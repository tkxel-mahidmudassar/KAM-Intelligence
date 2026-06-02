"use client";

import { useEffect, useState } from "react";
import { Brain, Zap, TrendingUp, AlertTriangle, Lightbulb, RefreshCw, ChevronRight, Sparkles, Clock } from "lucide-react";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Insight {
  id: string;
  type: string;
  title: string;
  summary: string;
  confidence: number;
  isDismissed: boolean;
  generatedAt: string;
  account: {
    id: string;
    name: string;
    health: string;
    arr: number;
  } | null;
}

interface Signal {
  id: string;
  type: string;
  title: string;
  severity: string;
  detectedAt: string;
  account: {
    id: string;
    name: string;
    health: string;
  } | null;
}

interface NotificationData {
  signals: Signal[];
  insights: Insight[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INSIGHT_TYPE_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  label: string;
}> = {
  RISK:           { icon: AlertTriangle, color: "#EF4444", bgColor: "#EF444418", label: "Risk"           },
  OPPORTUNITY:    { icon: TrendingUp,   color: "#22C55E", bgColor: "#22C55E18", label: "Opportunity"    },
  RECOMMENDATION: { icon: Lightbulb,   color: "#0755E9", bgColor: "#0755E918", label: "Recommendation" },
  TREND:          { icon: Zap,          color: "#F59E0B", bgColor: "#F59E0B18", label: "Trend"          },
  ANOMALY:        { icon: Brain,        color: "#8B5CF6", bgColor: "#8B5CF618", label: "Anomaly"        },
};

const SIGNAL_SEVERITY_CONFIG: Record<string, { color: string; variant: "critical" | "at-risk" | "neutral" }> = {
  CRITICAL: { color: "#EF4444", variant: "critical" },
  HIGH:     { color: "#F59E0B", variant: "at-risk"  },
  MEDIUM:   { color: "#6B7280", variant: "neutral"  },
};

const HEALTH_VARIANT: Record<string, "healthy" | "at-risk" | "critical"> = {
  HEALTHY: "healthy", AT_RISK: "at-risk", CRITICAL: "critical",
};

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: Insight }) {
  const cfg = INSIGHT_TYPE_CONFIG[insight.type] ?? INSIGHT_TYPE_CONFIG.RECOMMENDATION;
  const Icon = cfg.icon;
  const healthVariant = insight.account ? (HEALTH_VARIANT[insight.account.health] ?? "neutral") : ("neutral" as const);

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-4 hover:border-[var(--border-default)] transition-all">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5"
          style={{ background: cfg.bgColor }}
        >
          <Icon className="h-4 w-4" style={{ color: cfg.color }} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">{insight.title}</p>
            <span className="text-[10px] text-[var(--text-disabled)] shrink-0 flex items-center gap-0.5 mt-0.5">
              <Clock className="h-3 w-3" /> {timeAgo(insight.generatedAt)}
            </span>
          </div>
          <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mb-3">{insight.summary}</p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="neutral" style={{ color: cfg.color, borderColor: cfg.color + "40", background: cfg.bgColor }}>
                {cfg.label}
              </Badge>
              {insight.account && (
                <>
                  <Link href={`/accounts/${insight.account.id}`}>
                    <Badge variant={healthVariant} className="hover:opacity-80 transition-opacity cursor-pointer">
                      {insight.account.name}
                    </Badge>
                  </Link>
                  <span className="text-[11px] text-[var(--text-disabled)]">{formatARR(insight.account.arr)} ARR</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-disabled)]">
              <Sparkles className="h-3 w-3" />
              <span>{Math.round((insight.confidence ?? 0) * 100)}% confidence</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: Signal }) {
  const cfg = SIGNAL_SEVERITY_CONFIG[signal.severity] ?? SIGNAL_SEVERITY_CONFIG.MEDIUM;
  const healthVariant = signal.account ? (HEALTH_VARIANT[signal.account.health] ?? "neutral") : ("neutral" as const);

  return (
    <div className={cn(
      "rounded-xl border p-4 hover:border-[var(--border-default)] transition-all",
      "bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)]",
      signal.severity === "CRITICAL"
        ? "border-l-4 border-l-[#EF4444] border-[var(--glass-border)]"
        : signal.severity === "HIGH"
        ? "border-l-4 border-l-[#F59E0B] border-[var(--glass-border)]"
        : "border-[var(--glass-border)]"
    )}>
      <div className="flex items-start gap-3">
        <Zap className="h-4 w-4 mt-0.5 shrink-0" style={{ color: cfg.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">{signal.title}</p>
            <span className="text-[10px] text-[var(--text-disabled)] shrink-0">{timeAgo(signal.detectedAt)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={cfg.variant}>{signal.severity.charAt(0) + signal.severity.slice(1).toLowerCase()}</Badge>
            {signal.account && (
              <Link href={`/accounts/${signal.account.id}`}>
                <Badge variant={healthVariant} className="hover:opacity-80 cursor-pointer">{signal.account.name}</Badge>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ insights, signals }: { insights: Insight[]; signals: Signal[] }) {
  const risks         = insights.filter((i) => i.type === "RISK").length;
  const opportunities = insights.filter((i) => i.type === "OPPORTUNITY").length;
  const criticalSigs  = signals.filter((s) => s.severity === "CRITICAL").length;
  const avgConf       = insights.length > 0
    ? Math.round(insights.reduce((s, i) => s + i.confidence, 0) / insights.length * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "AI Insights",   value: insights.length, icon: Brain,         color: "#0755E9" },
        { label: "Risks",         value: risks,            icon: AlertTriangle, color: "#EF4444" },
        { label: "Opps",          value: opportunities,    icon: TrendingUp,    color: "#22C55E" },
        { label: "Crit. Signals", value: criticalSigs,     icon: Zap,           color: "#F59E0B" },
      ].map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 flex flex-col gap-1.5"
        >
          <p className="text-[11px] font-medium text-[var(--text-muted)] leading-tight" style={{ wordBreak: "break-word" }}>{label}</p>
          <div className="flex items-end justify-between gap-1">
            <p className="text-[28px] font-bold text-[var(--text-primary)] tabular-nums leading-none">{value}</p>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mb-0.5" style={{ background: `${color}18` }}>
              <Icon className="h-3.5 w-3.5" style={{ color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiPulsePage() {
  const { role } = useRole();
  const [data, setData]       = useState<NotificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"insights" | "signals">("insights");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/notifications?allInsights=true", { headers: { "x-role": role } });
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateInsight = async () => {
    setLoading(true);
    try {
      // Generate a new portfolio-wide AI insight via Gemini
      await fetch("/api/ai/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({}),
      });
      // Refresh display after generating
      await fetchData();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [role]);

  const insights = data?.insights ?? [];
  const signals  = data?.signals  ?? [];

  const insightTypes = ["ALL", "RISK", "OPPORTUNITY", "RECOMMENDATION", "TREND", "ANOMALY"];
  const filteredInsights = typeFilter === "ALL"
    ? insights
    : insights.filter((i) => i.type === typeFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">
            AI Pulse
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Portfolio-wide AI insights and risk signals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={generateInsight}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-white transition-all disabled:opacity-50"
            style={{ background: loading ? "#0755E988" : "#0755E9" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate AI Insight
          </button>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-[76px]" />)}
        </div>
      ) : (
        <StatsBar insights={insights} signals={signals} />
      )}

      {/* Tab toggle */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => setTab("insights")}
          className={cn(
            "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all",
            tab === "insights"
              ? "text-[#0755E9] border-[#0755E9]"
              : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]"
          )}
        >
          AI Insights
          <span className="ml-1.5 text-[10px] bg-[#0755E9]/12 text-[#0755E9] rounded-full px-1.5 py-px font-semibold">
            {insights.length}
          </span>
        </button>
        <button
          onClick={() => setTab("signals")}
          className={cn(
            "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all",
            tab === "signals"
              ? "text-[#0755E9] border-[#0755E9]"
              : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]"
          )}
        >
          Signals
          <span className="ml-1.5 text-[10px] bg-[#EF4444]/12 text-[#EF4444] rounded-full px-1.5 py-px font-semibold">
            {signals.length}
          </span>
        </button>
      </div>

      {/* Insight type filter */}
      {tab === "insights" && !loading && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {insightTypes.map((t) => {
            const count = t === "ALL" ? insights.length : insights.filter((i) => i.type === t).length;
            const cfg   = INSIGHT_TYPE_CONFIG[t];
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border",
                  typeFilter === t
                    ? "text-white border-transparent"
                    : "bg-transparent text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                )}
                style={typeFilter === t ? { background: cfg?.color ?? "#0755E9" } : {}}
              >
                {t === "ALL" ? `All (${count})` : `${t.charAt(0) + t.slice(1).toLowerCase()} (${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} className="h-[110px]" />)}
        </div>
      ) : tab === "insights" ? (
        filteredInsights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Brain className="h-12 w-12 text-[var(--text-disabled)] mb-3" />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">No insights yet</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">AI insights will appear as accounts are analysed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )
      ) : (
        signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Zap className="h-12 w-12 text-[var(--text-disabled)] mb-3" />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">No active signals</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">All signals across your portfolio will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
