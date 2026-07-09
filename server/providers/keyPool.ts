import type { ProviderApiKey } from "./types.js";

/**
 * Egy szolgáltatóhoz tartozó, tetszőleges számú kulcsot tartalmazó,
 * körbeforgó (round-robin) készlet (11.1. pont). A `next()` SOHA nem ad
 * vissza egy olyan kulcsot, amely még a saját backoff-ablakában van —
 * így a failover-lánc garantáltan nem próbálja meg újra ugyanazt a már
 * hibásnak bizonyult kapcsolatot (11.5. pont).
 */
export class KeyPool {
  private cursor = 0;

  constructor(private readonly keys: ProviderApiKey[]) {}

  size(): number {
    return this.keys.length;
  }

  /** Hány kulcs van jelenleg backoff alatt (diagnosztikához). */
  disabledCount(now: number = Date.now()): number {
    return this.keys.filter((k) => k.disabledUntil && Date.parse(k.disabledUntil) > now).length;
  }

  next(now: number = Date.now()): ProviderApiKey | null {
    if (this.keys.length === 0) return null;
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.cursor + i) % this.keys.length;
      const candidate = this.keys[idx];
      const disabledUntil = candidate.disabledUntil ? Date.parse(candidate.disabledUntil) : 0;
      if (disabledUntil <= now) {
        this.cursor = (idx + 1) % this.keys.length;
        return candidate;
      }
    }
    return null; // minden kulcs átmenetileg hibás (backoff alatt)
  }

  markFailed(keyId: string, backoffMs: number, now: number = Date.now()): void {
    const key = this.keys.find((k) => k.id === keyId);
    if (key) key.disabledUntil = new Date(now + backoffMs).toISOString();
  }

  markSucceeded(keyId: string): void {
    const key = this.keys.find((k) => k.id === keyId);
    if (key) key.disabledUntil = null;
  }
}
