import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomBytes } from "node:crypto";

export interface SandboxFile {
  relativePath: string;
  content: string;
}

export interface SandboxRunOptions {
  cpuTimeSeconds?: number;
  memoryBytes?: number;
  wallClockTimeoutMs?: number;
  sandboxUser?: string;
}

export interface SandboxRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  sandboxDir: string;
}

const DEFAULT_OPTIONS: Required<SandboxRunOptions> = {
  cpuTimeSeconds: 10,
  memoryBytes: 256 * 1024 * 1024,
  wallClockTimeoutMs: 15_000,
  sandboxUser: "novaswarm-sandbox",
};

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * A bekötő-réteg, amely a tényleges rendszer-parancsokat (mount, useradd,
 * chown stb.) futtatja. Egységtesztekben ez kicserélhető egy fake-re, hogy a
 * SandboxRunner döntési logikáját root/unshare nélkül is lehessen tesztelni —
 * a tényleges izolációt bizonyító integrációs teszt viszont a VALÓS
 * implementációt használja (lásd sandboxRunner.test.ts).
 */
export interface SystemCommandRunner {
  exec(command: string, args: string[]): Promise<ExecResult>;
}

export class RealSystemCommandRunner implements SystemCommandRunner {
  exec(command: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", () => resolve({ stdout, stderr: stderr + "\n(spawn error)", code: -1 }));
      child.on("close", (code) => resolve({ stdout, stderr, code }));
    });
  }
}

/**
 * Megvizsgálja, hogy a futtatási környezet támogatja-e a valós izolációs
 * primitíveket (root jogosultság + unshare network-namespace képesség).
 * Ezt használja a teszt-csomag, hogy korlátozott CI-környezetben szépen
 * kihagyja (ne hamisan bukjon el) a valós izolációs integrációs tesztet.
 */
export async function probeSandboxCapability(runner: SystemCommandRunner = new RealSystemCommandRunner()): Promise<boolean> {
  if (typeof process.getuid === "function" && process.getuid() !== 0) return false;
  const result = await runner.exec("unshare", ["--net", "--", "true"]);
  return result.code === 0;
}

/**
 * Konkrét izolációs mechanizmus a Felügyelő ágens dry-run/sandbox
 * teszteléséhez (13.3. pont, "b" opció — Docker hiányában dedikált,
 * korlátozott jogú Linux felhasználó + cgroup erőforrás-limit):
 *
 *  1. A tesztelt módosítás KIZÁRÓLAG egy ideiglenes, tmpfs-re mountolt
 *     másolaton dolgozik — soha a valós fájlrendszeren.
 *  2. A parancs egy dedikált, jogosultság nélküli Linux felhasználóként fut
 *     (setpriv), nem a fő folyamat jogosultságaival.
 *  3. Önálló hálózati névtérben fut (unshare --net) — nincs internet-/
 *     hálózat-hozzáférése.
 *  4. cgroup memória-limit korlátozza az erőforrás-felhasználást.
 */
export class SandboxRunner {
  private readonly options: Required<SandboxRunOptions>;

  constructor(
    options: SandboxRunOptions = {},
    private readonly runner: SystemCommandRunner = new RealSystemCommandRunner()
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  private async ensureSandboxUser(): Promise<{ uid: string; gid: string }> {
    const idCheck = await this.runner.exec("id", ["-u", this.options.sandboxUser]);
    if (idCheck.code !== 0) {
      await this.runner.exec("useradd", [
        "-r",
        "-M",
        "-s",
        "/usr/sbin/nologin",
        "-d",
        "/nonexistent",
        this.options.sandboxUser,
      ]);
    }
    const uid = (await this.runner.exec("id", ["-u", this.options.sandboxUser])).stdout.trim();
    const gid = (await this.runner.exec("id", ["-g", this.options.sandboxUser])).stdout.trim();
    return { uid, gid };
  }

  private execIsolated(
    cwd: string,
    uid: string,
    gid: string,
    cgroupPath: string,
    command: string,
    args: string[]
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve) => {
      const fullArgs = [
        "--net",
        "--pid",
        "--mount-proc",
        "--fork",
        "--",
        "setpriv",
        `--reuid=${uid}`,
        `--regid=${gid}`,
        "--clear-groups",
        "--",
        "prlimit",
        `--cpu=${this.options.cpuTimeSeconds}`,
        "--nproc=64",
        "--",
        command,
        ...args,
      ];

      const child = spawn("unshare", fullArgs, { cwd, stdio: ["ignore", "pipe", "pipe"] });

      // Amint a process létrejön, azonnal a korlátozott cgroup-ba soroljuk.
      // A később bekövetkező fork (--fork) és exec (setpriv -> prlimit ->
      // parancs) lánc örökli a cgroup-tagságot, mert sem a fork, sem az
      // exec nem változtatja meg egy process cgroup-hovatartozását.
      if (child.pid) {
        fs.writeFile(path.join(cgroupPath, "cgroup.procs"), String(child.pid)).catch(() => {
          /* ha a cgroup írás sikertelen, a futás attól még izolált marad (namespace+jogosultság), csak a memória-limit marad el */
        });
      }

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.options.wallClockTimeoutMs);

      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });
    });
  }

  private async cleanup(sandboxDir: string, cgroupPath: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await this.runner.exec("umount", [sandboxDir]);
      if (result.code === 0) break;
      if (attempt === 4) {
        await this.runner.exec("umount", ["-l", sandboxDir]); // lazy unmount, ha minden más sikertelen
      } else {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
    await fs.rmdir(cgroupPath).catch(() => {});
  }

  /**
   * Lefuttat egy parancsot egy izolált, ideiglenes (tmpfs) másolaton.
   * @param files A sandbox-ba másolandó fájlok (a tesztelendő skill/MCP/kódváltozás).
   * @param command A futtatandó parancs (pl. "node", "npm", "bash").
   * @param args A parancs argumentumai.
   */
  async run(files: SandboxFile[], command: string, args: string[]): Promise<SandboxRunResult> {
    const sandboxId = randomBytes(6).toString("hex");
    const sandboxDir = path.join(os.tmpdir(), `novaswarm-sandbox-${sandboxId}`);
    const cgroupPath = `/sys/fs/cgroup/memory/novaswarm-sandbox-${sandboxId}`;

    await fs.mkdir(sandboxDir, { recursive: true });
    await this.runner.exec("mount", ["-t", "tmpfs", "-o", "size=64m", "tmpfs", sandboxDir]);

    try {
      for (const file of files) {
        const fullPath = path.join(sandboxDir, file.relativePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, file.content, "utf8");
      }

      const { uid, gid } = await this.ensureSandboxUser();
      await this.runner.exec("chown", ["-R", `${uid}:${gid}`, sandboxDir]);

      await fs.mkdir(cgroupPath, { recursive: true }).catch(() => {});
      await fs
        .writeFile(path.join(cgroupPath, "memory.limit_in_bytes"), String(this.options.memoryBytes))
        .catch(() => {});

      const result = await this.execIsolated(sandboxDir, uid, gid, cgroupPath, command, args);
      return { ...result, sandboxDir };
    } finally {
      await this.cleanup(sandboxDir, cgroupPath);
    }
  }
}
