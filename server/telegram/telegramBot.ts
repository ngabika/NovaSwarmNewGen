import { Telegraf, type Context } from "telegraf";
import type { AgentStore } from "../agents/agentStore.js";
import type { MessageStore } from "../agents/messageStore.js";
import type { KanbanStore } from "../agents/kanbanStore.js";
import type { AgentEngine } from "../agents/agentEngine.js";
import type { SettingsStore } from "../agents/settingsStore.js";
import type { AuditLogger } from "../terminal/auditLog.js";
import type { HardwareMetrics } from "../system/hardwareMonitor.js";
import type { CostLedger } from "../state/costLedger.js";

export interface TelegramBotDeps {
  agentStore: AgentStore;
  messageStore: MessageStore;
  kanbanStore: KanbanStore;
  agentEngine: AgentEngine;
  settingsStore: SettingsStore;
  auditLog: AuditLogger;
  costLedger: CostLedger;
  getLatestHardwareMetrics: () => HardwareMetrics | null;
}

/** Bejövő Telegram-üzenet megjelenítése a Web UI-ban is (16.1. pont: egységes üzenet-tár). */
let webBroadcastCallback: ((text: string, agentId: string) => void) | null = null;

export function setWebBroadcastCallback(cb: (text: string, agentId: string) => void): void {
  webBroadcastCallback = cb;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

/** 16.2: ha az üzenet @AgentNevet tartalmaz, delegáljuk közvetlenül oda */
function detectMentionedAgent(text: string, agents: ReturnType<AgentStore["getAll"]>): string | null {
  for (const agent of agents) {
    const mention = `@${agent.name.replace(/\s+/g, "")}`;
    if (text.toLowerCase().includes(mention.toLowerCase())) return agent.id;
  }
  return null;
}

export function createTelegramBot(token: string, deps: TelegramBotDeps): Telegraf {
  const bot = new Telegraf(token);

  // ─── Üzenet → ágens-delegálás ─────────────────────────────────────────────
  bot.on("text", async (ctx: Context) => {
    const text = (ctx.message && "text" in ctx.message) ? ctx.message.text : "";
    if (!text || text.startsWith("/")) return;

    const agents = deps.agentStore.getAll().filter((a) => a.active);
    if (!agents.length) {
      await ctx.reply("Nincs aktív ágens. Hozz létre egyet a Web UI-ban.");
      return;
    }

    // 16.2: ha @NévvelMegszólított → az a konkrét ágens válaszol
    const mentionedId = detectMentionedAgent(text, agents);
    const targetAgentId = mentionedId ?? agents[0].id;

    await deps.auditLog.append({ type: "telegram", sourceAgent: "telegram", message: text });

    const response = await deps.agentEngine.handleExplicitUserMessage(targetAgentId, text, "telegram");

    // 16.1: az üzenet bekerül az egységes message store-ba (a Web UI is látja)
    if (webBroadcastCallback) webBroadcastCallback(response, targetAgentId);

    await ctx.reply(response.slice(0, 4096));
  });

  // ─── /statusz ─────────────────────────────────────────────────────────────
  bot.command("statusz", async (ctx: Context) => {
    const metrics = deps.getLatestHardwareMetrics();
    const ledger = deps.costLedger.getState();
    const agents = deps.agentStore.getActive();

    const lines = [
      `🖥️ *NovaSwarm státusz*`,
      `Aktív ágensek: ${agents.length}`,
      `Napi API-költés: $${ledger.spentTodayUsd.toFixed(4)} / $${ledger.dailyLimitUsd}`,
    ];

    if (metrics) {
      lines.push(`CPU: ${metrics.cpu.loadPercent}% ${metrics.cpu.tempCelsius ? `(${metrics.cpu.tempCelsius}°C)` : ""}`);
      lines.push(`RAM: ${metrics.ram.usedMb} / ${metrics.ram.totalMb} MB`);
      if (metrics.battery.hasBattery) {
        lines.push(`🔋 Akkumulátor: ${metrics.battery.percent ?? "?"}%${metrics.battery.isCharging ? " ⚡" : ""}`);
      }
    }

    await ctx.replyWithMarkdownV2(escapeMarkdown(lines.join("\n")));
  });

  // ─── /kanban ──────────────────────────────────────────────────────────────
  bot.command("kanban", async (ctx: Context) => {
    const cards = deps.kanbanStore.getAll();
    if (!cards.length) { await ctx.reply("A Kanban tábla üres."); return; }

    const sections = ["todo", "in-progress", "done"] as const;
    const emojis = { todo: "📋", "in-progress": "⚙️", done: "✅" };
    const labels = { todo: "Teendő", "in-progress": "Folyamatban", done: "Kész" };

    const lines: string[] = ["*Kanban tábla*"];
    for (const status of sections) {
      const group = cards.filter((c) => c.status === status);
      if (!group.length) continue;
      lines.push(`\n${emojis[status]} *${labels[status]}*`);
      for (const card of group) lines.push(`• ${card.title}`);
    }
    await ctx.replyWithMarkdownV2(escapeMarkdown(lines.join("\n")));
  });

  // ─── /modell ──────────────────────────────────────────────────────────────
  bot.command("modell", async (ctx: Context) => {
    const s = deps.settingsStore.get();
    const lines = [
      `🤖 *Modell-konfiguráció*`,
      `Elsődleges szolgáltató: ${s.primaryProviderId}`,
      `Ollama URL: ${s.ollamaBaseUrl}`,
      `Ollama modell: ${s.ollamaModel}`,
    ];
    await ctx.replyWithMarkdownV2(escapeMarkdown(lines.join("\n")));
  });

  // ─── /keres <kérdés> ──────────────────────────────────────────────────────
  bot.command("keres", async (ctx: Context) => {
    const text = (ctx.message && "text" in ctx.message) ? ctx.message.text : "";
    const query = text.replace(/^\/keres\s*/i, "").trim();
    if (!query) { await ctx.reply("Használat: /keres <kérdés>"); return; }

    const agents = deps.agentStore.getActive();
    if (!agents.length) { await ctx.reply("Nincs aktív ágens."); return; }

    const response = await deps.agentEngine.handleExplicitUserMessage(agents[0].id, `Keresés: ${query}`, "telegram");
    await ctx.reply(response.slice(0, 4096));
  });

  // ─── /leallitas (8.4: vészleállító) ──────────────────────────────────────
  bot.command("leallitas", async (ctx: Context) => {
    deps.agentEngine.stop();
    await deps.auditLog.append({ type: "rendszer", sourceAgent: "telegram", message: "Vészleállító aktiválva Telegramon keresztül." });
    await ctx.reply("⛔ NovaSwarm ágensek leállítva. Újraindításhoz töltsd újra a szervert.");
  });

  return bot;
}
