import { useState } from "react";
import { api } from "../../lib/api.js";
import { t, LANGUAGE_OPTIONS, type Locale } from "../../locales/i18n.js";

interface WizardState {
  language: Locale;
  geminiKey: string; openaiKey: string; anthropicKey: string; openrouterKey: string; localOnly: boolean;
  telegramToken: string; telegramChatId: string;
  userProfile: string;
  agentName: string; agentRole: string; agentInstruction: string;
  hostAccess: boolean | null;
}

const ARCHETYPES = [
  { key: "general", emoji: "🤖", role: "general", instruction: "Légy egy általános, segítőkész digitális asszisztens. Segíts bármilyen kérdésben vagy feladatban." },
  { key: "dev", emoji: "👨‍💻", role: "developer", instruction: "Fejlesztő Copilot vagy. Segíts kódírásban, debuggolásban, code review-ban és szoftverarchitektúra tervezésben." },
  { key: "business", emoji: "💼", role: "business", instruction: "Üzleti és stratégiai tanácsadó vagy. Segíts döntéshozatalban, piacelemzésben és tervek kidolgozásában." },
  { key: "ops", emoji: "🖥️", role: "ops", instruction: "Rendszerüzemeltető és biztonsági szakértő vagy. Kezeld a szerver infrastruktúrát, figyelj a biztonságra és a teljesítményre." },
] as const;

const TOTAL_STEPS = 6;

interface Props { onComplete: () => void; }

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${i < step ? "bg-emerald-500" : i === step - 1 ? "bg-emerald-400" : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}

