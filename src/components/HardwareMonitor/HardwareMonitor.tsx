import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import type { Locale } from "../../locales/i18n.js";
import { t } from "../../locales/i18n.js";

interface HardwareMetrics {
  cpu: { loadPercent: number; tempCelsius: number | null; cores: number; brand: string };
  ram: { totalMb: number; usedMb: number; freeMb: number };
  disk: { totalGb: number; usedGb: number; freeGb: number };
  battery: { hasBattery: boolean; percent: number | null; isCharging: boolean | null };
  shouldThrottleBackground: boolean;
  collectedAt: string;
}

function Bar({ value, max, color = "bg-emerald-500" }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : color}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-white/40">{pct}%</span>
    </div>
  );
}

interface Props { locale: Locale; compact?: boolean; }

export default function HardwareMonitor({ locale, compact = false }: Props) {
  const tx = t(locale);
  const [metrics, setMetrics] = useState<HardwareMetrics | null>(null);

  useEffect(() => {
    const poll = async () => {
      try { setMetrics(await api.get<HardwareMetrics>("/system/hardware")); }
      catch { /* silent — server might not be ready yet */ }
    };
    void poll();
    const interval = setInterval(poll, compact ? 15_000 : 8_000);
    return () => clearInterval(interval);
  }, [compact]);

  if (!metrics) return <div className="text-xs text-white/20 p-2">{tx.common.loading}</div>;

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-1 text-xs text-white/40">
        <span>CPU {metrics.cpu.loadPercent}%{metrics.cpu.tempCelsius ? ` ${metrics.cpu.tempCelsius}°C` : ""}</span>
        <span>RAM {Math.round(metrics.ram.usedMb / 1024 * 10) / 10}/{Math.round(metrics.ram.totalMb / 1024 * 10) / 10}GB</span>
        {metrics.battery.hasBattery && (
          <span>{metrics.battery.percent}%{metrics.battery.isCharging ? " ⚡" : ""}</span>
        )}
        {metrics.shouldThrottleBackground && <span className="text-amber-400">⚠️</span>}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {metrics.shouldThrottleBackground && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {tx.hardware.throttle}
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-[#0f1511] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/50">{tx.hardware.cpu}</span>
          <span className="text-xs text-white/30">{metrics.cpu.brand} · {metrics.cpu.cores} mag</span>
        </div>
        <Bar value={metrics.cpu.loadPercent} max={100} />
        {metrics.cpu.tempCelsius && (
          <Bar value={metrics.cpu.tempCelsius} max={100} color={metrics.cpu.tempCelsius > 80 ? "bg-red-500" : "bg-blue-400"} />
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0f1511] p-4 space-y-2">
        <span className="text-xs font-medium text-white/50">{tx.hardware.ram}</span>
        <Bar value={metrics.ram.usedMb} max={metrics.ram.totalMb} />
        <p className="text-right text-xs text-white/25">
          {Math.round(metrics.ram.usedMb / 1024 * 10) / 10} / {Math.round(metrics.ram.totalMb / 1024 * 10) / 10} GB
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0f1511] p-4 space-y-2">
        <span className="text-xs font-medium text-white/50">{tx.hardware.disk}</span>
        <Bar value={metrics.disk.usedGb} max={metrics.disk.totalGb} />
        <p className="text-right text-xs text-white/25">{metrics.disk.usedGb} / {metrics.disk.totalGb} GB</p>
      </div>

      {metrics.battery.hasBattery && (
        <div className="rounded-lg border border-white/10 bg-[#0f1511] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/50">{tx.hardware.battery}</span>
            {metrics.battery.isCharging && <span className="text-xs text-emerald-400">{tx.hardware.charging} ⚡</span>}
          </div>
          <Bar value={metrics.battery.percent ?? 0} max={100} color="bg-emerald-500" />
        </div>
      )}
    </div>
  );
}
