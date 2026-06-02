"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, XCircle, DollarSign,
  ClipboardList, ArrowRight, Activity,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { CalendarView } from "@/components/home/CalendarView";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  isResolved: boolean;
  pendingReview: boolean;
  detectedAt: string;
}

interface Account {
  id: string;
  name: string;
  industry: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  kamScores: { overall: number }[];
  signals: Signal[];
  _count: { actions: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 864e5);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

const HEALTH_ORDER: Record<string, number> = { CRITICAL: 0, AT_RISK: 1, HEALTHY: 2 };
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

const SEVERITY_CONFIG = {
  CRITICAL: { variant: "critical" as const, label: "Critical" },
  WARNING:  { variant: "at-risk"  as const, label: "Warning"  },
  INFO:     { variant: "neutral"  as const, label: "Info"     },
};

// ─── Watchlist Row ────────────────────────────────────────────────────────────

function WatchlistRow({ account }: { account: Account }) {
  const score   = account.kamScores[0]?.overall ?? null;
  const renewal = daysUntil(account.contractEnd);
  const scoreColor =
    score === null ? "text-[var(--text-muted)]"
    : score >= 70  ? "text-[#22C55E]"
    : score >= 45  ? "text-[#F59E0B]"
    :                "text-[#EF4444]";

  const healthConfig = {
    HEALTHY:  { variant: "healthy"  as const },
    AT_RISK:  { variant: "at-risk"  as const },
    CRITICAL: { variant: "critical" as const },
  }[account.health];

  return (
    <Link
      href={`/accounts/${account.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-surface-2)] transition-colors group"
    >
      <div className="shrink-0">
        <Badge variant={healthConfig.variant}>
          {account.health === "HEALTHY" ? "Healthy" : account.health === "AT_RISK" ? "At Risk" : "Critical"}
        </Badge>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{account.name}</p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {formatARR(account.arr)} ARR
          {renewal !== null && ` - ${renewal > 0 ? `${renewal}d to renewal` : "Renewal past due"}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] text-[var(--text-muted)] leading-none mb-0.5">Score</p>
        <p className={cn("text-[16px] font-bold tabular-nums leading-none", scoreColor)}>
          {score !== null ? Math.round(score) : "-"}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

// ─── Signal Row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal, accountName, accountId,
}: {
  signal: Signal; accountName: string; accountId: string;
}) {
  const cfg = SEVERITY_CONFIG[signal.severity] ?? SEVERITY_CONFIG.INFO;
  return (
    <Link
      href={`/accounts/${accountId}`}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-surface-2)] transition-colors group"
    >
      <div className="shrink-0 pt-0.5">
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug truncate">{signal.title}</p>
        <p className="text-[11px] text-[var(--text-muted)] truncate">{accountName}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { role } = useRole();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading]   = useState(true);

  const fetchAccounts = useCallback(() => {
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setAccounts(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [role]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const totalOpenActions = accounts.reduce((s, a) => s + a._count.actions, 0);

  const watchlist = [...accounts]
    .sort((a, b) => {
      const hDiff = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
      if (hDiff !== 0) return hDiff;
      const aScore = a.kamScores[0]?.overall ?? 100;
      const bScore = b.kamScores[0]?.overall ?? 100;
      if (aScore !== bScore) return aScore - bScore;
      const aRenewal = daysUntil(a.contractEnd) ?? 9999;
      const bRenewal = daysUntil(b.contractEnd) ?? 9999;
      return aRenewal - bRenewal;
    })
    .slice(0, 5);

  // Only show live (non-pending-review) signals
  const liveSignals = accounts
    .flatMap((a) =>
      a.signals
        .filter((s) => !s.isResolved && !s.pendingReview)
        .map((s) => ({ signal: s, accountName: a.name, accountId: a.id }))
    )
    .sort((a, b) => SEVERITY_ORDER[a.signal.severity] - SEVERITY_ORDER[b.signal.severity])
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {/* ── Greeting bar ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
          {greeting()}
        </h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5">{todayLabel()}</p>
      </div>

      {/* ── Summary stat cards ───────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <PortfolioStatCards accounts={accounts} openActions={totalOpenActions} />
        </div>
      )}

      {/* ── Calendar hero ────────────────────────────────────────────────── */}
      <CalendarView onItemUpdated={fetchAccounts} />

      {/* ── Bottom grid: watchlist + signals ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Account Watchlist */}
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]">
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Account Watchlist</span>
            </div>
            <Link href="/portfolio" className="text-[11px] text-[#0755E9] font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="px-1.5 py-1.5 space-y-0.5">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-[var(--bg-surface-2)] animate-pulse mx-1.5" />
              ))
            ) : watchlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
                <CheckCircle2 className="h-8 w-8 mb-2 text-[#22C55E]" />
                <p className="text-[13px]">All accounts healthy</p>
              </div>
            ) : (
              watchlist.map((a) => <WatchlistRow key={a.id} account={a} />)
            )}
          </div>
        </div>

        {/* Live Signals */}
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]">
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#9333EA]" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Live Signals</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">Reviewed & active</span>
          </div>
          <div className="px-1.5 py-1.5 space-y-0.5">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-[var(--bg-surface-2)] animate-pulse mx-1.5" />
              ))
            ) : liveSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
                <CheckCircle2 className="h-8 w-8 mb-2 text-[#22C55E]" />
                <p className="text-[13px]">No active signals</p>
              </div>
            ) : (
              liveSignals.map(({ signal, accountName, accountId }) => (
                <SignalRow
                  key={signal.id}
                  signal={signal}
                  accountName={accountName}
                  accountId={accountId}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline stat cards ────────────────────────────────────────────────────────

function PortfolioStatCards({
  accounts, openActions,
}: {
  accounts: Array<{ health: string; arr: number }>;
  openActions: number;
}) {
  const total    = accounts.length;
  const healthy  = accounts.filter((a) => a.health === "HEALTHY").length;
  const atRisk   = accounts.filter((a) => a.health === "AT_RISK").length;
  const critical = accounts.filter((a) => a.health === "CRITICAL").length;
  const totalARR = accounts.reduce((s, a) => s + a.arr, 0);

  function fmt(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  }

  const cards = [
    { label: "Total ARR",   value: fmt(totalARR),  sub: `${total} account${total !== 1 ? "s" : ""}`, icon: DollarSign,  iconBg: "#0755E9" },
    { label: "Healthy",     value: healthy,         sub: healthy > 0 ? `${Math.round((healthy / Math.max(total, 1)) * 100)}% of portfolio` : "-", icon: CheckCircle2, iconBg: "#22C55E" },
    { label: "At Risk",     value: atRisk,          sub: atRisk > 0 ? `${fmt(accounts.filter((a) => a.health === "AT_RISK").reduce((s, a) => s + a.arr, 0))} ARR` : "-", icon: AlertTriangle, iconBg: "#F59E0B" },
    { label: "Critical",    value: critical,        sub: critical > 0 ? `${fmt(accounts.filter((a) => a.health === "CRITICAL").reduce((s, a) => s + a.arr, 0))} at risk` : "-", icon: XCircle, iconBg: "#EF4444" },
    { label: "Open Actions",value: openActions,     sub: openActions === 1 ? "1 task pending" : `${openActions} tasks pending`, icon: ClipboardList, iconBg: "#7C3AED" },
  ];

  return (
    <>
      {cards.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-4 flex flex-col gap-1.5"
          >
            <p className="text-[11px] font-medium text-[var(--text-muted)] leading-tight">{s.label}</p>
            <div className="flex items-end justify-between gap-1">
              <p className="text-[28px] font-bold text-[var(--text-primary)] leading-none tabular-nums">{s.value}</p>
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mb-0.5"
                style={{ background: `${s.iconBg}20` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: s.iconBg }} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{s.sub}</p>
          </div>
        );
      })}
    </>
  );
}
