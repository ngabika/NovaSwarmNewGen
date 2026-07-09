import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonIfExists } from "../state/atomicFile.js";
import type { Conversation, Message, AgentId } from "./types.js";

interface MessageStoreData {
  conversations: Conversation[];
  messages: Message[];
}

export class MessageStore {
  private conversations = new Map<string, Conversation>();
  private messages: Message[] = [];
  private listeners: Array<(message: Message) => void> = [];
  private loaded = false;

  constructor(private readonly storePath: string) {}

  async load(): Promise<void> {
    const data = await readJsonIfExists<MessageStoreData>(this.storePath);
    if (data) {
      for (const c of data.conversations) this.conversations.set(c.id, c);
      this.messages = data.messages;
    }
    this.loaded = true;
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new Error("MessageStore.load() nem futott le még.");
  }

  onNewMessage(listener: (msg: Message) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getConversations(agentId?: AgentId): Conversation[] {
    this.assertLoaded();
    const all = Array.from(this.conversations.values()).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    );
    return agentId ? all.filter((c) => c.agentId === agentId) : all;
  }

  getMessages(conversationId: string, limit = 100): Message[] {
    this.assertLoaded();
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .slice(-limit);
  }

  async ensureConversation(agentId: AgentId, title?: string): Promise<Conversation> {
    this.assertLoaded();
    const existing = Array.from(this.conversations.values()).find(
      (c) => c.agentId === agentId
    );
    if (existing) return existing;
    const conv: Conversation = {
      id: randomUUID(),
      agentId,
      title: title ?? `Beszélgetés – ${agentId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(conv.id, conv);
    await this.persist();
    return conv;
  }

  async addMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    this.assertLoaded();
    const msg: Message = {
      ...message,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.messages.push(msg);

    const conv = this.conversations.get(msg.conversationId);
    if (conv) {
      this.conversations.set(conv.id, { ...conv, updatedAt: msg.createdAt });
    }

    await this.persist();
    for (const listener of this.listeners) listener(msg);
    return msg;
  }

  private async persist(): Promise<void> {
    await atomicWriteJson(this.storePath, {
      conversations: Array.from(this.conversations.values()),
      messages: this.messages,
    });
  }
}
