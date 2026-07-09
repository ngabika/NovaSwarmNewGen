import { useState } from "react";
import { api } from "../../lib/api.js";
import type { Agent } from "../../hooks/useAppState.js";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";

interface Props { agents: Agent[]; locale: Locale; onRefresh: () => void; }

function AgentNode({ agent, allAgents, depth, locale, onRefresh }: {
  agent: Agent; allAgents: Agent[]; depth: number; locale: Locale; onRefresh: () => void;
}) {
  const children = allAgents.filter((a) => a.parentAgentId === agent.id);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", role: "general", systemInstruction: "", avatar: "🤖" });
  const [busy, setBusy] = useState(false);

  async function createChild() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await api.post("/agents", {
        ...form,
        parentAgentId: agent.id,
        assignedModel: "default",
        assignedProvider: "ollama",
        webSearchEnabled: false,
        hostCommandEnabled: false,
        active: true,
      });
      setCreating(false);
      setForm({ name: "", role: "general", systemInstruction: "", avatar: "🤖" });
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent() {
    if (!confirm(`Törlöd: ${agent.name}?`)) return;
    await api.delete(`/agents/${agent.id}`);
    onRefresh();
  }

  return (
    <div className="flex flex-col items-start" style={{ paddingLeft: depth > 0 ? "2rem" : 0 }}>
      {depth > 0 && (
        <div className="ml-4 mb-1 h-4 w-px bg-white/20" />
      )}
      <div className={`group relative flex items-center gap-2 rounded-xl border px-3 py-2 ${
        agent.id === "supervisor-auditor"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-white/10 bg-[#0f1511]"
      }`}>
        <span className="text-xl">{agent.avatar}</span>
        <div>
          <div className="text-sm font-medium text-white/85">{agent.name}</div>
          <div className="text-xs text-white/35">{agent.role}</div>
        </div>
        {!agent.active && <span className="ml-1 text-xs text-red-400">inaktív</span>}
        {agent.id !== "supervisor-auditor" && (
          <div className="absolute -right-2 -top-2 hidden gap-1 group-hover:flex">
            <button onClick={() => setCreating((v) => !v)}
              className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs text-white hover:bg-emerald-500"
              title="Alárendelt ágens létrehozása">+</button>
            <button onClick={deleteAgent}
              className="rounded-full bg-red-600/70 px-1.5 py-0.5 text-xs text-white hover:bg-red-600"
              title="Törlés">✕</button>
          </div>
        )}
      </div>

      {creating && (
        <div className="mt-2 rounded-lg border border-emerald-500/20 bg-[#0f1511] p-3 space-y-2 ml-8">
          <div className="flex gap-2">
            <input value={form.avatar} onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))}
              className="w-10 rounded bg-white/5 px-1 text-center text-lg focus:outline-none" placeholder="🤖" />
            <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ágens neve"
              className="flex-1 rounded bg-white/5 px-2 py-1 text-sm text-white placeholder-white/20 focus:outline-none" />
          </div>
          <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            placeholder="Szerepkör (pl. developer, analyst)"
            className="w-full rounded bg-white/5 px-2 py-1 text-xs text-white placeholder-white/20 focus:outline-none" />
          <textarea value={form.systemInstruction} onChange={(e) => setForm((f) => ({ ...f, systemInstruction: e.target.value }))}
            rows={2} placeholder="Rendszerutasítás / személyiség"
            className="w-full rounded bg-white/5 px-2 py-1 text-xs text-white placeholder-white/20 focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={createChild} disabled={busy || !form.name.trim()}
              className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-40">
              Létrehozás
            </button>
            <button onClick={() => setCreating(false)} className="text-xs text-white/30 hover:text-white">Mégse</button>
          </div>
        </div>
      )}

      {children.length > 0 && (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <AgentNode key={child.id} agent={child} allAgents={allAgents} depth={depth + 1} locale={locale} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChartView({ agents, locale, onRefresh }: Props) {
  const tx = t(locale);
  const topLevel = agents.filter((a) => !a.parentAgentId);

  return (
    <div className="overflow-auto p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/30">{tx.orgChart.title}</h2>
      {agents.length === 0 ? (
        <p className="text-sm text-white/30">{tx.orgChart.noAgents}</p>
      ) : (
        <div className="space-y-4">
          {topLevel.map((agent) => (
            <AgentNode key={agent.id} agent={agent} allAgents={agents} depth={0} locale={locale} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
