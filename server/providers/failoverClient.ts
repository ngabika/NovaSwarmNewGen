import type { AttemptResult, FailoverResult, LlmCallParams, ProviderId } from "./types.js";
import { KeyPool } from "./keyPool.js";
import { CostLedger } from "../state/costLedger.js";

export interface ProviderCallResponse {
  text: string;
  /** Valós válasz-fejléc-adat a kvótáról, ha a szolgáltató ad ilyet. */
  realQuota?: { remaining: number; limit: number; resetAt: string | null };
}

/**
 * Egyetlen valódi hívás egy konkrét szolgáltató felé egy konkrét kulccsal
 * (vagy Ollama esetén kulcs nélkül). A tényleges HTTP-kommunikációt ez az
 * interfész rejti el — így a failover-logika tesztelhető valós hálózati
 * hívás nélkül, és a produkciós implementáció (Gemini/OpenAI/Anthropic/
 * OpenRouter/Ollama kliens) cserélhető anélkül, hogy a láncot érintené.
 */
export interface ProviderTransport {
  call(providerId: ProviderId, apiKeyRef: string | null, params: LlmCallParams): Promise<ProviderCallResponse>;
}

export interface FailoverChainLink {
  providerId: ProviderId;
  /** `null` jelenti a lokális Ollama-t, amihez nem kell kulcs-pool. */
  keyPool: KeyPool | null;
}

export interface FailoverClientOptions {
  initialBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A próbálkozási sorrend megvalósítása (11.5. pont): elsődleges szolgáltató
 * (kulcs-pool rotációval) → másodlagos felhős szolgáltató (kulcs-pool
 * rotációval) → lokális Ollama, exponenciálisan növekvő várakozási idővel.
 * Ha a napi költséglimit közeledik (14.3), a lánc sorrendje átalakul úgy,
 * hogy a lokális Ollama kerül előre.
 */
export class FailoverClient {
  private readonly initialBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly chain: FailoverChainLink[],
    private readonly transport: ProviderTransport,
    private readonly costLedger: CostLedger,
    options: FailoverClientOptions = {}
  ) {
    this.initialBackoffMs = options.initialBackoffMs ?? 250;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private buildEffectiveChain(): FailoverChainLink[] {
    const throttle = this.costLedger.evaluateThrottle(this.estimateNextCallCostUsd());
    if (throttle === "switch-to-local") {
      const ollama = this.chain.filter((l) => l.providerId === "ollama");
      const others = this.chain.filter((l) => l.providerId !== "ollama");
      return [...ollama, ...others];
    }
    return this.chain;
  }

  /**
   * Egyszerűsített becslés egy hívás várható költségére, amíg a tényleges
   * token-alapú számítás (amely a modell-választástól is függ) a hívó
   * felelőssége marad. A konzervatív, kis felülbecslés szándékos: inkább
   * korábban váltson lokálisra, mint hogy túllője a napi limitet.
   */
  private estimateNextCallCostUsd(): number {
    return 0.01;
  }

  async send(params: LlmCallParams): Promise<FailoverResult> {
    const haltDecision = this.costLedger.evaluateThrottle(this.estimateNextCallCostUsd());
    if (haltDecision === "halt") {
      return {
        ok: false,
        attempts: [],
        haltedByCostLimit: true,
        detailedFailureMessage:
          "Napi költséglimit elérve – minden felhős ÉS lokális hívás szüneteltetve. Értesítés kiküldve (felület + Telegram).",
      };
    }

    const effectiveChain = this.buildEffectiveChain();
    const attempts: AttemptResult[] = [];
    let backoffMs = this.initialBackoffMs;

    for (const link of effectiveChain) {
      const isOllama = link.keyPool === null;

      if (!isOllama && link.keyPool!.size() === 0) {
        attempts.push({ providerId: link.providerId, ok: false, errorMessage: "nincs konfigurált API kulcs ehhez a szolgáltatóhoz" });
        continue;
      }

      const maxKeyAttempts = isOllama ? 1 : link.keyPool!.size();

      for (let i = 0; i < maxKeyAttempts; i++) {
        const key = isOllama ? null : link.keyPool!.next();
        if (!isOllama && !key) {
          attempts.push({
            providerId: link.providerId,
            ok: false,
            errorMessage: "minden kulcs átmenetileg hibásnak jelölve (backoff alatt)",
          });
          break;
        }

        const startedAt = Date.now();
        try {
          const response = await this.transport.call(link.providerId, key?.secretRef ?? null, params);
          if (key) link.keyPool!.markSucceeded(key.id);
          attempts.push({ providerId: link.providerId, keyId: key?.id, ok: true, latencyMs: Date.now() - startedAt });
          await this.costLedger.recordSpend(this.estimateNextCallCostUsd());
          return { ok: true, providerId: link.providerId, text: response.text, attempts };
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (key) link.keyPool!.markFailed(key.id, backoffMs);
          attempts.push({ providerId: link.providerId, keyId: key?.id, ok: false, errorMessage, latencyMs: Date.now() - startedAt });
          await this.sleep(backoffMs);
          backoffMs *= 2;
        }
      }
    }

    return {
      ok: false,
      attempts,
      detailedFailureMessage: this.formatDetailedFailure(attempts),
    };
  }

  /**
   * MINDIG az összes kipróbált csatorna eredményét részletezi — sose egy
   * homályos, végső "minden modell kimerült" összefoglalót (11.5. pont).
   */
  private formatDetailedFailure(attempts: AttemptResult[]): string {
    if (attempts.length === 0) return "Nem indult el próbálkozás (üres lánc-konfiguráció).";
    return attempts
      .map((a) => `[${a.providerId}${a.keyId ? ":" + a.keyId : ""}]: ${a.ok ? "ok" : a.errorMessage ?? "ismeretlen hiba"}`)
      .join(" | ");
  }
}
