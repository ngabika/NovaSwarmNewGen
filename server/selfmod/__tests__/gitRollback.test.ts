import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import simpleGit from "simple-git";
import { SelfModEngine } from "../gitRollback.js";

let repoRoot: string;

beforeEach(async () => {
  repoRoot = path.join(os.tmpdir(), `novaswarm-selfmod-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(repoRoot, { recursive: true });
  const git = simpleGit(repoRoot);
  await git.init();
  await git.addConfig("user.email", "test@localhost");
  await git.addConfig("user.name", "Test");
  // kezdő, "ártalmatlan" commit, amire visszaállhatunk
  await fs.writeFile(path.join(repoRoot, "README.md"), "kezdeti állapot\n", "utf8");
  await git.add(".");
  await git.commit("initial");
});

afterEach(async () => {
  await fs.rm(repoRoot, { recursive: true, force: true });
});

describe("SelfModEngine", () => {
  it("tiltott zónát érintő módosítást teljesen blokkol, SEMMIT nem ír a fájlrendszerre", async () => {
    const engine = new SelfModEngine(repoRoot);
    const result = await engine.applyChange(
      [{ path: ".env", content: "API_KEY=titok" }],
      async () => true
    );

    expect(result.ok).toBe(false);
    expect(result.blockedFiles).toContain(".env");

    const envExists = await fs
      .access(path.join(repoRoot, ".env"))
      .then(() => true)
      .catch(() => false);
    expect(envExists).toBe(false);
  });

  it("sikeres health-check esetén commitolja és megtartja a módosítást", async () => {
    const engine = new SelfModEngine(repoRoot);
    const result = await engine.applyChange(
      [{ path: "server/agents/example.ts", content: "export const ok = true;\n" }],
      async () => true
    );

    expect(result.ok).toBe(true);
    expect(result.rolledBack).toBe(false);

    const content = await fs.readFile(path.join(repoRoot, "server/agents/example.ts"), "utf8");
    expect(content).toContain("export const ok = true;");

    const git = simpleGit(repoRoot);
    const log = await git.log();
    expect(log.all.some((entry) => entry.message.includes("önmódosítás"))).toBe(true);
  });

  it("sikertelen health-check esetén AUTOMATIKUSAN visszaállítja az előző állapotot, emberi beavatkozás nélkül", async () => {
    const engine = new SelfModEngine(repoRoot);

    const result = await engine.applyChange(
      [{ path: "server/agents/broken.ts", content: "this is not valid typescript +++ {{{" }],
      async () => false // a health-check (pl. build) ELBUKIK
    );

    expect(result.ok).toBe(false);
    expect(result.rolledBack).toBe(true);

    // a fájl NEM maradhat fent a repóban a rollback után
    const brokenStillExists = await fs
      .access(path.join(repoRoot, "server/agents/broken.ts"))
      .then(() => true)
      .catch(() => false);
    expect(brokenStillExists).toBe(false);

    // a git HEAD-nek vissza kell térnie a kezdeti, working állapothoz
    const git = simpleGit(repoRoot);
    const log = await git.log();
    expect(log.all.some((entry) => entry.message === "initial")).toBe(true);
    expect(log.all.some((entry) => entry.message.includes("önmódosítás"))).toBe(false);
  });
});
