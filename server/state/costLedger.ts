import { atomicWriteJson, readJsonIfExists } from "./atomicFile.js";

export interface CostLedgerState {
  dailyLimitUsd: number;
  enabled: boolean;
  /** YYYY-MM-DD (UTC) — amikor a nap kezdődött, amihez a spentTodayUsd tartozik. */
  dayKey: string;
  spentTodayUsd: number;
}

export type ThrottleDecision = "normal" | "switch-to-local" | "halt";

const DEFAULT_DAILY_LIMIT_USD = 1.0; // spec 14.3 javasolt alapérték

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * A NAPI költséglimit EGYETLEN forrása a teljes rendszerben (3.1 elv).
 * Ezt fogyasztja a provider-failover lánc (1. komponens) ÉS az Álmodás-
 * ciklus (4. komponens) is — nem csak az álmodásra korlátozódik, mert a
 * specifikáció 14.3 pontja explicit kimondja, hogy ez egy közös,
 * MINDEN API-hívásra vonatkozó keret.
 */
export class CostLedger {
  private state: CostLedgerState = {
    dailyLimitUsd: DEFAULT_DAILY_LIMIT_USD,
    enabled: true, // alapértelmezetten bekapcsolt, spec szerint
    dayKey: todayKey(new Date()),
    spentTodayUsd: 0,
  };
  private loaded = false;

  constructor(
    private readonly statePath: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async load(): Promise<void> {
    const persisted = await readJsonIfExists<CostLedgerState>(this.statePath);
    if (persisted) {
      this.state = persisted;
    }
    this.loaded = true;
    this.rolloverIfNewDay();
  }

  private assertLoaded(): void {
    if (!this.loaded) {
      throw new Error("CostLedger.load() nem futott le – induláskor kötelező betölteni a perzisztált állapotot.");
    }
  }

  private rolloverIfNewDay(): void {
    const key = todayKey(this.now());
    if (key !== this.state.dayKey) {
      this.state = { ...this.state, dayKey: key, spentTodayUsd: 0 };
    }
  }

  getState(): Readonly<CostLedgerState> {
    this.assertLoaded();
    this.rolloverIfNewDay();
    return this.state;
  }

  async setDailyLimit(limitUsd: number, enabled: boolean): Promise<void> {
    this.assertLoaded();
    this.state = { ...this.state, dailyLimitUsd: limitUsd, enabled };
    await this.persist();
  }

  async recordSpend(amountUsd: number): Promise<void> {
    this.assertLoaded();
    this.rolloverIfNewDay();
    this.state = { ...this.state, spentTodayUsd: this.state.spentTodayUsd + amountUsd };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await atomicWriteJson(this.statePath, this.state);
  }

  /**
   * Eldönti, hogy egy következő API-hívás normálisan mehet-e felhős
   * szolgáltatóra, át kell-e váltani a lokális Ollama-ra, vagy teljesen le
   * kell állni (14.3. pont: limit közeledésekor előbb lokálisra váltás,
   * majd teljes leállás + értesítés).
   */
  evaluateThrottle(estimatedNextCallUsd: number): ThrottleDecision {
    this.assertLoaded();
    this.rolloverIfNewDay();
    if (!this.state.enabled) return "normal";

    const projected = this.state.spentTodayUsd + estimatedNextCallUsd;
    const softThreshold = this.state.dailyLimitUsd * 0.9;

    if (this.state.spentTodayUsd >= this.state.dailyLimitUsd) return "halt";
    if (projected >= this.state.dailyLimitUsd) return "halt";
    if (projected >= softThreshold) return "switch-to-local";
    return "normal";
  }
}
