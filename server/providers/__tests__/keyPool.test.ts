import { describe, expect, it } from "vitest";
import { KeyPool } from "../keyPool.js";

describe("KeyPool", () => {
  it("körbeforgó (round-robin) sorrendben adja vissza a kulcsokat", () => {
    const pool = new KeyPool([
      { id: "k1", providerId: "gemini", secretRef: "ref1" },
      { id: "k2", providerId: "gemini", secretRef: "ref2" },
      { id: "k3", providerId: "gemini", secretRef: "ref3" },
    ]);

    expect(pool.next()?.id).toBe("k1");
    expect(pool.next()?.id).toBe("k2");
    expect(pool.next()?.id).toBe("k3");
    expect(pool.next()?.id).toBe("k1");
  });

  it("egy hibásnak jelölt kulcsot NEM ad vissza ismét, amíg a backoff-ideje le nem telik", () => {
    const pool = new KeyPool([
      { id: "k1", providerId: "gemini", secretRef: "ref1" },
      { id: "k2", providerId: "gemini", secretRef: "ref2" },
    ]);

    const now = 1_000_000;
    const first = pool.next(now);
    expect(first?.id).toBe("k1");

    pool.markFailed("k1", 5000, now);

    // a következő próbálkozásnak a MÁSIK kulcsot kell visszaadnia, nem a most hibásnak jelöltet
    const second = pool.next(now + 10);
    expect(second?.id).toBe("k2");

    // k1 még backoff alatt van -> k2 jön ismét (csak 1 elérhető kulcs van)
    const third = pool.next(now + 10);
    expect(third?.id).toBe("k2");

    // a backoff letelte után k1 ismét elérhető
    const fourth = pool.next(now + 6000);
    expect(fourth?.id).toBe("k1");
  });

  it("null-t ad vissza, ha minden kulcs backoff alatt van", () => {
    const pool = new KeyPool([{ id: "k1", providerId: "gemini", secretRef: "ref1" }]);
    const now = 0;
    pool.markFailed("k1", 5000, now);
    expect(pool.next(now + 10)).toBeNull();
  });

  it("markSucceeded törli egy korábbi backoff-ot", () => {
    const pool = new KeyPool([{ id: "k1", providerId: "gemini", secretRef: "ref1" }]);
    const now = 0;
    pool.markFailed("k1", 5000, now);
    expect(pool.next(now + 10)).toBeNull();
    pool.markSucceeded("k1");
    expect(pool.next(now + 10)?.id).toBe("k1");
  });
});
