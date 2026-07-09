import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api.js";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";

interface AuditEntry {
  id: string; timestamp: string;
  type: "gondolat" | "akció" | "chat" | "terminal" | "rendszer" | "telegram" | "kanban" | "memória" | "supervisor";
  sourceAgent: string; message: string;
}

const TYPE_COLORS: Record<AuditEntry["type"], string> = {
  gondolat: "text-violet-400", akció: "text-blue-400", chat: "text-emerald-400",
  terminal: "text-yellow-400", rendszer: "text-orange-400", telegram: "text-sky-400",
  kanban: "text-pink-400", memória: "text-teal-400", supervisor: "text-red-400",
};

const TYPE_ICONS: Record<AuditEntry["type"], string> = {
  gondolat: "💭", akció: "⚡", chat: "💬", terminal: "🖥️", rendszer: "⚙️",
  telegram: "✈️", kanban: "📋", memória: "🧠", supervisor: "🔍",
};

interface Props { locale: Locale; }

export default function AuditLogView({ locale }: Props) {
  const tx = t(locale);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    const data = await api.get<AuditEntry[]>("/audit");
    setEntries([...data].reverse());
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => void load(), 8_000);
    return () => clearInterval(interval);
  }, [load]);

  const types = ["all", "chat", "terminal", "supervisor", "rendszer", "akció", "telegram"] as const;
  const visible = filter === "all" ? entries : entries.filter((e) => e.type === filter);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <span className="text-xs text-white/30">{tx.audit.filter}:</span>
        {types.map((type) => (
          <button key={type} onClick={() => setFilter(type)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              filter === type ? "bg-white/15 text-white" : "text-white/30 hover:text-white/60"
            }`}>
            {type === "all" ? tx.audit.all : (TYPE_ICONS[type as AuditEntry["type"]] + " " + type)}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-xs text-white/20 hover:text-white/50">↻</button>
      </div>

      <div className="flex-1 overflow-y-auto font-mono">
        {visible.length === 0 ? (
          <div className="p-6 text-sm text-white/30">{tx.audit.empty}</div>
        ) : visible.map((entry) => (
          <div key={entry.id} className="border-b border-white/5 px-4 py-2 text-xs hover:bg-white/3">
            <div className="flex items-baseline gap-2">
              <span className="text-white/20 tabular-nums">{entry.timestamp.replace("T", " ").slice(0, 19)}</span>
              <span className={`font-medium ${TYPE_COLORS[entry.type] ?? "text-white/50"}`}>
                {TYPE_ICONS[entry.type]} {entry.type}
              </span>
              <span className="text-white/30">[{entry.sourceAgent}]</span>
            </div>
            <div className="mt-0.5 text-white/70 leading-relaxed">{entry.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
