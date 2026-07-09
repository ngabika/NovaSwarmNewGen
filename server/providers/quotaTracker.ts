import type { ProviderId, QuotaInfo } from "./types.js";

export class QuotaTracker {
  private quotas = new Map<ProviderId, QuotaInfo>();

  /** Tényleges szolgáltatói válasz-fejlécből (pl. X-RateLimit-Remaining) érkezett adat. */
  recordReal(providerId: ProviderId, remaining: number, limit: number, resetAt: string | null): void {
    this.quotas.set(providerId, { providerId, remaining, limit, resetAt, source: "real-header" });
  }

  /** Nincs valós fejléc-adat — a UI-nak EXPLICIT "becsült érték"-ként kell megjelenítenie, sose pontos számként. */
  recordEstimate(providerId: ProviderId, remaining: number | null, limit: number | null): void {
    this.quotas.set(providerId, { providerId, remaining, limit, resetAt: null, source: "estimated" });
  }

  get(providerId: ProviderId): QuotaInfo {
    return (
      this.quotas.get(providerId) ?? { providerId, remaining: null, limit: null, resetAt: null, source: "unavailable" }
    );
  }

  getAll(): QuotaInfo[] {
    return Array.from(this.quotas.values());
  }
}
