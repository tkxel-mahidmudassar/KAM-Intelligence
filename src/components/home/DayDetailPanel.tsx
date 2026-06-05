"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  X, Activity, Calendar, Clock, ArrowUpRight,
  CheckCircle2, AlertTriangle, RefreshCw, Zap, Lightbulb, BookOpen, Brain,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/app/api/calendar/route";
import { ActionDetailModal } from "./ActionDetailModal";
import { SignalReviewModal } from "./SignalReviewModal";

const TYPE_COLOR: Record<string, string> = {
  action:         "#0755E9",
  qbr:            "#A855F7",
  renewal:        "#F59E0B",
  signal:         "#EF4444",
  touchpoint:     "#14B8A6",
  pulse:          "#7C3AED",
  recommendation: "#22C55E",
};

const TYPE_ICON: Record<string, React.ElementType> = {
  action:         CheckCircle2,
  qbr:            Calendar,
  renewal:        RefreshCw,
  signal:         AlertTriangle,
  touchpoint:     Activity,
  pulse:          Zap,
  recommendation: Lightbulb,
};

const TYPE_LABEL: Record<string, string> = {
  action: "Action", qbr: "QBR", renewal: "Renewal", signal: "Signal",
  touchpoint: "Touchpoint", pulse: "AI Pulse", recommendation: "Recommendation",
};

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fullDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Drum-roll date scroller ──────────────────────────────────────────────────

