"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ChevronRight, CheckCircle2, AlertTriangle, User, Calendar, Building2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import type { CalendarItem } from "@/app/api/calendar/route";

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#6B7280", MEDIUM: "#F59E0B", HIGH: "#EF4444", CRITICAL: "#7C3AED",
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress", DONE: "Done", DISMISSED: "Dismissed",
};

interface ActionDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  owner: { name: string } | null;
  account: { id: string; name: string } | null;
}

interface ActionDetailModalProps {
  item: CalendarItem;
  onClose: () => void;
  onUpdated: () => void;
}

export function ActionDetailModal({ item, onClose, onUpdated }: ActionDetailModalProps) {
  const { role } = useRole();
  const canEdit = role === "KAM" || role === "MANAGER";

  const [action, setAction]   = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote]       = useState("");
  const [saving, setSaving]   = useState(false);

  // Fetch full action on mount
  useState(() => {
    fetch(`/api/actions/${item.id}`, { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setAction(j.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false));
  });

  const advance = async (newStatus: string) => {
    setSaving(true);
    try {
      const body: Record<string, string> = { status: newStatus };
      if (note.trim()) body.completionNote = note.trim();
      const res  = await fetch(`/api/actions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify(body),
      });
      if (res.ok) onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const nextStatus: Record<string, string> = {
    OPEN: "IN_PROGRESS", IN_PROGRESS: "DONE",
  };
  const next = action ? nextStatus[action.status] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] font-bold text-[var(--text-primary)] leading-snug flex-1">
            {loading ? "Loading…" : action?.title ?? item.title}
          </p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!loading && action && (
          <>
            {/* Meta */}
            <div className="flex flex-wrap gap-2">
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: PRIORITY_COLOR[action.priority], background: `${PRIORITY_COLOR[action.priority]}18` }}
              >
                {action.priority}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-surface-2)] text-[var(--text-muted)]">
                {STATUS_LABEL[action.status] ?? action.status}
              </span>
              {action.dueDate && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <Calendar className="h-3 w-3" />
                  {new Date(action.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              )}
              {action.owner && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                  <User className="h-3 w-3" /> {action.owner.name}
                </span>
              )}
            </div>

            {/* Description */}
            {action.description && (
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                {action.description}
              </p>
            )}

            {/* Account link */}
            <Link
              href={`/accounts/${item.accountId}`}
              onClick={onClose}
              className="flex items-center gap-1.5 text-[11px] text-[#0755E9] hover:underline"
            >
              <Building2 className="h-3 w-3" /> {item.accountName}
            </Link>

            {/* Note input (for completion) */}
            {canEdit && action.status !== "DONE" && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                  <MessageSquare className="h-3 w-3" /> Completion note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="What was the outcome?"
                  className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9] resize-none"
                />
              </div>
            )}

            {/* Actions */}
            {canEdit && (
              <div className="flex items-center gap-2">
                {next && (
                  <button
                    onClick={() => advance(next)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    {saving ? "Updating…" : `Mark ${STATUS_LABEL[next]}`}
                  </button>
                )}
                {action.status !== "DISMISSED" && action.status !== "DONE" && (
                  <button
                    onClick={() => advance("DISMISSED")}
                    disabled={saving}
                    className="px-3 py-2 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:border-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/5 disabled:opacity-50 transition-all"
                  >
                    Dismiss
                  </button>
                )}
                {action.status === "DONE" && (
                  <span className="flex items-center gap-1.5 text-[12px] text-[#22C55E] font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Completed
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
