import { Router, type Request, type Response } from "express";
import type { AgentStore } from "../agents/agentStore.js";
import { buildSupervisorAgent, SUPERVISOR_AGENT_ID } from "../agents/agentStore.js";
import type { MessageStore } from "../agents/messageStore.js";
import type { KanbanStore } from "../agents/kanbanStore.js";
import type { SettingsStore } from "../agents/settingsStore.js";
import type { McpManager } from "../mcp/mcpManager.js";
import type { AuditLogger } from "../terminal/auditLog.js";
import type { AgentEngine } from "../agents/agentEngine.js";
import type { HostAccessGate } from "../state/hostAccessGate.js";
import type { CostLedger } from "../state/costLedger.js";
import type { QuotaTracker } from "../providers/quotaTracker.js";
import type { HardwareMetrics } from "../system/hardwareMonitor.js";
import { collectHardwareMetrics } from "../system/hardwareMonitor.js";

export interface RouteDeps {
  agentStore: AgentStore;
  messageStore: MessageStore;
  kanbanStore: KanbanStore;
  settingsStore: SettingsStore;
  mcpManager: McpManager;
  auditLog: AuditLogger;
  agentEngine: AgentEngine;
  hostAccessGate: HostAccessGate;
  costLedger: CostLedger;
  quotaTracker: QuotaTracker;
}

let cachedHwMetrics: HardwareMetrics | null = null;
export function getLatestHardwareMetrics(): HardwareMetrics | null { return cachedHwMetrics; }

function ok(res: Response, data: unknown) { res.json({ ok: true, data }); }
function err(res: Response, status: number, message: string) { res.status(status).json({ ok: false, error: message }); }

