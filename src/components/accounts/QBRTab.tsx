"use client";

import { useState } from "react";
import {
  Calendar, CheckSquare, ChevronDown, ChevronUp,
  Sparkles, Loader2, Plus, X,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import { SourcesPanel } from "@/components/ui/SourcesPanel";
import { AgentTracePanel } from "@/components/ui/AgentTracePanel";
import type { AgentSource } from "@/lib/ai/agents/types";
import type { AgentStep } from "@/components/ui/AgentTracePanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QbrItem {
  id: string;
  category: string | null;
  title: string;
  content: string | null;
  status: string | null;
}

interface QbrSession {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  conductedAt: string | null;
  attendees: string[] | string | null;
  aiSummary: string | null;
  notes: string | null;
  items: QbrItem[];
}

interface QBRTabProps {
  sessions: QbrSession[];
  accountId: string;
  onGenerateSummary: (sessionId: string) => Promise<string>;
  onGenerateSession: (title: string, type: string) => Promise<void>;
  agentSources?: AgentSource[];
  agentSteps?:   AgentStep[];
  agentModel?:   string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SESSION_STATUS_CONFIG: Record<string, { label: string; variant: "neutral" | "brand" | "healthy" | "at-risk" }> = {
  DRAFT:     { label: "Draft",     variant: "neutral" },
  SCHEDULED: { label: "Scheduled", variant: "brand"   },
  COMPLETED: { label: "Completed", variant: "healthy" },
  CANCELLED: { label: "Cancelled", variant: "at-risk" },
};

const ITEM_STATUS_COLOR: Record<string, string> = {
  OPEN:        "#6B7280",
  IN_PROGRESS: "#0755E9",
  DONE:        "#22C55E",
  DEFERRED:    "#F59E0B",
};

const CATEGORY_LABEL: Record<string, string> = {
  REVIEW:    "Review",
  RISK:      "Risk",
  ACTION:    "Action",
  EXPANSION: "Expansion",
  WRAP_UP:   "Wrap-up",
};

const SESSION_TYPES = ["QBR", "DBR", "EBR"];

function typeLabel(type: string) {
  const map: Record<string, string> = { QBR: "QBR", DBR: "DBR", EBR: "EBR", KICKOFF: "Kickoff", ADHOC: "Ad-hoc" };
  return map[type] ?? type;
}

function parseAttendees(raw: string[] | string | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

// ─── Generate Session Modal ───────────────────────────────────────────────────

function GenerateModal({
  onGenerate,
  onCancel,
}: {
  onGenerate: (title: string, type: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType]     = useState("QBR");
  const [title, setTitle]   = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await onGenerate(title.trim() || "", type);
      onCancel();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6 shadow-[var(--glass-elevated-shadow)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#0755E9]" />
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Generate Session with AI</h3>
          </div>
          <button onClick={onCancel} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13px] text-[var(--text-muted)] mb-5">
          Gemini will analyse this account&apos;s health, signals, and KPIs to generate a tailored agenda.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Session Type
            </label>
            <div className="flex gap-2">
              {SESSION_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-[12px] font-medium border transition-all",
                    type === t
                      ? "bg-[#0755E9] text-white border-transparent"
                      : "bg-transparent text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
              Title (optional — leave blank for auto)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. Q2 ${type} — Strategic Review`}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--modal-input-bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[#0755E9] transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function QbrSessionCard({
  session,
  onGenerateSummary,
}: {
  session: QbrSession;
  onGenerateSummary: (id: string) => Promise<string>;
}) {
  const [expanded, setExpanded]           = useState(false);
  const [generatingSummary, setGenerating] = useState(false);
  const [localSummary, setLocalSummary]   = useState(session.aiSummary);

  const cfg        = SESSION_STATUS_CONFIG[session.status] ?? SESSION_STATUS_CONFIG.DRAFT;
  const date       = session.conductedAt ?? session.scheduledAt;
  const attendees  = parseAttendees(session.attendees);
  const doneItems  = session.items.filter((i) => i.status === "DONE" || i.status === "resolved").length;

  const handleGenerateSummary = async () => {
    setGenerating(true);
    try {
      const summary = await onGenerateSummary(session.id);
      setLocalSummary(summary);
      setExpanded(true);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{session.title}</h3>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            <Badge variant="neutral">{typeLabel(session.type)}</Badge>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)] flex-wrap">
            {date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {attendees.length > 0 && (
              <span>{attendees.length} attendee{attendees.length !== 1 ? "s" : ""}</span>
            )}
            {session.items.length > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" />
                {doneItems}/{session.items.length} items
              </span>
            )}
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
            title="Generate AI Summary"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--text-muted)] hover:text-[#0755E9] hover:bg-[#0755E9]/8 disabled:opacity-50 transition-all"
          >
            {generatingSummary
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{generatingSummary ? "Generating…" : "AI Summary"}</span>
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-4">
          {/* AI Summary */}
          {localSummary && (
            <div className="rounded-lg border border-[#0755E9]/20 bg-[#0755E9]/5 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#0755E9]" />
                <span className="text-[11px] font-semibold text-[#0755E9] uppercase tracking-wider">AI Summary</span>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{localSummary}</p>
            </div>
          )}

          {/* Notes */}
          {session.notes && (
            <div>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Notes</p>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{session.notes}</p>
            </div>
          )}

          {/* Attendees */}
          {attendees.length > 0 && (
            <div>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Attendees</p>
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((a) => (
                  <span key={a} className="px-2.5 py-1 rounded-full text-[11px] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          {session.items.length > 0 && (
            <div>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Agenda Items</p>
              <div className="space-y-0">
                {session.items.map((item) => {
                  const isDone = item.status === "DONE" || item.status === "resolved";
                  return (
                    <div key={item.id} className="flex items-start gap-2.5 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
                      <div
                        className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 border-2"
                        style={{
                          borderColor: ITEM_STATUS_COLOR[item.status ?? ""] ?? "#6B7280",
                          background: isDone ? (ITEM_STATUS_COLOR[item.status ?? ""] ?? "#22C55E") : "transparent",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "text-[12px] font-medium leading-snug",
                          isDone ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
                        )}>
                          {item.title}
                        </p>
                        {item.content && (
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{item.content}</p>
                        )}
                        {item.category && (
                          <Badge variant="neutral" className="text-[10px] mt-1">
                            {CATEGORY_LABEL[item.category] ?? item.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QBRTab({ sessions, accountId, onGenerateSummary, onGenerateSession, agentSources, agentSteps, agentModel }: QBRTabProps) {
  const { role }             = useRole();
  const [showModal, setShowModal] = useState(false);
  const canCreate = role === "KAM" || role === "MANAGER";

  return (
    <>
      {showModal && (
        <GenerateModal
          onGenerate={onGenerateSession}
          onCancel={() => setShowModal(false)}
        />
      )}

      <div className="space-y-3">

        {/* ── AI source attribution (shown after a session is generated) ──── */}
        {agentSources && agentSources.length > 0 && (
          <SourcesPanel sources={agentSources} label="Data sources used to generate this session" />
        )}
        {agentSteps && agentSteps.length > 0 && (
          <AgentTracePanel steps={agentSteps} model={agentModel} />
        )}

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[var(--text-muted)]">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </p>
          {canCreate && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-12 w-12 text-[var(--text-disabled)] mb-3" />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">No QBR sessions</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 mb-4">
              Use &quot;Generate with AI&quot; to create your first session
            </p>
            {canCreate && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-[#0755E9] rounded-xl hover:bg-[#0647C7] transition-colors"
              >
                <Plus className="h-4 w-4" /> Generate Session
              </button>
            )}
          </div>
        ) : (
          sessions.map((session) => (
            <QbrSessionCard
              key={session.id}
              session={session}
              onGenerateSummary={onGenerateSummary}
            />
          ))
        )}
      </div>
    </>
  );
}
