import { describe, expect, it } from "vitest";
import { assertAllowed, isForbiddenPath, ForbiddenZoneError } from "../forbiddenZones.js";

describe("forbiddenZones", () => {
  it.each([
    ".env",
    "server/.env",
    ".config.json",
    "novaswarm.service",
    "server/system/novaswarm.service",
    ".gitignore",
    "server/selfmod/gitRollback.ts",
    "server/selfmod/forbiddenZones.ts",
  ])("tiltottnak jelöli: %s", (p) => {
    expect(isForbiddenPath(p)).toBe(true);
  });

  it.each(["server/agents/coordinator.ts", "src/components/Dashboard.tsx", "server/routes/kanban.ts"])(
    "NEM tiltottnak jelöli: %s",
    (p) => {
      expect(isForbiddenPath(p)).toBe(false);
    }
  );

  it("assertAllowed dob egy ForbiddenZoneError-t tiltott útvonalra", () => {
    expect(() => assertAllowed(".env")).toThrow(ForbiddenZoneError);
  });

  it("assertAllowed nem dob hibát megengedett útvonalra", () => {
    expect(() => assertAllowed("server/agents/coordinator.ts")).not.toThrow();
  });
});
