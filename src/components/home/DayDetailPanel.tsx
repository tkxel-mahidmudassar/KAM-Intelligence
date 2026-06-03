"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X, Activity, Calendar, Clock, ArrowUpRight,
  CheckCircle2, AlertTriangle, RefreshCw, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/app/api/calendar/route";
import { ActionDetailModal } from "./ActionDetailModal";
import { SignalReviewModal } from "./SignalReviewModal";

const TYPE_COLOR: Record<string, string> = {
  action:     "#0755E9",
  qbr:        "#A855F7",
  renewal:    "#F59E0B",
  signal:     "#EF4444",
  touchpoint: "#14B8A6",
  pulse:      "#7C3AED",
};

const TYPE_ICON: Record<string, React.ElementType> = {
  action:     CheckCircle2,
  qbr:        Calendar,
  renewal:    RefreshCw,
  signal:     AlertTriangle,
  touchpoint: Activity,
  pulse:      Zap,
};

const TYPE_LABEL: Record<string, string> = {
  action: "Action", qbr: "QBR", renewal: "Renewal", signal: "Signal", touchpoint: "Touchpoint", pulse: "AI Pulse",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function ItemRow({
  item, onSelect,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
}) {
  const color = TYPE_COLOR[item.type] ?? "#6B7280";
  const Icon  = TYPE_ICON[item.type] ?? Zap;

  const isClickable = item.type === "action" || item.type === "signal";
  const href = item.href ?? `/accounts/${item.accountId}`;

  return (
    <div
      role={isClickable ? "button" : undefined}
      onClick={isClickable ? () => onSelect(item) : undefined}
      className={cn(
        "flex items-start gap-3 p-3 rounded-xl border border-[var(--border-subtle)] transition-all",
        isClickable
          ? "cursor-pointer hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-2)]"
          : "bg-[var(--bg-surface-2)]",
      )}
    >
      {/* Icon */}
      <div
        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}18` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ color, background: `${color}15` }}
          >
            {TYPE_LABEL[item.type]}
          </span>
          {item.severity && (
            <span className="text-[10px] text-[var(--text-muted)]">{item.severity}</span>
          )}
          {item.priority && (
            <span className="text-[10px] text-[var(--text-muted)]">{item.priority}</span>
          )}
          {item.status && (
            <span className="text-[10px] text-[var(--text-muted)]">{item.status}</span>
          )}
        </div>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-[#0755E9] hover:underline mt-0.5 block truncate"
        >
          {item.accountName}
        </Link>
        {item.summary && (
          <p className="mt-1 text-[10px] text-[var(--text-muted)] line-clamp-2">{item.summary}</p>
        )}
      </div>

      {/* Arrow for non-modal items */}
      {!isClickable && (
        <Link
          href={href}
          className="shrink-0 p-1 rounded text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors"
          title="Open account"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

interface DayDetailPanelProps {
  date: string;
  items: CalendarItem[];
  onClose: () => void;
  onItemUpdated: () => void;
}

export function DayDetailPanel({ date, items, onClose, onItemUpdated }: DayDetailPanelProps) {
  const [activeAction, setActiveAction] = useState<CalendarItem | null>(null);
  const [activeSignal, setActiveSignal] = useState<CalendarItem | null>(null);

  const grouped = items.reduce<Record<string, CalendarItem[]>>((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  const typeOrder = ["signal", "pulse", "renewal", "action", "qbr", "touchpoint"];

  const handleSelect = (item: CalendarItem) => {
    if (item.type === "action") setActiveAction(item);
    if (item.type === "signal") setActiveSignal(item);
  };

  return (
    <>
      <div className="w-80 shrink-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <p className="text-[13px] font-bold text-[var(--text-primary)]">{formatDate(date)}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="h-8 w-8 text-[var(--text-disabled)] mb-2" />
              <p className="text-[12px] text-[var(--text-muted)]">Nothing scheduled</p>
            </div>
          ) : (
            typeOrder
              .filter((t) => grouped[t]?.length)
              .map((type) => (
                <div key={type}>
                  <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1">
                    {TYPE_LABEL[type]}s
                  </p>
                  <div className="space-y-1.5">
                    {grouped[type].map((item) => (
                      <ItemRow key={item.id} item={item} onSelect={handleSelect} />
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Item modals */}
      {activeAction && (
        <ActionDetailModal
          item={activeAction}
          onClose={() => setActiveAction(null)}
          onUpdated={() => { setActiveAction(null); onItemUpdated(); }}
        />
      )}
      {activeSignal && (
        <SignalReviewModal
          item={activeSignal}
          onClose={() => setActiveSignal(null)}
          onUpdated={() => { setActiveSignal(null); onItemUpdated(); }}
        />
      )}
    </>
  );
}
