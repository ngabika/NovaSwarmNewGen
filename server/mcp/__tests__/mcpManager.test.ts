import { describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { McpManager } from "../mcpManager.js";

function tmpPath() {
  return path.join(os.tmpdir(), `mcp-${randomBytes(6).toString("hex")}.json`);
}

describe("McpManager", () => {
  it("register + getAll + getById", async () => {
    const manager = new McpManager(tmpPath());
    await manager.load();
    const server = await manager.register({ name: "TestMCP", endpointUrl: "http://localhost:9000", authType: "none", authCredentials: {} });
    expect(server.connectionStatus).toBe("unchecked");
    expect(manager.getById(server.id)).not.toBeNull();
    expect(manager.getAll()).toHaveLength(1);
  });

  it("testConnection 'connected'-re állítja a státuszt, ha a szerver 200-at ad", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;
    const manager = new McpManager(tmpPath(), mockFetch);
    await manager.load();
    const server = await manager.register({ name: "Live", endpointUrl: "http://mcp.example.com", authType: "none", authCredentials: {} });

    const result = await manager.testConnection(server.id);
    expect(result.connectionStatus).toBe("connected");
    expect(result.lastError).toBeNull();
    expect(result.lastCheckedAt).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1); // tényleges hívás történt
  });

  it("testConnection 'error'-re állítja a státuszt, ha a szerver 401-et ad — NEM 'connected'-t", async () => {
    const mockFetch = vi.fn(async () => ({ ok: false, status: 401, statusText: "Unauthorized" })) as unknown as typeof fetch;
    const manager = new McpManager(tmpPath(), mockFetch);
    await manager.load();
    const server = await manager.register({ name: "Secured", endpointUrl: "http://secured.example.com", authType: "api-key", authCredentials: { apiKey: "wrong-key" } });

    const result = await manager.testConnection(server.id);
    expect(result.connectionStatus).toBe("error");
    expect(result.lastError).toContain("401");
  });

  it("testConnection 'error'-re állítja, ha a hálózati hívás kivételt dob (pl. nem elérhető szerver)", async () => {
    const mockFetch = vi.fn(async () => { throw new Error("időtúllépés"); }) as unknown as typeof fetch;
    const manager = new McpManager(tmpPath(), mockFetch);
    await manager.load();
    const server = await manager.register({ name: "Down", endpointUrl: "http://down.example.com", authType: "none", authCredentials: {} });

    const result = await manager.testConnection(server.id);
    expect(result.connectionStatus).toBe("error");
    expect(result.lastError).toContain("időtúllépés");
  });

  it("update visszaállítja az állapotot 'unchecked'-re (az új cím megköveteli az újbóli ellenőrzést)", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;
    const manager = new McpManager(tmpPath(), mockFetch);
    await manager.load();
    const server = await manager.register({ name: "X", endpointUrl: "http://a.example.com", authType: "none", authCredentials: {} });
    await manager.testConnection(server.id);
    expect(manager.getById(server.id)?.connectionStatus).toBe("connected");

    await manager.update(server.id, { endpointUrl: "http://b.example.com" });
    expect(manager.getById(server.id)?.connectionStatus).toBe("unchecked");
  });
});
