import type { CostCategory } from "./types.js";

interface PricingRule {
  pattern: RegExp;
  category: CostCategory;
}

/**
 * KARBANTARTOTT, lokális ár/kategória-táblázat (11.2. pont). A legtöbb
 * szolgáltatói "list models" végpont NEM ad vissza ár-információt, csak
 * modell-nevet — ezért ez a táblázat egészíti ki (nem helyettesíti) a
 * dinamikus felfedezést. Az OpenRouter API válaszában VAN explicit ár-mező,
 * ott a modelDiscovery a dinamikus értéket használja elsőként (lásd
 * enrichModelInfo) és csak ennek hiányában esik vissza ide.
 *
 * A mintázatok szándékosan a modell-CSALÁDRA illeszkednek, nem egyetlen,
 * gyorsan elavuló verziószámra, hogy egy új kiadás (pl. egy következő
 * "-flash" vagy "-haiku" verzió) automatikusan helyes kategóriát kapjon
 * anélkül, hogy a táblázatot minden verzióváltáskor módosítani kellene.
 */
const PRICING_TABLE: PricingRule[] = [
  { pattern: /^gemini-.*flash.*lite/i, category: "free" },
  { pattern: /^gemini-.*flash/i, category: "low" },
  { pattern: /^gemini-.*pro/i, category: "medium" },
  { pattern: /^gpt-4o-mini/i, category: "low" },
  { pattern: /^gpt-4o/i, category: "high" },
  { pattern: /^gpt-3\.5/i, category: "low" },
  { pattern: /^claude-.*haiku/i, category: "low" },
  { pattern: /^claude-.*sonnet/i, category: "medium" },
  { pattern: /^claude-.*opus/i, category: "high" },
  { pattern: /^claude-.*mythos/i, category: "high" },
  { pattern: /^o1-mini/i, category: "medium" },
  { pattern: /^o1(?!-mini)/i, category: "high" },
];

export function lookupLocalCostCategory(modelId: string): CostCategory {
  for (const rule of PRICING_TABLE) {
    if (rule.pattern.test(modelId)) return rule.category;
  }
  return "unknown";
}
