import { describe, expect, it, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { SandboxRunner, probeSandboxCapability } from "../sandboxRunner.js";

let sandboxCapable = false;

beforeAll(async () => {
  sandboxCapable = await probeSandboxCapability();
});

describe("SandboxRunner — valós izolációs integrációs teszt (13.3. pont)", () => {
  it("egy szándékosan destruktív parancs a sandboxban NEM érintheti a valós fájlrendszert", async () => {
    if (!sandboxCapable) {
      console.warn("Kihagyva: a futtatási környezet nem ad root/unshare képességet a valós izoláció teszteléséhez.");
      return;
    }

    const markerPath = path.join(os.tmpdir(), `novaswarm-real-marker-${randomBytes(6).toString("hex")}.txt`);
    await fs.writeFile(markerPath, "EZ A VALÓS FÁJL — A SANDBOXNAK SOSEM SZABAD TÖRÖLNIE", "utf8");

    try {
      const runner = new SandboxRunner({ wallClockTimeoutMs: 10_000 });

      const script = [
        "echo SANDBOX_WHOAMI:$(id -u)",
        `echo "adat" > ./important.db`,
        "rm -rf ./important.db", // destruktív, DE a sandbox saját tmpfs-másolatán belül -> ez OK
        `rm -f "${markerPath}" 2>&1 || echo SANDBOX_RM_OUTSIDE_FAILED`,
      ].join(" && ");

      const result = await runner.run([{ relativePath: "README.txt", content: "sandbox fixture" }], "bash", ["-c", script]);

      expect(result.stdout).toContain("SANDBOX_RM_OUTSIDE_FAILED");
      expect(result.stdout).not.toContain("SANDBOX_WHOAMI:0"); // NEM futhat root-ként

      // A LEGFONTOSABB bizonyíték: a valós fájlrendszeren a marker fájlnak ÉPSÉGBEN megvan kell maradnia.
      const survived = await fs.readFile(markerPath, "utf8");
      expect(survived).toBe("EZ A VALÓS FÁJL — A SANDBOXNAK SOSEM SZABAD TÖRÖLNIE");
    } finally {
      await fs.rm(markerPath, { force: true });
    }
  }, 30_000);

  it("a sandbox-folyamatnak NINCS hálózati hozzáférése (önálló network namespace)", async () => {
    if (!sandboxCapable) {
      return;
    }
    const runner = new SandboxRunner({ wallClockTimeoutMs: 10_000 });
    const result = await runner.run(
      [],
      "bash",
      ["-c", "curl -s -m 3 https://example.com >/dev/null 2>&1 && echo NETWORK_REACHED || echo NETWORK_BLOCKED"]
    );
    expect(result.stdout).toContain("NETWORK_BLOCKED");
    expect(result.stdout).not.toContain("NETWORK_REACHED");
  }, 30_000);

  it("a sandbox-könyvtár a futás után megszűnik (csak ideiglenes tmpfs-másolat, nem marad nyom)", async () => {
    if (!sandboxCapable) {
      return;
    }
    const runner = new SandboxRunner({ wallClockTimeoutMs: 10_000 });
    const result = await runner.run([{ relativePath: "x.txt", content: "x" }], "bash", ["-c", "echo done"]);

    const stillExists = await fs
      .access(result.sandboxDir)
      .then(() => true)
      .catch(() => false);
    expect(stillExists).toBe(false);
  }, 30_000);
});
