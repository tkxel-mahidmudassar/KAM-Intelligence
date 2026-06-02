"use client";

import { useEffect, useState } from "react";
import { Calendar, CheckSquare, ChevronDown, ChevronUp, Sparkles, Users, Filter } from "lucide-react";
import Link from "next/link";
import { useRole } from "@/context/RoleContext";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

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
  attendees: string | null;   // stored as JSON string
  aiSummary: string | null;
  items: QbrItem[];
  account: {
    id: string;
    name: string;
    health: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: "neutral" | "brand" | "healthy" | "at-risk" }> = {
  PLANNED:   { label: "Planned",   variant: "neutral" },
  SCHEDULED: { label: "Scheduled", variant: "brand"   },
  COMPLETED: { label: "Completed", variant: "healthy" },
  CANCELLED: { label: "Cancelled", variant: "at-risk" },
};

const HEALTH_VARIANT: Record<string, "healthy" | "at-risk" | "critical"> = {
  HEALTHY: "healthy", AT_RISK: "at-risk", CRITICAL: "critical",
};

const ITEM_STATUS_COLOR: Record<string, string> = {
  OPEN: "#6B7280", IN_PROGRESS: "#0755E9", DONE: "#22C55E", DEFERRED: "#F59E0B",
};

function typeLabel(type: string) {
  const m: Record<string, string> = { QBR: "QBR", DBR: "DBR", EBR: "EBR", KICKOFF: "Kickoff", ADHOC: "Ad-hoc" };
  return m[type] ?? type;
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function parseAttendees(raw: string | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  try { return JSON.parse(raw); } catch { return []; }
}

function SessionCard({ session }: { session: QbrSession }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.PLANNED;
  const healthVariant = HEALTH_VARIANT[session.account.health] ?? "neutral";
  const date = session.conductedAt ?? session.scheduledAt;
  const attendees = parseAttendees(session.attendees);
  const doneItems = session.items.filter((i) => i.status === "DONE" || i.status === "resolved").length;

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-[var(--bg-surface-2)] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{session.title}</h3>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            <Badge variant="neutral">{typeLabel(session.type)}</Badge>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[12px] text-[var(--text-muted)]">
            {date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            <Link href={`/accounts/${session.account.id}`} onClick={(e) => e.stopPropagation()}>
              <Badge variant={healthVariant} className="hover:opacity-80 cursor-pointer">
                {session.account.name}
              </Badge>
            </Link>
            {attendees.length > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {attendees.length}
              </span>
            )}
            {session.items.length > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" />
                {doneItems}/{session.items.length} items
              </span>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
          : <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-4">
          {session.aiSummary && (
            <div className="rounded-lg border border-[#0755E9]/20 bg-[#0755E9]/5 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#0755E9]" />
                <span className="text-[11px] font-semibold text-[#0755E9] uppercase tracking-wider">AI Summary</span>
              </div>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{session.aiSummary}</p>
            </div>
          )}
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
          {session.items.length > 0 && (
            <div>
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Agenda Items</p>
              <div className="space-y-2">
                {session.items.map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5 py-1.5">
                    <div
                      className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 border-2"
                      style={{
                        borderColor: ITEM_STATUS_COLOR[item.status ?? ""] ?? "#6B7280",
                        background: (item.status === "DONE" || item.status === "resolved")
                          ? (ITEM_STATUS_COLOR[item.status ?? ""] ?? "#22C55E")
                          : "transparent",
                      }}
                    />
                    <div className="min-w-0">
                      <p className={cn(
                        "text-[12px] font-medium",
                        (item.status === "DONE" || item.status === "resolved") ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
                      )}>
                        {item.title}
                      </p>
                      {item.content && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.content}</p>
                      )}
                      {item.category && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="neutral" className="text-[10px]">{item.category}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QBRPage() {
  const { role } = useRole();
  const [sessions, setSessions] = useState<QbrSession[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<string>("ALL");

  useEffect(() => {
    setLoading(true);
    fetch("/api/qbr", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setSessions(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [role]);

  const statuses = ["ALL", "SCHEDULED", "COMPLETED", "PLANNED"];
  const filtered = filter === "ALL" ? sessions : sessions.filter((s) => s.status === filter);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">QBR / DBR</h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
          Quarterly and daily business reviews across your portfolio
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
        {statuses.map((s) => {
          const count = s === "ALL" ? sessions.length : sessions.filter((x) => x.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1 rounded-lg text-[12px] font-medium transition-all border",
                filter === s
                  ? "bg-[#0755E9] text-white border-transparent"
                  : "bg-transparent text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
              )}
            >
              {s === "ALL" ? `All (${count})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${count})`}
            </button>
          );
        })}
      </div>

      {/* Sessions */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-[80px]" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Calendar className="h-12 w-12 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">No sessions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
    </div>
  );
}
