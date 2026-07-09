import express from "express";
import { createServer } from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

import { HostAccessGate } from "./state/hostAccessGate.js";
import { CostLedger } from "./state/costLedger.js";
import { AgentStore, buildSupervisorAgent, SUPERVISOR_AGENT_ID } from "./agents/agentStore.js";
import { MessageStore } from "./agents/messageStore.js";
import { KanbanStore } from "./agents/kanbanStore.js";
import { SettingsStore } from "./agents/settingsStore.js";
import { AgentEngine } from "./agents/agentEngine.js";
import { McpManager } from "./mcp/mcpManager.js";
import { QuotaTracker } from "./providers/quotaTracker.js";
import { AuditLogger } from "./terminal/auditLog.js";
import { NodePtyFactory } from "./terminal/nodePtyFactory.js";
import { TerminalSessionManager } from "./terminal/terminalManager.js";
import { attachTerminalWebSocketServer } from "./terminal/wsServer.js";
import { FailoverClient, type ProviderTransport, type FailoverChainLink } from "./providers/failoverClient.js";
import { KeyPool } from "./providers/keyPool.js";
import type { ProviderApiKey, ProviderId } from "./providers/types.js";
import { createApiRouter, getLatestHardwareMetrics } from "./routes/apiRoutes.js";
import { createTelegramBot, setWebBroadcastCallback } from "./telegram/telegramBot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// FONTOS: ez a fájl lefordítva `dist/server/index.js`-ként fut, tehát a
// projekt-gyökér KÉT szinttel van feljebb (dist/server -> dist -> gyökér),
// nem egy szinttel. Ha csak egy szinttel mennénk feljebb, a .novaswarm-data
// a dist/ alá kerülne, és egy tiszta újrafordítás (`npm run build`) törölné
// az összes felhasználói adatot — ezt közvetlen szerver-indítással, valós
// HTTP-hívásokkal ellenőriztük, nem csak a build sikerességét néztük.
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, ".novaswarm-data");
const DIST_FRONTEND = path.join(ROOT, "dist-frontend");

const PORT = Number(process.env.PORT ?? 4317);

