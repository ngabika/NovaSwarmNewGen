import { describe, expect, it } from "vitest";
import { runLightPhase } from "../lightPhase.js";
import type { MemorySignal } from "../types.js";

function signal(partial: Partial<MemorySignal> & { id: string; content: string }): MemorySignal {
  return {
    createdAt: "2026-06-25T08:00:00.000Z",
    relevance: 0.5,
    queryDiversity: 0.5,
    conceptualRichness: 0.5,
    ...partial,
  };
}

describe("runLightPhase", () => {
  it("kiszűri a duplikátumokat és megszámolja az előfordulásokat", () => {
    const signals: MemorySignal[] = [
      signal({ id: "s1", content: "A felhasználó a NovaSwarm projekten dolgozik." }),
      signal({ id: "s2", content: "A felhasználó a NovaSwarm projekten dolgozik." }),
      signal({ id: "s3", content: "  A FELHASZNÁLÓ a NovaSwarm projekten dolgozik.  " }),
      signal({ id: "s4", content: "Teljesen más tartalom." }),
    ];

    const result = runLightPhase(signals);

    expect(result).toHaveLength(2);
    const novaSwarmCandidate = result.find((c) => c.signal.content.includes("NovaSwarm"));
    expect(novaSwarmCandidate?.occurrenceCount).toBe(3);
    expect(novaSwarmCandidate?.mergedSignalIds.sort()).toEqual(["s1", "s2", "s3"]);
  });

  it("egyedi tartalomnál occurrenceCount = 1", () => {
    const result = runLightPhase([signal({ id: "s1", content: "egyedi tartalom" })]);
    expect(result[0].occurrenceCount).toBe(1);
  });

  it("üres bemenetre üres listát ad", () => {
    expect(runLightPhase([])).toEqual([]);
  });

  it("pure function — nincs paraméterében semmilyen writer, így architekturálisan sem tud tartós memóriát írni", () => {
    // Ez a teszt magát a függvény-szignatúrát/viselkedést dokumentálja: a
    // visszatérési érték kizárólag in-memory adatszerkezet, oldalhatás nélkül.
    const before = JSON.stringify([signal({ id: "s1", content: "x" })]);
    const input = JSON.parse(before) as MemorySignal[];
    runLightPhase(input);
    expect(JSON.stringify(input)).toBe(before); // a bemenet sem módosul
  });
});
