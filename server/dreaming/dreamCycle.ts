import { runLightPhase, type LightPhaseCandidate } from "./lightPhase.js";
import { runDeepPhase, type DeepPhaseResult, type DeepPhaseOptions } from "./deepPhase.js";
import { runRemPhase } from "./remPhase.js";
import type { DreamJournalEntry, DreamJournalWriter, DurableMemoryWriter, MemorySignal } from "./types.js";
import { CostLedger } from "../state/costLedger.js";

/** Egy teljes álmodási kör (összegzés + LLM-hívások) becsült költsége. Konzervatív felülbecslés. */
const ESTIMATED_DREAM_CYCLE_COST_USD = 0.02;

export interface DreamCycleDeps {
  costLedger: CostLedger;
  durableWriter: DurableMemoryWriter;
  journalWriter: DreamJournalWriter;
  now?: () => Date;
  deepPhaseOptions?: DeepPhaseOptions;
}

export interface DreamCycleResult {
  ranAt: string;
  halted: boolean;
  haltReason?: string;
  usedLocalModel: boolean;
  light: LightPhaseCandidate[];
  deep?: DeepPhaseResult;
  rem?: DreamJournalEntry;
}

/**
 * 10 perc inaktivitás után (vagy konfigurált ütemezés alapján) induló teljes
 * álmodási kör: Light → Deep → REM, ugyanazt a globális, MINDEN API-hívásra
 * vonatkozó napi költséglimitet tiszteletben tartva, amit a provider-
 * failover lánc (1. komponens) is használ (14.3. pont: az álmodás csak EGY
 * fogyasztója a közös keretnek, nem egy különálló, saját limit).
 */
export async function runDreamCycle(rawSignals: MemorySignal[], deps: DreamCycleDeps): Promise<DreamCycleResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();

  const throttle = deps.costLedger.evaluateThrottle(ESTIMATED_DREAM_CYCLE_COST_USD);

  if (throttle === "halt") {
    return {
      ranAt: startedAt.toISOString(),
      halted: true,
      haltReason:
        "Napi költséglimit elérve – az álmodási ciklus ezúttal kimarad. Értesítés kiküldve (felület + Telegram).",
      usedLocalModel: false,
      light: [],
    };
  }

  const usedLocalModel = throttle === "switch-to-local";

  const light = runLightPhase(rawSignals);
  const deep = await runDeepPhase(light, deps.durableWriter, { ...deps.deepPhaseOptions, now });
  const rem = await runRemPhase(light, deps.journalWriter, now);

  // Lokális modell esetén a költség elhanyagolható (gyakorlatilag 0), de a
  // tényt rögzítjük; felhős modell esetén a becsült költséget könyveljük el
  // a KÖZÖS keretbe, amit a nappali, provider-failover hívások is fogyasztanak.
  await deps.costLedger.recordSpend(usedLocalModel ? 0 : ESTIMATED_DREAM_CYCLE_COST_USD);

  return {
    ranAt: startedAt.toISOString(),
    halted: false,
    usedLocalModel,
    light,
    deep,
    rem,
  };
}
