"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lightbulb, BookOpen, Brain, ChevronDown, ChevronUp,
  Zap, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recommendation {
  id: string;
  title: string;
  summary: string;
  recommendedAction: string | null;
  sourceType: "PLAYBOOK" | "AI_FALLBACK";
  priority: number;
  dueDate: string | null;
  confidence: number | null;
  status: string;
  playbookRule?: {
    id?: string;
    category: string;
    sourcePage?: number | null;
    sourceSection?: string | null;
    sourceSheet?: string | null;
    playbook?: { title: string };
  } | null;
}

type DismissReason = "IRRELEVANT" | "ALREADY_DONE" | "WRONG_TIMING" | "OTHER";

const DISMISS_REASONS: { value: DismissReason; label: string; description: string }[] = [
  { value: "IRRELEVANT",   label: "Irrelevant",    description: "Doesn't apply to this account" },
  { value: "ALREADY_DONE", label: "Already Done",  description: "This has already been actioned" },
  { value: "WRONG_TIMING", label: "Wrong Timing",  description: "Right idea, wrong time" },
  { value: "OTHER",        label: "Other",         description: "Another reason" },
];

const PRIORITY_META = {
  1: { label: "High",   color: "#EF4444" },
  2: { label: "Medium", color: "#F59E0B" },
  3: { label: "Low",    color: "#22C55E" },
};

// ─── Citation pill ────────────────────────────────────────────────────────────

