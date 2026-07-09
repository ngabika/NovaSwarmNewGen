import type { DurableMemoryWriter, PromotedMemory, ScoringWeights } from "./types.js";
import { DEFAULT_SCORING_WEIGHTS } from "./types.js";
import type { LightPhaseCandidate } from "./lightPhase.js";

const FRESHNESS_WINDOW_DAYS = 7;

function freshnessScore(createdAtIso: string, now: Date): number {
  const ageMs = now.getTime() - Date.parse(createdAtIso);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.min(1, 1 - ageDays / FRESHNESS_WINDOW_DAYS));
}

function frequencyScore(occurrenceCount: number): number {
  return Math.min(1, occurrenceCount / 5);
}

function recurrenceScore(occurrenceCount: number): number {
  return occurrenceCount > 1 ? 1 : 0;
}

export function scoreLightCandidate(
  candidate: LightPhaseCandidate,
  now: Date,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): number {
  const metrics = {
    frequency: frequencyScore(candidate.occurrenceCount),
    relevance: candidate.signal.relevance,
    queryDiversity: candidate.signal.queryDiversity,
    freshness: freshnessScore(candidate.signal.createdAt, now),
    recurrence: recurrenceScore(candidate.occurrenceCount),
    conceptualRichness: candidate.signal.conceptualRichness,
  };

  return (
    metrics.frequency * weights.frequency +
    metrics.relevance * weights.relevance +
    metrics.queryDiversity * weights.queryDiversity +
    metrics.freshness * weights.freshness +
    metrics.recurrence * weights.recurrence +
    metrics.conceptualRichness * weights.conceptualRichness
  );
}

export interface DeepPhaseOptions {
  promotionThreshold?: number;
  weights?: ScoringWeights;
  now?: () => Date;
}

export interface DeepPhaseResult {
  promoted: PromotedMemory[];
  rejected: Array<{ candidate: LightPhaseCandidate; score: number }>;
}

const DEFAULT_PROMOTION_THRESHOLD = 0.55;

/**
 * Deep fázis (14.2. pont): EZ AZ EGYETLEN fázis, amely tartós írást végez.
 * Csak ennek a függvénynek van paraméterében `DurableMemoryWriter` —
 * a Light és a REM fázis implementációja szándékosan nem kap ilyet.
 */
export async function runDeepPhase(
  candidates: LightPhaseCandidate[],
  writer: DurableMemoryWriter,
  options: DeepPhaseOptions = {}
): Promise<DeepPhaseResult> {
  const threshold = options.promotionThreshold ?? DEFAULT_PROMOTION_THRESHOLD;
  const weights = options.weights ?? DEFAULT_SCORING_WEIGHTS;
  const now = options.now ?? (() => new Date());
  const nowValue = now();

  const promoted: PromotedMemory[] = [];
  const rejected: Array<{ candidate: LightPhaseCandidate; score: number }> = [];

  for (const candidate of candidates) {
    const score = scoreLightCandidate(candidate, nowValue, weights);
    if (score >= threshold) {
      const entry: PromotedMemory = {
        id: candidate.signal.id,
        content: candidate.signal.content,
        score,
        sourceSignalIds: candidate.mergedSignalIds,
        createdAt: nowValue.toISOString(),
      };
      await writer.writeDurable(entry);
      promoted.push(entry);
    } else {
      rejected.push({ candidate, score });
    }
  }

  return { promoted, rejected };
}
