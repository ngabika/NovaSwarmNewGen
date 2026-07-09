import simpleGit, { type SimpleGit } from "simple-git";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { isForbiddenPath } from "./forbiddenZones.js";

export interface FileChange {
  /** A repó gyökeréhez viszonyított relatív útvonal. */
  path: string;
  content: string;
}

export interface SelfModResult {
  ok: boolean;
  appliedFiles: string[];
  rolledBack: boolean;
  blockedFiles?: string[];
  errorMessage?: string;
}

export type HealthCheck = () => Promise<boolean>;

/**
 * Minden önmódosítás előtt automatikus, lokális git commit készül. Ha a
 * módosítás után a health-check sikertelen (a rendszer nem indul el /
 * összeomlik), egy automatizált mechanizmus — EMBERI BEAVATKOZÁS NÉLKÜL —
 * visszaállítja az utolsó működő commit állapotát (13.2. pont). A tiltott
 * zónákat (8.5) minden futás előtt, MIELŐTT bármilyen fájl íródna, ellenőrzi.
 */
export class SelfModEngine {
  private readonly git: SimpleGit;

  constructor(private readonly repoRoot: string) {
    this.git = simpleGit(repoRoot);
  }

  private async ensureGitIdentity(): Promise<void> {
    // Teszt/friss repó esetén szükséges lehet egy minimális identitás, hogy a commit ne bukjon el.
    try {
      await this.git.raw(["config", "user.email"]);
    } catch {
      await this.git.addConfig("user.email", "novaswarm-selfmod@localhost");
      await this.git.addConfig("user.name", "NovaSwarm SelfMod Engine");
    }
  }

  private async hasAnyCommit(): Promise<boolean> {
    try {
      await this.git.log({ maxCount: 1 });
      return true;
    } catch {
      return false;
    }
  }

  private async currentHeadHash(): Promise<string | null> {
    if (!(await this.hasAnyCommit())) return null;
    const log = await this.git.log({ maxCount: 1 });
    return log.latest?.hash ?? null;
  }

  /**
   * @param changes A javasolt fájl-módosítások.
   * @param healthCheck A módosítás UTÁN futtatandó ellenőrzés (pl. típusellenőrzés + build + indulási teszt).
   */
  async applyChange(changes: FileChange[], healthCheck: HealthCheck): Promise<SelfModResult> {
    // 1. Tiltott zóna ellenőrzés MINDEN érintett fájlra, MIELŐTT bármi íródna.
    const blocked = changes.filter((c) => isForbiddenPath(c.path));
    if (blocked.length > 0) {
      return {
        ok: false,
        appliedFiles: [],
        rolledBack: false,
        blockedFiles: blocked.map((b) => b.path),
        errorMessage: "Tiltott módosítási zónát érintő változás — semmilyen fájl nem került írásra.",
      };
    }

    await this.ensureGitIdentity();

    // 2. Snapshot commit a változás ELŐTT, hogy mindig legyen visszaállítható pont.
    await this.git.add(".");
    const beforeStatus = await this.git.status();
    if (beforeStatus.files.length > 0 || !(await this.hasAnyCommit())) {
      await this.git.commit("novaswarm: snapshot önmódosítás előtt");
    }
    const preChangeHash = await this.currentHeadHash();

    // 3. A módosítások felírása a valós fájlrendszerre.
    for (const change of changes) {
      const fullPath = path.join(this.repoRoot, change.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, change.content, "utf8");
    }
    await this.git.add(".");
    await this.git.commit(`novaswarm: önmódosítás (${changes.map((c) => c.path).join(", ")})`);

    // 4. Health-check a módosítás UTÁN.
    const healthy = await healthCheck();
    if (!healthy) {
      if (preChangeHash) {
        await this.git.reset(["--hard", preChangeHash]);
      }
      return {
        ok: false,
        appliedFiles: [],
        rolledBack: true,
        errorMessage:
          "A health-check sikertelen volt a módosítás után — automatikus rollback megtörtént, emberi beavatkozás nélkül.",
      };
    }

    return { ok: true, appliedFiles: changes.map((c) => c.path), rolledBack: false };
  }
}
