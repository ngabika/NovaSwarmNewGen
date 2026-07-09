import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

export type AuditLogType = "gondolat" | "akció" | "chat" | "terminal" | "rendszer" | "telegram" | "kanban" | "memória" | "supervisor";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditLogType;
  sourceAgent: string; // "user" vagy egy konkrét ágens-azonosító
  message: string;
}

/**
 * Egyszerű, append-only audit napló. A 9.5. pont szerint a terminálban
 * lefutó MINDEN parancssor (nem minden billentyűleütés) ide kerül,
 * `terminal` típussal, jelezve, hogy a felhasználó vagy melyik ágens
 * indította a session-t.
 */
export class AuditLogger {
  constructor(private readonly logFilePath: string) {}

  async append(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: randomBytes(8).toString("hex"),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
    await fs.appendFile(this.logFilePath, JSON.stringify(fullEntry) + "\n", "utf8");
    return fullEntry;
  }

  async logTerminalCommand(sessionId: string, sourceAgent: string, commandLine: string): Promise<AuditLogEntry> {
    return this.append({
      type: "terminal",
      sourceAgent,
      message: `[session:${sessionId}] ${commandLine}`,
    });
  }

  async readAll(): Promise<AuditLogEntry[]> {
    try {
      const raw = await fs.readFile(this.logFilePath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AuditLogEntry);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }
}
