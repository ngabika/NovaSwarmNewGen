import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJsonIfExists } from "../state/atomicFile.js";
import type { McpServer, McpAuthType, McpConnectionStatus } from "../agents/types.js";

interface McpStoreData {
  servers: McpServer[];
}

export class McpManager {
  private servers = new Map<string, McpServer>();
  private loaded = false;

  constructor(
    private readonly storePath: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async load(): Promise<void> {
    const data = await readJsonIfExists<McpStoreData>(this.storePath);
    if (data) for (const s of data.servers) this.servers.set(s.id, s);
    this.loaded = true;
  }

  private assertLoaded(): void {
    if (!this.loaded) throw new Error("McpManager.load() nem futott le még.");
  }

  getAll(): McpServer[] {
    this.assertLoaded();
    return Array.from(this.servers.values());
  }

  getById(id: string): McpServer | null {
    this.assertLoaded();
    return this.servers.get(id) ?? null;
  }

  async register(partial: {
    name: string;
    endpointUrl: string;
    authType: McpAuthType;
    authCredentials: Record<string, string>;
  }): Promise<McpServer> {
    this.assertLoaded();
    const server: McpServer = {
      id: randomUUID(),
      name: partial.name,
      endpointUrl: partial.endpointUrl,
      authType: partial.authType,
      authCredentials: partial.authCredentials,
      connectionStatus: "unchecked",
      lastCheckedAt: null,
      lastError: null,
    };
    this.servers.set(server.id, server);
    await this.persist();
    return server;
  }

  async update(id: string, patch: Partial<Pick<McpServer, "name" | "endpointUrl" | "authType" | "authCredentials">>): Promise<McpServer> {
    this.assertLoaded();
    const existing = this.servers.get(id);
    if (!existing) throw new Error(`MCP szerver nem található: ${id}`);
    const updated = { ...existing, ...patch, connectionStatus: "unchecked" as McpConnectionStatus, lastCheckedAt: null, lastError: null };
    this.servers.set(id, updated);
    await this.persist();
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.assertLoaded();
    this.servers.delete(id);
    await this.persist();
  }

  /**
   * VALÓS hálózati hívás (3.3 elv): "kapcsolat tesztelése" NEM egy időzített
   * várakozás utáni automatikus "sikeres" — ténylegesen megpróbál csatlakozni
   * a megadott végponthoz, és a kapott tényleges válasz (vagy hiba) alapján
   * állítja be a kapcsolódási állapotot.
   */
  async testConnection(id: string): Promise<McpServer> {
    this.assertLoaded();
    const server = this.servers.get(id);
    if (!server) throw new Error(`MCP szerver nem található: ${id}`);

    const now = new Date().toISOString();
    let status: McpConnectionStatus;
    let lastError: string | null = null;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (server.authType === "api-key" && server.authCredentials["apiKey"]) {
        headers["Authorization"] = `Bearer ${server.authCredentials["apiKey"]}`;
      } else if (server.authType === "basic") {
        const { username = "", password = "" } = server.authCredentials;
        headers["Authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      }

      const response = await this.fetcher(server.endpointUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5_000),
      });

      status = response.ok ? "connected" : "error";
      if (!response.ok) lastError = `HTTP ${response.status} ${response.statusText}`;
    } catch (err) {
      status = "error";
      lastError = err instanceof Error ? err.message : String(err);
    }

    const updated = { ...server, connectionStatus: status, lastCheckedAt: now, lastError };
    this.servers.set(id, updated);
    await this.persist();
    return updated;
  }

  private async persist(): Promise<void> {
    await atomicWriteJson(this.storePath, { servers: Array.from(this.servers.values()) });
  }
}
