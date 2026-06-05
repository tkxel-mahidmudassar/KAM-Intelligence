"use client";

import { useState } from "react";
import {
  Plus, CheckCircle2, Clock, User, ChevronDown,
  BookOpen, X, TrendingUp, AlertTriangle, RefreshCw,
  Users, FileText, Zap, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

interface Action {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  dueDate: string | null;
  owner: { id: string; name: string } | null;
}

interface ActionsTabProps {
  actions: Action[];
  accountId: string;
  onStatusChange: (actionId: string, status: string) => Promise<void>;
  onCreateAction: (data: { title: string; priority: string; dueDate: string | null; description?: string }) => Promise<void>;
}

const STATUS_ORDER = ["OPEN", "IN_PROGRESS", "DISMISSED", "DONE"];
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress", DISMISSED: "Dismissed", DONE: "Done",
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: "#6B7280", IN_PROGRESS: "#0755E9", DISMISSED: "#F59E0B", DONE: "#22C55E",
};

// ─── Playbook definitions ─────────────────────────────────────────────────────

interface PlaybookAction {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDays: number; // days from now
}

interface Playbook {
  id: string;
  label: string;
  description: string;
  color: string;
  bg: string;
  icon: React.ElementType;
  actions: PlaybookAction[];
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "csat_recovery",
    label: "CSAT Recovery",
    description: "Structured response to NPS decline or CSAT drop below threshold",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.08)",
    icon: TrendingUp,
    actions: [
      { title: "Schedule emergency exec call to discuss CSAT decline", description: "Book a 30-min call with primary stakeholder to acknowledge issues and present recovery plan.", priority: "CRITICAL", dueDays: 3 },
      { title: "Audit top 10 support tickets driving negative sentiment", description: "Review detractor feedback themes and identify the 3 highest-impact issues to fix first.", priority: "HIGH", dueDays: 5 },
      { title: "Assign dedicated support resource for 30-day recovery sprint", description: "Coordinate with support team for named ownership and SLA commitment.", priority: "HIGH", dueDays: 7 },
      { title: "Share CSAT improvement roadmap with stakeholder", description: "Document actions, owners, and timelines. Send written summary to build confidence.", priority: "MEDIUM", dueDays: 14 },
      { title: "Follow-up NPS pulse survey at 30 days", description: "Run lightweight 3-question pulse to measure recovery progress before next formal NPS cycle.", priority: "MEDIUM", dueDays: 30 },
    ],
  },
  {
    id: "contract_renewal",
    label: "Contract Renewal",
    description: "Proactive renewal motion to de-risk contract expiry and protect ARR",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
    icon: RefreshCw,
    actions: [
      { title: "Open renewal conversation with executive sponsor", description: "Initiate early renewal dialogue — reference value delivered, usage growth, and upcoming roadmap.", priority: "HIGH", dueDays: 7 },
      { title: "Prepare commercial renewal proposal with options", description: "Build 3-tier proposal: status quo, loyalty discount (12-month), and multi-year with enhanced SLA.", priority: "HIGH", dueDays: 14 },
      { title: "Internal renewal readiness review with manager", description: "Validate pricing, identify risks, confirm delivery health before presenting to client.", priority: "MEDIUM", dueDays: 5 },
      { title: "Send ROI and value realisation summary to stakeholder", description: "Quantify KPIs improved, cost savings delivered, and business outcomes enabled by Tkxel.", priority: "HIGH", dueDays: 10 },
    ],
  },
  {
    id: "escalation_response",
    label: "Escalation Response",
    description: "Structured response to a critical delivery or relationship escalation",
    color: "#DC2626",
    bg: "rgba(220,38,38,0.08)",
    icon: AlertTriangle,
    actions: [
      { title: "Acknowledge escalation formally within 24 hours", description: "Send written acknowledgement to client executive. Include interim owner and response timeline.", priority: "CRITICAL", dueDays: 1 },
      { title: "Conduct root cause analysis (RCA) and share findings", description: "5-why analysis completed by technical lead. Share transparent RCA with client within 5 days.", priority: "CRITICAL", dueDays: 5 },
      { title: "Agree remediation plan with committed milestones", description: "Co-create a written recovery plan with the client. Include weekly checkpoints and accountability.", priority: "CRITICAL", dueDays: 7 },
      { title: "Assign senior delivery lead as escalation owner", description: "Escalation requires senior leadership visibility. Assign named delivery lead with direct client access.", priority: "HIGH", dueDays: 2 },
      { title: "Weekly escalation status update for 6 weeks", description: "Cadence: Friday 15-min sync + written update via email. Track against milestones.", priority: "HIGH", dueDays: 7 },
    ],
  },
  {
    id: "relationship_building",
    label: "Relationship Building",
    description: "Deepen executive engagement and expand the relationship map",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.08)",
    icon: Users,
    actions: [
      { title: "Map all stakeholders and identify executive gaps", description: "Update stakeholder map. Identify senior contacts without a Tkxel relationship. Plan outreach.", priority: "MEDIUM", dueDays: 7 },
      { title: "Arrange executive sponsor-to-sponsor introduction call", description: "Facilitate a Tkxel executive pairing with client C-level. Builds resilience if KAM changes.", priority: "MEDIUM", dueDays: 21 },
      { title: "Invite key stakeholders to Tkxel community event", description: "Leverage Tkxel webinars, roundtables, or partner events to deepen engagement outside BAU.", priority: "LOW", dueDays: 30 },
      { title: "Conduct quarterly relationship health check", description: "15-min informal call: what's working, what could improve, any upcoming organisational changes.", priority: "MEDIUM", dueDays: 14 },
    ],
  },
  {
    id: "qbr_prep",
    label: "QBR Preparation",
    description: "Systematic prep for a high-impact Quarterly Business Review",
    color: "#0755E9",
    bg: "rgba(7,85,233,0.08)",
    icon: FileText,
    actions: [
      { title: "Collect and validate all QBR data inputs", description: "Gather: KPI scorecard, delivery velocity, NPS trend, ticket resolution, ARR utilisation.", priority: "HIGH", dueDays: 7 },
      { title: "Draft QBR agenda and share with client for approval", description: "3-section agenda: Value delivered, Challenges & mitigations, Forward plan. Align 5 days ahead.", priority: "HIGH", dueDays: 10 },
      { title: "Prepare client-facing QBR deck", description: "Executive-ready deck: 8–12 slides. Visuals > tables. Include AI health score narrative.", priority: "HIGH", dueDays: 12 },
      { title: "Internal QBR dry-run with manager", description: "Run through deck with manager. Stress test key messages. Prepare for difficult questions.", priority: "MEDIUM", dueDays: 14 },
      { title: "Send QBR follow-up summary and next steps within 24h", description: "Post-meeting: written summary, agreed actions with owners, next QBR date.", priority: "HIGH", dueDays: 16 },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, "priority-critical" | "priority-high" | "priority-medium" | "priority-low"> = {
    CRITICAL: "priority-critical", HIGH: "priority-high", MEDIUM: "priority-medium", LOW: "priority-low",
  };
  return <Badge variant={map[priority] ?? "neutral"}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</Badge>;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const overdue = d < new Date();
  const str = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { str, overdue };
}

function dueDateFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ─── Create Action Form ───────────────────────────────────────────────────────

function CreateActionForm({
  onSave, onCancel,
}: {
  onSave: (data: { title: string; priority: string; dueDate: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle]         = useState("");
  const [priority, setPriority]   = useState("MEDIUM");
  const [dueDate, setDueDate]     = useState("");
  const [saving, setSaving]       = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), priority, dueDate: dueDate || null });
      setTitle(""); setPriority("MEDIUM"); setDueDate("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#0755E9]/30 bg-[#0755E9]/5 p-4 space-y-3">
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">New Action</p>
      <input
        autoFocus
        type="text"
        placeholder="Action title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9] focus:ring-1 focus:ring-[#0755E9]/20"
      />
      <div className="flex items-center gap-3">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]"
        >
          {["LOW","MEDIUM","HIGH","CRITICAL"].map((p) => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]"
        />
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-4 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Add Action"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Playbook Card ────────────────────────────────────────────────────────────

function PlaybookCard({
  playbook, onApply,
}: {
  playbook: Playbook;
  onApply: (playbook: Playbook) => Promise<void>;
}) {
  const [applying,  setApplying]  = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const Icon = playbook.icon;

  const handleApply = async () => {
    setApplying(true);
    try { await onApply(playbook); } finally { setApplying(false); }
  };

  return (
    <div
      className="rounded-xl border p-4 transition-all"
      style={{ borderColor: `${playbook.color}30`, background: playbook.bg }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${playbook.color}18` }}
        >
          <Icon className="h-4 w-4" style={{ color: playbook.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{playbook.label}</p>
          <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">{playbook.description}</p>
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: playbook.color, background: `${playbook.color}15` }}
        >
          {playbook.actions.length} actions
        </span>
      </div>

      {/* Action preview toggle */}
      <button
        onClick={() => setExpanded((x) => !x)}
        className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        {expanded ? "Hide" : "Preview"} actions
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 pl-1">
          {playbook.actions.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: playbook.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--text-primary)] leading-snug">{a.title}</p>
                <span
                  className="text-[9px] font-semibold px-1.5 py-px rounded mt-0.5 inline-block"
                  style={{ color: playbook.color, background: `${playbook.color}12` }}
                >
                  {a.priority} · due in {a.dueDays}d
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply button */}
      <button
        onClick={handleApply}
        disabled={applying}
        className="mt-3 w-full py-2 text-[12px] font-semibold rounded-lg border transition-all disabled:opacity-50"
        style={{
          color: playbook.color,
          borderColor: `${playbook.color}40`,
          background: applying ? `${playbook.color}15` : "transparent",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${playbook.color}12`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        {applying ? `Adding ${playbook.actions.length} actions…` : `Apply ${playbook.label} Playbook`}
      </button>
    </div>
  );
}

// ─── Action Row ───────────────────────────────────────────────────────────────

function ActionRow({
  action, canEdit, onStatusChange,
}: {
  action: Action;
  canEdit: boolean;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  const [changing, setChanging] = useState(false);
  const date = formatDate(action.dueDate);

  const nextStatus = (current: string): string | null => {
    const ADVANCE_ORDER = ["OPEN", "IN_PROGRESS", "DONE"];
    const i = ADVANCE_ORDER.indexOf(current);
    return i >= 0 && i < ADVANCE_ORDER.length - 1 ? ADVANCE_ORDER[i + 1] : null;
  };

  const handleAdvance = async () => {
    const next = nextStatus(action.status);
    if (!next || !canEdit) return;
    setChanging(true);
    try { await onStatusChange(action.id, next); } finally { setChanging(false); }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] hover:border-[var(--border-default)] transition-all">
      {/* Status indicator */}
      <div
        className="mt-0.5 h-3 w-3 rounded-full shrink-0 border-2"
        style={{
          borderColor: STATUS_COLOR[action.status],
          background: action.status === "DONE" ? STATUS_COLOR[action.status] : "transparent",
        }}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-[13px] font-medium leading-snug",
          action.status === "DONE" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
        )}>
          {action.title}
        </p>
        {action.description && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{action.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <PriorityBadge priority={action.priority} />
          <Badge variant="neutral" className="text-[10px]" style={{ color: STATUS_COLOR[action.status] }}>
            {STATUS_LABEL[action.status]}
          </Badge>
          {date && (
            <span className={cn("text-[11px] flex items-center gap-0.5", date.overdue ? "text-[#EF4444]" : "text-[var(--text-disabled)]")}>
              <Clock className="h-3 w-3" /> {date.str}
            </span>
          )}
          {action.owner && (
            <span className="text-[11px] text-[var(--text-disabled)] flex items-center gap-0.5">
              <User className="h-3 w-3" /> {action.owner.name.split(" ")[0]}
            </span>
          )}
        </div>
      </div>

      {/* Advance button */}
      {canEdit && nextStatus(action.status) && (
        <button
          onClick={handleAdvance}
          disabled={changing}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#0755E9] hover:text-[#0755E9] hover:bg-[#0755E9]/5 transition-all disabled:opacity-50"
        >
          {changing ? "…" : (
            <>
              <ChevronDown className="h-3 w-3 -rotate-90" />
              {STATUS_LABEL[nextStatus(action.status)!]}
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ActionsTab({ actions, accountId, onStatusChange, onCreateAction }: ActionsTabProps) {
  const { role }    = useRole();
  const canEdit     = role === "KAM" || role === "MANAGER";
  const [showForm,       setShowForm]       = useState(false);
  const [showPlaybooks,  setShowPlaybooks]  = useState(false);
  const [playbookApplied, setPlaybookApplied] = useState<string | null>(null);
  const [statusFilter,   setStatusFilter]   = useState<"ALL" | "OPEN" | "IN_PROGRESS" | "DISMISSED" | "DONE">("ALL");

  const filtered = statusFilter === "ALL" ? actions : actions.filter((a) => a.status === statusFilter);

  const handleCreate = async (data: { title: string; priority: string; dueDate: string | null }) => {
    await onCreateAction(data);
    setShowForm(false);
  };

  const handleApplyPlaybook = async (playbook: Playbook) => {
    // Create all actions sequentially
    for (const pa of playbook.actions) {
      await onCreateAction({
        title:       pa.title,
        description: pa.description,
        priority:    pa.priority,
        dueDate:     dueDateFromNow(pa.dueDays),
      });
    }
    setPlaybookApplied(playbook.id);
    setShowPlaybooks(false);
    // Clear the "applied" banner after 4s
    setTimeout(() => setPlaybookApplied(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Success banner */}
      {playbookApplied && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/25 text-[12px] text-[#22C55E] font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Playbook applied — {PLAYBOOKS.find((p) => p.id === playbookApplied)?.actions.length ?? 0} actions added to your list
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
          {(["ALL", "OPEN", "IN_PROGRESS", "DISMISSED", "DONE"] as const).map((s) => {
            const count = s === "ALL" ? actions.length : actions.filter((a) => a.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                  statusFilter === s
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {s === "ALL" ? "All" : STATUS_LABEL[s]} <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setShowPlaybooks((x) => !x); setShowForm(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-all",
                showPlaybooks
                  ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                  : "text-[#7C3AED] border-[#7C3AED]/40 hover:bg-[#7C3AED]/10"
              )}
            >
              {showPlaybooks ? <X className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
              Playbooks
            </button>
            <button
              onClick={() => { setShowForm(true); setShowPlaybooks(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add Action
            </button>
          </div>
        )}
      </div>

      {/* Playbooks panel */}
      {showPlaybooks && (
        <div className="rounded-xl border border-[#7C3AED]/25 bg-[#7C3AED]/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#7C3AED]" />
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Action Playbooks</p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">Apply a pre-built set of best-practice actions in one click</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {PLAYBOOKS.map((pb) => (
              <PlaybookCard key={pb.id} playbook={pb} onApply={handleApplyPlaybook} />
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <CreateActionForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Actions list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle2 className="h-10 w-10 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">No actions here</p>
          {canEdit && (
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Click "Add Action" to create one or try a Playbook</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              canEdit={canEdit}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
