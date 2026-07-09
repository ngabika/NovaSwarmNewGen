import type { DreamJournalEntry, DreamJournalWriter } from "./types.js";
import type { LightPhaseCandidate } from "./lightPhase.js";

const STOPWORDS = new Set([
  "hogy", "nincs", "csak", "akkor", "mert", "amit", "amely", "egy", "ezt", "azt", "lesz", "vagy", "majd",
]);

function extractKeywords(content: string): string[] {
  return content
    .toLowerCase()
    .split(/[^a-zá-űáéíóöőúüű0-9]+/i)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

/**
 * Visszatérő témák azonosítása (14.2. pont, REM fázis): legalább két
 * különböző jelölt-sorban felbukkanó kulcsszavak, gyakoriság szerint
 * rendezve.
 */
export function identifyRecurringThemes(candidates: LightPhaseCandidate[]): string[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const uniqueWordsInThisCandidate = new Set(extractKeywords(candidate.signal.content));
    for (const word of uniqueWordsInThisCandidate) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

function buildNarrative(themes: string[]): string {
  if (themes.length === 0) {
    return "Nem volt azonosítható visszatérő téma ebben az álmodási ciklusban.";
  }
  return `Az elmúlt ciklusban visszatérő témák: ${themes.slice(0, 8).join(", ")}.`;
}

/**
 * REM fázis: olvasható "álomnapló"-bejegyzést készít. EZ NEM promóciós
 * forrás — a függvény szándékosan csak `DreamJournalWriter`-t kap, nem
 * `DurableMemoryWriter`-t, így architekturálisan sem tud tartós memóriát
 * promótálni.
 */
export async function runRemPhase(
  candidates: LightPhaseCandidate[],
  journalWriter: DreamJournalWriter,
  now: () => Date = () => new Date()
): Promise<DreamJournalEntry> {
  const themes = identifyRecurringThemes(candidates);
  const entry: DreamJournalEntry = {
    createdAt: now().toISOString(),
    themes,
    narrative: buildNarrative(themes),
  };
  await journalWriter.writeJournal(entry);
  return entry;
}
