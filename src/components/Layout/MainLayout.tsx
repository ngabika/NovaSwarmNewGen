import type { ReactNode } from "react";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";
import HardwareMonitor from "../HardwareMonitor/HardwareMonitor.js";

type TabId = "chat" | "kanban" | "orgchart" | "terminal" | "audit" | "settings";

interface Props {
  locale: Locale;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: ReactNode;
}

const NAV_ITEMS: { id: TabId; icon: string; labelKey: keyof ReturnType<typeof t>["nav"] }[] = [
  { id: "chat", icon: "💬", labelKey: "chat" },
  { id: "kanban", icon: "📋", labelKey: "kanban" },
  { id: "orgchart", icon: "🏢", labelKey: "orgChart" },
  { id: "terminal", icon: "🖥️", labelKey: "terminal" },
  { id: "audit", icon: "📜", labelKey: "auditLog" },
  { id: "settings", icon: "⚙️", labelKey: "settings" },
];

export default function MainLayout({ locale, activeTab, onTabChange, children }: Props) {
  const tx = t(locale);

  return (
    <div className="flex h-screen flex-col bg-[#070908] text-white">
      {/* ── Top bar ── */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-[#0a0d0b] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-tight text-emerald-400">NovaSwarm</span>
          <span className="text-xs text-white/20">2.0</span>
        </div>
        <HardwareMonitor locale={locale} compact />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar nav ── */}
        <nav className="flex w-14 flex-col border-r border-white/10 bg-[#0a0d0b] py-2">
          {NAV_ITEMS.map(({ id, icon, labelKey }) => (
            <button key={id} onClick={() => onTabChange(id)}
              title={tx.nav[labelKey]}
              className={`mx-auto mb-1 flex h-10 w-10 flex-col items-center justify-center rounded-lg text-xl transition-colors ${
                activeTab === id
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-white/25 hover:bg-white/5 hover:text-white/60"
              }`}>
              {icon}
            </button>
          ))}
        </nav>

        {/* ── Main content ── */}
        <main className="min-w-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
