"use client";

import React, { useState, useMemo, type ComponentType } from "react";
import {
  CalendarDays, Phone, Mail, BarChart2, Activity,
  AlertTriangle, FileText, FileCheck, Presentation,
  TrendingUp, TrendingDown,
  Wrench, DollarSign, Users, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
// Inline Touchpoint type to avoid circular import through account page
interface Touchpoint {
  id: string;
  type: string;
  date: string;
  loggedBy: string | null;
  notes: string | null;
  stakeholders: string | null;
  createdAt: string;
}

// ─── Props types (minimal — only what we need for timeline) ──────────────────

interface AccountSignal {
  id: string;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  detectedAt: string;
  isResolved: boolean;
}

interface AccountDocument {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

interface AccountKycVersion {
  id: string;
  status: string;
  createdAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  executiveSummary?: string | null;
}

interface AccountQbrSession {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  conductedAt: string | null;
}

interface AccountKamScore {
  id: string;
  overall: number;
  computedAt: string;
}

interface AccountEscalation {
  id: string;
  type: string;
  severity: string;
  description: string;
  status: string;
  openedAt?: string;
  createdAt?: string;
}

export interface TimelineTabProps {
  accountId:   string;
  touchpoints: Touchpoint[];
  signals:     AccountSignal[];
  documents:   AccountDocument[];
  kycVersions: AccountKycVersion[];
  qbrSessions: AccountQbrSession[];
  kamScores:   AccountKamScore[];
  escalations: AccountEscalation[];
}

// ─── Event types ──────────────────────────────────────────────────────────────

type EventKind = "touchpoint" | "signal" | "document" | "kyc" | "qbr" | "score" | "escalation";

interface TimelineEvent {
  id:        string;
  kind:      EventKind;
  date:      string;  // ISO
  title:     string;
  subtitle?: string;
  badge?:    string;
  badgeColor?: string;
  icon:      ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconBg:    string;
  iconColor: string;
  resolved?: boolean;
}

// ─── Config maps ──────────────────────────────────────────────────────────────

const TOUCHPOINT_META: Record<string, { icon: ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }> = {
  MEETING: { icon: CalendarDays, color: "#3B82F6" },
  CALL:    { icon: Phone,        color: "#22C55E" },
  EMAIL:   { icon: Mail,         color: "#F59E0B" },
  QBR:     { icon: BarChart2,    color: "#8B5CF6" },
  OTHER:   { icon: Activity,     color: "#6B7280" },
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "#EF4444",
  WARNING:  "#F59E0B",
  INFO:     "#3B82F6",
};

const ESCALATION_META: Record<string, { icon: ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  DELIVERY:     { icon: Wrench      },
  COMMERCIAL:   { icon: DollarSign  },
  RELATIONSHIP: { icon: Users       },
  OTHER:        { icon: HelpCircle  },
};

const ESC_SEV_COLOR: Record<string, string> = {
  CRITICAL: "#EF4444", HIGH: "#F97316", MEDIUM: "#F59E0B", LOW: "#22C55E",
};

const KYC_STATUS_LABEL: Record<string, string> = {
  DRAFT: "KYC draft created", SUBMITTED: "KYC submitted for review",
  APPROVED: "KYC approved", REJECTED: "KYC rejected",
};

const KYC_STATUS_COLOR: Record<string, string> = {
  DRAFT: "#6B7280", SUBMITTED: "#3B82F6", APPROVED: "#22C55E", REJECTED: "#EF4444",
};

const QBR_STATUS_LABEL: Record<string, string> = {
  PLANNED: "QBR planned", SCHEDULED: "QBR scheduled",
  COMPLETED: "QBR completed", CANCELLED: "QBR cancelled",
};

const QBR_STATUS_COLOR: Record<string, string> = {
  PLANNED: "#6B7280", SCHEDULED: "#3B82F6", COMPLETED: "#22C55E", CANCELLED: "#EF4444",
};

const FILTER_LABELS: Record<EventKind, string> = {
  touchpoint: "Activity",
  signal:     "Signals",
  document:   "Documents",
  kyc:        "KYC",
  qbr:        "QBR",
  score:      "Scores",
  escalation: "Escalations",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)         return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)         return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)         return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)          return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5)          return `${w}w ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── (QuickLogForm removed — touchpoint logging lives in the Touchpoints tab) ──

// ─── Timeline event row ───────────────────────────────────────────────────────

function EventRow({ event }: { event: TimelineEvent }) {
  const Icon = event.icon;

  return (
    <div className="flex gap-3">
      {/* Icon column */}
      <div className="relative flex flex-col items-center">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: event.iconBg }}
        >
          <Icon className="h-4 w-4" style={{ color: event.iconColor }} />
        </div>
        {/* Connector line — rendered by the parent */}
      </div>

      {/* Content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn(
              "text-[13px] font-medium leading-snug",
              event.resolved ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"
            )}>
              {event.title}
            </p>
            {event.subtitle && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{event.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.badge && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                style={{
                  color: event.badgeColor ?? "#6B7280",
                  background: `${event.badgeColor ?? "#6B7280"}15`,
                  borderColor: `${event.badgeColor ?? "#6B7280"}30`,
                }}
              >
                {event.badge}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-disabled)] whitespace-nowrap" title={formatDate(event.date)}>
              {relativeTime(event.date)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TimelineTab({
  accountId,
  touchpoints,
  signals,
  documents,
  kycVersions,
  qbrSessions,
  kamScores,
  escalations,
}: TimelineTabProps) {
  const [activeFilters, setActiveFilters] = useState<Set<EventKind>>(new Set());

  // accountId reserved for future use
  void accountId;

  // ── Derive events ─────────────────────────────────────────────────────────

  const events = useMemo<TimelineEvent[]>(() => {
    const evts: TimelineEvent[] = [];

    // Touchpoints
    for (const tp of touchpoints) {
      const meta = TOUCHPOINT_META[tp.type] ?? TOUCHPOINT_META.OTHER;
      evts.push({
        id:        `tp-${tp.id}`,
        kind:      "touchpoint",
        date:      tp.date,
        title:     `${tp.type === "MEETING" ? "Meeting" : tp.type === "CALL" ? "Call" : tp.type === "EMAIL" ? "Email" : tp.type === "QBR" ? "QBR prep" : "Activity"} logged`,
        subtitle:  [
          tp.stakeholders ? `👥 ${tp.stakeholders}` : null,
          tp.notes ? tp.notes.slice(0, 120) + (tp.notes.length > 120 ? "…" : "") : null,
        ].filter(Boolean).join(" · ") || undefined,
        badge:      tp.type,
        badgeColor: meta.color,
        icon:       meta.icon,
        iconBg:     `${meta.color}18`,
        iconColor:  meta.color,
      });
    }

    // Signals
    for (const sig of signals) {
      const col = SEV_COLOR[sig.severity] ?? "#6B7280";
      evts.push({
        id:        `sig-${sig.id}`,
        kind:      "signal",
        date:      sig.detectedAt,
        title:     sig.title,
        subtitle:  sig.description ?? undefined,
        badge:     sig.severity,
        badgeColor: col,
        icon:      AlertTriangle,
        iconBg:    `${col}18`,
        iconColor: col,
        resolved:  sig.isResolved,
      });
    }

    // Documents
    for (const doc of documents) {
      evts.push({
        id:        `doc-${doc.id}`,
        kind:      "document",
        date:      doc.createdAt,
        title:     `Document uploaded: ${doc.name}`,
        badge:     doc.type,
        badgeColor: "#0755E9",
        icon:      FileText,
        iconBg:    "#0755E920",
        iconColor: "#0755E9",
      });
    }

    // KYC versions
    for (const kyc of kycVersions) {
      const kycDate = kyc.createdAt ?? kyc.approvedAt ?? kyc.submittedAt;
      if (!kycDate) continue;
      const col = KYC_STATUS_COLOR[kyc.status] ?? "#6B7280";
      evts.push({
        id:        `kyc-${kyc.id}`,
        kind:      "kyc",
        date:      kycDate,
        title:     KYC_STATUS_LABEL[kyc.status] ?? `KYC ${kyc.status.toLowerCase()}`,
        subtitle:  kyc.executiveSummary ? kyc.executiveSummary.slice(0, 120) + (kyc.executiveSummary.length > 120 ? "…" : "") : undefined,
        badge:     kyc.status,
        badgeColor: col,
        icon:      FileCheck,
        iconBg:    `${col}18`,
        iconColor: col,
      });
    }

    // QBR sessions
    for (const qbr of qbrSessions) {
      const dateStr = qbr.conductedAt ?? qbr.scheduledAt ?? qbr.conductedAt;
      if (!dateStr) continue;
      const col = QBR_STATUS_COLOR[qbr.status] ?? "#6B7280";
      evts.push({
        id:        `qbr-${qbr.id}`,
        kind:      "qbr",
        date:      dateStr,
        title:     qbr.title,
        badge:     QBR_STATUS_LABEL[qbr.status] ?? qbr.status,
        badgeColor: col,
        icon:      Presentation,
        iconBg:    `${col}18`,
        iconColor: col,
      });
    }

    // Score changes (show every score record — most recent first means most recent last in timeline)
    let prevScore: number | null = null;
    const sortedScores = [...kamScores].sort((a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime());
    for (const sc of sortedScores) {
      const direction = prevScore === null ? null : sc.overall > prevScore ? "up" : sc.overall < prevScore ? "down" : null;
      const col = sc.overall >= 70 ? "#22C55E" : sc.overall >= 45 ? "#F59E0B" : "#EF4444";
      evts.push({
        id:        `score-${sc.id}`,
        kind:      "score",
        date:      sc.computedAt,
        title:     `KAM score updated: ${sc.overall}/100`,
        subtitle:  direction === "up" ? `▲ Up from ${prevScore}` : direction === "down" ? `▼ Down from ${prevScore}` : undefined,
        badge:     `${sc.overall}`,
        badgeColor: col,
        icon:      direction === "down" ? TrendingDown : TrendingUp,
        iconBg:    `${col}18`,
        iconColor: col,
      });
      prevScore = sc.overall;
    }

    // Escalations
    for (const esc of escalations) {
      const dateStr = esc.openedAt ?? esc.createdAt;
      if (!dateStr) continue;
      const meta = ESCALATION_META[esc.type] ?? ESCALATION_META.OTHER;
      const col  = ESC_SEV_COLOR[esc.severity] ?? "#6B7280";
      evts.push({
        id:        `esc-${esc.id}`,
        kind:      "escalation",
        date:      dateStr,
        title:     `Escalation: ${esc.description.slice(0, 80)}${esc.description.length > 80 ? "…" : ""}`,
        badge:     esc.severity,
        badgeColor: col,
        icon:      meta.icon,
        iconBg:    `${col}18`,
        iconColor: col,
        resolved:  esc.status === "RESOLVED",
      });
    }

    // Sort all events by date, newest first
    evts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return evts;
  }, [touchpoints, signals, documents, kycVersions, qbrSessions, kamScores, escalations]);

  // ── Filtered events ───────────────────────────────────────────────────────

  const filtered = activeFilters.size === 0
    ? events
    : events.filter((e) => activeFilters.has(e.kind));

  // ── Kind counts for filter pills ──────────────────────────────────────────

  const counts = useMemo(() => {
    const c = {} as Record<EventKind, number>;
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  const toggleFilter = (kind: EventKind) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      {events.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(FILTER_LABELS) as [EventKind, string][])
            .filter(([kind]) => (counts[kind] ?? 0) > 0)
            .map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => toggleFilter(kind)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all",
                  activeFilters.has(kind)
                    ? "bg-[#0755E9] border-[#0755E9] text-white"
                    : "border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]"
                )}
              >
                {label}
                <span className={cn(
                  "text-[10px] px-1 py-px rounded-full",
                  activeFilters.has(kind) ? "bg-white/20" : "bg-[var(--bg-surface-3)]"
                )}>
                  {counts[kind]}
                </span>
              </button>
            ))}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-14 w-14 rounded-xl bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] flex items-center justify-center mb-3">
            <Activity className="h-6 w-6 text-[var(--text-disabled)]" />
          </div>
          <p className="text-[14px] font-medium text-[var(--text-primary)]">No events yet</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            {activeFilters.size > 0
              ? "No events match the selected filters"
              : "Log touchpoints in the Touchpoints tab or run a score refresh to populate the timeline"}
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-4 top-4 bottom-0 w-px"
            style={{ background: "var(--border-subtle)" }}
          />

          <div className="space-y-0 relative pl-0">
            {filtered.map((event, i) => {
              // Group by date
              const eventDate = formatDate(event.date);
              const prevDate = i > 0 ? formatDate(filtered[i - 1].date) : null;
              const showDivider = eventDate !== prevDate;

              return (
                <div key={event.id}>
                  {showDivider && (
                    <div className="flex items-center gap-3 mb-3 mt-1 pl-12">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
                        {eventDate}
                      </span>
                    </div>
                  )}
                  <EventRow event={event} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
