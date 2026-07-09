export interface MemorySignal {
  id: string;
  content: string;
  /** ISO időbélyeg. */
  createdAt: string;
  /** 0..1 — a vektor-DB lekérdezési hasonlóság/relevancia alapján, más alrendszer számítja. */
  relevance: number;
  /** 0..1 — mennyire különböző lekérdezésekben bukkant fel ez a tartalom. */
  queryDiversity: number;
  /** 0..1 — fogalmi gazdagság (pl. egyedi entitások/fogalmak száma a tartalomban). */
  conceptualRichness: number;
}

export interface ScoringWeights {
  frequency: number;
  relevance: number;
  queryDiversity: number;
  freshness: number;
  recurrence: number;
  conceptualRichness: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  frequency: 0.2,
  relevance: 0.25,
  queryDiversity: 0.15,
  freshness: 0.15,
  recurrence: 0.15,
  conceptualRichness: 0.1,
};

export interface PromotedMemory {
  id: string;
  content: string;
  score: number;
  sourceSignalIds: string[];
  createdAt: string;
}

export interface DreamJournalEntry {
  createdAt: string;
  themes: string[];
  narrative: string;
}

export interface DurableMemoryWriter {
  writeDurable(entry: PromotedMemory): Promise<void>;
}

export interface DreamJournalWriter {
  writeJournal(entry: DreamJournalEntry): Promise<void>;
}
