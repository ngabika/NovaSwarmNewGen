import { describe, expect, it, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { runDreamCycle } from "../dreamCycle.js";
import { CostLedger } from "../../state/costLedger.js";
import type { DreamJournalWriter, DurableMemoryWriter, MemorySignal } from "../types.js";

const FIXED_NOW = new Date("2026-06-25T23:00:00.000Z");

function tmpStatePath(): string {
  return path.join(os.tmpdir(), `novaswarm-dreamcycle-ledger-${randomBytes(6).toString("hex")}.json`);
}

async function freshLedger(): Promise<CostLedger> {
  const ledger = new CostLedger(tmpStatePath(), () => FIXED_NOW);
  await ledger.load();
  return ledger;
}

function makeSignals(): MemorySignal[] {
  return [
    { id: "s1", content: "fontos, sokszor visszatérő NovaSwarm hiba", createdAt: FIXED_NOW.toISOString(), relevance: 0.9, queryDiversity: 0.8, conceptualRichness: 0.8 },
    { id: "s2", content: "fontos, sokszor visszatérő NovaSwarm hiba", createdAt: FIXED_NOW.toISOString(), relevance: 0.9, queryDiversity: 0.8, conceptualRichness: 0.8 },
    { id: "s3", content: "fontos, sokszor visszatérő NovaSwarm hiba", createdAt: FIXED_NOW.toISOString(), relevance: 0.9, queryDiversity: 0.8, conceptualRichness: 0.8 },
    { id: "s4", content: "fontos, sokszor visszatérő NovaSwarm hiba", createdAt: FIXED_NOW.toISOString(), relevance: 0.9, queryDiversity: 0.8, conceptualRichness: 0.8 },
    { id: "s5", content: "fontos, sokszor visszatérő NovaSwarm hiba", createdAt: FIXED_NOW.toISOString(), relevance: 0.9, queryDiversity: 0.8, conceptualRichness: 0.8 },
  ];
}

describe("runDreamCycle", () => {
  it("normál esetben lefuttatja mindhárom fázist és elkönyveli a becsült költséget", async () => {
    const ledger = await freshLedger();
    const durableWriter: DurableMemoryWriter = { writeDurable: vi.fn(async () => {}) };
    const journalWriter: DreamJournalWriter = { writeJournal: vi.fn(async () => {}) };

    const result = await runDreamCycle(makeSignals(), {
      costLedger: ledger,
      durableWriter,
      journalWriter,
      now: () => FIXED_NOW,
    });

    expect(result.halted).toBe(false);
    expect(result.usedLocalModel).toBe(false);
    expect(result.deep?.promoted.length).toBeGreaterThan(0);
    expect(durableWriter.writeDurable).toHaveBeenCalled();
    expect(journalWriter.writeJournal).toHaveBeenCalledTimes(1);
    expect(ledger.getState().spentTodayUsd).toBeGreaterThan(0);
  });

  it("ha a napi költséglimit elérve, a teljes ciklus kimarad — Deep/REM egyáltalán nem hívódik meg", async () => {
    const ledger = await freshLedger();
    await ledger.setDailyLimit(0.01, true);
    await ledger.recordSpend(0.01);

    const durableWriter: DurableMemoryWriter = { writeDurable: vi.fn(async () => {}) };
    const journalWriter: DreamJournalWriter = { writeJournal: vi.fn(async () => {}) };

    const result = await runDreamCycle(makeSignals(), {
      costLedger: ledger,
      durableWriter,
      journalWriter,
      now: () => FIXED_NOW,
    });

    expect(result.halted).toBe(true);
    expect(result.haltReason).toBeDefined();
    expect(durableWriter.writeDurable).not.toHaveBeenCalled();
    expect(journalWriter.writeJournal).not.toHaveBeenCalled();
  });

  it("a limit közeledésekor lokális modellre vált, de a ciklus mindhárom fázisa továbbra is lefut", async () => {
    const ledger = await freshLedger();
    await ledger.setDailyLimit(1, true);
    await ledger.recordSpend(0.92); // 90%-os küszöb fölött, de a teljes limit alatt

    const durableWriter: DurableMemoryWriter = { writeDurable: vi.fn(async () => {}) };
    const journalWriter: DreamJournalWriter = { writeJournal: vi.fn(async () => {}) };

    const result = await runDreamCycle(makeSignals(), {
      costLedger: ledger,
      durableWriter,
      journalWriter,
      now: () => FIXED_NOW,
    });

    expect(result.halted).toBe(false);
    expect(result.usedLocalModel).toBe(true);
    expect(journalWriter.writeJournal).toHaveBeenCalledTimes(1);

    const spentAfter = ledger.getState().spentTodayUsd;
    expect(spentAfter).toBeCloseTo(0.92, 5); // lokális modell -> ~0 többletköltség könyvelve
  });
});
