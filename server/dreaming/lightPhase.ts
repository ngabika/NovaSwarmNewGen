import type { MemorySignal } from "./types.js";

export interface LightPhaseCandidate {
  signal: MemorySignal;
  occurrenceCount: number;
  mergedSignalIds: string[];
}

function normalizationKey(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Light fázis (14.2. pont): a friss, rövid-távú memóriajeleket és a
 * legutóbbi beszélgetés-kivonatokat összegyűjti, duplikátumokat sző ki, és
 * jelölt-sorokat készít a Deep fázishoz. Szándékosan PURE FUNCTION — nincs
 * semmilyen írási képessége, ami architekturálisan garantálja, hogy ez a
 * fázis NEM ír tartós memóriát.
 */
export function runLightPhase(rawSignals: MemorySignal[]): LightPhaseCandidate[] {
  const byKey = new Map<string, LightPhaseCandidate>();

  for (const signal of rawSignals) {
    const key = normalizationKey(signal.content);
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.mergedSignalIds.push(signal.id);
      // a legfrissebb előfordulás időbélyegét/metrikáit tartjuk meg referenciaként
      if (Date.parse(signal.createdAt) > Date.parse(existing.signal.createdAt)) {
        existing.signal = signal;
      }
    } else {
      byKey.set(key, { signal, occurrenceCount: 1, mergedSignalIds: [signal.id] });
    }
  }

  return Array.from(byKey.values());
}
