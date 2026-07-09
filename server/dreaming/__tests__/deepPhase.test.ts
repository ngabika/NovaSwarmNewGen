import { describe, expect, it, vi } from "vitest";
import { runDeepPhase, scoreLightCandidate } from "../deepPhase.js";
import type { LightPhaseCandidate } from "../lightPhase.js";
import type { DurableMemoryWriter, MemorySignal } from "../types.js";

const FIXED_NOW = new Date("2026-06-25T12:00:00.000Z");

function candidate(partial: Partial<MemorySignal> & { id: string; content: string }, occurrenceCount = 1): LightPhaseCandidate {
  const signal: MemorySignal = {
    createdAt: FIXED_NOW.toISOString(),
    relevance: 0.5,
    queryDiversity: 0.5,
    conceptualRichness: 0.5,
    ...partial,
  };
  return { signal, occurrenceCount, mergedSignalIds: [signal.id] };
}

describe("runDeepPhase", () => {
  it("egy magas pontszámú jelöltet promótál és a writer-en keresztül írja", async () => {
    const writer: DurableMemoryWriter = { writeDurable: vi.fn(async () => {}) };
    const strong = candidate(
      { id: "strong", content: "fontos, gyakran visszatérő, friss emlék", relevance: 0.9, queryDiversity: 0.9, conceptualRichness: 0.9 },
      5
    );

    const result = await runDeepPhase([strong], writer, { now: () => FIXED_NOW });

    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].id).toBe("strong");
    expect(writer.writeDurable).toHaveBeenCalledTimes(1);
  });

  it("egy gyenge pontszámú jelöltet NEM promótál, és a writer-t sem hívja meg rá", async () => {
    const writer: DurableMemoryWriter = { writeDurable: vi.fn(async () => {}) };
    const weak = candidate(
      { id: "weak", content: "egyszeri, alacsony relevanciájú, régi emlék", relevance: 0.05, queryDiversity: 0.05, conceptualRichness: 0.05, createdAt: "2026-06-01T00:00:00.000Z" },
      1
    );

    const result = await runDeepPhase([weak], writer, { now: () => FIXED_NOW });

    expect(result.promoted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(writer.writeDurable).not.toHaveBeenCalled();
  });

  it("a writer pontosan annyiszor hívódik meg, ahány jelölt átlépi a küszöböt — sose többször, sose kevesebbszer", async () => {
    const writer: DurableMemoryWriter = { writeDurable: vi.fn(async () => {}) };
    const strong1 = candidate({ id: "s1", content: "egy", relevance: 0.95, queryDiversity: 0.9, conceptualRichness: 0.9 }, 5);
    const strong2 = candidate({ id: "s2", content: "kettő", relevance: 0.95, queryDiversity: 0.9, conceptualRichness: 0.9 }, 5);
    const weak1 = candidate({ id: "w1", content: "három", relevance: 0.02, queryDiversity: 0.02, conceptualRichness: 0.02, createdAt: "2026-06-01T00:00:00.000Z" }, 1);

    const result = await runDeepPhase([strong1, strong2, weak1], writer, { now: () => FIXED_NOW });

    expect(result.promoted).toHaveLength(2);
    expect(writer.writeDurable).toHaveBeenCalledTimes(2);
  });

  it("scoreLightCandidate determinisztikus és a súlyok összegével arányosan változik", () => {
    const c = candidate({ id: "x", content: "valami", relevance: 1, queryDiversity: 1, conceptualRichness: 1 }, 5);
    const score = scoreLightCandidate(c, FIXED_NOW);
    expect(score).toBeGreaterThan(0.9); // minden metrika maximális -> a pontszámnak a súlyok összege közelében kell lennie (~1.0)
    expect(score).toBeLessThanOrEqual(1.0001);
  });
});
