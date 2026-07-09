import type { ProviderId } from "../providers/types.js";

// ─── Agent ───────────────────────────────────────────────────────────────────

export type AgentId = string;

export interface Agent {
  id: AgentId;
  name: string;
  avatar: string; // emoji vagy URL
  role: string;
  /** Felettes ágens azonosítója — null = top-level (10.1. pont: tetszőlegesen mély hierarchia) */
  parentAgentId: AgentId | null;
  systemInstruction: string;
  assignedModel: string;
  assignedProvider: ProviderId;
  webSearchEnabled: boolean;
  hostCommandEnabled: boolean;
  active: boolean;
  createdAt: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface ApiKeyEntry {
  id: string;
  provider: ProviderId;
  secretRef: string; // a tényleges kulcs — csak futásidőben az env/state-ből
  label?: string;
  disabledUntil?: string | null;
}

export interface Settings {
  language: string; // pl. "hu", "en"
  onboardingComplete: boolean;
  userProfile: string; // a felhasználó szabad szöveges bemutatkozása (6. lépés)
  apiKeys: ApiKeyEntry[];
  telegram: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  hostAccessGranted: boolean; // EGYETLEN igazságforrás a host-jogosultsághoz (3.1 + state/hostAccessGate.ts-szel szinkronban)
  ollamaBaseUrl: string;
  ollamaModel: string;
  dailyLimitUsd: number;
  dailyLimitEnabled: boolean;
  primaryProviderId: ProviderId;
  backupSchedule: "daily" | "weekly" | "monthly" | "manual";
  backupCloudEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "hu",
  onboardingComplete: false,
  userProfile: "",
  apiKeys: [],
  telegram: { botToken: "", chatId: "", enabled: false },
  hostAccessGranted: false,
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5:1.5b",
  dailyLimitUsd: 1.0,
  dailyLimitEnabled: true,
  primaryProviderId: "gemini",
  backupSchedule: "daily",
  backupCloudEnabled: false,
};

// ─── Message / Conversation ───────────────────────────────────────────────────

export type MessageRole = "user" | "agent" | "system";
export type MessageSource = "web" | "telegram";

export interface Message {
  id: string;
  conversationId: string;
  agentId: AgentId;
  role: MessageRole;
  content: string;
  source: MessageSource;
  createdAt: string;
}

export interface Conversation {
  id: string;
  agentId: AgentId;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

export type KanbanStatus = "todo" | "in-progress" | "done";

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  status: KanbanStatus;
  assignedAgentId: AgentId | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  agentId: AgentId | null;
  tags: string[];
  embedding?: number[];
  createdAt: string;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export type McpAuthType = "none" | "api-key" | "basic" | "oauth2";
export type McpConnectionStatus = "connected" | "error" | "unchecked" | "not-configured";

export interface McpServer {
  id: string;
  name: string;
  endpointUrl: string;
  authType: McpAuthType;
  /** Titkosítandó mentés előtt — soha plaintext a state-fájlban */
  authCredentials: Record<string, string>;
  /** 3.3 elv: TÉNYLEGESEN ellenőrzött állapot, sosem feltételezett */
  connectionStatus: McpConnectionStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type AuditLogType =
  | "gondolat"
  | "akció"
  | "chat"
  | "terminal"
  | "rendszer"
  | "telegram"
  | "kanban"
  | "memória"
  | "supervisor";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditLogType;
  sourceAgent: string;
  message: string;
}

// ─── Skill ───────────────────────────────────────────────────────────────────

export type SkillApprovalStatus = "pending" | "approved" | "rejected";

export interface Skill {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  createdByAgentId: AgentId;
  approvalStatus: SkillApprovalStatus;
  createdAt: string;
}
