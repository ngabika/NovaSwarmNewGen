import { describe, expect, it } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { CostLedger } from "../costLedger.js";

function tmpStatePath(): string {
  return path.join(os.tmpdir(), `novaswarm-costledger-direct-${randomBytes(6).toString("hex")}.json`);
}

describe("CostLedger", () => {
  it("alapértelmezetten bekapcsolt, 1 USD/nap limittel indul (14.3. pont javasolt alapérték)", async () => {
    const ledger = new CostLedger(tmpStatePath());
    await ledger.load();
    expect(ledger.getState().enabled).toBe(true);
    expect(ledger.getState().dailyLimitUsd).toBe(1.0);
  });

  it("recordSpend perzisztálódik egy új betöltés után is", async () => {
    const statePath = tmpStatePath();
    const fixedNow = () => new Date("2026-06-25T10:00:00.000Z");
    const ledger = new CostLedger(statePath, fixedNow);
    await ledger.load();
    await ledger.recordSpend(0.25);

    const reloaded = new CostLedger(statePath, fixedNow);
    await reloaded.load();
    expect(reloaded.getState().spentTodayUsd).toBeCloseTo(0.25, 6);
  });

  it("napváltáskor (UTC nap) automatikusan nullázza a napi elköltött összeget", async () => {
    const statePath = tmpStatePath();
    let current = new Date("2026-06-25T23:50:00.000Z");
    const ledger = new CostLedger(statePath, () => current);
    await ledger.load();
    await ledger.recordSpend(0.9);
    expect(ledger.getState().spentTodayUsd).toBeCloseTo(0.9, 6);

    current = new Date("2026-06-26T00:05:00.000Z"); // másnap
    expect(ledger.getState().spentTodayUsd).toBe(0);
  });

  it("evaluateThrottle 'normal'-t ad vissza messze a limit alatt", async () => {
    const ledger = new CostLedger(tmpStatePath(), () => new Date("2026-06-25T10:00:00.000Z"));
    await ledger.load();
    expect(ledger.evaluateThrottle(0.01)).toBe("normal");
  });

  it("evaluateThrottle 'switch-to-local'-t ad vissza a 90%-os küszöb fölött", async () => {
    const ledger = new CostLedger(tmpStatePath(), () => new Date("2026-06-25T10:00:00.000Z"));
    await ledger.load();
    await ledger.setDailyLimit(1, true);
    await ledger.recordSpend(0.91);
    expect(ledger.evaluateThrottle(0.001)).toBe("switch-to-local");
  });

  it("evaluateThrottle 'halt'-ot ad vissza, ha a limit elérve vagy túllépve", async () => {
    const ledger = new CostLedger(tmpStatePath(), () => new Date("2026-06-25T10:00:00.000Z"));
    await ledger.load();
    await ledger.setDailyLimit(1, true);
    await ledger.recordSpend(1.0);
    expect(ledger.evaluateThrottle(0.0001)).toBe("halt");
  });

  it("ha a limit ki van kapcsolva, mindig 'normal'-t ad vissza, függetlenül a költéstől", async () => {
    const ledger = new CostLedger(tmpStatePath(), () => new Date("2026-06-25T10:00:00.000Z"));
    await ledger.load();
    await ledger.setDailyLimit(1, false);
    await ledger.recordSpend(5);
    expect(ledger.evaluateThrottle(10)).toBe("normal");
  });
});
