import { useState, useEffect, useCallback } from "react";
import { api } from "../../lib/api.js";
import type { Agent } from "../../hooks/useAppState.js";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";

interface KanbanCard {
  id: string; title: string; description: string;
  status: "todo" | "in-progress" | "done";
  assignedAgentId: string | null; createdAt: string; updatedAt: string;
}

const COLUMNS = [
  { key: "todo" as const, color: "border-white/10" },
  { key: "in-progress" as const, color: "border-amber-500/30" },
  { key: "done" as const, color: "border-emerald-500/30" },
] as const;

interface NewCardForm { title: string; description: string; assignedAgentId: string | null; }
const EMPTY_FORM: NewCardForm = { title: "", description: "", assignedAgentId: null };

interface Props { agents: Agent[]; locale: Locale; }

export default function KanbanView({ agents, locale }: Props) {
  const tx = t(locale);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [form, setForm] = useState<NewCardForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    const data = await api.get<KanbanCard[]>("/kanban");
    setCards(data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createCard(status: "todo" | "in-progress" | "done") {
    if (!form.title.trim()) return;
    await api.post("/kanban", { ...form, status });
    setAdding(null); setForm(EMPTY_FORM);
    await load();
  }

  async function moveCard(id: string, status: KanbanCard["status"]) {
    await api.patch(`/kanban/${id}`, { status });
    await load();
  }

  async function deleteCard(id: string) {
    await api.delete(`/kanban/${id}`);
    await load();
  }

  const colLabel = { todo: tx.kanban.todo, "in-progress": tx.kanban.inProgress, done: tx.kanban.done };

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4">
      {COLUMNS.map(({ key, color }) => (
        <div key={key} className="flex w-72 flex-shrink-0 flex-col">
          <div className={`mb-3 flex items-center justify-between border-b pb-2 ${color}`}>
            <span className="text-sm font-semibold text-white/70">{colLabel[key]}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/40">
              {cards.filter((c) => c.status === key).length}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {cards.filter((c) => c.status === key).map((card) => (
              <div key={card.id} className="rounded-lg border border-white/10 bg-[#0f1511] p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-white/85">{card.title}</p>
                  <button onClick={() => deleteCard(card.id)} className="flex-shrink-0 text-xs text-white/20 hover:text-red-400">✕</button>
                </div>
                {card.description && <p className="mb-2 text-xs text-white/40 leading-relaxed">{card.description}</p>}
                {card.assignedAgentId && (
                  <div className="mb-2 text-xs text-white/30">
                    {agents.find((a) => a.id === card.assignedAgentId)?.avatar}{" "}
                    {agents.find((a) => a.id === card.assignedAgentId)?.name}
                  </div>
                )}
                <div className="flex gap-1 flex-wrap">
                  {COLUMNS.filter((c) => c.key !== key).map((col) => (
                    <button key={col.key} onClick={() => moveCard(card.id, col.key)}
                      className="rounded px-2 py-0.5 text-xs text-white/30 hover:bg-white/5 hover:text-white/60">
                      → {colLabel[col.key]}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {adding === key ? (
              <div className="rounded-lg border border-emerald-500/30 bg-[#0f1511] p-3 space-y-2">
                <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={tx.kanban.title}
                  className="w-full rounded bg-white/5 px-2 py-1 text-sm text-white placeholder-white/20 focus:outline-none" />
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder={tx.kanban.description}
                  className="w-full rounded bg-white/5 px-2 py-1 text-xs text-white placeholder-white/20 focus:outline-none" />
                <select value={form.assignedAgentId ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, assignedAgentId: e.target.value || null }))}
                  className="w-full rounded bg-white/5 px-2 py-1 text-xs text-white/60 focus:outline-none">
                  <option value="">{tx.kanban.assignTo}</option>
                  {agents.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.avatar} {a.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => createCard(key)}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500">
                    {tx.common.confirm}
                  </button>
                  <button onClick={() => { setAdding(null); setForm(EMPTY_FORM); }}
                    className="text-xs text-white/30 hover:text-white">{tx.common.cancel}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAdding(key); setForm(EMPTY_FORM); }}
                className="w-full rounded-lg border border-dashed border-white/10 py-2 text-xs text-white/30 hover:border-white/20 hover:text-white/50">
                + {tx.kanban.addCard}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
