"use client";

import { useEffect, useState } from "react";
import { Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Activity, DollarSign, Shield, XCircle, RefreshCw, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface ScoreOverride {
  id: string;
  kpiKey: string;
  previousValue: number;
  requestedValue: number;
  reason: string;
  status: string;
  createdAt: string;
  account?: { id: string; name: string; health: string };
}

const KPI_LABELS: Record<string, string> = {
  csat: "CSAT", relationship: "Relationship", risk: "Risk",
  contractHealth: "Contract Health", projectHealth: "Project Health",
  resourceHealth: "Resource Health", financial: "Financial", whitespace: "Whitespace",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  industry: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  healthUpdatedAt: string | null;
  kam: { id: string; name: string } | null;
  kamScores: { overall: number }[];
  signals: { id: string; severity: string }[];
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

const HEALTH_CONFIG = {
  HEALTHY:  { variant: "healthy"  as const, label: "Healthy",  color: "#22C55E" },
  AT_RISK:  { variant: "at-risk"  as const, label: "At Risk",  color: "#F59E0B" },
  CRITICAL: { variant: "critical" as const, label: "Critical", color: "#EF4444" },
};

// ─── KAM Summary ─────────────────────────────────────────────────────────────

function KAMCard({ name, accounts }: { name: string; accounts: Account[] }) {
  const totalARR = accounts.reduce((s, a) => s + a.arr, 0);
  const critical = accounts.filter((a) => a.health === "CRITICAL").length;
  const atRisk   = accounts.filter((a) => a.health === "AT_RISK").length;
  const avgScore = accounts.length > 0
    ? Math.round(accounts.reduce((s, a) => s + (a.kamScores[0]?.overall ?? 0), 0) / accounts.length)
    : 0;

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-9 w-9 rounded-full bg-[#0755E9] flex items-center justify-center shrink-0">
          <span className="text-[12px] font-bold text-white">
            {name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{name}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{accounts.length} accounts · {formatARR(totalARR)} ARR</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[11px] text-[var(--text-muted)]">Avg Score</p>
          <p className={cn(
            "text-[18px] font-bold tabular-nums",
            avgScore >= 70 ? "text-[#22C55E]" : avgScore >= 45 ? "text-[#F59E0B]" : "text-[#EF4444]"
          )}>
            {avgScore}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {critical > 0 && <Badge variant="critical">{critical} Critical</Badge>}
        {atRisk > 0  && <Badge variant="at-risk">{atRisk} At Risk</Badge>}
        {critical === 0 && atRisk === 0 && <Badge variant="healthy">All Healthy</Badge>}
      </div>
    </div>
  );
}

// ─── Account Table Row ────────────────────────────────────────────────────────

function AccountRow({ account }: { account: Account }) {
  const cfg  = HEALTH_CONFIG[account.health];
  const days = daysUntil(account.contractEnd);
  const score = account.kamScores[0]?.overall ?? null;
  const criticalSignals = account.signals.filter((s) => s.severity === "CRITICAL").length;

  return (
    <Link href={`/accounts/${account.id}`} className="block hover:bg-[var(--bg-surface-2)] transition-colors">
      <div className="grid grid-cols-[1fr_80px_80px_80px_80px_100px_60px] items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)] last:border-0">
        {/* Account name */}
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{account.name}</p>
          <p className="text-[11px] text-[var(--text-muted)] truncate">{account.industry ?? "—"}</p>
        </div>

        {/* Health */}
        <Badge variant={cfg.variant} className="justify-center">{cfg.label}</Badge>

        {/* ARR */}
        <p className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums text-right">{formatARR(account.arr)}</p>

        {/* Score */}
        <p className={cn(
          "text-[13px] font-bold tabular-nums text-center",
          score === null ? "text-[var(--text-disabled)]" :
          score >= 70 ? "text-[#22C55E]" : score >= 45 ? "text-[#F59E0B]" : "text-[#EF4444]"
        )}>
          {score ?? "—"}
        </p>

        {/* Renewal */}
        <p className={cn(
          "text-[11px] tabular-nums text-right",
          days === null ? "text-[var(--text-disabled)]" :
          days <= 0   ? "text-[#EF4444] font-semibold" :
          days <= 60  ? "text-[#EF4444] font-medium" :
          days <= 90  ? "text-[#F59E0B] font-medium" :
          "text-[var(--text-muted)]"
        )}>
          {days === null ? "—" : days <= 0 ? "Overdue" : `${days}d`}
        </p>

        {/* Signals */}
        <div className="flex items-center justify-center gap-1.5">
          {criticalSignals > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-[#EF4444] font-medium">
              <AlertTriangle className="h-3 w-3" /> {criticalSignals}
            </span>
          )}
          {account.signals.length > criticalSignals && (
            <span className="text-[11px] text-[var(--text-muted)]">
              +{account.signals.length - criticalSignals}
            </span>
          )}
          {account.signals.length === 0 && (
            <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E]" />
          )}
        </div>

        {/* Actions */}
        <p className="text-[12px] text-[var(--text-muted)] text-center tabular-nums">
          {account._count.actions}
        </p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerPage() {
  const { role } = useRole();
  const [accounts, setAccounts]             = useState<Account[]>([]);
  const [loading, setLoading]               = useState(true);
  const [pendingOverrides, setPendingOverrides] = useState<ScoreOverride[]>([]);
  const [declineTarget, setDeclineTarget]   = useState<string | null>(null);
  const [declineReason, setDeclineReason]   = useState("");
  const [refreshing, setRefreshing]         = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setAccounts(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/score-overrides?status=PENDING", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setPendingOverrides(res.data ?? []))
      .catch(() => {});
  }, [role]);

  const handleApprove = async (id: string) => {
    const res  = await fetch(`/api/score-overrides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ action: "APPROVE" }),
    });
    if (res.ok) setPendingOverrides((prev) => prev.filter((o) => o.id !== id));
  };

  const handleDecline = async (id: string) => {
    const res  = await fetch(`/api/score-overrides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ action: "DECLINE", declineReason }),
    });
    if (res.ok) {
      setPendingOverrides((prev) => prev.filter((o) => o.id !== id));
      setDeclineTarget(null);
      setDeclineReason("");
    }
  };

  const handleBulkRefresh = async () => {
    setRefreshing(true);
    const all = [...accounts];
    setRefreshProgress({ done: 0, total: all.length });
    for (let i = 0; i < all.length; i++) {
      try {
        await fetch("/api/ai/score", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-role": role },
          body: JSON.stringify({ accountId: all[i].id }),
        });
      } catch { /* continue even if one fails */ }
      setRefreshProgress({ done: i + 1, total: all.length });
    }
    // Reload accounts with fresh scores
    const res = await fetch("/api/accounts", { headers: { "x-role": role } });
    const json = await res.json();
    if (json.data) setAccounts(json.data);
    setRefreshing(false);
    setRefreshProgress(null);
  };

  // Accounts with renewals in ≤90 days
  const renewalAtRisk = accounts
    .filter((a) => {
      const d = daysUntil(a.contractEnd);
      return d !== null && d >= 0 && d <= 90;
    })
    .sort((a, b) => (daysUntil(a.contractEnd) ?? 999) - (daysUntil(b.contractEnd) ?? 999));

  const totalARR     = accounts.reduce((s, a) => s + a.arr, 0);
  const criticalARR  = accounts.filter((a) => a.health === "CRITICAL").reduce((s, a) => s + a.arr, 0);
  const atRiskARR    = accounts.filter((a) => a.health === "AT_RISK").reduce((s, a) => s + a.arr, 0);
  const criticalCount = accounts.filter((a) => a.health === "CRITICAL").length;
  const atRiskCount   = accounts.filter((a) => a.health === "AT_RISK").length;

  // Group by KAM
  const kamGroups = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    const kamName = a.kam?.name ?? "Unassigned";
    if (!acc[kamName]) acc[kamName] = [];
    acc[kamName].push(a);
    return acc;
  }, {});

  // Sort by risk: critical first, then at-risk, then healthy; within group by ARR desc
  const sortedAccounts = [...accounts].sort((a, b) => {
    const healthOrder = { CRITICAL: 0, AT_RISK: 1, HEALTHY: 2 };
    const hDiff = healthOrder[a.health] - healthOrder[b.health];
    return hDiff !== 0 ? hDiff : b.arr - a.arr;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">Command Centre</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Portfolio governance and KAM performance overview
          </p>
        </div>
        <button
          onClick={handleBulkRefresh}
          disabled={refreshing || loading}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all shrink-0",
            refreshing
              ? "bg-[var(--bg-surface-2)] text-[var(--text-muted)] border border-[var(--border-subtle)] cursor-not-allowed"
              : "bg-[#0755E9]/10 text-[#0755E9] border border-[#0755E9]/30 hover:bg-[#0755E9]/20"
          )}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          {refreshing && refreshProgress
            ? `Refreshing ${refreshProgress.done}/${refreshProgress.total}…`
            : "Refresh All Scores"}
        </button>
      </div>

      {/* Pending Score Overrides */}
      {pendingOverrides.length > 0 && (
        <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#F59E0B]" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              Pending Score Overrides
            </p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              {pendingOverrides.length} request{pendingOverrides.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2">
            {pendingOverrides.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] px-4 py-3 flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/accounts/${o.account?.id}`}
                      className="text-[13px] font-semibold text-[#0755E9] hover:underline truncate"
                    >
                      {o.account?.name ?? "Unknown"}
                    </Link>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {KPI_LABELS[o.kpiKey] ?? o.kpiKey}: {o.previousValue} → {o.requestedValue}
                    </span>
                  </div>
                  {declineTarget === o.id ? (
                    <div className="mt-2 flex gap-2 items-center">
                      <input
                        type="text"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Reason (optional)"
                        className="flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] px-2 py-1 text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#EF4444]/40"
                      />
                      <button
                        onClick={() => handleDecline(o.id)}
                        className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626]"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => { setDeclineTarget(null); setDeclineReason(""); }}
                        className="rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{o.reason}</p>
                  )}
                </div>
                {declineTarget !== o.id && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => handleApprove(o.id)}
                      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] transition-colors"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                    <button
                      onClick={() => setDeclineTarget(o.id)}
                      className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] transition-colors"
                    >
                      <XCircle className="h-3 w-3" /> Decline
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-[76px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total ARR",   value: formatARR(totalARR),    icon: DollarSign,   color: "#0755E9" },
            { label: "Accounts",    value: accounts.length,         icon: Users,        color: "#0755E9" },
            { label: "At Risk ARR", value: formatARR(atRiskARR + criticalARR), icon: AlertTriangle, color: "#F59E0B" },
            { label: "Critical",    value: criticalCount,           icon: Shield,       color: "#EF4444" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-[var(--text-muted)] leading-tight">{label}</p>
              <div className="flex items-end justify-between gap-1">
                <p className="text-[28px] font-bold text-[var(--text-primary)] tabular-nums leading-none">{value}</p>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mb-0.5" style={{ background: `${color}18` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Renewal at Risk */}
      {!loading && renewalAtRisk.length > 0 && (
        <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-4 w-4 text-[#F59E0B]" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Renewals in the Next 90 Days</p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              {renewalAtRisk.length} contract{renewalAtRisk.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {renewalAtRisk.map((a) => {
              const days = daysUntil(a.contractEnd)!;
              const urgent = days <= 30;
              return (
                <Link
                  key={a.id}
                  href={`/accounts/${a.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--glass-bg)] hover:border-[#F59E0B]/40 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{a.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{a.kam?.name ?? "Unassigned"} · {formatARR(a.arr)}</p>
                  </div>
                  <span className={cn(
                    "text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                    urgent
                      ? "text-[#EF4444] bg-[#EF4444]/12"
                      : "text-[#F59E0B] bg-[#F59E0B]/12"
                  )}>
                    {days === 0 ? "Today" : `${days}d`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* KAM breakdown */}
      {!loading && Object.keys(kamGroups).length > 0 && (
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">KAM Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(kamGroups).map(([name, accs]) => (
              <KAMCard key={name} name={name} accounts={accs} />
            ))}
          </div>
        </div>
      )}

      {/* Account table */}
      {loading ? (
        <SkeletonCard className="h-[300px]" />
      ) : (
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_80px_80px_80px_100px_60px] items-center gap-3 px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Account</p>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-center">Health</p>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">ARR</p>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-center">Score</p>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-right">Renewal</p>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-center">Signals</p>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-center">Actions</p>
          </div>
          {sortedAccounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
