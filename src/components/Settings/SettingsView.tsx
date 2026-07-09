import { useState } from "react";
import { api } from "../../lib/api.js";
import type { AppSettings } from "../../hooks/useAppState.js";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";

interface Props { settings: AppSettings; locale: Locale; onUpdated: (s: AppSettings) => void; }

type TabId = "apikeys" | "telegram" | "limits" | "ollama" | "host" | "danger";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-[#0f1511] p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/30">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-white/40">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-emerald-500/50 focus:outline-none";

export default function SettingsView({ settings, locale, onUpdated }: Props) {
  const tx = t(locale);
  const [tab, setTab] = useState<TabId>("apikeys");
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);

  const set = (patch: Partial<AppSettings>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };

  async function save() {
    setBusy(true);
    try {
      const updated = await api.patch<AppSettings>("/settings", form);
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setBusy(false);
    }
  }

  async function emergencyStop() {
    await api.post("/system/emergency-stop", {});
    setStopConfirm(false);
    alert("Vészleállító aktiválva — az összes ágensfolyamat leállt.");
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: "apikeys", label: tx.settings.apiKeys },
    { id: "telegram", label: tx.settings.telegram },
    { id: "limits", label: tx.settings.limits },
    { id: "ollama", label: tx.settings.ollama },
    { id: "host", label: tx.settings.host },
    { id: "danger", label: tx.settings.danger },
  ];

  return (
    <div className="flex h-full">
      <nav className="w-40 flex-shrink-0 border-r border-white/10 p-3 space-y-0.5">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              tab === id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}>
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        {/* ── API kulcsok ── */}
        {tab === "apikeys" && (
          <Section title={tx.settings.apiKeys}>
            <p className="mb-3 text-xs text-white/40">
              Több kulcs is megadható ugyanahhoz a szolgáltatóhoz — a rendszer ezeket round-robin terheléselosztással rotálja.
            </p>
            {["gemini", "openai", "anthropic", "openrouter"].map((provider) => (
              <Field key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                <input type="password" className={INPUT} placeholder="API kulcs..."
                  onChange={(e) => {
                    const existing = form.apiKeys ?? [];
                    const updated = existing.filter((k) => k.provider !== provider);
                    if (e.target.value) updated.push({ id: crypto.randomUUID(), provider, secretRef: e.target.value, label: provider });
                    set({ apiKeys: updated });
                  }} />
              </Field>
            ))}
          </Section>
        )}

        {/* ── Telegram ── */}
        {tab === "telegram" && (
          <Section title={tx.settings.telegram}>
            <label className="mb-3 flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input type="checkbox" checked={form.telegram.enabled}
                onChange={(e) => set({ telegram: { ...form.telegram, enabled: e.target.checked } })}
                className="accent-emerald-500" />
              {tx.settings.enabled}
            </label>
            <Field label={tx.settings.botToken}>
              <input type="password" className={INPUT} value={form.telegram.botToken}
                onChange={(e) => set({ telegram: { ...form.telegram, botToken: e.target.value } })} />
            </Field>
            <Field label={tx.settings.chatId}>
              <input type="text" className={INPUT} value={form.telegram.chatId}
                onChange={(e) => set({ telegram: { ...form.telegram, chatId: e.target.value } })} />
            </Field>
          </Section>
        )}

        {/* ── Napi limit ── */}
        {tab === "limits" && (
          <Section title={tx.settings.limits}>
            <label className="mb-3 flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input type="checkbox" checked={form.dailyLimitEnabled}
                onChange={(e) => set({ dailyLimitEnabled: e.target.checked })}
                className="accent-emerald-500" />
              {tx.settings.limitEnabled}
            </label>
            <Field label={tx.settings.dailyLimit}>
              <input type="number" step="0.1" min="0" className={INPUT} value={form.dailyLimitUsd}
                onChange={(e) => set({ dailyLimitUsd: Number(e.target.value) })} />
            </Field>
            <p className="text-xs text-white/30">
              Ez a limit MINDEN API-hívásra vonatkozik (nappali feladatok + álmodási ciklus együtt). Az álmodás előbb lokális Ollama-ra vált, majd ha szükséges, leáll.
            </p>
          </Section>
        )}

        {/* ── Ollama ── */}
        {tab === "ollama" && (
          <Section title={tx.settings.ollama}>
            <Field label={tx.settings.ollamaUrl}>
              <input type="text" className={INPUT} value={form.ollamaBaseUrl}
                onChange={(e) => set({ ollamaBaseUrl: e.target.value })} />
            </Field>
            <Field label={tx.settings.ollamaModel}>
              <input type="text" className={INPUT} value={form.ollamaModel}
                onChange={(e) => set({ ollamaModel: e.target.value })} />
            </Field>
          </Section>
        )}

        {/* ── Gazdagép-hozzáférés ── */}
        {tab === "host" && (
          <Section title={tx.settings.host}>
            <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              form.hostAccessGranted
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}>
              {form.hostAccessGranted ? `✅ ${tx.settings.hostGranted}` : `🔒 Megtagadva`}
            </div>
            {form.hostAccessGranted ? (
              <button onClick={() => set({ hostAccessGranted: false })}
                className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
                {tx.settings.hostRevoke}
              </button>
            ) : (
              <button onClick={() => set({ hostAccessGranted: true })}
                className="rounded-lg border border-emerald-500/30 px-4 py-2 text-sm text-emerald-400 hover:bg-emerald-500/10">
                {tx.settings.hostGrant}
              </button>
            )}
          </Section>
        )}

        {/* ── Veszélyes műveletek (8.4: szándékosan mélyen) ── */}
        {tab === "danger" && (
          <Section title={tx.settings.danger}>
            <p className="mb-4 text-xs text-white/40">
              A vészleállító azonnal leáll minden ágens-folyamatot és MCP-szervert.
              Újraindításhoz töltsd újra a szervert.
            </p>
            {!stopConfirm ? (
              <button onClick={() => setStopConfirm(true)}
                className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400 hover:bg-red-500/15">
                ⛔ {tx.settings.emergencyStop}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-300">{tx.settings.emergencyStopConfirm}</p>
                <div className="flex gap-2">
                  <button onClick={emergencyStop} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500">{tx.common.yes}</button>
                  <button onClick={() => setStopConfirm(false)} className="rounded-lg px-4 py-2 text-sm text-white/40 hover:text-white">{tx.common.cancel}</button>
                </div>
              </div>
            )}
          </Section>
        )}

        {tab !== "danger" && (
          <button onClick={save} disabled={busy}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
            {saved ? tx.settings.saved : busy ? "..." : tx.settings.save}
          </button>
        )}
      </div>
    </div>
  );
}