function DrumRoll({
  date,
  allGrouped,
  onDateChange,
}: {
  date: string;
  allGrouped: Record<string, CalendarItem[]>;
  onDateChange: (d: string) => void;
}) {
  const [sliding, setSliding] = useState<"up" | "down" | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = parseLocalDate(date);
  const prev = new Date(current); prev.setDate(prev.getDate() - 1);
  const next = new Date(current); next.setDate(next.getDate() + 1);
  const prevKey = toDateKey(prev);
  const nextKey = toDateKey(next);
  const prevCount = (allGrouped[prevKey] ?? []).length;
  const currCount = (allGrouped[date]   ?? []).length;
  const nextCount = (allGrouped[nextKey] ?? []).length;

  const go = (dir: "prev" | "next") => {
    if (sliding) return;
    setSliding(dir === "prev" ? "up" : "down");
    timeoutRef.current = setTimeout(() => {
      onDateChange(dir === "prev" ? prevKey : nextKey);
      setSliding(null);
    }, 180);
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const rows = [
    { key: prevKey, date: prev, count: prevCount, slot: "prev" as const },
    { key: date,    date: current, count: currCount,  slot: "curr" as const },
    { key: nextKey, date: next, count: nextCount, slot: "next" as const },
  ];

  return (
    <div
      className="relative shrink-0 overflow-hidden select-none"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
        maskImage:       "linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)",
      }}
    >
      {/* Drum slots */}
      <div
        className="transition-transform"
        style={{
          transform: sliding === "up" ? "translateY(33.33%)" : sliding === "down" ? "translateY(-33.33%)" : "translateY(0)",
          transitionDuration: sliding ? "180ms" : "0ms",
          transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {rows.map(({ key, date: d, count, slot }) => (
          <button
            key={key}
            onClick={() => slot === "prev" ? go("prev") : slot === "next" ? go("next") : undefined}
            disabled={slot === "curr"}
            className={cn(
              "w-full flex items-center justify-center gap-2.5 py-2.5 px-4 transition-colors",
              slot === "curr"
                ? "cursor-default"
                : "cursor-pointer hover:bg-[var(--bg-surface-2)]",
            )}
          >
            {slot === "prev" && <ChevronUp className="h-3 w-3 text-[var(--text-disabled)] shrink-0" />}

            <span
              className={cn(
                "font-semibold transition-all",
                slot === "curr"
                  ? "text-[13px] text-[var(--text-primary)]"
                  : "text-[11px] text-[var(--text-disabled)]",
              )}
            >
              {slot === "curr" ? fullDate(d) : shortDate(d)}
            </span>

            {count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-semibold num-mono",
                  slot === "curr"
                    ? "text-[10px] bg-[#0755E9] text-white"
                    : "text-[9px] bg-[var(--bg-surface-3)] text-[var(--text-muted)]",
                )}
              >
                {count}
              </span>
            )}

            {slot === "next" && <ChevronDown className="h-3 w-3 text-[var(--text-disabled)] shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, onSelect }: { item: CalendarItem; onSelect: (item: CalendarItem) => void }) {
  const color     = TYPE_COLOR[item.type] ?? "#6B7280";
  const Icon      = TYPE_ICON[item.type] ?? Zap;
  const isClickable = item.type === "action" || item.type === "signal";
  const isPlaybook  = item.type === "recommendation" && item.sourceType === "PLAYBOOK";
  const href        = item.href ?? `/accounts/${item.accountId}`;

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
      <div
        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}18` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">{item.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color, background: `${color}15` }}>
            {TYPE_LABEL[item.type]}
          </span>
          {item.severity && <span className="text-[10px] text-[var(--text-muted)]">{item.severity}</span>}
          {item.priority && <span className="text-[10px] text-[var(--text-muted)]">{item.priority}</span>}
          {item.status   && <span className="text-[10px] text-[var(--text-muted)]">{item.status}</span>}
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
        {item.type === "recommendation" && (
          <div className="mt-1">
            {isPlaybook ? (
              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium border border-[#0755E9]/25 text-[#0755E9]" style={{ background: "rgba(7,85,233,0.07)" }}>
                <BookOpen className="h-2.5 w-2.5" />{item.citation ?? "Playbook-guided"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium border border-[#6B7280]/25 text-[var(--text-muted)]" style={{ background: "rgba(107,114,128,0.07)" }}>
                <Brain className="h-2.5 w-2.5" />AI fallback
              </span>
            )}
          </div>
        )}
      </div>

      {!isClickable && (
        <Link href={href} className="shrink-0 p-1 rounded text-[var(--text-disabled)] hover:text-[var(--text-primary)] transition-colors" title="Open account">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface DayDetailPanelProps {
  date: string;
  items: CalendarItem[];
  allGrouped: Record<string, CalendarItem[]>;
  onClose: () => void;
  onItemUpdated: () => void;
  onDateChange: (d: string) => void;
}

export function DayDetailPanel({ date, items, allGrouped, onClose, onItemUpdated, onDateChange }: DayDetailPanelProps) {
  const [activeAction, setActiveAction] = useState<CalendarItem | null>(null);
  const [activeSignal, setActiveSignal] = useState<CalendarItem | null>(null);

  const grouped  = items.reduce<Record<string, CalendarItem[]>>((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {});

  const typeOrder = ["signal", "recommendation", "pulse", "renewal", "action", "qbr", "touchpoint"];

  const handleSelect = (item: CalendarItem) => {
    if (item.type === "action") setActiveAction(item);
    if (item.type === "signal") setActiveSignal(item);
  };

  return (
    <>
      <div className="w-80 shrink-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] flex flex-col overflow-hidden">
        {/* Close button */}
        <div className="flex items-center justify-end px-3 pt-2 shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drum-roll date scroller */}
        <DrumRoll date={date} allGrouped={allGrouped} onDateChange={onDateChange} />

        {/* Items count */}
        <div className="px-4 py-2 shrink-0">
          <p className="text-[11px] text-[var(--text-muted)]">
            {items.length === 0 ? "Nothing scheduled" : `${items.length} item${items.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="h-8 w-8 text-[var(--text-disabled)] mb-2" />
              <p className="text-[12px] text-[var(--text-muted)]">Nothing scheduled for this day</p>
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

      {activeAction && (
        <ActionDetailModal item={activeAction} onClose={() => setActiveAction(null)} onUpdated={() => { setActiveAction(null); onItemUpdated(); }} />
      )}
      {activeSignal && (
        <SignalReviewModal item={activeSignal} onClose={() => setActiveSignal(null)} onUpdated={() => { setActiveSignal(null); onItemUpdated(); }} />
      )}
    </>
  );
}
