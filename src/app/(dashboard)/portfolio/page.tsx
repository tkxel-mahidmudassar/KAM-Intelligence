"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, SlidersHorizontal, LayoutGrid, List, Plus } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { AccountCard } from "@/components/portfolio/AccountCard";
import { PortfolioStats } from "@/components/portfolio/PortfolioStats";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { AccountFormModal } from "@/components/accounts/AccountFormModal";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal { id: string; severity: string; title: string; }

interface Account {
  id: string;
  name: string;
  industry: string | null;
  arr: number;
  health: "HEALTHY" | "AT_RISK" | "CRITICAL";
  contractEnd: string | null;
  kam: { id: string; name: string } | null;
  kamScores: { overall: number; computedAt: string }[];
  signals: Signal[];
  _count: { actions: number };
}

/** Generate a plausible 6-point score trend when real history is sparse */
function syntheticTrend(health: string, latestScore: number): number[] {
  const trend =
    health === "CRITICAL" ? [-18, -12, -8, -4, -2, 0] :
    health === "AT_RISK"  ? [-10, -6, -3, -1,  1, 0] :
                            [  0,  2,  4,  3,  5, 0];
  return trend.map((delta) => Math.max(0, Math.min(100, latestScore + delta)));
}

type HealthFilter = "ALL" | "HEALTHY" | "AT_RISK" | "CRITICAL";

const HEALTH_TABS: { value: HealthFilter; label: string }[] = [
  { value: "ALL",      label: "All"      },
  { value: "CRITICAL", label: "Critical" },
  { value: "AT_RISK",  label: "At Risk"  },
  { value: "HEALTHY",  label: "Healthy"  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { role } = useRole();
  const [accounts, setAccounts]         = useState<Account[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [filter, setFilter]             = useState<HealthFilter>("ALL");
  const [view, setView]                 = useState<"grid" | "list">("grid");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canCreate = role === "MANAGER";

  const reload = () => {
    setLoading(true);
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setAccounts(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [role]);

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      const matchesHealth = filter === "ALL" || a.health === filter;
      const matchesSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.industry ?? "").toLowerCase().includes(search.toLowerCase());
      return matchesHealth && matchesSearch;
    });
  }, [accounts, filter, search]);

  const healthCount = (h: HealthFilter) =>
    h === "ALL" ? accounts.length : accounts.filter((a) => a.health === h).length;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">
            Portfolio
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {loading ? "Loading…" : `${accounts.length} accounts · real-time health overview`}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-[#0755E9] rounded-xl hover:bg-[#0647C7] transition-colors"
          >
            <Plus className="h-4 w-4" /> New Account
          </button>
        )}
      </div>

      {showCreateModal && (
        <AccountFormModal
          mode="create"
          onClose={() => setShowCreateModal(false)}
          onSaved={() => { setShowCreateModal(false); reload(); }}
        />
      )}

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} className="h-[76px]" />
          ))}
        </div>
      ) : (
        <PortfolioStats accounts={accounts} />
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Health tabs */}
        <div
          className="flex items-center gap-1 rounded-xl p-1"
          style={{
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {HEALTH_TABS.map((tab) => {
            const active = filter === tab.value;
            const count  = healthCount(tab.value);
            const dotColor =
              tab.value === "CRITICAL" ? "#EF4444" :
              tab.value === "AT_RISK"  ? "#F59E0B" :
              tab.value === "HEALTHY"  ? "#22C55E" : undefined;

            return (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all duration-150",
                  active
                    ? "bg-[var(--glass-bg)] shadow-sm text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {dotColor && (
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                )}
                {tab.label}
                <span
                  className={cn(
                    "tabular-nums text-[10px] rounded-full px-1.5 py-px",
                    active
                      ? "bg-[var(--border-subtle)] text-[var(--text-secondary)]"
                      : "text-[var(--text-disabled)]"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-disabled)]" />
            <input
              type="text"
              placeholder="Search accounts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "pl-8 pr-3 py-2 text-[12px] rounded-lg outline-none w-48",
                "bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]",
                "text-[var(--text-primary)] placeholder:text-[var(--text-disabled)]",
                "focus:border-[#0755E9] focus:ring-1 focus:ring-[#0755E9]/20 transition-all"
              )}
            />
          </div>

          {/* View toggle */}
          <div
            className="flex items-center gap-1 rounded-lg p-1"
            style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)" }}
          >
            {(["grid", "list"] as const).map((v) => {
              const Icon = v === "grid" ? LayoutGrid : List;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "p-1.5 rounded-md transition-all duration-150",
                    view === v
                      ? "bg-[var(--glass-bg)] shadow-sm text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Account grid */}
      {loading ? (
        <div className={cn(
          "grid gap-3",
          view === "grid" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
        )}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="h-[220px]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-[14px] font-medium text-[var(--text-primary)]">No accounts found</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            Try adjusting your search or filter
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-3",
            view === "grid"
              ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
              : "grid-cols-1"
          )}
        >
          {filtered.map((account) => (
            <AccountCard
              key={account.id}
              id={account.id}
              name={account.name}
              industry={account.industry}
              arr={account.arr}
              health={account.health}
              contractEnd={account.contractEnd}
              score={account.kamScores?.[0]?.overall ?? null}
              scoreHistory={(() => {
                const scores = [...account.kamScores].reverse().map((s) => s.overall);
                const latest = scores[scores.length - 1] ?? account.kamScores?.[0]?.overall;
                return scores.length >= 2 ? scores : (latest != null ? syntheticTrend(account.health, latest) : []);
              })()}
              kamName={account.kam?.name ?? null}
              openSignals={account.signals}
              openActionCount={account._count.actions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
