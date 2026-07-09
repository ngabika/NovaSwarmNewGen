import { describe, expect, it } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { HostAccessGate, HostAccessDeniedError } from "../hostAccessGate.js";

function tmpStatePath(): string {
  return path.join(os.tmpdir(), `novaswarm-hostaccess-${randomBytes(6).toString("hex")}.json`);
}

describe("HostAccessGate", () => {
  it("alapból NEM engedélyezett, és assertGranted egyértelmű hibával bukik, nem csendben", async () => {
    const gate = new HostAccessGate(tmpStatePath());
    await gate.load();
    expect(gate.isGranted()).toBe(false);
    expect(() => gate.assertGranted("teszt-művelet")).toThrow(HostAccessDeniedError);
  });

  it("grant() után a kapu engedélyezetté válik, ÉS ez perzisztálódik egy új betöltésnél is", async () => {
    const statePath = tmpStatePath();
    const gate = new HostAccessGate(statePath);
    await gate.load();
    await gate.grant();
    expect(gate.isGranted()).toBe(true);

    const reloaded = new HostAccessGate(statePath);
    await reloaded.load();
    expect(reloaded.isGranted()).toBe(true);
  });

  it("revoke() után ismét megtagadja a hozzáférést", async () => {
    const gate = new HostAccessGate(tmpStatePath());
    await gate.load();
    await gate.grant();
    await gate.revoke();
    expect(gate.isGranted()).toBe(false);
    expect(() => gate.assertGranted("terminal-write")).toThrow(HostAccessDeniedError);
  });

  it("betöltés előtt explicit hibát dob, ahelyett hogy bizonytalan állapotot engedne", () => {
    const gate = new HostAccessGate(tmpStatePath());
    expect(() => gate.isGranted()).toThrow();
  });
});
