"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Bell, Zap, AlertTriangle, Info, TrendingUp, Lightbulb, RefreshCw, CheckCheck, Trash2, Clock, TrendingUp as OppIcon, Calendar } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

/* ─── Types ─────────────────────────────────────────────── */

interface AccountRef {
  id: string;
  name: string;
  health: string;
}

interface Signal {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description?: string;
  detectedAt: string;
  isRead: boolean;
  account: AccountRef;
}

interface Insight {
  id: string;
  type: string;
  title: string;
  summary: string;
  generatedAt: string;
  isRead: boolean;
  account: AccountRef & { arr: number };
}

/* ─── Helpers ────────────────────────────────────────────── */

const SEVERITY_CONFIG: Record<Signal["severity"], { color: string; bg: string; icon: React.ElementType; label: string }> = {
  CRITICAL: { color: "#EF4444", bg: "#EF444415", icon: AlertTriangle, label: "Critical" },
  WARNING:  { color: "#F59E0B", bg: "#F59E0B15", icon: AlertTriangle, label: "Warning"  },
  INFO:     { color: "#3B82F6", bg: "#3B82F615", icon: Info,          label: "Info"     },
};

const INSIGHT_TYPE_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  RISK:           { color: "#EF4444", bg: "#EF444415", icon: AlertTriangle },
  OPPORTUNITY:    { color: "#22C55E", bg: "#22C55E15", icon: TrendingUp    },
  TREND:          { color: "#3B82F6", bg: "#3B82F615", icon: TrendingUp    },
  ANOMALY:        { color: "#F59E0B", bg: "#F59E0B15", icon: Zap           },
  RECOMMENDATION: { color: "#8B5CF6", bg: "#8B5CF615", icon: Lightbulb    },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const HEALTH_DOT: Record<string, string> = {
  HEALTHY:  "#22C55E",
  AT_RISK:  "#F59E0B",
  CRITICAL: "#EF4444",
  CHURNED:  "#6B7280",
};

/* ─── Sub-components ─────────────────────────────────────── */

function SignalItem({ signal, onClick }: { signal: Signal; onClick: () => void }) {
  const cfg = SEVERITY_CONFIG[signal.severity] ?? SEVERITY_CONFIG.INFO;
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 transition-colors",
        "hover:bg-[var(--bg-surface-2)]",
        !signal.isRead && "border-l-2 border-[var(--border-subtle)]"
      )}
      style={!signal.isRead ? { borderLeftColor: cfg.color } : undefined}
    >
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: cfg.bg }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            {cfg.label}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: HEALTH_DOT[signal.account.health] ?? "#6B7280" }}
            />
            {signal.account.name}
          </span>
          {!signal.isRead && (
            <span className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-[#0755E9]" />
          )}
        </div>
        <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
          {signal.title}
        </p>
        {signal.description && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{signal.description}</p>
        )}
        <p className="text-[10px] text-[var(--text-disabled)] mt-1">{timeAgo(signal.detectedAt)}</p>
      </div>
    </button>
  );
}

function InsightItem({
  insight, onClick, onDismiss,
}: {
  insight: Insight;
  onClick: () => void;
  onDismiss: (e: React.MouseEvent) => void;
}) {
  const cfg = INSIGHT_TYPE_CONFIG[insight.type] ?? INSIGHT_TYPE_CONFIG.TREND;
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 transition-colors group/insight",
        "hover:bg-[var(--bg-surface-2)]",
        !insight.isRead && "border-l-2 border-[var(--border-subtle)]"
      )}
      style={!insight.isRead ? { borderLeftColor: cfg.color } : undefined}
    >
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: cfg.bg }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            {insight.type.charAt(0) + insight.type.slice(1).toLowerCase()}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: HEALTH_DOT[insight.account.health] ?? "#6B7280" }}
            />
            {insight.account.name}
          </span>
          {!insight.isRead && (
            <span className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-[#0755E9]" />
          )}
        </div>
        <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
          {insight.title}
        </p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-2">{insight.summary}</p>
        <p className="text-[10px] text-[var(--text-disabled)] mt-1">{timeAgo(insight.generatedAt)}</p>
      </div>

      {/* Dismiss button — hover-reveal */}
      <button
        onClick={onDismiss}
        className="shrink-0 mt-0.5 p-1 rounded text-[var(--text-disabled)] hover:text-[#EF4444] opacity-0 group-hover/insight:opacity-100 transition-all"
        title="Dismiss"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </button>
  );
}

function EmptyState({ tab }: { tab: "signals" | "insights" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-surface-2)]">
        <Bell className="h-5 w-5 text-[var(--text-muted)]" />
      </div>
      <div>
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">All clear</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
          {tab === "signals" ? "No active signals right now." : "No unread AI insights."}
        </p>
      </div>
    </div>
  );
}