export default function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>({
    language: "hu", geminiKey: "", openaiKey: "", anthropicKey: "", openrouterKey: "", localOnly: false,
    telegramToken: "", telegramChatId: "",
    userProfile: "",
    agentName: "", agentRole: "general", agentInstruction: "",
    hostAccess: null,
  });

  const tx = t(state.language);
  const set = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  const canAdvance = () => {
    if (step === 2) return state.localOnly || !!state.geminiKey || !!state.openaiKey || !!state.anthropicKey || !!state.openrouterKey;
    if (step === 4) return state.userProfile.trim().length > 10;
    if (step === 5) return state.agentName.trim().length >= 2 && state.agentInstruction.trim().length >= 10;
    if (step === 6) return state.hostAccess !== null;
    return true;
  };

  async function finish() {
    setBusy(true); setError(null);
    try {
      const apiKeys = [];
      if (state.geminiKey) apiKeys.push({ id: crypto.randomUUID(), provider: "gemini", secretRef: state.geminiKey, label: "Gemini" });
      if (state.openaiKey) apiKeys.push({ id: crypto.randomUUID(), provider: "openai", secretRef: state.openaiKey, label: "OpenAI" });
      if (state.anthropicKey) apiKeys.push({ id: crypto.randomUUID(), provider: "anthropic", secretRef: state.anthropicKey, label: "Anthropic" });
      if (state.openrouterKey) apiKeys.push({ id: crypto.randomUUID(), provider: "openrouter", secretRef: state.openrouterKey, label: "OpenRouter" });

      await api.post("/onboarding/complete", {
        settings: {
          language: state.language,
          userProfile: state.userProfile,
          apiKeys,
          hostAccessGranted: state.hostAccess === true,
          telegram: { botToken: state.telegramToken, chatId: state.telegramChatId, enabled: !!(state.telegramToken && state.telegramChatId) },
          primaryProviderId: state.geminiKey ? "gemini" : state.openaiKey ? "openai" : state.anthropicKey ? "anthropic" : state.openrouterKey ? "openrouter" : "ollama",
        },
        firstAgent: {
          name: state.agentName,
          avatar: ARCHETYPES.find((a) => a.role === state.agentRole)?.emoji ?? "🤖",
          role: state.agentRole,
          parentAgentId: null,
          systemInstruction: state.agentInstruction,
          assignedModel: "default",
          assignedProvider: "ollama",
          webSearchEnabled: false,
          hostCommandEnabled: state.hostAccess === true,
          active: true,
        },
      });
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070908] p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="mb-1 text-xl font-semibold text-emerald-400">{tx.setup.title}</h1>
          <p className="mb-3 text-xs text-white/40">{tx.setup.step} {step} {tx.setup.of} {TOTAL_STEPS}</p>
          <ProgressBar step={step} />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0f1511] p-6">
          {/* ── Lépés 1: Nyelv ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-medium text-white">{tx.setup.lang}</h2>
              <p className="text-sm text-white/50">{tx.setup.langDesc}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => set({ language: lang.code })}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      state.language === lang.code
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 text-white/60 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <div className="font-medium">{lang.native}</div>
                    <div className="text-xs opacity-60">{lang.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Lépés 2: API kulcsok ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-medium text-white">{tx.setup.apiKeys}</h2>
              <p className="text-sm text-white/50">{tx.setup.apiKeysDesc}</p>
              {[
                { label: tx.setup.geminiKey, key: "geminiKey" as const },
                { label: tx.setup.openaiKey, key: "openaiKey" as const },
                { label: tx.setup.anthropicKey, key: "anthropicKey" as const },
                { label: tx.setup.openrouterKey, key: "openrouterKey" as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs text-white/50">{label}</label>
                  <input
                    type="password"
                    value={state[key]}
                    onChange={(e) => set({ [key]: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-emerald-500/50 focus:outline-none"
                    placeholder="sk-..."
                    disabled={state.localOnly}
                  />
                </div>
              ))}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={state.localOnly} onChange={(e) => set({ localOnly: e.target.checked })} className="accent-emerald-500" />
                {tx.setup.orLocalOnly}
              </label>
            </div>
          )}

          {/* ── Lépés 3: Telegram ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-medium text-white">{tx.setup.telegram}</h2>
              <p className="text-sm text-white/50">{tx.setup.telegramDesc}</p>
              <div>
                <label className="mb-1 block text-xs text-white/50">{tx.setup.botToken}</label>
                <input type="password" value={state.telegramToken} onChange={(e) => set({ telegramToken: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none" placeholder="123456:ABC..." />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">{tx.setup.chatId}</label>
                <input type="text" value={state.telegramChatId} onChange={(e) => set({ telegramChatId: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none" placeholder="-100123456789" />
              </div>
            </div>
          )}

          {/* ── Lépés 4: Felhasználói profil ── */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="font-medium text-white">{tx.setup.profile}</h2>
              <p className="text-sm text-white/50">{tx.setup.profileDesc}</p>
              <textarea
                value={state.userProfile}
                onChange={(e) => set({ userProfile: e.target.value })}
                rows={6}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-emerald-500/50 focus:outline-none"
                placeholder={tx.setup.profilePlaceholder}
              />
              <p className="text-right text-xs text-white/30">{state.userProfile.length} karakter (min. 10)</p>
            </div>
          )}

          {/* ── Lépés 5: Első ágens ── */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="font-medium text-white">{tx.setup.firstAgent}</h2>
              <p className="text-sm text-white/50">{tx.setup.firstAgentDesc}</p>
              <div className="grid grid-cols-2 gap-2">
                {ARCHETYPES.map((arch) => {
                  const label = tx.setup.archetypes[arch.key as keyof typeof tx.setup.archetypes];
                  return (
                    <button key={arch.key}
                      onClick={() => set({ agentRole: arch.role, agentInstruction: arch.instruction, agentName: state.agentName || label })}
                      className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                        state.agentRole === arch.role
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-white/10 text-white/60 hover:border-white/20"
                      }`}
                    >
                      <span className="mr-2 text-xl">{arch.emoji}</span>{label}
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">{tx.setup.agentName}</label>
                <input type="text" value={state.agentName} onChange={(e) => set({ agentName: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">{tx.setup.agentInstruction}</label>
                <textarea rows={3} value={state.agentInstruction} onChange={(e) => set({ agentInstruction: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none" />
              </div>
            </div>
          )}

          {/* ── Lépés 6: Host-hozzáférés ── */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="font-medium text-white">{tx.setup.hostAccess}</h2>
              <p className="text-sm text-white/50">{tx.setup.hostAccessDesc}</p>
              <div className="space-y-2">
                <button onClick={() => set({ hostAccess: true })}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    state.hostAccess === true ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-white/60 hover:border-white/20"
                  }`}>
                  ✅ {tx.setup.grant}
                </button>
                <button onClick={() => set({ hostAccess: false })}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    state.hostAccess === false ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-white/10 text-white/60 hover:border-white/20"
                  }`}>
                  🔒 {tx.setup.deny}
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>

        <div className="mt-4 flex justify-between">
          <button onClick={() => setStep((s) => s - 1)} disabled={step === 1}
            className="rounded-lg px-4 py-2 text-sm text-white/50 hover:text-white disabled:opacity-30">
            ← {tx.setup.back}
          </button>
          <div className="flex gap-2">
            {step === 3 && (
              <button onClick={() => setStep((s) => s + 1)} className="rounded-lg px-4 py-2 text-sm text-white/40 hover:text-white">
                {tx.setup.skip}
              </button>
            )}
            {step < TOTAL_STEPS ? (
              <button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
                {tx.setup.next} →
              </button>
            ) : (
              <button onClick={finish} disabled={!canAdvance() || busy}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
                {busy ? "..." : tx.setup.finish}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
