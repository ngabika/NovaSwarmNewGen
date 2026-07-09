import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../lib/api.js";
import type { Agent } from "../../hooks/useAppState.js";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";

interface Message {
  id: string; conversationId: string; agentId: string;
  role: "user" | "agent" | "system"; content: string;
  source: "web" | "telegram"; createdAt: string;
}

function RoleIcon({ role, source }: { role: Message["role"]; source: Message["source"] }) {
  if (role === "user") return <span className="text-base">👤</span>;
  if (role === "system") return <span className="text-base">⚙️</span>;
  return <span className="text-base">{source === "telegram" ? "✈️" : "🤖"}</span>;
}

interface Props { agents: Agent[]; locale: Locale; }

export default function ChatView({ agents, locale }: Props) {
  const tx = t(locale);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(agents[0] ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (agentId: string) => {
    const msgs = await api.get<Message[]>(`/agents/${agentId}/messages`);
    setMessages(msgs);
  }, []);

  useEffect(() => {
    if (selectedAgent) void loadMessages(selectedAgent.id);
  }, [selectedAgent, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Frissítés minden 5 másodpercben (Telegram-üzenetek is megjelennek, 16.1)
  useEffect(() => {
    if (!selectedAgent) return;
    const interval = setInterval(() => void loadMessages(selectedAgent.id), 5_000);
    return () => clearInterval(interval);
  }, [selectedAgent, loadMessages]);

  async function sendMessage() {
    if (!selectedAgent || !input.trim() || thinking) return;
    const text = input.trim();
    setInput("");
    setThinking(true);
    // Optimista UI: azonnal megmutatjuk a felhasználó üzenetét
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(), conversationId: "", agentId: selectedAgent.id,
      role: "user", content: text, source: "web", createdAt: new Date().toISOString(),
    }]);
    try {
      await api.post(`/agents/${selectedAgent.id}/message`, { content: text });
      await loadMessages(selectedAgent.id);
    } finally {
      setThinking(false);
    }
  }

  const activeAgents = agents.filter((a) => a.active && a.id !== "supervisor-auditor");

  return (
    <div className="flex h-full">
      {/* Ágens-lista */}
      <aside className="flex w-48 flex-shrink-0 flex-col border-r border-white/10 bg-[#0a0d0b]">
        <div className="border-b border-white/10 p-3 text-xs font-medium uppercase tracking-wider text-white/30">
          Ágensek
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {activeAgents.map((agent) => (
            <button key={agent.id} onClick={() => setSelectedAgent(agent)}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                selectedAgent?.id === agent.id
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}>
              <span>{agent.avatar}</span>
              <div className="min-w-0">
                <div className="truncate font-medium">{agent.name}</div>
                <div className="truncate text-xs opacity-50">{agent.role}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Üzenetek */}
      <div className="flex flex-1 flex-col">
        {!selectedAgent ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/30">{tx.chat.noConversation}</div>
        ) : (
          <>
            <div className="border-b border-white/10 px-4 py-3 text-sm font-medium text-white/70">
              {selectedAgent.avatar} {selectedAgent.name}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className="flex-shrink-0 pt-0.5">
                    <RoleIcon role={msg.role} source={msg.source} />
                  </div>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-emerald-600/25 text-emerald-100"
                      : msg.role === "system"
                      ? "bg-amber-500/10 text-amber-300 text-xs italic"
                      : "bg-white/8 text-white/85"
                  }`}>
                    {msg.content}
                    {msg.source === "telegram" && (
                      <span className="ml-2 text-xs opacity-40">✈️</span>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-sm text-white/30">
                  <span>🤖</span><span className="animate-pulse">{tx.chat.thinking}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-white/10 p-3">
              <div className="flex gap-2">
                <input
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-emerald-500/50 focus:outline-none"
                  placeholder={tx.chat.placeholder}
                  disabled={thinking}
                />
                <button onClick={sendMessage} disabled={!input.trim() || thinking}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-40">
                  {tx.chat.send}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
