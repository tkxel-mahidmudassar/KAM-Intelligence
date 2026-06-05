"use client";

import { useState } from "react";
import {
  ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle,
  FileText, Edit2, Plus, X, Save, ChevronDown, ChevronUp,
  Sparkles, Loader2, LayoutList, GitCompare,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { SourcesPanel } from "@/components/ui/SourcesPanel";
import { AgentTracePanel } from "@/components/ui/AgentTracePanel";
import type { AgentSource } from "@/lib/ai/agents/types";
import type { AgentStep } from "@/components/ui/AgentTracePanel";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KycVersion {
  id: string;
  version: number;
  status: string;
  executiveSummary:     string | null;
  businessModel:        string | null;
  keyStakeholders:      string | null;
  strategicGoals:       string | null;
  riskFactors:          string | null;
  expansionOpportunity: string | null;
  csatHistory:          string | null;
  competitiveLandscape: string | null;
  financialOverview:    string | null;
  submittedAt:     string | null;
  approvedAt:      string | null;
  rejectionReason: string | null;
}

interface KYCTabProps {
  kycVersions: KycVersion[];
  accountId:   string;
  onSubmit:    (id: string) => Promise<void>;
  onApprove:   (id: string) => Promise<void>;
  onReject:    (id: string, reason: string) => Promise<void>;
  onCreateNew: (fields: Partial<KycVersion>) => Promise<void>;
  onUpdate:    (id: string, fields: Partial<KycVersion>) => Promise<void>;
  onAiDraft:   () => Promise<void>;
  agentSources?: AgentSource[];
  agentSteps?:   AgentStep[];
  agentModel?:   string;
}

interface KycFields {
  executiveSummary:     string;
  businessModel:        string;
  keyStakeholders:      string;
  strategicGoals:       string;
  riskFactors:          string;
  expansionOpportunity: string;
  csatHistory:          string;
  competitiveLandscape: string;
  financialOverview:    string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
  label: string; color: string; icon: React.ElementType;
  variant: "healthy" | "at-risk" | "critical" | "neutral" | "brand";
}> = {
  DRAFT:     { label: "Draft",     color: "#6B7280", icon: FileText,     variant: "neutral" },
  SUBMITTED: { label: "Submitted", color: "#F59E0B", icon: Clock,        variant: "at-risk" },
  APPROVED:  { label: "Approved",  color: "#22C55E", icon: CheckCircle2, variant: "healthy" },
  REJECTED:  { label: "Rejected",  color: "#EF4444", icon: XCircle,      variant: "critical" },
};

const FIELD_LABELS: Record<keyof KycFields, string> = {
  executiveSummary:     "Executive Summary",
  businessModel:        "Business Model",
  keyStakeholders:      "Key Stakeholders",
  strategicGoals:       "Strategic Goals",
  riskFactors:          "Risk Factors",
  expansionOpportunity: "Expansion Opportunity",
  csatHistory:          "CSAT & Satisfaction History",
  competitiveLandscape: "Competitive Landscape",
  financialOverview:    "Financial Overview",
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as (keyof KycFields)[];

// ─── KYC Edit Form ────────────────────────────────────────────────────────────

function KycForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<KycFields>;
  onSave: (fields: Partial<KycVersion>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [fields, setFields] = useState<Partial<KycFields>>(initial);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(fields);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {FIELD_KEYS.map((key) => (
        <div key={key}>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {FIELD_LABELS[key]}
          </label>
          <textarea
            rows={3}
            value={fields[key] ?? ""}
            onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder={`Enter ${FIELD_LABELS[key].toLowerCase()}…`}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--modal-input-bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[#0755E9] resize-none transition-colors"
          />
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-60 transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save Draft"}
        </button>
      </div>
    </form>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6 shadow-[var(--glass-elevated-shadow)]">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">Reject KYC</h3>
        <p className="text-[13px] text-[var(--text-muted)] mb-4">Provide a reason that will be visible to the KAM.</p>
        <textarea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Missing financial documentation…"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--modal-input-bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[#EF4444] resize-none transition-colors mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#EF4444] rounded-lg hover:bg-[#DC2626] disabled:opacity-40 transition-colors"
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Completeness Panel ───────────────────────────────────────────────────────

// Section weights: executiveSummary counts double (it's the most important)
const SECTION_WEIGHTS: Record<keyof KycFields, number> = {
  executiveSummary:     2,
  businessModel:        1,
  keyStakeholders:      1,
  strategicGoals:       1,
  riskFactors:          1,
  expansionOpportunity: 1,
  csatHistory:          1,
  competitiveLandscape: 1,
  financialOverview:    1,
};
const TOTAL_WEIGHT = Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0); // 10

function getCompletenessColor(pct: number): string {
  if (pct >= 80) return "#22C55E";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

function KycCompletenessPanel({ kyc }: { kyc: KycVersion }) {
  const [expanded, setExpanded] = useState(true);

  const filledWeight = FIELD_KEYS.reduce((sum, key) => {
    const val = kyc[key as keyof KycVersion];
    return sum + (val && (val as string).trim() ? SECTION_WEIGHTS[key] : 0);
  }, 0);

  const pct       = Math.round((filledWeight / TOTAL_WEIGHT) * 100);
  const filledCnt = FIELD_KEYS.filter((k) => {
    const v = kyc[k as keyof KycVersion];
    return v && (v as string).trim();
  }).length;
  const color = getCompletenessColor(pct);

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
      {/* Header row */}
      <button
        className="flex items-center justify-between w-full p-4 hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}18` }}>
            <LayoutList className="h-3.5 w-3.5" style={{ color }} />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              KYC Completeness
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {filledCnt} of {FIELD_KEYS.length} sections filled
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Circular-ish % badge */}
          <div
            className="flex items-center justify-center h-9 w-9 rounded-full border-2 font-bold text-[13px] tabular-nums"
            style={{ borderColor: color, color }}
          >
            {pct}%
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
            : <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />}
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-1 w-full bg-[var(--bg-surface-2)]">
        <div
          className="h-1 transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {/* Section list */}
      {expanded && (
        <div className="p-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {FIELD_KEYS.map((key) => {
            const val     = kyc[key as keyof KycVersion];
            const filled  = !!(val && (val as string).trim());
            const weight  = SECTION_WEIGHTS[key];
            return (
              <div
                key={key}
                className="flex items-center gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0 sm:[&:nth-last-child(-n+2)]:border-0"
              >
                {filled ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22C55E]" />
                ) : (
                  <div className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--border-subtle)]" />
                )}
                <span className={cn(
                  "text-[12px] flex-1 leading-tight",
                  filled ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-disabled)]"
                )}>
                  {FIELD_LABELS[key]}
                </span>
                {weight > 1 && (
                  <span className="text-[10px] text-[#0755E9] bg-[#0755E9]/10 px-1.5 rounded font-medium shrink-0">
                    ×{weight}
                  </span>
                )}
                <span className={cn(
                  "text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded",
                  filled
                    ? "text-[#22C55E] bg-[#22C55E]/10"
                    : "text-[var(--text-disabled)] bg-[var(--bg-surface-2)]"
                )}>
                  {filled ? "Filled" : "Empty"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Version Diff View ────────────────────────────────────────────────────────

function KycVersionDiff({ older, newer }: { older: KycVersion; newer: KycVersion }) {
  const changedCount = FIELD_KEYS.filter((k) => {
    const o = (older[k as keyof KycVersion] as string | null) ?? "";
    const n = (newer[k as keyof KycVersion] as string | null) ?? "";
    return o.trim() !== n.trim();
  }).length;

  return (
    <div className="mt-3 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/4 overflow-hidden">
      {/* Diff header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F59E0B]/20">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-[#F59E0B]" />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            v{older.version} → v{newer.version}
          </span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B]">
            {changedCount} field{changedCount !== 1 ? "s" : ""} changed
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#F59E0B]/40" />
            Changed
          </span>
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <span className="inline-block h-2 w-2 rounded-sm bg-[var(--bg-surface-2)]" />
            Unchanged
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[140px_1fr_1fr] border-b border-[var(--border-subtle)] px-4 py-2 bg-[var(--bg-surface-2)]/40">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Section</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pl-3">
          v{older.version} {older.status === "APPROVED" ? "· Approved" : `· ${older.status}`}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pl-3 border-l border-[var(--border-subtle)]">
          v{newer.version} {newer.status === "APPROVED" ? "· Approved" : `· ${newer.status}`} (current)
        </span>
      </div>

      {/* Field rows */}
      <div>
        {FIELD_KEYS.map((key, idx) => {
          const olderVal = ((older[key as keyof KycVersion] as string | null) ?? "").trim();
          const newerVal = ((newer[key as keyof KycVersion] as string | null) ?? "").trim();
          const changed  = olderVal !== newerVal;

          return (
            <div
              key={key}
              className={cn(
                "grid grid-cols-[140px_1fr_1fr] px-4 py-3 border-b border-[var(--border-subtle)] last:border-0",
                changed ? "bg-[#F59E0B]/6" : "",
                idx % 2 === 0 && !changed ? "bg-[var(--bg-surface-2)]/20" : ""
              )}
            >
              {/* Section label */}
              <div className="flex items-start gap-1.5 pr-3 pt-0.5">
                {changed && <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#F59E0B] shrink-0" />}
                <span className={cn(
                  "text-[11px] font-semibold leading-tight",
                  changed ? "text-[#F59E0B]" : "text-[var(--text-muted)]"
                )}>
                  {FIELD_LABELS[key]}
                </span>
              </div>

              {/* Older value */}
              <div className={cn(
                "pr-3 pl-3 border-r border-[var(--border-subtle)]",
                changed && olderVal ? "bg-[#EF4444]/5" : ""
              )}>
                {olderVal ? (
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {olderVal}
                  </p>
                ) : (
                  <p className="text-[11px] italic text-[var(--text-disabled)]">Empty</p>
                )}
              </div>

              {/* Newer value */}
              <div className={cn(
                "pl-3",
                changed && newerVal ? "bg-[#22C55E]/5" : ""
              )}>
                {newerVal ? (
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {newerVal}
                  </p>
                ) : (
                  <p className="text-[11px] italic text-[var(--text-disabled)]">Empty</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KYCTab({ kycVersions, accountId, onSubmit, onApprove, onReject, onCreateNew, onUpdate, onAiDraft, agentSources, agentSteps, agentModel }: KYCTabProps) {
  const { role } = useRole();
  const canSubmit  = role === "KAM" || role === "MANAGER";
  const canApprove = role === "KAM" || role === "MANAGER";
  const canEdit    = role === "KAM" || role === "MANAGER";

  const [editing, setEditing]               = useState(false);
  const [creating, setCreating]             = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [drafting, setDrafting]             = useState(false);
  const [showReject, setShowReject]         = useState(false);
  const [histExpanded, setHistExpanded]     = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  const latest = kycVersions[0];

  const handleAiDraft = async () => {
    setDrafting(true);
    try {
      await onAiDraft();
    } finally {
      setDrafting(false);
    }
  };

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (!latest && !creating) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShieldAlert className="h-12 w-12 text-[var(--text-disabled)] mb-3" />
        <p className="text-[14px] font-medium text-[var(--text-primary)]">No KYC record found</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1 mb-5">KYC has not been initiated for this account</p>
        {canEdit && (
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <button
              onClick={handleAiDraft}
              disabled={drafting}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-[#0755E9] rounded-xl hover:bg-[#0647C7] disabled:opacity-60 transition-colors"
            >
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {drafting ? "Generating…" : "Generate with AI"}
            </button>
            <button
              onClick={() => setCreating(true)}
              disabled={drafting}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-xl hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" /> Create Manually
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Create new KYC form ──────────────────────────────────────────────────────

  if (creating) {
    return (
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            New KYC Record — v{(latest?.version ?? 0) + 1}
          </h3>
        </div>
        <KycForm
          initial={{}}
          onSave={async (fields) => {
            setSaving(true);
            try {
              await onCreateNew(fields);
              setCreating(false);
            } finally {
              setSaving(false);
            }
          }}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      </div>
    );
  }

  const cfg = STATUS_CONFIG[latest.status] ?? STATUS_CONFIG.DRAFT;
  const StatusIcon = cfg.icon;

  return (
    <>
      {showReject && (
        <RejectModal
          onConfirm={async (reason) => {
            setShowReject(false);
            await onReject(latest.id, reason);
          }}
          onCancel={() => setShowReject(false)}
        />
      )}

      <div className="space-y-4">
        {/* ── Status card ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: `${cfg.color}18` }}
              >
                <StatusIcon className="h-5 w-5" style={{ color: cfg.color }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">KYC v{latest.version}</h3>
                  <Badge variant={cfg.variant}>{cfg.label}</Badge>
                </div>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  {latest.submittedAt
                    ? `Submitted ${new Date(latest.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                    : "Draft — not yet submitted"}
                  {latest.approvedAt
                    ? ` · Approved ${new Date(latest.approvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                    : ""}
                </p>
                {latest.status === "REJECTED" && latest.rejectionReason && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/6 px-3 py-2">
                    <XCircle className="h-3.5 w-3.5 text-[#EF4444] shrink-0 mt-px" />
                    <p className="text-[12px] text-[#EF4444] leading-snug">
                      <span className="font-semibold">Rejection reason: </span>
                      {latest.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && latest.status === "DRAFT" && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:text-[var(--text-primary)] transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {canSubmit && latest.status === "DRAFT" && !editing && (
                <button
                  onClick={() => onSubmit(latest.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] transition-colors"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Submit for Review
                </button>
              )}
              {canApprove && latest.status === "SUBMITTED" && (
                <>
                  <button
                    onClick={() => onApprove(latest.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#22C55E] rounded-lg hover:bg-[#16A34A] transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => setShowReject(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/30 rounded-lg hover:bg-[#EF4444]/5 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </>
              )}
              {canEdit && (latest.status === "APPROVED" || latest.status === "REJECTED") && (
                <>
                  <button
                    onClick={handleAiDraft}
                    disabled={drafting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-60 transition-colors"
                  >
                    {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {drafting ? "Generating…" : "AI Draft New Version"}
                  </button>
                  <button
                    onClick={() => setCreating(true)}
                    disabled={drafting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Manually
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Completeness panel ──────────────────────────────────────────── */}
        {!creating && <KycCompletenessPanel kyc={latest} />}

        {/* ── AI source attribution ────────────────────────────────────────── */}
        {!editing && agentSources && agentSources.length > 0 && (
          <SourcesPanel sources={agentSources} label="Data sources used to draft this KYC" />
        )}
        {!editing && agentSteps && agentSteps.length > 0 && (
          <AgentTracePanel steps={agentSteps} model={agentModel} />
        )}

        {/* ── Edit form ───────────────────────────────────────────────────── */}
        {editing && (
          <div className="rounded-xl border border-[#0755E9]/30 bg-[#0755E9]/4 [backdrop-filter:var(--glass-blur)] p-5">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">Edit KYC Fields</h3>
            <KycForm
              initial={{
                executiveSummary:     latest.executiveSummary     ?? "",
                businessModel:        latest.businessModel        ?? "",
                keyStakeholders:      latest.keyStakeholders      ?? "",
                strategicGoals:       latest.strategicGoals       ?? "",
                riskFactors:          latest.riskFactors          ?? "",
                expansionOpportunity: latest.expansionOpportunity ?? "",
                csatHistory:          latest.csatHistory          ?? "",
                competitiveLandscape: latest.competitiveLandscape ?? "",
                financialOverview:    latest.financialOverview    ?? "",
              }}
              onSave={async (fields) => {
                setSaving(true);
                try {
                  await onUpdate(latest.id, fields);
                  setEditing(false);
                } finally {
                  setSaving(false);
                }
              }}
              onCancel={() => setEditing(false)}
              saving={saving}
            />
          </div>
        )}

        {/* ── KYC fields ──────────────────────────────────────────────────── */}
        {!editing && (
          <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-5">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-4">
              KYC Details
            </h3>
            <div className="space-y-4">
              {FIELD_KEYS.map((key) => {
                const val = latest[key];
                if (!val) return null;
                return (
                  <div key={key}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      {FIELD_LABELS[key]}
                    </p>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{val}</p>
                  </div>
                );
              })}
              {FIELD_KEYS.every((k) => !latest[k]) && (
                <p className="text-[13px] text-[var(--text-disabled)] italic">
                  No fields filled in yet.{canEdit && latest.status === "DRAFT" ? " Click Edit to add content." : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Version history ─────────────────────────────────────────────── */}
        {kycVersions.length > 1 && (
          <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-5">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => {
                setHistExpanded((v) => !v);
                if (histExpanded) setCompareVersionId(null);
              }}
            >
              <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Version History ({kycVersions.length - 1} previous)
              </h3>
              {histExpanded
                ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                : <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />}
            </button>
            {histExpanded && (
              <div className="mt-3 space-y-1">
                {kycVersions.slice(1).map((v) => {
                  const c          = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.DRAFT;
                  const isCompared = compareVersionId === v.id;
                  return (
                    <div key={v.id}>
                      <div className="flex items-center gap-3 py-2 border-b border-[var(--border-subtle)]">
                        <span className="text-[12px] font-medium text-[var(--text-muted)] w-6">v{v.version}</span>
                        <Badge variant={c.variant}>{c.label}</Badge>
                        <div className="flex-1 flex items-center gap-2 flex-wrap text-[11px] text-[var(--text-disabled)]">
                          {v.submittedAt && (
                            <span>Submitted {new Date(v.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                          )}
                          {v.approvedAt && (
                            <span>· Approved {new Date(v.approvedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                          )}
                        </div>
                        {/* Compare button */}
                        <button
                          onClick={() => setCompareVersionId(isCompared ? null : v.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0",
                            isCompared
                              ? "bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30"
                              : "text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] hover:border-[#F59E0B]/40"
                          )}
                        >
                          <GitCompare className="h-3 w-3" />
                          {isCompared ? "Hide diff" : "Compare"}
                        </button>
                      </div>
                      {/* Inline diff panel */}
                      {isCompared && (
                        <KycVersionDiff older={v} newer={latest} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
