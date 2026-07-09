import { describe, expect, it } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { HostAccessGate, HostAccessDeniedError } from "../../state/hostAccessGate.js";
import { AuditLogger } from "../auditLog.js";
import { TerminalSessionManager } from "../terminalManager.js";
import type { IPtyProcess, PtyFactory, PtySpawnOptions } from "../ptyTypes.js";

class FakePtyProcess implements IPtyProcess {
  readonly pid = 42424;
  readonly writes: string[] = [];
  killed = false;
  private dataListeners: Array<(d: string) => void> = [];
  private exitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  write(data: string): void {
    this.writes.push(data);
  }
  resize(): void {}
  kill(): void {
    this.killed = true;
  }
  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener);
  }
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(listener);
  }
  emitData(data: string): void {
    for (const l of this.dataListeners) l(data);
  }
  emitExit(exitCode: number): void {
    for (const l of this.exitListeners) l({ exitCode });
  }
}

class FakePtyFactory implements PtyFactory {
  public lastProc?: FakePtyProcess;
  async spawn(_shellPath: string, _args: string[], _options: PtySpawnOptions): Promise<IPtyProcess> {
    this.lastProc = new FakePtyProcess();
    return this.lastProc;
  }
}

function tmpPath(prefix: string): string {
  return path.join(os.tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}.json`);
}

async function setup(granted: boolean) {
  const gate = new HostAccessGate(tmpPath("novaswarm-gate"));
  await gate.load();
  if (granted) await gate.grant();

  const auditLogPath = tmpPath("novaswarm-audit").replace(".json", ".log");
  const auditLog = new AuditLogger(auditLogPath);
  const ptyFactory = new FakePtyFactory();
  const manager = new TerminalSessionManager(gate, ptyFactory, auditLog);
  return { gate, auditLog, ptyFactory, manager };
}

describe("TerminalSessionManager", () => {
  it("createSession HostAccessDeniedError-t dob, ha a jogosultság nincs megadva", async () => {
    const { manager } = await setup(false);
    await expect(manager.createSession({ startedBy: "user" })).rejects.toThrow(HostAccessDeniedError);
  });

  it("engedélyezett jogosultsággal létrehozza a session-t és naplózza a megnyitást", async () => {
    const { manager, auditLog } = await setup(true);
    const { sessionId, pid } = await manager.createSession({ startedBy: "user" });

    expect(sessionId).toBeTruthy();
    expect(pid).toBe(42424);

    const entries = await auditLog.readAll();
    expect(entries.some((e) => e.type === "terminal" && e.message.includes("session megnyitva"))).toBe(true);
  });

  it("write() CSAK a lezárt (Enterrel befejezett) parancssort naplózza, a félben lévő bevitelt nem", async () => {
    const { manager, auditLog, ptyFactory } = await setup(true);
    const { sessionId } = await manager.createSession({ startedBy: "user" });

    await manager.write(sessionId, "l");
    await manager.write(sessionId, "s");
    await manager.write(sessionId, " -");
    await manager.write(sessionId, "l");

    let entries = await auditLog.readAll();
    expect(entries.filter((e) => e.message.includes("ls"))).toHaveLength(0); // még nincs Enter

    await manager.write(sessionId, "\r");

    entries = await auditLog.readAll();
    expect(entries.some((e) => e.message.includes("ls -l"))).toBe(true);

    // a teljes nyers bevitel mindenképp eljut a tényleges pty-hez, billentyűnként is
    expect(ptyFactory.lastProc!.writes.join("")).toBe("ls -l\r");
  });

  it("write() HostAccessDeniedError-t dob, ha a jogosultságot menet közben visszavonják", async () => {
    const { manager, gate } = await setup(true);
    const { sessionId } = await manager.createSession({ startedBy: "user" });
    await gate.revoke();
    await expect(manager.write(sessionId, "echo szia\n")).rejects.toThrow(HostAccessDeniedError);
  });

  it("több párhuzamos session is létrehozható és egymástól függetlenül kezelhető (9.3. pont)", async () => {
    const { manager } = await setup(true);
    const s1 = await manager.createSession({ startedBy: "user" });
    const s2 = await manager.createSession({ startedBy: "agent-coordinator" });

    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(manager.listSessionIds().sort()).toEqual([s1.sessionId, s2.sessionId].sort());
  });

  it("ágens is indíthat session-t, és a naplóban az ágens-azonosító jelenik meg indítóként (9.4. pont)", async () => {
    const { manager, auditLog } = await setup(true);
    const { sessionId } = await manager.createSession({ startedBy: "agent-devops" });
    await manager.write(sessionId, "uptime\n");

    const entries = await auditLog.readAll();
    const commandEntry = entries.find((e) => e.message.includes("uptime"));
    expect(commandEntry?.sourceAgent).toBe("agent-devops");
  });

  it("closeSession kilövi a pty-t, eltávolítja a session listából, és naplózza a lezárást", async () => {
    const { manager, auditLog, ptyFactory } = await setup(true);
    const { sessionId } = await manager.createSession({ startedBy: "user" });

    await manager.closeSession(sessionId);

    expect(ptyFactory.lastProc!.killed).toBe(true);
    expect(manager.listSessionIds()).not.toContain(sessionId);

    const entries = await auditLog.readAll();
    expect(entries.some((e) => e.message.includes("session lezárva"))).toBe(true);
  });
});
