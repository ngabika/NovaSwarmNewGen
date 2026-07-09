import { atomicWriteJson, readJsonIfExists } from "./atomicFile.js";

export interface HostAccessState {
  /** Az onboarding 6. lépésében adott válasz — az EGYETLEN igazság-forrás (3.1 elv). */
  hostAccessGranted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
}

export class HostAccessDeniedError extends Error {
  constructor(public readonly operation: string) {
    super(
      `Gazdagép-hozzáférés megtagadva: a "${operation}" művelet nem futhat le, ` +
        `mert a host-jogosultsági kapu nincs engedélyezve (lásd onboarding 6. lépés / Beállítások).`
    );
    this.name = "HostAccessDeniedError";
  }
}

/**
 * Az egyetlen, központi jogosultsági kapu. Ezen kell átmennie MINDEN
 * gazdagép-érintő hívásnak (parancsfuttatás, fájlírás/olvasás, terminál-
 * session indítás stb.) — háttér-automatizmusból és interaktív chatből
 * egyaránt (8.2. pont). A példányt szándékosan szingletonként exportáljuk,
 * hogy garantáltan egyetlen mező hordozza ezt az állapotot a teljes
 * rendszerben (3.1. elv).
 */
export class HostAccessGate {
  private state: HostAccessState = {
    hostAccessGranted: false,
    grantedAt: null,
    revokedAt: null,
  };
  private loaded = false;

  constructor(private readonly statePath: string) {}

  async load(): Promise<void> {
    const persisted = await readJsonIfExists<HostAccessState>(this.statePath);
    if (persisted) {
      this.state = persisted;
    }
    this.loaded = true;
  }

  private assertLoaded(): void {
    if (!this.loaded) {
      throw new Error(
        "HostAccessGate.load() nem futott le még – a kapu állapota nem lehet bizonytalan, " +
          "explicit betöltés szükséges induláskor."
      );
    }
  }

  isGranted(): boolean {
    this.assertLoaded();
    return this.state.hostAccessGranted;
  }

  getState(): Readonly<HostAccessState> {
    this.assertLoaded();
    return this.state;
  }

  async grant(): Promise<void> {
    this.assertLoaded();
    this.state = { hostAccessGranted: true, grantedAt: new Date().toISOString(), revokedAt: null };
    await atomicWriteJson(this.statePath, this.state);
  }

  async revoke(): Promise<void> {
    this.assertLoaded();
    this.state = { ...this.state, hostAccessGranted: false, revokedAt: new Date().toISOString() };
    await atomicWriteJson(this.statePath, this.state);
  }

  /**
   * Kötelezően meghívandó minden gazdagép-érintő művelet ELEJÉN.
   * Ha a jogosultság nincs megadva, érthető hibával (nem csendben) bukik el.
   */
  assertGranted(operation: string): void {
    this.assertLoaded();
    if (!this.state.hostAccessGranted) {
      throw new HostAccessDeniedError(operation);
    }
  }
}
