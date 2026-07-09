import { atomicWriteJson, readJsonIfExists } from "../state/atomicFile.js";
import { DEFAULT_SETTINGS, type Settings } from "../agents/types.js";

export class SettingsStore {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private loaded = false;

  constructor(private readonly storePath: string) {}

  async load(): Promise<void> {
    const persisted = await readJsonIfExists<Partial<Settings>>(this.storePath);
    if (persisted) {
      // Nem-roncsoló merge: a perzisztált értékek felülírják az alapértékeket,
      // de az alapértékek kitöltik az esetleg hiányzó (új verzióban bevezetett) mezőket.
      this.settings = { ...DEFAULT_SETTINGS, ...persisted };
    }
    this.loaded = true;
  }

  get(): Readonly<Settings> {
    if (!this.loaded) throw new Error("SettingsStore.load() nem futott le még.");
    return this.settings;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    if (!this.loaded) throw new Error("SettingsStore.load() nem futott le még.");
    this.settings = { ...this.settings, ...patch };
    await atomicWriteJson(this.storePath, this.settings);
    return this.settings;
  }

  /**
   * Visszaadja az összes API-kulcsot egy adott szolgáltatóhoz, a titkos részt
   * kiszórva — REST végpontokra biztonságos, a `secretRef` kerül vissza, nem a
   * nyers kulcs.
   */
  getPublicApiKeyList() {
    return this.settings.apiKeys.map(({ id, provider, label, disabledUntil }) => ({
      id,
      provider,
      label,
      disabledUntil,
    }));
  }
}
