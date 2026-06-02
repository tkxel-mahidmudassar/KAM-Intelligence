"use client";

import { useState } from "react";
import {
  Plus, Sparkles, TrendingUp, ChevronRight, ChevronDown,
  Trash2, DollarSign, Target, Zap, CheckCircle2, XCircle,
  Flame, ArrowUpDown, Clock, ThumbsUp, ThumbsDown, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { AgentTracePanel } from "@/components/ui/AgentTracePanel";
import { SourcesPanel } from "@/components/ui/SourcesPanel";
import type { AgentSource } from "@/lib/ai/agents/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Opportunity {
  id: string;
  accountId: string;
  serviceLine: string;
  description: string;
  estimatedValue: number | null;
  effort: string | null;
  probability: number | null;
  status: string;
  source: string;
  nextAction: string | null;
  pendingReview: boolean;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OpportunitiesTabProps {
  opportunities: Opportunity[];
  accountId: string;
  onCreate: (data: {
    serviceLine: string;
    description: string;
    estimatedValue: number | null;
    effort: string | null;
    probability: number | null;
    nextAction: string | null;
  }) => Promise<void>;
  onAdvance:    (id: string, newStatus: string) => Promise<void>;
  onEdit:       (id: string, patch: Partial<Opportunity>) => Promise<void>;
  onDelete:     (id: string) => Promise<void>;
  onAiGenerate: () => Promise<void>;
  onReview:     (id: string, action: "approve" | "decline", note?: string) => Promise<void>;
  agentSteps?:   import("@/components/ui/AgentTracePanel").AgentStep[];
  agentModel?:   string;
  agentLatency?: number;
  agentSources?: AgentSource[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_ORDER  = ["IDENTIFIED", "QUALIFYING", "PROPOSAL", "WON", "LOST"] as const;
type OppStatus = typeof STATUS_ORDER[number];

const STATUS_META: Record<OppStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  IDENTIFIED: { label: "Identified", color: "#6B7280", bg: "rgba(107,114,128,0.10)", icon: Target       },
  QUALIFYING: { label: "Qualifying", color: "#0755E9", bg: "rgba(7,85,233,0.10)",    icon: TrendingUp   },
  PROPOSAL:   { label: "Proposal",   color: "#A855F7", bg: "rgba(168,85,247,0.10)",  icon: Zap          },
  WON:        { label: "Won",        color: "#22C55E", bg: "rgba(34,197,94,0.10)",   icon: CheckCircle2 },
  LOST:       { label: "Lost",       color: "#EF4444", bg: "rgba(239,68,68,0.10)",   icon: XCircle      },
};

const EFFORT_META: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Low effort",    color: "#22C55E" },
  MEDIUM: { label: "Medium effort", color: "#F59E0B" },
  HIGH:   { label: "High effort",   color: "#EF4444" },
};

// Effort divisor for composite whitespace score
const EFFORT_FACTOR: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

type SortMode = "status" | "potential" | "value";

const ACTIVE_STATUSES: OppStatus[] = ["IDENTIFIED", "QUALIFYING", "PROPOSAL"];
const EFFORT_KEYS = ["LOW", "MEDIUM", "HIGH"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number | null) {
  if (v == null) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${v.toLocaleString()}`;
}

function nextStatus(current: OppStatus): OppStatus | null {
  if (current === "WON" || current === "LOST") return null;
  const i = ACTIVE_STATUSES.indexOf(current as typeof ACTIVE_STATUSES[number]);
  return i < ACTIVE_STATUSES.length - 1 ? ACTIVE_STATUSES[i + 1] : "WON";
}

/** Composite whitespace score: (estimatedValue × probability) ÷ effortFactor.
 *  Only meaningful for active opps — returns 0 if data is incomplete. */
function whitespaceScore(opp: Opportunity): number {
  const value  = opp.estimatedValue ?? 0;
  const prob   = opp.probability   ?? 0.5;
  const factor = EFFORT_FACTOR[opp.effort ?? "MEDIUM"] ?? 2;
  return (value * prob) / factor;
}

/** Determine if an opp is "high potential" — top 25% of active opps by composite score
 *  (min score threshold applied to avoid flagging trivial opps) */
function highPotentialIds(opps: Opportunity[]): Set<string> {
  const active = opps
    .filter((o) => ACTIVE_STATUSES.includes(o.status as OppStatus))
    .map((o) => ({ id: o.id, score: whitespaceScore(o) }))
    .filter((o) => o.score > 10_000) // min threshold: $10K adjusted
    .sort((a, b) => b.score - a.score);

  const topN = Math.max(1, Math.ceil(active.length * 0.25));
  return new Set(active.slice(0, topN).map((o) => o.id));
}

function sortOpps(opps: Opportunity[], mode: SortMode): Opportunity[] {
  const copy = [...opps];
  if (mode === "potential") {
    copy.sort((a, b) => whitespaceScore(b) - whitespaceScore(a));
  } else if (mode === "value") {
    copy.sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0));
  }
  // "status" keeps natural order (DB insertion order)
  return copy;
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateOpportunityForm({
  onSave, onCancel,
}: {
  onSave: (data: {
    serviceLine: string; description: string;
    estimatedValue: number | null; effort: string | null;
    probability: number | null; nextAction: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [serviceLine,     setServiceLine]     = useState("");
  const [description,     setDescription]     = useState("");
  const [estimatedValue,  setEstimatedValue]  = useState("");
  const [effort,          setEffort]          = useState("MEDIUM");
  const [probability,     setProbability]     = useState("50");
  const [nextAction,      setNextAction]      = useState("");
  const [saving,          setSaving]          = useState(false);

  const handleSave = async () => {
    if (!serviceLine.trim() || !description.trim()) return;
    setSaving(true);
    try {
      await onSave({
        serviceLine:   serviceLine.trim(),
        description:   description.trim(),
        estimatedValue: estimatedValue ? Number(estimatedValue.replace(/[,$]/g, "")) : null,
        effort:        effort || null,
        probability:   probability ? Number(probability) / 100 : null,
        nextAction:    nextAction.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#A855F7]/30 bg-[#A855F7]/5 p-4 space-y-3">
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">New Opportunity</p>

      <div className="flex gap-3">
        <input
          autoFocus
          type="text"
          placeholder="Service line (e.g. AI/ML Engineering)"
          value={serviceLine}
          onChange={(e) => setServiceLine(e.target.value)}
          className="flex-1 px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7]"
        />
        <input
          type="text"
          placeholder="Est. value (e.g. 50000)"
          value={estimatedValue}
          onChange={(e) => setEstimatedValue(e.target.value)}
          className="w-40 px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7]"
        />
      </div>

      <textarea
        placeholder="Describe the opportunity — what is needed, why now, what is the expected outcome?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7] resize-none"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="appearance-none pl-3 pr-7 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#A855F7]"
          >
            {EFFORT_KEYS.map((e) => <option key={e} value={e}>{EFFORT_META[e].label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">Probability:</span>
          <input
            type="number"
            min="0"
            max="100"
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            className="w-16 px-2 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#A855F7] text-center"
          />
          <span className="text-[11px] text-[var(--text-muted)]">%</span>
        </div>

        <input
          type="text"
          placeholder="Next action (optional)"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7]"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!serviceLine.trim() || !description.trim() || saving}
          className="px-4 py-1.5 text-[12px] font-medium text-white bg-[#A855F7] rounded-lg hover:bg-[#9333EA] disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Add Opportunity"}
        </button>
      </div>
    </div>
  );
}

// ─── Opportunity Edit Panel ───────────────────────────────────────────────────

function OpportunityEditPanel({
  opp, onSave, onCancel,
}: {
  opp: Opportunity;
  onSave: (id: string, patch: Partial<Opportunity>) => Promise<void>;
  onCancel: () => void;
}) {
  const [serviceLine,    setServiceLine]    = useState(opp.serviceLine);
  const [description,    setDescription]    = useState(opp.description);
  const [estimatedValue, setEstimatedValue] = useState(opp.estimatedValue != null ? String(opp.estimatedValue) : "");
  const [effort,         setEffort]         = useState(opp.effort ?? "MEDIUM");
  const [probability,    setProbability]    = useState(opp.probability != null ? String(Math.round(opp.probability * 100)) : "50");
  const [nextAction,     setNextAction]     = useState(opp.nextAction ?? "");
  const [saving,         setSaving]         = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(opp.id, {
        serviceLine:   serviceLine.trim(),
        description:   description.trim(),
        estimatedValue: estimatedValue ? Number(estimatedValue.replace(/[,$]/g, "")) : null,
        effort:        effort || null,
        probability:   probability ? Number(probability) / 100 : null,
        nextAction:    nextAction.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[var(--border-subtle)] pt-3 mt-1 space-y-3">
      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Edit Opportunity</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={serviceLine}
          onChange={(e) => setServiceLine(e.target.value)}
          placeholder="Service line"
          className="flex-1 px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7]"
        />
        <input
          type="text"
          value={estimatedValue}
          onChange={(e) => setEstimatedValue(e.target.value)}
          placeholder="Est. value"
          className="w-32 px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7]"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#A855F7] resize-none"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={effort}
          onChange={(e) => setEffort(e.target.value)}
          className="appearance-none pl-2.5 pr-6 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#A855F7]"
        >
          {EFFORT_KEYS.map((e) => <option key={e} value={e}>{EFFORT_META[e].label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[var(--text-muted)]">Prob.:</span>
          <input
            type="number" min="0" max="100"
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            className="w-14 px-2 py-1.5 text-[12px] text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#A855F7]"
          />
          <span className="text-[11px] text-[var(--text-muted)]">%</span>
        </div>
        <input
          type="text"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="Next action…"
          className="flex-1 min-w-[140px] px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#A855F7]"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!serviceLine.trim() || !description.trim() || saving}
          className="px-4 py-1.5 text-[12px] font-medium text-white bg-[#A855F7] rounded-lg hover:bg-[#9333EA] disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Opportunity Card ─────────────────────────────────────────────────────────

function OpportunityCard({
  opp, canEdit, isHighPotential, onAdvance, onDelete, onEdit,
}: {
  opp: Opportunity;
  canEdit: boolean;
  isHighPotential?: boolean;
  onAdvance: (id: string, newStatus: string) => Promise<void>;
  onDelete:  (id: string) => Promise<void>;
  onEdit:    (id: string, patch: Partial<Opportunity>) => Promise<void>;
}) {
  const [advancing,  setAdvancing]  = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [expanded,   setExpanded]   = useState(false);

  const statusMeta = STATUS_META[opp.status as OppStatus] ?? STATUS_META.IDENTIFIED;
  const StatusIcon = statusMeta.icon;
  const next       = nextStatus(opp.status as OppStatus);
  const isTerminal = opp.status === "WON" || opp.status === "LOST";
  const isAI       = opp.source === "AI";

  const probPct = opp.probability != null ? Math.round(opp.probability * 100) : null;
  const value   = formatCurrency(opp.estimatedValue);

  const handleAdvance = async (status: string) => {
    setAdvancing(true);
    try { await onAdvance(opp.id, status); } finally { setAdvancing(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(opp.id); } finally { setDeleting(false); }
  };

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-2.5 transition-all group",
      isTerminal
        ? "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] opacity-75"
        : expanded
        ? "border-[#A855F7]/40 bg-[var(--bg-surface-2)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] hover:border-[var(--border-default)] cursor-pointer"
    )}
    onClick={() => !expanded && canEdit && !isTerminal && setExpanded(true)}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {/* Status badge */}
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: statusMeta.color, background: statusMeta.bg }}
            >
              <StatusIcon className="h-3 w-3" /> {statusMeta.label}
            </span>
            {/* Service line */}
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              {opp.serviceLine}
            </span>
            {/* AI badge */}
            {isAI && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#A855F7] bg-[#A855F7]/10 px-1.5 py-0.5 rounded-full">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            )}
            {/* High Potential badge */}
            {isHighPotential && !isTerminal && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#F97316] bg-[#F97316]/12 px-1.5 py-0.5 rounded-full">
                <Flame className="h-2.5 w-2.5" /> High Potential
              </span>
            )}
          </div>
          <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{opp.description}</p>
        </div>

        {/* Delete (hover-reveal) + collapse */}
        <div className="flex shrink-0 items-center gap-1">
          {expanded && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-all"
              title="Collapse"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              disabled={deleting}
              className="p-1.5 rounded-lg text-[var(--text-disabled)] hover:text-[#EF4444] hover:bg-[#EF4444]/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 flex-wrap">
        {value && (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--text-primary)]">
            <DollarSign className="h-3.5 w-3.5 text-[#22C55E]" /> {value}
          </span>
        )}
        {probPct != null && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <Target className="h-3 w-3" /> {probPct}% probability
          </span>
        )}
        {opp.effort && (
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: EFFORT_META[opp.effort]?.color, background: `${EFFORT_META[opp.effort]?.color}18` }}
          >
            {EFFORT_META[opp.effort]?.label}
          </span>
        )}
        {canEdit && !isTerminal && !expanded && (
          <span className="ml-auto text-[10px] text-[var(--text-disabled)] italic opacity-0 group-hover:opacity-100 transition-opacity">
            Click to edit
          </span>
        )}
      </div>

      {/* Next action */}
      {opp.nextAction && !expanded && (
        <p className="text-[11px] text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-primary)]">Next: </span>{opp.nextAction}
        </p>
      )}

      {/* Inline edit panel */}
      {expanded && canEdit && (
        <OpportunityEditPanel
          opp={opp}
          onSave={async (id, patch) => {
            await onEdit(id, patch);
            setExpanded(false);
          }}
          onCancel={() => setExpanded(false)}
        />
      )}

      {/* Advance buttons (only when not editing) */}
      {canEdit && !isTerminal && !expanded && (
        <div className="flex items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
          {next && (
            <button
              onClick={() => handleAdvance(next)}
              disabled={advancing}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#A855F7] hover:text-[#A855F7] hover:bg-[#A855F7]/5 transition-all disabled:opacity-50"
            >
              {advancing ? "…" : <><ChevronRight className="h-3 w-3" /> {STATUS_META[next]?.label}</>}
            </button>
          )}
          <button
            onClick={() => handleAdvance("LOST")}
            disabled={advancing}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/5 transition-all disabled:opacity-50 ml-auto"
          >
            Mark Lost
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pending Review Card (extracted so hooks are called at component level) ───

function PendingReviewCard({
  opp, onReview, onEdit,
}: {
  opp: Opportunity;
  onReview: (id: string, action: "approve" | "decline", note?: string) => Promise<void>;
  onEdit:   (id: string, patch: Partial<Opportunity>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  const fmtValue = (v: number | null) => {
    if (v == null) return null;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
    return `$${v}`;
  };

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 space-y-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full text-[#A855F7] bg-[#A855F7]/12">
            AI Suggested
          </span>
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{opp.serviceLine}</span>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{opp.description}</p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {opp.estimatedValue != null && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--text-primary)]">
              <DollarSign className="h-3.5 w-3.5 text-[#22C55E]" /> {fmtValue(opp.estimatedValue)}
            </span>
          )}
          {opp.probability != null && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {Math.round(opp.probability * 100)}% probability
            </span>
          )}
          {opp.effort && (
            <span className="text-[11px] text-[var(--text-muted)]">{opp.effort} effort</span>
          )}
        </div>
        {opp.nextAction && (
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            <span className="font-medium text-[var(--text-primary)]">Next: </span>{opp.nextAction}
          </p>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onReview(opp.id, "approve")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-[#22C55E] rounded-lg hover:bg-[#16A34A] transition-colors"
          >
            <ThumbsUp className="h-3 w-3" /> Approve
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[#0755E9] border border-[#0755E9]/30 rounded-lg hover:bg-[#0755E9]/8 transition-colors"
          >
            <Pencil className="h-3 w-3" /> Edit & Approve
          </button>
          <button
            onClick={() => onReview(opp.id, "decline")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:border-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/5 ml-auto transition-all"
          >
            <ThumbsDown className="h-3 w-3" /> Decline
          </button>
        </div>
      )}

      {editing && (
        <OpportunityEditPanel
          opp={opp}
          onSave={async (id, patch) => {
            await onEdit(id, patch);
            await onReview(id, "approve");
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OpportunitiesTab({
  opportunities, accountId, onCreate, onAdvance, onEdit, onDelete, onAiGenerate, onReview,
  agentSteps, agentModel, agentLatency, agentSources,
}: OpportunitiesTabProps) {
  const { role }   = useRole();
  const canWrite   = role === "KAM" || role === "MANAGER";

  const [showForm,     setShowForm]     = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [sortMode,     setSortMode]     = useState<SortMode>("status");

  // Pending review items (not counted in main pipeline)
  const pendingReviewOpps = opportunities.filter((o) => o.pendingReview);
  const activeOpps        = opportunities.filter((o) => !o.pendingReview);

  const highPotential = highPotentialIds(activeOpps);

  const baseFiltered = statusFilter === "ACTIVE"
    ? activeOpps.filter((o) => ACTIVE_STATUSES.includes(o.status as OppStatus))
    : statusFilter === "ALL"
    ? activeOpps
    : activeOpps.filter((o) => o.status === statusFilter);

  const filtered = sortOpps(baseFiltered, sortMode);

  // Pipeline value (active only)
  const pipelineValue = activeOpps
    .filter((o) => ACTIVE_STATUSES.includes(o.status as OppStatus))
    .reduce((sum, o) => sum + (o.estimatedValue ?? 0) * (o.probability ?? 0.5), 0);

  const handleCreate = async (data: Parameters<typeof onCreate>[0]) => {
    await onCreate(data);
    setShowForm(false);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try { await onAiGenerate(); } finally { setGenerating(false); }
  };

  const FILTER_OPTIONS = [
    { key: "ACTIVE", label: "Active" },
    { key: "ALL",    label: "All" },
    ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label })),
  ];

  return (
    <div className="space-y-4">

      {/* ── Pending AI Review ──────────────────────────────────────────────── */}
      {pendingReviewOpps.length > 0 && canWrite && (
        <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#F59E0B]" />
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              Pending AI Review
            </p>
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">
              {pendingReviewOpps.length} opportunity{pendingReviewOpps.length !== 1 ? "s" : ""} need your review
            </span>
          </div>
          <div className="space-y-2">
            {pendingReviewOpps.map((opp) => (
              <PendingReviewCard
                key={opp.id}
                opp={opp}
                onReview={onReview}
                onEdit={onEdit}
              />
            ))}
          </div>
          {agentSources && agentSources.length > 0 && (
            <SourcesPanel sources={agentSources} label="Data sources used by AI" />
          )}
          {agentSteps && agentSteps.length > 0 && (
            <AgentTracePanel steps={agentSteps} model={agentModel} totalLatencyMs={agentLatency} />
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
          {FILTER_OPTIONS.map(({ key, label }) => {
            const count = key === "ACTIVE"
              ? activeOpps.filter((o) => ACTIVE_STATUSES.includes(o.status as OppStatus)).length
              : key === "ALL"
              ? activeOpps.length
              : activeOpps.filter((o) => o.status === key).length;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                  statusFilter === key
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {label} <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Pipeline value */}
        {pipelineValue > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#22C55E] bg-[#22C55E]/10 px-2.5 py-1 rounded-full">
            <DollarSign className="h-3 w-3" /> {formatCurrency(Math.round(pipelineValue))} pipeline
          </span>
        )}

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <ArrowUpDown className="h-3 w-3 text-[var(--text-muted)]" />
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
            {([
              { key: "status",    label: "Status"    },
              { key: "potential", label: "Potential" },
              { key: "value",     label: "Value"     },
            ] as const).map((s) => (
              <button
                key={s.key}
                onClick={() => setSortMode(s.key)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-medium transition-all",
                  sortMode === s.key
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A855F7] border border-[#A855F7]/40 rounded-lg hover:bg-[#A855F7]/10 disabled:opacity-50 transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? "Analysing…" : "AI Suggest"}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#A855F7] rounded-lg hover:bg-[#9333EA] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Opportunity
            </button>
          </div>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <CreateOpportunityForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <TrendingUp className="h-10 w-10 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">No opportunities yet</p>
          {canWrite && (
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              Use "AI Suggest" to auto-generate or "Add Opportunity" to log one manually
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              canEdit={canWrite}
              isHighPotential={highPotential.has(opp.id)}
              onAdvance={onAdvance}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