function CitationPill({ rec }: { rec: Recommendation }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (rec.sourceType === "PLAYBOOK" && rec.playbookRule?.playbook) {
    const { playbook, sourcePage, sourceSection, sourceSheet } = rec.playbookRule;
    const shortLabel = [
      playbook.title.slice(0, 20) + (playbook.title.length > 20 ? "..." : ""),
      sourcePage ? `p.${sourcePage}` : null,
    ].filter(Boolean).join(" - ");

    const fullDetail = [
      playbook.title,
      sourcePage ? `Page ${sourcePage}` : null,
      sourceSection ? `Section: ${sourceSection}` : null,
      sourceSheet ? `Sheet: ${sourceSheet}` : null,
    ].filter(Boolean).join(" | ");

    return (
      <div className="relative inline-block">
        <span
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-[#0755E9]/30 text-[#0755E9] cursor-default"
          style={{ background: "rgba(7,85,233,0.08)" }}
        >
          <BookOpen className="h-2.5 w-2.5" />
          {shortLabel}
        </span>
        {showTooltip && (
          <div className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-lg px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)] mb-0.5">Playbook-guided</p>
            <p>{fullDetail}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-[#6B7280]/30 text-[var(--text-muted)]"
      style={{ background: "rgba(107,114,128,0.08)" }}
    >
      <Brain className="h-2.5 w-2.5" />
      AI fallback
    </span>
  );
}

// ─── Individual recommendation card ──────────────────────────────────────────

function RecCard({
  rec,
  accountId,
  role,
  onUpdate,
}: {
  rec: Recommendation;
  accountId: string;
  role: string;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissing, setDismissing] = useState(false);  // showing reason picker
  const [selectedReason, setSelectedReason] = useState<DismissReason | null>(null);
  const [loading, setLoading] = useState<"actioning" | "dismissing" | "suppressing" | null>(null);
  const [suppressionEligible, setSuppressionEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [actioned, setActioned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = { "Content-Type": "application/json", "x-role": role };

  const handleAction = async () => {
    setLoading("actioning");
    setError(null);
    try {
      const res = await fetch("/api/feedback/recommendation", {
        method: "POST",
        headers,
        body: JSON.stringify({ recommendationId: rec.id, feedbackType: "ACTIONED" }),
      });
      if (!res.ok) throw new Error("Failed to mark as done");
      setActioned(true);
      setTimeout(onUpdate, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  };

  const handleDismissConfirm = async () => {
    if (!selectedReason) return;
    setLoading("dismissing");
    setError(null);
    try {
      const res = await fetch("/api/feedback/recommendation", {
        method: "POST",
        headers,
        body: JSON.stringify({
          recommendationId: rec.id,
          feedbackType: "DISMISSED",
          dismissReason: selectedReason,
        }),
      });
      if (!res.ok) throw new Error("Failed to dismiss");
      const json = await res.json();
      setDismissed(true);
      setSuppressionEligible(json.data?.suppressionEligible === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  };

  const handleSuppressRule = async () => {
    if (!rec.playbookRule?.id) return;
    setLoading("suppressing");
    try {
      await fetch(`/api/accounts/${accountId}/rule-suppressions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          playbookRuleId: rec.playbookRule.id,
          reason: "KAM requested: dismissed 2+ times",
        }),
      });
      setTimeout(onUpdate, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  };

  const pMeta = PRIORITY_META[rec.priority as 1 | 2 | 3] ?? PRIORITY_META[2];

  if (actioned) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/05 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-[#22C55E] shrink-0" />
        <p className="text-[12px] text-[#22C55E] font-medium">Marked as done — great work!</p>
      </div>
    );
  }

  if (dismissed && !suppressionEligible) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2.5 opacity-60">
        <XCircle className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        <p className="text-[12px] text-[var(--text-muted)]">Dismissed</p>
      </div>
    );
  }

  if (dismissed && suppressionEligible) {
    return (
      <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/05 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#F59E0B] shrink-0" />
          <p className="text-[12px] text-[var(--text-primary)] font-medium">
            You&apos;ve dismissed this rule twice for this account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSuppressRule}
            disabled={loading === "suppressing"}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-[#EF4444] hover:underline disabled:opacity-50"
          >
            {loading === "suppressing" && <Loader2 className="h-3 w-3 animate-spin" />}
            Don&apos;t show this rule for this account
          </button>
          <span className="text-[var(--text-muted)]">·</span>
          <button
            onClick={onUpdate}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Keep showing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => { if (!dismissing) setExpanded((e) => !e); }}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-[var(--bg-surface-2)] transition-colors"
      >
        <div className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ background: pMeta.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-tight">{rec.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <CitationPill rec={rec} />
            {rec.dueDate && (
              <span className="text-[10px] text-[var(--text-muted)]">
                Due {new Date(rec.dueDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
          : <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
        }
      </button>

      {/* Expanded body */}
      {expanded && !dismissing && (
        <div className="px-4 pb-3 border-t border-[var(--border-subtle)] pt-3 space-y-3">
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{rec.summary}</p>
          {rec.recommendedAction && rec.recommendedAction !== rec.summary && (
            <div className="rounded-lg border border-[#0755E9]/15 p-2.5" style={{ background: "rgba(7,85,233,0.05)" }}>
              <p className="text-[11px] font-semibold text-[#0755E9] mb-1 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Recommended Action
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">{rec.recommendedAction}</p>
            </div>
          )}
          {error && <p className="text-[11px] text-[#EF4444]">{error}</p>}
          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAction}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] transition-colors disabled:opacity-50"
            >
              {loading === "actioning" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Mark Done
            </button>
            <button
              onClick={() => { setDismissing(true); setSelectedReason(null); }}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)] hover:border-[#EF4444]/50 hover:text-[#EF4444] transition-colors disabled:opacity-50"
            >
              <XCircle className="h-3 w-3" /> Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Inline dismiss reason picker */}
      {expanded && dismissing && (
        <div className="px-4 pb-3 border-t border-[var(--border-subtle)] pt-3 space-y-3">
          <p className="text-[12px] font-semibold text-[var(--text-primary)]">Why are you dismissing this?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DISMISS_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedReason(r.value)}
                className={cn(
                  "text-left rounded-lg border px-2.5 py-2 transition-all",
                  selectedReason === r.value
                    ? "border-[#EF4444]/60 bg-[#EF4444]/08 text-[#EF4444]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]",
                )}
                style={selectedReason === r.value ? { background: "rgba(239,68,68,0.08)" } : undefined}
              >
                <p className="text-[11px] font-semibold">{r.label}</p>
                <p className="text-[10px] opacity-70 mt-0.5">{r.description}</p>
              </button>
            ))}
          </div>
          {error && <p className="text-[11px] text-[#EF4444]">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismissConfirm}
              disabled={!selectedReason || loading === "dismissing"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] transition-colors disabled:opacity-40"
            >
              {loading === "dismissing" && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirm Dismiss
            </button>
            <button
              onClick={() => { setDismissing(false); setSelectedReason(null); }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function RecommendationsPanel({ accountId }: { accountId: string }) {
  const { role } = useRole();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchRecs = useCallback(() => {
    setLoading(true);
    fetch(`/api/recommendations?accountId=${accountId}&status=ACTIVE`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setRecommendations(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accountId, role]);

  useEffect(() => { fetchRecs(); }, [fetchRecs]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch("/api/ai/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ trigger: "pulse_refresh", context: { accountId } }),
      });
      fetchRecs();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-[#F59E0B]" />
          <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            Recommendations
          </h3>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#0755E9]/10 text-[#0755E9] hover:bg-[#0755E9]/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} />
          {generating ? "Generating..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-[var(--bg-surface-2)] animate-pulse" />
          ))}
        </div>
      ) : recommendations.length === 0 ? (
        <div className="text-center py-6">
          <Lightbulb className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-[12px] text-[var(--text-muted)]">No active recommendations.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-2 text-[11px] text-[#0755E9] hover:underline disabled:opacity-50"
          >
            Generate now
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {recommendations.map((rec) => (
            <RecCard
              key={rec.id}
              rec={rec}
              accountId={accountId}
              role={role}
              onUpdate={fetchRecs}
            />
          ))}
        </div>
      )}
    </div>
  );
}
