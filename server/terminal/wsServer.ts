import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { TerminalSessionManager } from "./terminalManager.js";
import { HostAccessDeniedError } from "../state/hostAccessGate.js";

interface ClientMessage {
  type: "create" | "input" | "resize" | "close";
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  startedBy?: string;
}

/**
 * A Terminál fül WebSocket-végpontja (9.1. pont). Ha a host-hozzáférés nincs
 * engedélyezve, a kapcsolat NEM szakad meg csendben — egy explicit,
 * "host-access-denied" típusú üzenetet kap a kliens, amit a frontend egy
 * magyarázó szöveggel jelenít meg (9.2. pont).
 */
export function attachTerminalWebSocketServer(httpServer: Server, manager: TerminalSessionManager): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/terminal" });

  wss.on("connection", (socket: WebSocket) => {
    socket.on("message", async (raw: Buffer) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Érvénytelen üzenet formátum." }));
        return;
      }

      try {
        switch (message.type) {
          case "create": {
            const { sessionId, pid } = await manager.createSession({
              startedBy: message.startedBy ?? "user",
              cols: message.cols,
              rows: message.rows,
            });
            manager.onData(sessionId, (data) => {
              socket.send(JSON.stringify({ type: "data", sessionId, data }));
            });
            manager.onExit(sessionId, (event) => {
              socket.send(JSON.stringify({ type: "exit", sessionId, exitCode: event.exitCode }));
            });
            socket.send(JSON.stringify({ type: "created", sessionId, pid }));
            break;
          }
          case "input": {
            if (message.sessionId && message.data !== undefined) {
              await manager.write(message.sessionId, message.data);
            }
            break;
          }
          case "resize": {
            if (message.sessionId && message.cols && message.rows) {
              manager.resize(message.sessionId, message.cols, message.rows);
            }
            break;
          }
          case "close": {
            if (message.sessionId) {
              await manager.closeSession(message.sessionId);
            }
            break;
          }
        }
      } catch (err) {
        if (err instanceof HostAccessDeniedError) {
          socket.send(JSON.stringify({ type: "host-access-denied", message: err.message }));
        } else {
          const errorMessage = err instanceof Error ? err.message : String(err);
          socket.send(JSON.stringify({ type: "error", message: errorMessage }));
        }
      }
    });
  });

  return wss;
}
