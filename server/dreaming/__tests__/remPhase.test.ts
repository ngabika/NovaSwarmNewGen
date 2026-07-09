import { describe, expect, it, vi } from "vitest";
import { runRemPhase, identifyRecurringThemes } from "../remPhase.js";
import { runLightPhase } from "../lightPhase.js";
import type { DreamJournalWriter, MemorySignal } from "../types.js";

const FIXED_NOW = new Date("2026-06-25T23:00:00.000Z");

function signal(id: string, content: string): MemorySignal {
  return { id, content, createdAt: FIXED_NOW.toISOString(), relevance: 0.5, queryDiversity: 0.5, conceptualRichness: 0.5 };
}

describe("REM fázis", () => {
  it("azonosítja a legalább két jelölt-sorban felbukkanó visszatérő kulcsszavakat", () => {
    const candidates = runLightPhase([
      signal("s1", "A NovaSwarm telepítő szkript bugot tartalmazott."),
      signal("s2", "A NovaSwarm Telegram integrációja hibásan működött."),
      signal("s3", "Teljesen más, egyszeri esemény."),
    ]);

    const themes = identifyRecurringThemes(candidates);
    expect(themes).toContain("novaswarm");
  });

  it("üres jelölt-listára nincs visszatérő téma", () => {
    expect(identifyRecurringThemes([])).toEqual([]);
  });

  it("CSAK a journalWriter-t hívja meg, semmilyen durable-memory writer-t nem ismer", async () => {
    const journalWriter: DreamJournalWriter = { writeJournal: vi.fn(async () => {}) };
    const candidates = runLightPhase([
      signal("s1", "ismétlődő minta egy"),
      signal("s2", "ismétlődő minta egy"),
    ]);

    const entry = await runRemPhase(candidates, journalWriter, () => FIXED_NOW);

    expect(journalWriter.writeJournal).toHaveBeenCalledTimes(1);
    expect(entry.createdAt).toBe(FIXED_NOW.toISOString());
    // típusszinten sincs durable-writer paraméter — ezt a runRemPhase szignatúrája garantálja,
    // itt csak azt ellenőrizzük, hogy a kapott bejegyzés kizárólag napló-jellegű mezőket tartalmaz.
    expect(Object.keys(entry).sort()).toEqual(["createdAt", "narrative", "themes"]);
  });
});