async function main() {
  // ─── Adatkönyvtár ─────────────────────────────────────────────────────────
  await fs.promises.mkdir(DATA_DIR, { recursive: true });

  // ─── Szingletonok (3.1 elv: egyetlen igazság-forrás minden állapotnál) ────
  const hostAccessGate = new HostAccessGate(path.join(DATA_DIR, "host-access.json"));
  const costLedger = new CostLedger(path.join(DATA_DIR, "cost-ledger.json"));
  const agentStore = new AgentStore(path.join(DATA_DIR, "agents.json"));
  const messageStore = new MessageStore(path.join(DATA_DIR, "messages.json"));
  const kanbanStore = new KanbanStore(path.join(DATA_DIR, "kanban.json"));
  const settingsStore = new SettingsStore(path.join(DATA_DIR, "settings.json"));
  const mcpManager = new McpManager(path.join(DATA_DIR, "mcp-servers.json"));
  const auditLog = new AuditLogger(path.join(DATA_DIR, "audit.log"));
  const quotaTracker = new QuotaTracker();

  await Promise.all([
    hostAccessGate.load(),
    costLedger.load(),
    agentStore.load(),
    messageStore.load(),
    kanbanStore.load(),
    settingsStore.load(),
    mcpManager.load(),
  ]);

  const settings = settingsStore.get();

  // ─── Provider-failover lánc (11.5. pont) ──────────────────────────────────
  // A beállításokban tárolt kulcsokat (ApiKeyEntry) szolgáltatónként csoportosítjuk,
  // és a failover-lánc KeyPool-jait ezekkel a VALÓS kulcsokkal töltjük fel — nem
  // üres pool-okkal (ami korábban itt egy hiba volt: a kulcsok sosem kerültek be).
  const keysByProvider = new Map<ProviderId, ProviderApiKey[]>();
  for (const key of settings.apiKeys) {
    const list = keysByProvider.get(key.provider) ?? [];
    list.push({ id: key.id, providerId: key.provider, secretRef: key.secretRef, label: key.label, disabledUntil: key.disabledUntil ?? null });
    keysByProvider.set(key.provider, list);
  }

  const primaryKeyPool = new KeyPool(keysByProvider.get(settings.primaryProviderId) ?? []);

  const failoverChain: FailoverChainLink[] = [
    { providerId: settings.primaryProviderId, keyPool: settings.primaryProviderId === "ollama" ? null : primaryKeyPool },
    { providerId: "ollama", keyPool: null },
  ];

  // A tényleges hálózati transport — production-ban a valódi Gemini/OpenAI/Ollama kliens.
  // Ebben a körben az Ollama HTTP-hívása van bekötve; a többi szolgáltató kliense
  // (Gemini/OpenAI/Anthropic/OpenRouter) ugyanide, ugyanezen ProviderTransport-interfész
  // mögé illeszthető a következő körben, a failover-logika érintése nélkül.
  const transport: ProviderTransport = {
    call: async (_providerId, _keyRef, params) => {
      const baseUrl = settings.ollamaBaseUrl;
      const model = settings.ollamaModel;
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: params.prompt, stream: false }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const data = await response.json() as { response: string };
      return { text: data.response };
    },
  };

  const failoverClient = new FailoverClient(failoverChain, transport, costLedger);

  // ─── Ágens-motor ──────────────────────────────────────────────────────────
  const agentEngine = new AgentEngine(agentStore, messageStore, kanbanStore, failoverClient, auditLog);

  // Felügyelő-ágens automatikus biztosítása az onboarding befejezése után
  if (settings.onboardingComplete && !agentStore.getById(SUPERVISOR_AGENT_ID)) {
    await agentStore.create(buildSupervisorAgent(settings.primaryProviderId, settings.ollamaModel));
  }

  if (settings.onboardingComplete) agentEngine.start();

  // ─── Express szerver ──────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // REST API
  app.use(
    "/api",
    createApiRouter({ agentStore, messageStore, kanbanStore, settingsStore, mcpManager, auditLog, agentEngine, hostAccessGate, costLedger, quotaTracker })
  );

  // Statikus frontend (prod build)
  if (fs.existsSync(DIST_FRONTEND)) {
    app.use(express.static(DIST_FRONTEND));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(DIST_FRONTEND, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => res.send("NovaSwarm backend fut. A frontend build hiányzik — futtasd: npm run build:frontend"));
  }

  const httpServer = createServer(app);

  // ─── Terminál WebSocket ───────────────────────────────────────────────────
  const ptyFactory = new NodePtyFactory();
  const terminalManager = new TerminalSessionManager(hostAccessGate, ptyFactory, auditLog);
  attachTerminalWebSocketServer(httpServer, terminalManager);

  // ─── Telegram bot ─────────────────────────────────────────────────────────
  if (settings.telegram.enabled && settings.telegram.botToken) {
    const bot = createTelegramBot(settings.telegram.botToken, {
      agentStore, messageStore, kanbanStore, agentEngine, settingsStore, auditLog, costLedger,
      getLatestHardwareMetrics,
    });

    // 16.1: web broadcast → telegram-üzenetek a web UI-ban is megjelennek
    setWebBroadcastCallback(async (text, agentId) => {
      const conv = await messageStore.ensureConversation(agentId);
      await messageStore.addMessage({ conversationId: conv.id, agentId, role: "agent", content: text, source: "telegram" });
    });

    bot.launch().catch((e: unknown) => console.error("Telegram bot hiba:", e));
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  }

  httpServer.listen(PORT, () => {
    console.log(`NovaSwarm szerver fut: http://localhost:${PORT}`);
  });

  process.on("SIGTERM", () => { agentEngine.stop(); process.exit(0); });
  process.on("SIGINT", () => { agentEngine.stop(); process.exit(0); });
}

main().catch((err) => { console.error("Szerver indítási hiba:", err); process.exit(1); });
