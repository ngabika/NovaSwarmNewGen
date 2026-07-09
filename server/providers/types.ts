export type ProviderId = "gemini" | "openai" | "anthropic" | "openrouter" | "ollama";

export type CostCategory = "free" | "low" | "medium" | "high" | "unknown";

export interface ProviderApiKey {
  id: string;
  providerId: ProviderId;
  /** Nem a nyers titkot tároljuk itt memóriában hosszabb ideig, mint szükséges — ez egy referencia/azonosító. */
  secretRef: string;
  label?: string;
  /** Ha egy kulcs nemrég hibázott, ameddig kihagyjuk a rotációból (lásd 11.5: ne próbáljuk újra ugyanazt a hibás kapcsolatot). */
  disabledUntil?: string | null;
}

export interface ModelInfo {
  id: string;
  providerId: ProviderId;
  displayName?: string;
  costCategory: CostCategory;
  /**
   * "dynamic-priced": a szolgáltató API-ja konkrét ár-mezőt adott vissza (pl. OpenRouter).
   * "local-table": a lokális ár/kategória-táblázatból került ide, mert a szolgáltató NEM ad ár-infót.
   * "unknown": se dinamikus ár, se találat a lokális táblázatban.
   */
  costSource: "dynamic-priced" | "local-table" | "unknown";
  isFree: boolean;
}

export interface QuotaInfo {
  providerId: ProviderId;
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
  /**
   * "real-header": tényleges szolgáltatói válasz-fejlécből származó adat.
   * "estimated": nincs valós adat, becslés — a UI-nak ezt EXPLICIT jelölnie kell (3.3 elv).
   * "unavailable": semmilyen adat nincs.
   */
  source: "real-header" | "estimated" | "unavailable";
}

export interface AttemptResult {
  providerId: ProviderId;
  keyId?: string;
  ok: boolean;
  errorMessage?: string;
  latencyMs?: number;
}

export interface FailoverResult {
  ok: boolean;
  providerId?: ProviderId;
  text?: string;
  attempts: AttemptResult[];
  /** Ha MINDEN csatorna elbukott, itt az összes próbálkozás részletes hibája — sose egy homályos összefoglaló (11.5). */
  detailedFailureMessage?: string;
  /** Ha a napi költséglimit miatt egyáltalán nem indult el próbálkozás (14.3). */
  haltedByCostLimit?: boolean;
}

export interface LlmCallParams {
  prompt: string;
}
