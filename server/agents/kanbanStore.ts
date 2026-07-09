import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonIfExists } from "../state/atomicFile.js";
import type { KanbanCard, KanbanStatus, AgentId } from "./types.js";

interface KanbanStoreData {
  cards: KanbanCard[];
}

export class KanbanStore {
  private cards = new Map<string, KanbanCard>();
  private loaded = false;

  constructor(private readonly storePath: string) {}

  async load(): Promise<void> {
    const data = await readJsonIfExists<KanbanStoreData>(this.storePath);
    if (data) for (const c of data.cards) this.cards.set(c.id, c);
    this.loaded = true;
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new Error("KanbanStore.load() nem futott le még.");
  }

  getAll(): KanbanCard[] {
    this.assertLoaded();
    return Array.from(this.cards.values()).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
  }

  getByStatus(status: KanbanStatus): KanbanCard[] {
    return this.getAll().filter((c) => c.status === status);
  }

  async create(
    partial: Pick<KanbanCard, "title" | "description"> & {
      status?: KanbanStatus;
      assignedAgentId?: AgentId | null;
    }
  ): Promise<KanbanCard> {
    this.assertLoaded();
    const now = new Date().toISOString();
    const card: KanbanCard = {
      id: randomUUID(),
      title: partial.title,
      description: partial.description,
      status: partial.status ?? "todo",
      assignedAgentId: partial.assignedAgentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.cards.set(card.id, card);
    await this.persist();
    return card;
  }

  async update(id: string, patch: Partial<Omit<KanbanCard, "id" | "createdAt">>): Promise<KanbanCard> {
    this.assertLoaded();
    const existing = this.cards.get(id);
    if (!existing) throw new Error(`KanbanCard nem található: ${id}`);
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.cards.set(id, updated);
    await this.persist();
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.assertLoaded();
    this.cards.delete(id);
    await this.persist();
  }

  private async persist(): Promise<void> {
    await atomicWriteJson(this.storePath, { cards: Array.from(this.cards.values()) });
  }
}
