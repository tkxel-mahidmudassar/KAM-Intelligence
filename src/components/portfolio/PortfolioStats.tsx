"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, AlertTriangle, XCircle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortfolioStatsProps {
  accounts: Array<{
    health: string;
    arr: number;
  }>;
}

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

const PIE_COLORS: Record<string, string> = {
  HEALTHY:  "#22C55E",
  AT_RISK:  "#F59E0B",
  CRITICAL: "#EF4444",
};

const LABEL: Record<string, string> = {
  HEALTHY: "Healthy", AT_RISK: "At Risk", CRITICAL: "Critical",
};

export function PortfolioStats({ accounts }: PortfolioStatsProps) {
  const total     = accounts.length;
  const healthy   = accounts.filter((a) => a.health === "HEALTHY").length;
  const atRisk    = accounts.filter((a) => a.health === "AT_RISK").length;
  const critical  = accounts.filter((a) => a.health === "CRITICAL").length;
  const totalARR  = accounts.reduce((s, a) => s + a.arr, 0);
  const atRiskARR = accounts
    .filter((a) => a.health === "AT_RISK" || a.health === "CRITICAL")
    .reduce((s, a) => s + a.arr, 0);

  const pieData = [
    { name: "HEALTHY",  value: healthy  },
    { name: "AT_RISK",  value: atRisk   },
    { name: "CRITICAL", value: critical },
  ].filter((d) => d.value > 0);

  const stats = [
    {
      label: "Total ARR",
      value: formatARR(totalARR),
      sub: `${total} account${total !== 1 ? "s" : ""}`,
      icon: DollarSign,
      iconBg: "#0755E9",
    },
    {
      label: "Healthy",
      value: healthy,
      sub: healthy > 0 ? `${Math.round((healthy / total) * 100)}% of portfolio` : "—",
      icon: TrendingUp,
      iconBg: "#22C55E",
    },
    {
      label: "At Risk",
      value: atRisk,
      sub: atRisk > 0 ? formatARR(accounts.filter(a => a.health === "AT_RISK").reduce((s,a) => s+a.arr,0)) + " ARR" : "—",
      icon: AlertTriangle,
      iconBg: "#F59E0B",
    },
    {
      label: "Critical",
      value: critical,
      sub: critical > 0 ? formatARR(accounts.filter(a => a.health === "CRITICAL").reduce((s,a) => s+a.arr,0)) + " ARR at risk" : "—",
      icon: XCircle,
      iconBg: "#EF4444",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_200px] gap-3">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-4 flex flex-col gap-1.5"
          >
            <p className="text-[11px] font-medium text-[var(--text-muted)] leading-tight">{s.label}</p>
            <div className="flex items-end justify-between gap-1">
              <p className="text-[28px] font-bold text-[var(--text-primary)] leading-none tabular-nums">{s.value}</p>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mb-0.5" style={{ background: `${s.iconBg}20` }}>
                <Icon className="h-3.5 w-3.5" style={{ color: s.iconBg }} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{s.sub}</p>
          </div>
        );
      })}

      {/* Donut chart */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-4 flex items-center gap-3">
        <ResponsiveContainer width={64} height={64}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%" cy="50%"
              innerRadius={20} outerRadius={30}
              dataKey="value"
              strokeWidth={0}
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={PIE_COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [value, LABEL[name as string]]}
              contentStyle={{
                background: "var(--glass-elevated-bg)",
                border: "1px solid var(--glass-elevated-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1.5 min-w-0">
          {pieData.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ background: PIE_COLORS[d.name] }} />
              <span className="text-[11px] text-[var(--text-muted)] truncate">
                {LABEL[d.name]} <span className="font-semibold text-[var(--text-primary)]">{d.value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
