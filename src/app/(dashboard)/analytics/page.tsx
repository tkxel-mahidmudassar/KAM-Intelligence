"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, AlertTriangle, DollarSign, Activity, ArrowRight, Download } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  id: string;
  type: string;
  severity: string;
  title: string;
  isResolved: boolean;
}

interface KamScore {
  overall:        number;
  csat:           number | null;
  relationship:   number | null;
  risk:           number | null;
  contractHealth: number | null;
  projectHealth:  number | null;
  resourceHealth: number | null;
  financial:      number | null;
  whitespace:     number | null;
  computedAt:     string;
}

interface Account {
  id: string;
  name: string;
  industry: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  kamScores: KamScore[];
  signals: Signal[];
  _count: { actions: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<string, string> = {
  HEALTHY:  "#22C55E",
  AT_RISK:  "#F59E0B",
  CRITICAL: "#EF4444",
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#EF4444",
  WARNING:  "#F59E0B",
  INFO:     "#0755E9",
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  REVENUE_DROP:      "Revenue Drop",
  ENGAGEMENT_LOW:    "Engagement Low",
  TICKET_SPIKE:      "Ticket Spike",
  NPS_DECLINE:       "NPS Decline",
  CONTRACT_EXPIRY:   "Contract Expiry",
  CHURN_RISK:        "Churn Risk",
  UPSELL_OPPORTUNITY:"Upsell Opp.",
  RELATIONSHIP_CHANGE:"Relationship",
  CUSTOM:            "Custom",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatARR(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

function escCsv(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportPortfolioCSV(accounts: Account[]) {
  const headers = [
    "Account", "Industry", "ARR", "Health", "KAM Score",
    "CSAT", "Relationship", "Risk", "Contract Health",
    "Project Health", "Resource Health", "Financial", "Whitespace",
    "Open Signals", "Open Actions", "Contract End", "Score Computed At",
  ];

  const rows = accounts.map((a) => {
    const s    = a.kamScores[0] ?? null;
    const sigs = a.signals.filter((x) => !x.isResolved).length;
    return [
      a.name,
      a.industry ?? "",
      a.arr,
      a.health,
      s?.overall ?? "",
      s?.csat           ?? "",
      s?.relationship   ?? "",
      s?.risk           ?? "",
      s?.contractHealth ?? "",
      s?.projectHealth  ?? "",
      s?.resourceHealth ?? "",
      s?.financial      ?? "",
      s?.whitespace     ?? "",
      sigs,
      a._count.actions,
      a.contractEnd ? new Date(a.contractEnd).toISOString().split("T")[0] : "",
      s?.computedAt ? new Date(s.computedAt).toISOString().split("T")[0] : "",
    ].map(escCsv).join(",");
  });

  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `kam-portfolio-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Reusable card shell ──────────────────────────────────────────────────────

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-5",
      className
    )}>
      <p className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{title}</p>
      {children}
    </div>
  );
}

// ─── Tooltip style ────────────────────────────────────────────────────────────

const tooltipStyle = {
  background: "var(--glass-elevated-bg, #1a1a2e)",
  border: "1px solid var(--glass-elevated-border, rgba(255,255,255,0.08))",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--text-primary)",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { role } = useRole();
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [exporting,  setExporting]  = useState(false);

  useEffect(() => {
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => { setAccounts(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [role]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total    = accounts.length;
    const healthy  = accounts.filter((a) => a.health === "HEALTHY").length;
    const atRisk   = accounts.filter((a) => a.health === "AT_RISK").length;
    const critical = accounts.filter((a) => a.health === "CRITICAL").length;
    const totalARR = accounts.reduce((s, a) => s + a.arr, 0);
    const riskARR  = accounts.filter((a) => a.health !== "HEALTHY").reduce((s, a) => s + a.arr, 0);
    const avgScore = accounts.length
      ? Math.round(accounts.reduce((s, a) => s + (a.kamScores[0]?.overall ?? 50), 0) / accounts.length)
      : 0;
    return { total, healthy, atRisk, critical, totalARR, riskARR, avgScore };
  }, [accounts]);

  // Health donut
  const pieData = useMemo(() => [
    { name: "Healthy",  key: "HEALTHY",  value: stats.healthy  },
    { name: "At Risk",  key: "AT_RISK",  value: stats.atRisk   },
    { name: "Critical", key: "CRITICAL", value: stats.critical },
  ].filter((d) => d.value > 0), [stats]);

  // ARR by health (horizontal bar)
  const arrByHealth = useMemo(() => [
    { name: "Healthy",  arr: accounts.filter((a) => a.health === "HEALTHY").reduce((s, a) => s + a.arr, 0),  fill: "#22C55E" },
    { name: "At Risk",  arr: accounts.filter((a) => a.health === "AT_RISK").reduce((s, a) => s + a.arr, 0),   fill: "#F59E0B" },
    { name: "Critical", arr: accounts.filter((a) => a.health === "CRITICAL").reduce((s, a) => s + a.arr, 0),  fill: "#EF4444" },
  ], [accounts]);

  // Score distribution histogram (buckets: 0-20, 21-40, 41-60, 61-80, 81-100)
  const scoreHistogram = useMemo(() => {
    const buckets = [
      { label: "0–20",  min: 0,  max: 20,  count: 0 },
      { label: "21–40", min: 21, max: 40,  count: 0 },
      { label: "41–60", min: 41, max: 60,  count: 0 },
      { label: "61–80", min: 61, max: 80,  count: 0 },
      { label: "81–100",min: 81, max: 100, count: 0 },
    ];
    accounts.forEach((a) => {
      const s = a.kamScores[0]?.overall ?? 50;
      const b = buckets.find((b) => s >= b.min && s <= b.max);
      if (b) b.count++;
    });
    return buckets;
  }, [accounts]);

  // Signals by type (top types by count)
  const signalsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    accounts.forEach((a) =>
      a.signals.filter((s) => !s.isResolved).forEach((s) => {
        counts[s.type] = (counts[s.type] ?? 0) + 1;
      })
    );
    return Object.entries(counts)
      .map(([type, count]) => ({ name: SIGNAL_TYPE_LABELS[type] ?? type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [accounts]);

  // Signals by severity
  const signalsBySeverity = useMemo(() => {
    const counts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    accounts.forEach((a) =>
      a.signals.filter((s) => !s.isResolved).forEach((s) => {
        const key = s.severity as keyof typeof counts;
        if (key in counts) counts[key]++;
      })
    );
    return [
      { name: "Critical", value: counts.CRITICAL, fill: "#EF4444" },
      { name: "Warning",  value: counts.WARNING,  fill: "#F59E0B" },
      { name: "Info",     value: counts.INFO,     fill: "#0755E9" },
    ].filter((d) => d.value > 0);
  }, [accounts]);

  // Industry breakdown
  const industryBreakdown = useMemo(() => {
    const map: Record<string, { count: number; arr: number }> = {};
    accounts.forEach((a) => {
      const ind = a.industry ?? "Other";
      map[ind] = map[ind] ?? { count: 0, arr: 0 };
      map[ind].count++;
      map[ind].arr += a.arr;
    });
    return Object.entries(map)
      .map(([industry, { count, arr }]) => ({ industry, count, arr }))
      .sort((a, b) => b.arr - a.arr)
      .slice(0, 6);
  }, [accounts]);

  // Top at-risk accounts
  const atRiskAccounts = useMemo(() =>
    [...accounts]
      .filter((a) => a.health !== "HEALTHY")
      .sort((a, b) => (a.kamScores[0]?.overall ?? 50) - (b.kamScores[0]?.overall ?? 50))
      .slice(0, 6),
    [accounts]
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-[88px]" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} className="h-[260px]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)]">Portfolio Analytics</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {stats.total} account{stats.total !== 1 ? "s" : ""} · live snapshot
          </p>
        </div>
        <button
          onClick={() => {
            setExporting(true);
            try { exportPortfolioCSV(accounts); }
            finally { setTimeout(() => setExporting(false), 800); }
          }}
          disabled={exporting || accounts.length === 0}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all shrink-0",
            "border border-[#0755E9]/30 bg-[#0755E9]/10 text-[#0755E9]",
            "hover:bg-[#0755E9]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* KPI stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total ARR",    value: formatARR(stats.totalARR), icon: DollarSign,   color: "#0755E9" },
          { label: "ARR at Risk",  value: formatARR(stats.riskARR),  icon: AlertTriangle, color: "#F59E0B" },
          { label: "Avg Score",    value: `${stats.avgScore}/100`,    icon: TrendingUp,   color: "#22C55E" },
          { label: "Open Signals", value: accounts.reduce((s, a) => s + a.signals.filter((x) => !x.isResolved).length, 0), icon: Activity, color: "#EF4444" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-[var(--text-muted)]">{s.label}</p>
                <div className="h-6 w-6 rounded-lg flex items-center justify-center" style={{ background: `${s.color}20` }}>
                  <Icon className="h-3 w-3" style={{ color: s.color }} />
                </div>
              </div>
              <p className="text-[24px] font-bold text-[var(--text-primary)] leading-none tabular-nums">{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 1. Health distribution donut */}
        <Card title="Portfolio Health Distribution">
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <defs>
                  <filter id="analytics-donut-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity="0.16" />
                  </filter>
                </defs>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={44} outerRadius={68}
                  dataKey="value"
                  strokeWidth={0}
                  animationDuration={850}
                  filter="url(#analytics-donut-shadow)"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={HEALTH_COLOR[entry.key]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {[
                { label: "Healthy",  count: stats.healthy,  health: "HEALTHY"  },
                { label: "At Risk",  count: stats.atRisk,   health: "AT_RISK"  },
                { label: "Critical", count: stats.critical, health: "CRITICAL" },
              ].map(({ label, count, health }) => (
                <div key={health} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLOR[health] }} />
                      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {count} <span className="font-normal text-[var(--text-disabled)]">({stats.total > 0 ? Math.round((count / stats.total) * 100) : 0}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`, background: HEALTH_COLOR[health] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* 2. ARR by health */}
        <Card title="ARR by Health Status">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={arrByHealth} layout="vertical" barSize={20} margin={{ left: 8, right: 24 }}>
              <defs>
                <linearGradient id="arr-health-healthy" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="arr-health-risk" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="arr-health-critical" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="1" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatARR(v)}
                tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                formatter={(v: number) => formatARR(v)}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="arr" radius={[0, 8, 8, 0]} label={false} animationDuration={900}>
                {arrByHealth.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.name === "Healthy" ? "url(#arr-health-healthy)" :
                      entry.name === "At Risk" ? "url(#arr-health-risk)" :
                      "url(#arr-health-critical)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 3. Score distribution */}
        <Card title="Score Distribution (KAM Health Score)">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={scoreHistogram} barSize={32} margin={{ left: -8, right: 8 }}>
              <defs>
                <linearGradient id="score-bar-healthy" x1="0" x2="0" y1="1" y2="0">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="score-bar-risk" x1="0" x2="0" y1="1" y2="0">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="score-bar-critical" x1="0" x2="0" y1="1" y2="0">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="1" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Accounts" radius={[8, 8, 0, 0]} animationDuration={900}>
                {scoreHistogram.map((entry, i) => {
                  const mid = (entry.min + entry.max) / 2;
                  const fill = mid >= 70 ? "url(#score-bar-healthy)" : mid >= 45 ? "url(#score-bar-risk)" : "url(#score-bar-critical)";
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 4. Open signals by type */}
        <Card title="Open Signals by Type">
          {signalsByType.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-[12px] text-[var(--text-disabled)]">
              No open signals
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={signalsByType} layout="vertical" barSize={14} margin={{ left: 4, right: 24 }}>
                <defs>
                  <linearGradient id="signal-bar-gradient" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.48" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="1" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--text-disabled)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Signals" fill="url(#signal-bar-gradient)" radius={[0, 8, 8, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

      </div>

      {/* Bottom row: industry + at-risk table */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">

        {/* Industry breakdown */}
        <Card title="ARR by Industry">
          {industryBreakdown.length === 0 ? (
            <p className="text-[12px] text-[var(--text-disabled)]">No industry data</p>
          ) : (
            <div className="space-y-2.5">
              {industryBreakdown.map(({ industry, count, arr }) => {
                const maxArr = industryBreakdown[0].arr;
                const pct = maxArr > 0 ? (arr / maxArr) * 100 : 0;
                return (
                  <div key={industry} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[var(--text-muted)] truncate max-w-[140px]">{industry}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[var(--text-disabled)]">{count} co.</span>
                        <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums w-14 text-right">{formatARR(arr)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0755E9] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* At-risk accounts */}
        <Card title="Accounts Needing Attention">
          {atRiskAccounts.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[12px] text-[var(--text-disabled)]">
              All accounts are healthy 🎉
            </div>
          ) : (
            <div className="space-y-1.5">
              {atRiskAccounts.map((a) => {
                const score  = a.kamScores[0]?.overall ?? null;
                const hColor = HEALTH_COLOR[a.health];
                return (
                  <Link
                    key={a.id}
                    href={`/accounts/${a.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-surface-2)] transition-colors group"
                  >
                    {/* Health dot */}
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: hColor }} />

                    {/* Name */}
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text-primary)] truncate">
                      {a.name}
                    </span>

                    {/* Score bar */}
                    {score != null && (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-20 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${score}%`, background: hColor }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: hColor }}>
                          {score}
                        </span>
                      </div>
                    )}

                    {/* ARR */}
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums w-14 text-right">
                      {formatARR(a.arr)}
                    </span>

                    <ArrowRight className="h-3 w-3 text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

      </div>

      {/* Signal severity summary */}
      {signalsBySeverity.length > 0 && (
        <Card title="Open Signal Severity Breakdown">
          <div className="flex items-center gap-6 flex-wrap">
            {signalsBySeverity.map(({ name, value, fill }) => (
              <div key={name} className="flex items-center gap-3 min-w-[120px]">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${fill}18` }}
                >
                  <Activity className="h-4 w-4" style={{ color: fill }} />
                </div>
                <div>
                  <p className="text-[22px] font-bold text-[var(--text-primary)] leading-none tabular-nums" style={{ color: fill }}>
                    {value}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{name}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