/* ─── Main Drawer ────────────────────────────────────────── */

export interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

export function NotificationDrawer({ isOpen, onClose, onUnreadChange }: NotificationDrawerProps) {
  const router = useRouter();
  const { role } = useRole();

  type DrawerTab = "signals" | "pending" | "insights";
  const [tab, setTab] = useState<DrawerTab>("signals");
  const [signals,         setSignals]         = useState<Signal[]>([]);
  const [insights,        setInsights]        = useState<Insight[]>([]);
  const [pendingSignals,  setPendingSignals]  = useState<Signal[]>([]);
  const [pendingOpps,     setPendingOpps]     = useState<any[]>([]);
  const [pendingOverrides,setPendingOverrides]= useState<any[]>([]);
  const [upcomingQBRs,    setUpcomingQBRs]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const updateBadge = useCallback((sigs: Signal[], ins: Insight[], pSigs: any[], pOpps: any[], pOvr: any[]) => {
    const total = sigs.filter((s) => !s.isRead).length + ins.filter((i) => !i.isRead).length
      + pSigs.length + pOpps.length + pOvr.length;
    onUnreadChange?.(total);
  }, [onUnreadChange]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res  = await fetch("/api/notifications", { headers: { "x-role": role } });
      const json = await res.json();
      if (json.data) {
        const sigs  = json.data.pendingSignals?.filter((s: any) => !s.pendingReview) ?? json.data.signals ?? [];
        const ins   = json.data.unreadInsights ?? json.data.insights ?? [];
        const pSigs = json.data.pendingSignals?.filter((s: any) => s.pendingReview) ?? [];
        const pOpps = json.data.pendingOpps    ?? [];
        const pOvr  = json.data.pendingOverrides ?? [];
        const qbrs  = json.data.upcomingQBRs   ?? [];
        setSignals(sigs);
        setInsights(ins);
        setPendingSignals(pSigs);
        setPendingOpps(pOpps);
        setPendingOverrides(pOvr);
        setUpcomingQBRs(qbrs);
        updateBadge(sigs, ins, pSigs, pOpps, pOvr);
      }
    } catch {/* ignore */} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, updateBadge]);

  // Load when drawer opens
  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  /* ── Mark individual signal as read + navigate ─ */
  const handleSignalClick = async (signal: Signal) => {
    if (!signal.isRead) {
      // Optimistic update
      setSignals((prev) => {
        const updated = prev.map((s) => s.id === signal.id ? { ...s, isRead: true } : s);
        updateBadge(updated, insights, pendingSignals, pendingOpps, pendingOverrides);
        return updated;
      });
      fetch(`/api/signals/${signal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ isRead: true }),
      }).catch(() => {});
    }
    onClose();
    router.push(`/accounts/${signal.account.id}`);
  };

  /* ── Mark individual insight as read + navigate ─ */
  const handleInsightClick = async (insight: Insight) => {
    if (!insight.isRead) {
      setInsights((prev) => {
        const updated = prev.map((i) => i.id === insight.id ? { ...i, isRead: true } : i);
        updateBadge(signals, updated, pendingSignals, pendingOpps, pendingOverrides);
        return updated;
      });
      fetch(`/api/ai/pulse/${insight.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ isRead: true }),
      }).catch(() => {});
    }
    onClose();
    router.push(`/accounts/${insight.account.id}`);
  };

  /* ── Dismiss an insight ─ */
  const handleDismissInsight = async (insightId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInsights((prev) => {
      const updated = prev.filter((i) => i.id !== insightId);
      updateBadge(signals, updated, pendingSignals, pendingOpps, pendingOverrides);
      return updated;
    });
    fetch(`/api/ai/pulse/${insightId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ isDismissed: true }),
    }).catch(() => {});
  };

  /* ── Mark all as read ─ */
  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "x-role": role },
      });
      setSignals((prev) => prev.map((s) => ({ ...s, isRead: true })));
      setInsights((prev) => prev.map((i) => ({ ...i, isRead: true })));
      onUnreadChange?.(0);
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadSignals  = signals.filter((s) => !s.isRead).length;
  const unreadInsights = insights.filter((i) => !i.isRead).length;
  const pendingCount   = pendingSignals.length + pendingOpps.length + pendingOverrides.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col transition-transform duration-200 ease-out",
        )}
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          borderLeft: "1px solid var(--border-subtle)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          boxShadow: isOpen ? "-4px 0 32px rgba(0,0,0,0.12)" : "none",
        }}
      >
        {/* Header */}
        <div
          className="flex h-14 shrink-0 items-center justify-between px-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0755E9]/10">
              <Bell className="h-4 w-4 text-[#0755E9]" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Notifications</p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {unreadSignals + unreadInsights > 0
                  ? `${unreadSignals + unreadInsights} unread`
                  : "All caught up"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {(unreadSignals + unreadInsights) > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] hover:text-[#22C55E] transition-colors disabled:opacity-40"
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? "…" : "All read"}
              </button>
            )}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab strip */}
        <div
          className="flex shrink-0 gap-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {([
            { key: "signals",  label: "Signals",  count: unreadSignals,  color: "#EF4444" },
            { key: "pending",  label: "Pending",  count: pendingCount,   color: "#F59E0B" },
            { key: "insights", label: "Insights", count: unreadInsights, color: "#0755E9" },
          ] as const).map(({ key, label, count, color }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2.5",
                  "text-[12px] font-medium transition-all duration-150",
                  "border-b-2 -mb-px",
                  active
                    ? "text-[#0755E9] border-[#0755E9]"
                    : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]"
                )}
              >
                {label}
                {count > 0 && (
                  <span
                    className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse">
                  <div className="h-7 w-7 rounded-lg bg-[var(--bg-surface-2)] shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 rounded bg-[var(--bg-surface-2)]" />
                    <div className="h-4 w-5/6 rounded bg-[var(--bg-surface-2)]" />
                    <div className="h-3 w-2/3 rounded bg-[var(--bg-surface-2)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "signals" ? (
            signals.length === 0 ? (
              <EmptyState tab="signals" />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {signals.map((s) => (
                  <SignalItem key={s.id} signal={s} onClick={() => handleSignalClick(s)} />
                ))}
              </div>
            )
          ) : tab === "pending" ? (
            pendingCount === 0 && upcomingQBRs.length === 0 ? (
              <EmptyState tab="signals" />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {pendingSignals.map((s: any) => (
                  <button key={s.id} onClick={() => { onClose(); router.push(`/accounts/${s.account?.id}`); }}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-surface-2)]">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F59E0B]/15">
                      <Clock className="h-3.5 w-3.5 text-[#F59E0B]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-[#F59E0B] mb-0.5">Signal - Needs Review</p>
                      <p className="text-[13px] font-medium text-[var(--text-primary)] line-clamp-2">{s.title}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{s.account?.name}</p>
                    </div>
                  </button>
                ))}
                {pendingOpps.map((o: any) => (
                  <button key={o.id} onClick={() => { onClose(); router.push(`/accounts/${o.account?.id}`); }}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-surface-2)]">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#A855F7]/15">
                      <OppIcon className="h-3.5 w-3.5 text-[#A855F7]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-[#A855F7] mb-0.5">AI Opportunity - Review</p>
                      <p className="text-[13px] font-medium text-[var(--text-primary)] line-clamp-2">{o.serviceLine}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{o.account?.name}</p>
                    </div>
                  </button>
                ))}
                {pendingOverrides.map((o: any) => (
                  <button key={o.id} onClick={() => { onClose(); router.push(`/accounts/${o.account?.id}`); }}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-surface-2)]">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0755E9]/15">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#0755E9]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-[#0755E9] mb-0.5">Score Override Request</p>
                      <p className="text-[13px] font-medium text-[var(--text-primary)] line-clamp-2">{o.account?.name} - {o.kpiKey}</p>
                    </div>
                  </button>
                ))}
                {upcomingQBRs.map((q: any) => (
                  <button key={q.id} onClick={() => { onClose(); router.push(`/accounts/${q.account?.id}`); }}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-surface-2)]">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#22C55E]/15">
                      <Calendar className="h-3.5 w-3.5 text-[#22C55E]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-[#22C55E] mb-0.5">Upcoming QBR</p>
                      <p className="text-[13px] font-medium text-[var(--text-primary)] line-clamp-2">{q.title}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{q.account?.name} - {q.scheduledAt ? new Date(q.scheduledAt).toLocaleDateString() : ""}</p>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            insights.length === 0 ? (
              <EmptyState tab="insights" />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {insights.map((i) => (
                  <InsightItem
                    key={i.id}
                    insight={i}
                    onClick={() => handleInsightClick(i)}
                    onDismiss={(e) => handleDismissInsight(i.id, e)}
                  />
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {!loading && (signals.length > 0 || insights.length > 0) && (
          <div
            className="shrink-0 px-4 py-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p className="text-center text-[11px] text-[var(--text-muted)]">
              Click any item to view account details
            </p>
          </div>
        )}
      </div>
    </>
  );
}
