import { describe, it, expect, vi, beforeEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { AgentStore, SUPERVISOR_AGENT_ID, buildSupervisorAgent } from "../agentStore.js";
import { MessageStore } from "../messageStore.js";
import { KanbanStore } from "../kanbanStore.js";
import { AgentEngine } from "../agentEngine.js";
import type { AuditLogger } from "../../terminal/auditLog.js";
import type { FailoverClient } from "../../providers/failoverClient.js";

function tmpPath(prefix: string) {
  return path.join(os.tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}.json`);
}

function makeAuditLog() {
  return { append: vi.fn(async () => ({ id: "x", timestamp: "", type: "chat" as const, sourceAgent: "", message: "" })), logTerminalCommand: vi.fn(), readAll: vi.fn(async () => []) } as unknown as AuditLogger;
}

function makeFailoverClient(response = "ok válasz"): FailoverClient {
  return { send: vi.fn(async () => ({ ok: true, providerId: "gemini" as const, text: response, attempts: [] })) } as unknown as FailoverClient;
}

describe("AgentStore", () => {
  it("create + getById + getAll", async () => {
    const store = new AgentStore(tmpPath("agents"));
    await store.load();
    const agent = await store.create({ name: "Teszt", avatar: "🤖", role: "general", parentAgentId: null, systemInstruction: "légy hasznos", assignedModel: "gemini-flash", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });
    expect(store.getById(agent.id)).not.toBeNull();
    expect(store.getAll()).toHaveLength(1);
  });

  it("getChildren visszaadja a közvetlen gyerekeket, getDepth a mélységet", async () => {
    const store = new AgentStore(tmpPath("agents"));
    await store.load();
    const parent = await store.create({ name: "Vezető", avatar: "👑", role: "coordinator", parentAgentId: null, systemInstruction: "", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });
    const child = await store.create({ name: "Alkalmazott", avatar: "👷", role: "dev", parentAgentId: parent.id, systemInstruction: "", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });

    expect(store.getChildren(parent.id)).toHaveLength(1);
    expect(store.getDepth(child.id)).toBe(1);
    expect(store.getDepth(parent.id)).toBe(0);
  });

  it("delete null-ra állítja a gyerekek parentId-ját", async () => {
    const store = new AgentStore(tmpPath("agents"));
    await store.load();
    const parent = await store.create({ name: "P", avatar: "P", role: "r", parentAgentId: null, systemInstruction: "", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });
    const child = await store.create({ name: "C", avatar: "C", role: "r", parentAgentId: parent.id, systemInstruction: "", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });
    await store.delete(parent.id);
    expect(store.getById(child.id)?.parentAgentId).toBeNull();
  });

  it("buildSupervisorAgent SUPERVISOR_AGENT_ID azonosítóval épül", () => {
    const supervisor = buildSupervisorAgent("gemini", "gemini-flash");
    expect(supervisor.id).toBe(SUPERVISOR_AGENT_ID);
    expect(supervisor.active).toBe(true);
  });
});

describe("AgentEngine", () => {
  let agentStore: AgentStore;
  let messageStore: MessageStore;
  let kanbanStore: KanbanStore;

  beforeEach(async () => {
    agentStore = new AgentStore(tmpPath("agents"));
    messageStore = new MessageStore(tmpPath("messages"));
    kanbanStore = new KanbanStore(tmpPath("kanban"));
    await agentStore.load();
    await messageStore.load();
    await kanbanStore.load();
  });

  it("handleExplicitUserMessage választ ad, és a választ eltárolja az üzenetek között", async () => {
    const client = makeFailoverClient("Helló, segítek!");
    const engine = new AgentEngine(agentStore, messageStore, kanbanStore, client, makeAuditLog());

    const agent = await agentStore.create({ name: "Asszisztens", avatar: "🤖", role: "general", parentAgentId: null, systemInstruction: "légy hasznos", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });

    const response = await engine.handleExplicitUserMessage(agent.id, "szia!", "web");
    expect(response).toBe("Helló, segítek!");

    const conv = await messageStore.ensureConversation(agent.id);
    const msgs = messageStore.getMessages(conv.id);
    expect(msgs.some((m) => m.role === "user" && m.content === "szia!")).toBe(true);
    expect(msgs.some((m) => m.role === "agent" && m.content === "Helló, segítek!")).toBe(true);
  });

  it("runCycle kihagyja a választ, ha nincs megválaszolatlan üzenet", async () => {
    const client = makeFailoverClient();
    const engine = new AgentEngine(agentStore, messageStore, kanbanStore, client, makeAuditLog());

    await agentStore.create({ name: "A", avatar: "🤖", role: "general", parentAgentId: null, systemInstruction: "", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });

    const results = await engine.runCycle();
    expect(results[0].skipped).toBe(true);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("Supervisor riaszt, ha az ágens nem-ellenőrzött sikert állít (pl. 'telepítettem X-t')", async () => {
    const auditLog = makeAuditLog();
    const client = makeFailoverClient("Rendben, telepítettem a csomagot sikeresen.");
    const engine = new AgentEngine(agentStore, messageStore, kanbanStore, client, auditLog);

    const agent = await agentStore.create({ name: "Dev", avatar: "👷", role: "dev", parentAgentId: null, systemInstruction: "", assignedModel: "m", assignedProvider: "gemini", webSearchEnabled: false, hostCommandEnabled: false, active: true });

    await engine.handleExplicitUserMessage(agent.id, "telepítsd az nginx-et", "web");

    await engine.runCycle();
    const supervisorEntry = (auditLog.append as ReturnType<typeof vi.fn>).mock.calls
      .map((call: unknown[]) => (call[0] as { type?: string; message?: string }))
      .find((entry) => entry?.type === "supervisor");

    expect(supervisorEntry).toBeDefined();
    expect(supervisorEntry?.message).toContain("⚠️ Felügyelő figyelmeztetés");
  });
});
