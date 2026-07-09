import { SandboxRunner, type SandboxFile } from "./sandboxRunner.js";

export type DryRunSubject = "skill" | "mcp-connection" | "code-change";

export interface DryRunRequest {
  subjectType: DryRunSubject;
  subjectName: string;
  files: SandboxFile[];
  /** A futtatandó teszt-parancs, pl. ["npm", ["test"]] vagy ["node", ["skill.js", "--dry-run"]]. */
  command: string;
  args: string[];
}

export interface DryRunVerdict {
  subjectType: DryRunSubject;
  subjectName: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  evaluatedAt: string;
}

/**
 * A Felügyelő (Auditor) ágens felelős a dry-run/sandbox tesztelésért,
 * MIELŐTT egy új skill, MCP-szerver vagy nagyobb kódváltozás élesbe
 * kerülne (10.3 + 13.3. pont). Ez a wrapper a SandboxRunner valós
 * izolációs mechanizmusára épül — nem szimulál semmit.
 */
export class SupervisorDryRunService {
  constructor(private readonly sandbox: SandboxRunner = new SandboxRunner()) {}

  async evaluate(request: DryRunRequest): Promise<DryRunVerdict> {
    const result = await this.sandbox.run(request.files, request.command, request.args);
    return {
      subjectType: request.subjectType,
      subjectName: request.subjectName,
      passed: !result.timedOut && result.exitCode === 0,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
