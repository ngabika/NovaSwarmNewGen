import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

type ServerMessage =
  | { type: "created"; sessionId: string; pid: number }
  | { type: "data"; sessionId: string; data: string }
  | { type: "exit"; sessionId: string; exitCode: number }
  | { type: "host-access-denied"; message: string }
  | { type: "error"; message: string };

interface SessionTab {
  sessionId: string;
  label: string;
}

const TERMINAL_THEME = {
  background: "#0b0f10",
  foreground: "#d8f0dd",
  cursor: "#5ee3a1",
  selectionBackground: "#1d3b2c",
  black: "#0b0f10",
  green: "#5ee3a1",
  brightGreen: "#8af0bd",
  yellow: "#e3c95e",
  red: "#e35e6f",
};

/**
 * Teljes értékű, interaktív Terminál fül (9. pont): node-pty + xterm.js,
 * WebSocket streaming. Ha a host-hozzáférés nincs engedélyezve, a fül
 * látható marad, de egy magyarázó üzenettel inaktív (9.2. pont) — sosem
 * törik el csendben.
 */
export default function TerminalView({ wsUrl = "/ws/terminal" }: { wsUrl?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hostAccessDeniedMessage, setHostAccessDeniedMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const activeSessionRef = useRef<string | null>(null);
  activeSessionRef.current = activeSessionId;

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    socketRef.current?.send(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    const xterm = new XTerm({
      convertEol: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, monospace",
      fontSize: 13,
      theme: TERMINAL_THEME,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    if (containerRef.current) {
      xterm.open(containerRef.current);
      fitAddon.fit();
    }
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    xterm.onData((data) => {
      const sessionId = activeSessionRef.current;
      if (sessionId) sendMessage({ type: "input", sessionId, data });
    });

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}${wsUrl}`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "create", startedBy: "user", cols: xterm.cols, rows: xterm.rows }));
    };

    socket.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      if (message.type === "created") {
        setSessions((prev) => [...prev, { sessionId: message.sessionId, label: `Terminál ${prev.length + 1}` }]);
        setActiveSessionId(message.sessionId);
      } else if (message.type === "data") {
        if (message.sessionId === activeSessionRef.current) xterm.write(message.data);
      } else if (message.type === "exit") {
        xterm.writeln(`\r\n[session lezárult, kilépési kód: ${message.exitCode}]`);
        setSessions((prev) => prev.filter((s) => s.sessionId !== message.sessionId));
      } else if (message.type === "host-access-denied") {
        setHostAccessDeniedMessage(message.message);
      } else if (message.type === "error") {
        setConnectionError(message.message);
      }
    };

    socket.onerror = () => setConnectionError("Nem sikerült kapcsolódni a terminál-szolgáltatáshoz.");

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      socket.close();
      xterm.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  const openNewSession = useCallback(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    sendMessage({ type: "create", startedBy: "user", cols: xterm.cols, rows: xterm.rows });
  }, [sendMessage]);

  if (hostAccessDeniedMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0b0f10] p-8 text-center">
        <span className="text-2xl">🔒</span>
        <p className="max-w-md text-sm leading-relaxed text-[#d8f0dd]/80">{hostAccessDeniedMessage}</p>
        <p className="text-xs text-[#d8f0dd]/50">
          Engedélyezd a gazdagép-hozzáférést a Beállításokban, hogy a Terminál fül aktívvá váljon.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0f10]">
      <div className="flex items-center gap-1 border-b border-white/10 bg-[#101615] px-2 py-1">
        {sessions.map((session) => (
          <button
            key={session.sessionId}
            onClick={() => setActiveSessionId(session.sessionId)}
            className={`rounded px-3 py-1 text-xs transition-colors ${
              session.sessionId === activeSessionId
                ? "bg-[#1d3b2c] text-[#8af0bd]"
                : "text-[#d8f0dd]/60 hover:bg-white/5"
            }`}
          >
            {session.label}
          </button>
        ))}
        <button
          onClick={openNewSession}
          title="Új terminál-session"
          className="ml-1 rounded px-2 py-1 text-xs text-[#d8f0dd]/50 hover:bg-white/5 hover:text-[#d8f0dd]"
        >
          +
        </button>
        {connectionError && <span className="ml-auto pr-2 text-xs text-[#e35e6f]">{connectionError}</span>}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 p-2" />
    </div>
  );
}
