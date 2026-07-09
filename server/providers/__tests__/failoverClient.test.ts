import { describe, expect, it, vi } from "vitest";
import { FailoverClient, type ProviderTransport, type ProviderCallResponse } from "../failoverClient.js";
import { KeyPool } from "../keyPool.js";
import { CostLedger } from "../../state/costLedger.js";
import type { ProviderId } from "../types.js";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

function tmpStatePath(): string {
  return path.join(os.tmpdir(), `novaswarm-costledger-${randomBytes(6).toString("hex")}.json`);
}

async function freshLedger(now: () => Date = () => new Date("2026-06-25T10:00:00.000Z")): Promise<CostLedger> {
  const ledger = new CostLedger(tmpStatePath(), now);
  await ledger.load();
  return ledger;
}

describe("FailoverClient", () => {
  it("ha az elsődleges szolgáltató sikeres, NEM próbálkozik a másodlagossal vagy az Ollama-val", async () => {
    const ledger = await freshLedger();
    const calls: ProviderId[] = [];
    const transport: ProviderTransport = {
      call: vi.fn(async (providerId): Promise<ProviderCallResponse> => {
        calls.push(providerId);
        return { text: `válasz innen: ${providerId}` };
      }),
    };

    const client = new FailoverClient(
      [
        { providerId: "gemini", keyPool: new KeyPool([{ id: "g1", providerId: "gemini", secretRef: "ref" }]) },
        { providerId: "openrouter", keyPool: new KeyPool([{ id: "o1", providerId: "openrouter", secretRef: "ref" }]) },
        { providerId: "ollama", keyPool: null },
      ],
      transport,
      ledger,
      { sleep: async () => {} }
    );

    const result = await client.send({ prompt: "szia" });

    expect(result.ok).toBe(true);
    expect(result.providerId).toBe("gemini");
    expect(calls).toEqual(["gemini"]);
  });

  it("ha az elsődleges minden kulcsa hibázik, a másodlagosra, majd Ollama-ra esik át — és minden próbálkozásnál a KÖVETKEZŐ kulcsot tölti be", async () => {
    const ledger = await freshLedger();
    const attemptLog: Array<{ providerId: ProviderId; keyRef: string | null }> = [];

    const transport: ProviderTransport = {
      call: vi.fn(async (providerId, apiKeyRef): Promise<ProviderCallResponse> => {
        attemptLog.push({ providerId, keyRef: apiKeyRef });
        if (providerId === "gemini") throw new Error("túl sok kérés (429)");
        if (providerId === "openrouter") throw new Error("érvénytelen kulcs (401)");
        return { text: "ollama lokális válasz" };
      }),
    };

    const client = new FailoverClient(
      [
        {
          providerId: "gemini",
          keyPool: new KeyPool([
            { id: "g1", providerId: "gemini", secretRef: "g1-ref" },
            { id: "g2", providerId: "gemini", secretRef: "g2-ref" },
          ]),
        },
        { providerId: "openrouter", keyPool: new KeyPool([{ id: "o1", providerId: "openrouter", secretRef: "o1-ref" }]) },
        { providerId: "ollama", keyPool: null },
      ],
      transport,
      ledger,
      { sleep: async () => {}, initialBackoffMs: 10 }
    );

    const result = await client.send({ prompt: "szia" });

    expect(result.ok).toBe(true);
    expect(result.providerId).toBe("ollama");
    // a két gemini-kulcsnak KÜLÖNBÖZŐNEK kell lennie (nem próbálta újra ugyanazt)
    const geminiAttempts = attemptLog.filter((a) => a.providerId === "gemini");
    expect(geminiAttempts.map((a) => a.keyRef)).toEqual(["g1-ref", "g2-ref"]);
  });

  it("ha MINDEN csatorna elbukik, a hibaüzenet az ÖSSZES próbálkozást részletezi, nem egy homályos összefoglalót", async () => {
    const ledger = await freshLedger();
    const transport: ProviderTransport = {
      call: vi.fn(async (providerId): Promise<ProviderCallResponse> => {
        if (providerId === "gemini") throw new Error("túl sok kérés");
        if (providerId === "openrouter") throw new Error("érvénytelen kulcs");
        throw new Error("időtúllépés");
      }),
    };

    const client = new FailoverClient(
      [
        { providerId: "gemini", keyPool: new KeyPool([{ id: "g1", providerId: "gemini", secretRef: "ref" }]) },
        { providerId: "openrouter", keyPool: new KeyPool([{ id: "o1", providerId: "openrouter", secretRef: "ref" }]) },
        { providerId: "ollama", keyPool: null },
      ],
      transport,
      ledger,
      { sleep: async () => {}, initialBackoffMs: 5 }
    );

    const result = await client.send({ prompt: "szia" });

    expect(result.ok).toBe(false);
    expect(result.detailedFailureMessage).toContain("[gemini:g1]: túl sok kérés");
    expect(result.detailedFailureMessage).toContain("[openrouter:o1]: érvénytelen kulcs");
    expect(result.detailedFailureMessage).toContain("[ollama]: időtúllépés");
  });

  it("exponenciálisan növekvő várakozási időt alkalmaz próbálkozások között", async () => {
    const ledger = await freshLedger();
    const sleepCalls: number[] = [];
    const transport: ProviderTransport = {
      call: vi.fn(async (): Promise<ProviderCallResponse> => {
        throw new Error("hiba");
      }),
    };

    const client = new FailoverClient(
      [
        { providerId: "gemini", keyPool: new KeyPool([{ id: "g1", providerId: "gemini", secretRef: "ref" }]) },
        { providerId: "openrouter", keyPool: new KeyPool([{ id: "o1", providerId: "openrouter", secretRef: "ref" }]) },
      ],
      transport,
      ledger,
      { sleep: async (ms: number) => { sleepCalls.push(ms); }, initialBackoffMs: 100 }
    );

    await client.send({ prompt: "szia" });

    expect(sleepCalls).toEqual([100, 200]);
  });

  it("a napi költséglimit elérésekor egyáltalán nem indít próbálkozást, és jelzi a leállás okát", async () => {
    const ledger = await freshLedger();
    await ledger.setDailyLimit(0.005, true); // nagyon alacsony limit, hogy a becsült költség azonnal túllépje
    await ledger.recordSpend(0.004);

    const transport: ProviderTransport = {
      call: vi.fn(async (): Promise<ProviderCallResponse> => ({ text: "sose kéne idáig jutnia" })),
    };

    const client = new FailoverClient(
      [{ providerId: "gemini", keyPool: new KeyPool([{ id: "g1", providerId: "gemini", secretRef: "ref" }]) }],
      transport,
      ledger
    );

    const result = await client.send({ prompt: "szia" });

    expect(result.ok).toBe(false);
    expect(result.haltedByCostLimit).toBe(true);
    expect(transport.call).not.toHaveBeenCalled();
  });

  it("a limit közeledésekor a lokális Ollama-t próbálja ELŐSZÖR, a felhős szolgáltatók csak utána jönnek", async () => {
    const ledger = await freshLedger();
    await ledger.setDailyLimit(0.5, true);
    await ledger.recordSpend(0.445); // a 90%-os "switch-to-local" küszöb (0.45) fölött, de a "halt" (0.5) alatt

    const order: ProviderId[] = [];
    const transport: ProviderTransport = {
      call: vi.fn(async (providerId): Promise<ProviderCallResponse> => {
        order.push(providerId);
        return { text: "ok" };
      }),
    };

    const client = new FailoverClient(
      [
        { providerId: "gemini", keyPool: new KeyPool([{ id: "g1", providerId: "gemini", secretRef: "ref" }]) },
        { providerId: "ollama", keyPool: null },
      ],
      transport,
      ledger
    );

    await client.send({ prompt: "szia" });

    expect(order[0]).toBe("ollama");
  });
});
