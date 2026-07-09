import { randomBytes } from "node:crypto";
import { HostAccessGate } from "../state/hostAccessGate.js";
import { AuditLogger } from "./auditLog.js";
import { CommandLineBuffer } from "./commandLineBuffer.js";
import type { IPtyProcess, PtyFactory } from "./ptyTypes.js";

export interface CreateSessionOptions {
  /** "user" vagy egy konkrét ágens-azonosító — ki indította a session-t (9.4. pont). */
  startedBy: string;
  shellPath?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

interface TerminalSession {
  id: string;
  startedBy: string;
  proc: IPtyProcess;
  lineBuffer: CommandLineBuffer;
}

export interface CreatedSession {
  sessionId: string;
  pid: number;
}

/**
 * Több, egymástól független terminál-session is futhat párhuzamosan (9.3.
 * pont). MINDEN gazdagép-érintő metódus (createSession, write, resize) a
 * 8.2. pontban leírt, KÖZÖS jogosultsági kapun megy át — ugyanazon
 * `HostAccessGate` példányon, amit a többi alrendszer is használ (3.1 elv).
 */
export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    private readonly hostAccessGate: HostAccessGate,
    private readonly ptyFactory: PtyFactory,
    private readonly auditLog: AuditLogger,
    private readonly idGenerator: () => string = () => randomBytes(8).toString("hex")
  ) {}

  listSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  async createSession(options: CreateSessionOptions): Promise<CreatedSession> {
    this.hostAccessGate.assertGranted("terminal-session-start");

    const shellPath = options.shellPath ?? process.env.SHELL ?? "/bin/bash";
    const proc = await this.ptyFactory.spawn(shellPath, [], {
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
    });

    const sessionId = this.idGenerator();
    this.sessions.set(sessionId, {
      id: sessionId,
      startedBy: options.startedBy,
      proc,
      lineBuffer: new CommandLineBuffer(),
    });

    await this.auditLog.append({
      type: "terminal",
      sourceAgent: options.startedBy,
      message: `[session:${sessionId}] session megnyitva (pid=${proc.pid})`,
    });

    return { sessionId, pid: proc.pid };
  }

  /**
   * A felhasználó/ágens által beírt nyers adat. Ez hívja a tényleges
   * pty.write-ot, ÉS — ha egy parancssor lezárult (Enter) — naplózza az
   * Audit Naplóba `terminal` típussal (9.5. pont).
   */
  async write(sessionId: string, data: string): Promise<void> {
    this.hostAccessGate.assertGranted("terminal-write");
    const session = this.getSessionOrThrow(sessionId);

    const completedLines = session.lineBuffer.push(data);
    for (const line of completedLines) {
      await this.auditLog.logTerminalCommand(sessionId, session.startedBy, line);
    }

    session.proc.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.hostAccessGate.assertGranted("terminal-resize");
    this.getSessionOrThrow(sessionId).proc.resize(cols, rows);
  }

  onData(sessionId: string, listener: (data: string) => void): void {
    this.getSessionOrThrow(sessionId).proc.onData(listener);
  }

  onExit(sessionId: string, listener: (event: { exitCode: number; signal?: number }) => void): void {
    this.getSessionOrThrow(sessionId).proc.onExit((event) => {
      this.sessions.delete(sessionId);
      listener(event);
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.proc.kill();
    this.sessions.delete(sessionId);
    await this.auditLog.append({
      type: "terminal",
      sourceAgent: session.startedBy,
      message: `[session:${sessionId}] session lezárva`,
    });
  }

  private getSessionOrThrow(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Nincs ilyen aktív terminál-session: ${sessionId}`);
    }
    return session;
  }
}
