import type { ModelInfo, ProviderId } from "./types.js";
import { lookupLocalCostCategory } from "./pricingTable.js";

export interface RawModelEntry {
  id: string;
  displayName?: string;
  /**
   * USD / millió input token. Csak az OpenRouter API ad ilyet valóban
   * (explicit ár-mező a válaszban) — a többi szolgáltatónál ez `undefined`
   * marad, és a lokális táblázat veszi át a kategorizálást (11.2. pont).
   */
  priceUsdPerMTokIn?: number | null;
}

/**
 * Egy konkrét szolgáltató "list models" végpontjának hívásáért felel.
 * Dependency-injection-nel cseréljük tesztben/valós hívásnál — így a
 * failover-logika sosem kódolja be közvetlenül a HTTP-hívást.
 */
export interface ProviderModelLister {
  listModels(providerId: ProviderId, apiKeyRef: string | null): Promise<RawModelEntry[]>;
}

function categorizeByDynamicPrice(priceUsdPerMTokIn: number): ModelInfo["costCategory"] {
  if (priceUsdPerMTokIn <= 0) return "free";
  if (priceUsdPerMTokIn < 0.5) return "low";
  if (priceUsdPerMTokIn < 5) return "medium";
  return "high";
}

export function enrichModelInfo(raw: RawModelEntry, providerId: ProviderId): ModelInfo {
  const hasDynamicPrice = providerId === "openrouter" && raw.priceUsdPerMTokIn !== undefined && raw.priceUsdPerMTokIn !== null;

  if (hasDynamicPrice) {
    const price = raw.priceUsdPerMTokIn as number;
    const category = categorizeByDynamicPrice(price);
    return {
      id: raw.id,
      providerId,
      displayName: raw.displayName,
      costCategory: category,
      costSource: "dynamic-priced",
      isFree: category === "free",
    };
  }

  const category = lookupLocalCostCategory(raw.id);
  return {
    id: raw.id,
    providerId,
    displayName: raw.displayName,
    costCategory: category,
    costSource: category === "unknown" ? "unknown" : "local-table",
    isFree: category === "free",
  };
}

/**
 * Lekéri és kategorizálja egy szolgáltató jelenleg elérhető modelljeit.
 * Ha a lekérés hibázik, a hívó felelőssége eldönteni mi történjen
 * (pl. megtartani a korábban cache-elt listát) — itt szándékosan nincs
 * elnyelt/csendes hibakezelés.
 */
export async function discoverModels(
  providerId: ProviderId,
  apiKeyRef: string | null,
  lister: ProviderModelLister
): Promise<ModelInfo[]> {
  const raw = await lister.listModels(providerId, apiKeyRef);
  return raw.map((entry) => enrichModelInfo(entry, providerId));
}

export interface ModelDiscoveryCache {
  providerId: ProviderId;
  fetchedAt: string;
  models: ModelInfo[];
}

/**
 * Heti automata frissítés (11.3. pont): eldönti, hogy egy korábban
 * cache-elt modell-lista elavultnak tekinthető-e.
 */
export function isDiscoveryCacheStale(cache: ModelDiscoveryCache, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - Date.parse(cache.fetchedAt);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  return ageMs >= oneWeekMs;
}
