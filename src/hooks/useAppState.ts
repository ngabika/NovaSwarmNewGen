import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import type { Locale } from "../locales/i18n.js";

export interface Agent {
  id: string; name: string; avatar: string; role: string;
  parentAgentId: string | null; systemInstruction: string;
  assignedModel: string; assignedProvider: string;
  webSearchEnabled: boolean; hostCommandEnabled: boolean; active: boolean;
}

export interface ApiKeyEntry {
  id: string; provider: string; secretRef?: string; label?: string; disabledUntil?: string | null;
}

export interface AppSettings {
  language: Locale; onboardingComplete: boolean; userProfile: string;
  hostAccessGranted: boolean; ollamaBaseUrl: string; ollamaModel: string;
  dailyLimitUsd: number; dailyLimitEnabled: boolean;
  primaryProviderId: string;
  apiKeys: ApiKeyEntry[];
  telegram: { botToken: string; chatId: string; enabled: boolean };
}

export function useAppState() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [s, a] = await Promise.all([
        api.get<AppSettings>("/settings"),
        api.get<Agent[]>("/agents"),
      ]);
      setSettings(s);
      setAgents(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = await api.patch<AppSettings>("/settings", patch);
    setSettings(updated);
    return updated;
  }, []);

  const refetchAgents = useCallback(async () => {
    const a = await api.get<Agent[]>("/agents");
    setAgents(a);
  }, []);

  return { settings, agents, loading, error, loadAll, updateSettings, refetchAgents };
}
