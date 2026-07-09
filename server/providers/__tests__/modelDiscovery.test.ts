import { describe, expect, it } from "vitest";
import { discoverModels, enrichModelInfo, isDiscoveryCacheStale, type ProviderModelLister } from "../modelDiscovery.js";

describe("modelDiscovery", () => {
  it("OpenRouter esetén a DINAMIKUS ár-mező dönt, nem a lokális táblázat", () => {
    const info = enrichModelInfo({ id: "some/free-model", priceUsdPerMTokIn: 0 }, "openrouter");
    expect(info.isFree).toBe(true);
    expect(info.costSource).toBe("dynamic-priced");
  });

  it("OpenRouter esetén nem-nulla ár esetén is dinamikus marad a forrás", () => {
    const info = enrichModelInfo({ id: "some/paid-model", priceUsdPerMTokIn: 8 }, "openrouter");
    expect(info.isFree).toBe(false);
    expect(info.costCategory).toBe("high");
    expect(info.costSource).toBe("dynamic-priced");
  });

  it("olyan szolgáltatónál, ami nem ad ár-infót (pl. Gemini), a LOKÁLIS táblázat dönt", () => {
    const info = enrichModelInfo({ id: "gemini-2.0-flash" }, "gemini");
    expect(info.costSource).toBe("local-table");
    expect(info.costCategory).toBe("low");
  });

  it("ismeretlen modell-azonosítónál 'unknown' kategóriát ad, sose kitalált értéket", () => {
    const info = enrichModelInfo({ id: "valami-teljesen-uj-modell-xyz" }, "anthropic");
    expect(info.costCategory).toBe("unknown");
    expect(info.costSource).toBe("unknown");
  });

  it("discoverModels a lister által visszaadott nyers listát dúsítja fel", async () => {
    const lister: ProviderModelLister = {
      listModels: async () => [
        { id: "gemini-2.0-flash" },
        { id: "gemini-2.0-pro" },
      ],
    };
    const models = await discoverModels("gemini", "fake-key-ref", lister);
    expect(models).toHaveLength(2);
    expect(models[0].providerId).toBe("gemini");
    expect(models[0].costCategory).toBe("low");
    expect(models[1].costCategory).toBe("medium");
  });

  it("isDiscoveryCacheStale igazat ad vissza egy hétnél régebbi cache-re", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const stale = isDiscoveryCacheStale({ providerId: "gemini", fetchedAt: eightDaysAgo, models: [] });
    expect(stale).toBe(true);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fresh = isDiscoveryCacheStale({ providerId: "gemini", fetchedAt: oneHourAgo, models: [] });
    expect(fresh).toBe(false);
  });
});
