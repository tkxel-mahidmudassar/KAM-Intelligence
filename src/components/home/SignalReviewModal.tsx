"use client";

import { useState } from "react";
import Link from "next/link";
import { X, AlertTriangle, CheckCircle2, Building2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import type { CalendarItem } from "@/app/api/calendar/route";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#EF4444", WARNING: "#F59E0B", INFO: "#0755E9",
};

interface SignalReviewModalProps {
  item: CalendarItem;
  onClose: () => void;
  onUpdated: () => void;
}

export function SignalReviewModal({ item, onClose, onUpdated }: SignalReviewModalProps) {
  const { role }    = useRole();
  const canEdit     = role === "KAM" || role === "MANAGER";
  const [note, setNote]     = useState("");
  const [saving, setSaving] = useState(false);

  const resolve = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/signals/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ isResolved: true, resolvedNote: note.trim() || null }),
      });
      if (res.ok) onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const color = SEVERITY_COLOR[item.severity ?? "INFO"] ?? "#6B7280";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${color}18` }}
            >
              <AlertTriangle className="h-4 w-4" style={{ color }} />
            </div>
            <div className="min-w-0">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ color, background: `${color}15` }}
              >
                {item.severity ?? "SIGNAL"}
              </span>
              <p className="text-[13px] font-bold text-[var(--text-primary)] leading-snug mt-0.5 line-clamp-2">
                {item.title}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Account */}
        <Link
          href={`/accounts/${item.accountId}`}
          onClick={onClose}
          className="flex items-center gap-1.5 text-[11px] text-[#0755E9] hover:underline"
        >
          <Building2 className="h-3 w-3" /> {item.accountName}
        </Link>

        {/* Detected date */}
        <p className="text-[11px] text-[var(--text-muted)]">
          Detected: {new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </p>

        {/* Resolution note */}
        {canEdit && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              <MessageSquare className="h-3 w-3" /> Resolution note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="How was this resolved?"
              className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#22C55E] resize-none"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={resolve}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#22C55E] rounded-lg hover:bg-[#16A34A] disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {saving ? "Resolving…" : "Mark Resolved"}
            </button>
          )}
          <Link
            href={`/accounts/${item.accountId}`}
            onClick={onClose}
            className="px-3 py-2 text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--bg-surface-2)] transition-colors"
          >
            Open Account
          </Link>
        </div>
      </div>
    </div>
  );
}