export function createApiRouter(deps: RouteDeps): Router {
  const r = Router();

  // ─── Ágensek ───────────────────────────────────────────────────────────────
  r.get("/agents", (_req, res) => ok(res, deps.agentStore.getAll()));

  r.post("/agents", async (req: Request, res: Response) => {
    try {
      const agent = await deps.agentStore.create(req.body);
      ok(res, agent);
    } catch (e) { err(res, 400, String(e)); }
  });

  r.patch("/agents/:id", async (req, res) => {
    try {
      const agent = await deps.agentStore.update(req.params.id, req.body);
      ok(res, agent);
    } catch (e) { err(res, 404, String(e)); }
  });

  r.delete("/agents/:id", async (req, res) => {
    try {
      await deps.agentStore.delete(req.params.id);
      ok(res, null);
    } catch (e) { err(res, 404, String(e)); }
  });

  // ─── Üzenetküldés (ágens-chat) ─────────────────────────────────────────────
  r.get("/agents/:id/messages", async (req, res) => {
    try {
      const conv = await deps.messageStore.ensureConversation(req.params.id);
      ok(res, deps.messageStore.getMessages(conv.id, Number(req.query.limit) || 100));
    } catch (e) { err(res, 404, String(e)); }
  });

  r.post("/agents/:id/message", async (req: Request, res: Response) => {
    try {
      const { content } = req.body as { content: string };
      const response = await deps.agentEngine.handleExplicitUserMessage(req.params.id, content, "web");
      ok(res, { response });
    } catch (e) { err(res, 500, String(e)); }
  });

  // ─── Beállítások ──────────────────────────────────────────────────────────
  r.get("/settings", (_req, res) => {
    const s = deps.settingsStore.get();
    ok(res, { ...s, apiKeys: deps.settingsStore.getPublicApiKeyList() });
  });

  r.patch("/settings", async (req: Request, res: Response) => {
    try {
      const updated = await deps.settingsStore.update(req.body);
      // 3.2 elv: minden beállítás tényleges hatással bír
      if ("hostAccessGranted" in req.body) {
        if (req.body.hostAccessGranted) await deps.hostAccessGate.grant();
        else await deps.hostAccessGate.revoke();
      }
      if ("dailyLimitUsd" in req.body || "dailyLimitEnabled" in req.body) {
        await deps.costLedger.setDailyLimit(
          updated.dailyLimitUsd,
          updated.dailyLimitEnabled
        );
      }
      ok(res, updated);
    } catch (e) { err(res, 400, String(e)); }
  });

  // ─── Onboarding ───────────────────────────────────────────────────────────
  r.post("/onboarding/complete", async (req: Request, res: Response) => {
    try {
      const { settings, firstAgent } = req.body as {
        settings: Partial<Parameters<SettingsStore["update"]>[0]>;
        firstAgent: Parameters<AgentStore["create"]>[0];
      };
      const updated = await deps.settingsStore.update({ ...settings, onboardingComplete: true });

      // Host-kapu szinkronizálás
      if (updated.hostAccessGranted) await deps.hostAccessGate.grant();

      // Első ágens
      const agent = await deps.agentStore.create(firstAgent);

      // Felügyelő-ágens automatikus hozzáadása (10.3 — technikai kivétel, nem a felhasználó hozza létre)
      if (!deps.agentStore.getById(SUPERVISOR_AGENT_ID)) {
        await deps.agentStore.create(buildSupervisorAgent(updated.primaryProviderId, updated.ollamaModel));
      }

      deps.agentEngine.start();
      ok(res, { settings: updated, firstAgent: agent });
    } catch (e) { err(res, 400, String(e)); }
  });

  // ─── Kanban ───────────────────────────────────────────────────────────────
  r.get("/kanban", (_req, res) => ok(res, deps.kanbanStore.getAll()));

  r.post("/kanban", async (req: Request, res: Response) => {
    try { ok(res, await deps.kanbanStore.create(req.body)); }
    catch (e) { err(res, 400, String(e)); }
  });

  r.patch("/kanban/:id", async (req, res) => {
    try { ok(res, await deps.kanbanStore.update(req.params.id, req.body)); }
    catch (e) { err(res, 404, String(e)); }
  });

  r.delete("/kanban/:id", async (req, res) => {
    try { await deps.kanbanStore.delete(req.params.id); ok(res, null); }
    catch (e) { err(res, 404, String(e)); }
  });

  // ─── Audit napló ──────────────────────────────────────────────────────────
  r.get("/audit", async (_req, res) => {
    try { ok(res, await deps.auditLog.readAll()); }
    catch (e) { err(res, 500, String(e)); }
  });

  // ─── MCP szerverek ────────────────────────────────────────────────────────
  r.get("/mcp", (_req, res) => ok(res, deps.mcpManager.getAll()));

  r.post("/mcp", async (req: Request, res: Response) => {
    try { ok(res, await deps.mcpManager.register(req.body)); }
    catch (e) { err(res, 400, String(e)); }
  });

  r.patch("/mcp/:id", async (req, res) => {
    try { ok(res, await deps.mcpManager.update(req.params.id, req.body)); }
    catch (e) { err(res, 404, String(e)); }
  });

  r.delete("/mcp/:id", async (req, res) => {
    try { await deps.mcpManager.delete(req.params.id); ok(res, null); }
    catch (e) { err(res, 404, String(e)); }
  });

  r.post("/mcp/:id/test", async (req, res) => {
    try { ok(res, await deps.mcpManager.testConnection(req.params.id)); }
    catch (e) { err(res, 500, String(e)); }
  });

  // ─── Hardver-monitor ──────────────────────────────────────────────────────
  r.get("/system/hardware", async (_req, res) => {
    try {
      const metrics = await collectHardwareMetrics();
      cachedHwMetrics = metrics;
      ok(res, metrics);
    } catch (e) { err(res, 500, String(e)); }
  });

  // ─── Kvóta/provider státusz ───────────────────────────────────────────────
  r.get("/quota", (_req, res) => {
    const quotas = deps.quotaTracker.getAll();
    const ledger = deps.costLedger.getState();
    ok(res, { quotas, costLedger: ledger });
  });

  // ─── Vészleállító (8.4. pont) ─────────────────────────────────────────────
  r.post("/system/emergency-stop", async (_req, res) => {
    deps.agentEngine.stop();
    await deps.auditLog.append({ type: "rendszer", sourceAgent: "user", message: "Vészleállító aktiválva Web UI-ról." });
    ok(res, { stopped: true });
  });

  return r;
}
