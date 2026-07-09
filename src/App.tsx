import { useState, Suspense, lazy } from "react";
import { useAppState } from "./hooks/useAppState.js";
import SetupWizard from "./components/Setup/SetupWizard.js";
import MainLayout from "./components/Layout/MainLayout.js";
import ChatView from "./components/Chat/ChatView.js";
import KanbanView from "./components/Kanban/KanbanView.js";
import OrgChartView from "./components/OrgChart/OrgChartView.js";
import AuditLogView from "./components/AuditLog/AuditLogView.js";
import SettingsView from "./components/Settings/SettingsView.js";
import type { Locale } from "./locales/i18n.js";
import type { AppSettings } from "./hooks/useAppState.js";

const TerminalView = lazy(() => import("./components/Terminal/TerminalView.js"));

type TabId = "chat" | "kanban" | "orgchart" | "terminal" | "audit" | "settings";

export default function App() {
  const { settings, agents, loading, error, loadAll, updateSettings, refetchAgents } = useAppState();
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070908]">
        <div className="text-sm text-white/30 animate-pulse">NovaSwarm betölt...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#070908]">
        <p className="text-sm text-red-400">Nem sikerült kapcsolódni a szerverhez: {error}</p>
        <button onClick={loadAll} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/50 hover:text-white">
          Újrapróbálkozás
        </button>
      </div>
    );
  }

  if (!settings?.onboardingComplete) {
    return <SetupWizard onComplete={loadAll} />;
  }

  const locale = (settings.language as Locale) ?? "hu";

  return (
    <MainLayout locale={locale} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "chat" && <ChatView agents={agents} locale={locale} />}
      {activeTab === "kanban" && <KanbanView agents={agents} locale={locale} />}
      {activeTab === "orgchart" && <OrgChartView agents={agents} locale={locale} onRefresh={refetchAgents} />}
      {activeTab === "terminal" && (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-white/30">Terminál betölt...</div>}>
          <TerminalView />
        </Suspense>
      )}
      {activeTab === "audit" && <AuditLogView locale={locale} />}
      {activeTab === "settings" && settings && (
        <SettingsView
          settings={settings}
          locale={locale}
          onUpdated={(s: AppSettings) => void updateSettings(s)}
        />
      )}
    </MainLayout>
  );
}
