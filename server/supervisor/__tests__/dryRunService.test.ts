import { describe, expect, it, beforeAll } from "vitest";
import { SupervisorDryRunService } from "../dryRunService.js";
import { probeSandboxCapability } from "../sandboxRunner.js";

let sandboxCapable = false;

beforeAll(async () => {
  sandboxCapable = await probeSandboxCapability();
});

describe("SupervisorDryRunService", () => {
  it("'passed: true' verdiktet ad, ha a tesztelt skill/kódváltozás 0-s kilépési kóddal fut le", async () => {
    if (!sandboxCapable) return;
    const service = new SupervisorDryRunService();

    const verdict = await service.evaluate({
      subjectType: "skill",
      subjectName: "demo-skill",
      files: [{ relativePath: "skill.sh", content: "#!/bin/bash\necho 'skill ok'\nexit 0\n" }],
      command: "bash",
      args: ["skill.sh"],
    });

    expect(verdict.passed).toBe(true);
    expect(verdict.exitCode).toBe(0);
    expect(verdict.stdout).toContain("skill ok");
  }, 30_000);

  it("'passed: false' verdiktet ad, ha a tesztelt skill nem-nulla kilépési kóddal hibázik", async () => {
    if (!sandboxCapable) return;
    const service = new SupervisorDryRunService();

    const verdict = await service.evaluate({
      subjectType: "code-change",
      subjectName: "demo-broken-change",
      files: [{ relativePath: "run.sh", content: "#!/bin/bash\necho 'something went wrong' 1>&2\nexit 1\n" }],
      command: "bash",
      args: ["run.sh"],
    });

    expect(verdict.passed).toBe(false);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.stderr).toContain("something went wrong");
  }, 30_000);
});
