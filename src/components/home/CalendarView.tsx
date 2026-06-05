"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";
import type { CalendarItem } from "@/app/api/calendar/route";
import { DayDetailPanel } from "./DayDetailPanel";

// ─── Type colour tokens ───────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  action:         "#0755E9",
  qbr:            "#A855F7",
  renewal:        "#F59E0B",
  signal:         "#EF4444",
  touchpoint:     "#14B8A6",
  pulse:          "#7C3AED",
  recommendation: "#22C55E",
};

const TYPE_LABEL: Record<string, string> = {
  action: "Action", qbr: "QBR", renewal: "Renewal", signal: "Signal",
  touchpoint: "Touchpoint", pulse: "AI Pulse", recommendation: "Recommendation",
};

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Build calendar grid ──────────────────────────────────────────────────────
function buildGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // shift to Mon start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_LABELS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Day Cell ─────────────────────────────────────────────────────────────────
function DayCell({
  date, items, isToday, isOtherMonth, isSelected, onClick,
}: {
  date: Date | null;
  items: CalendarItem[];
  isToday: boolean;
  isOtherMonth: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  if (!date) {
    return <div className="h-24 rounded-lg bg-[var(--bg-surface-2)] opacity-30" />;
  }

  const visible  = items.slice(0, 3);
  const overflow = items.length - 3;

  return (
    <button
      onClick={onClick}
      className={cn(
        "h-24 rounded-xl p-2 text-left transition-all border",
        "flex flex-col gap-1 w-full",
        isSelected
          ? "border-[#0755E9] bg-[#0755E9]/8 shadow-sm"
          : isToday
          ? "border-[#0755E9]/40 bg-[#0755E9]/5"
          : "border-[var(--border-subtle)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-2)]",
        isOtherMonth && "opacity-40",
      )}
    >
      {/* Date number */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[12px] font-semibold leading-none",
            isToday
              ? "h-5 w-5 rounded-full bg-[#0755E9] text-white flex items-center justify-center text-[11px]"
              : "text-[var(--text-primary)]",
          )}
        >
          {date.getDate()}
        </span>
        {items.length > 0 && (
          <span className="text-[10px] text-[var(--text-disabled)]">{items.length}</span>
        )}
      </div>

      {/* Chips */}
      <div className="flex-1 space-y-0.5 overflow-hidden">
        {visible.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate"
            style={{
              color:      TYPE_COLOR[item.type] ?? "#6B7280",
              background: `${TYPE_COLOR[item.type] ?? "#6B7280"}15`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: TYPE_COLOR[item.type] ?? "#6B7280" }}
            />
            <span className="truncate">{item.title}</span>
          </div>
        ))}
        {overflow > 0 && (
          <p className="text-[10px] text-[var(--text-disabled)] pl-1">+{overflow} more</p>
        )}
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function CalendarView({ onItemUpdated }: { onItemUpdated?: () => void }) {
  const { role, userId } = useRole();
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [grouped, setGrouped] = useState<Record<string, CalendarItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    // Extend range to cover padding days shown in grid
    const from = new Date(firstDay);
    from.setDate(from.getDate() - 6);
    const to = new Date(lastDay);
    to.setDate(to.getDate() + 6);

    try {
      const headers: Record<string, string> = { "x-role": role };
      if (userId) headers["x-user-id"] = userId;
      const res  = await fetch(
        `/api/calendar?from=${toDateKey(from)}&to=${toDateKey(to)}`,
        { headers },
      );
      const json = await res.json();
      setGrouped(json.data ?? {});
    } catch (err) {
      console.error("[calendar] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [year, month, role]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    setSelectedDate(null);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(toDateKey(today));
  };

  const weeks = buildGrid(year, month);
  const todayKey = toDateKey(today);

  const selectedItems = selectedDate ? (grouped[selectedDate] ?? []) : [];

  return (
    <div className="flex gap-4 min-h-0">
      {/* ── Calendar grid ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-[var(--text-primary)]">
            {MONTH_NAMES[month]} {year}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={goToday}
              className="px-2.5 py-1 text-[11px] font-medium text-[#0755E9] border border-[#0755E9]/30 rounded-lg hover:bg-[#0755E9]/8 transition-colors"
            >
              Today
            </button>
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] text-[var(--text-muted)] transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] text-[var(--text-muted)] transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(TYPE_COLOR).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {TYPE_LABEL[type]}
            </span>
          ))}
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-[var(--text-muted)] text-center py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-[var(--bg-surface-2)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((date, di) => {
                  const key = date ? toDateKey(date) : null;
                  const items = key ? (grouped[key] ?? []) : [];
                  const isOtherMonth = date ? date.getMonth() !== month : false;
                  return (
                    <DayCell
                      key={di}
                      date={date}
                      items={items}
                      isToday={key === todayKey}
                      isOtherMonth={isOtherMonth}
                      isSelected={key === selectedDate}
                      onClick={() => key && setSelectedDate(key === selectedDate ? null : key)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Day detail panel ──────────────────────────────────────────────── */}
      {selectedDate && (
        <DayDetailPanel
          date={selectedDate}
          items={selectedItems}
          onClose={() => setSelectedDate(null)}
          onItemUpdated={() => { fetchCalendar(); onItemUpdated?.(); }}
        />
      )}

      {/* ── Empty state when no date selected ────────────────────────────── */}
      {!selectedDate && !loading && (
        <div className="w-72 shrink-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-6 flex flex-col items-center justify-center text-center">
          <Calendar className="h-10 w-10 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Select a day</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Click any date to see actions, signals, renewals, and meetings</p>
        </div>
      )}
    </div>
  );
}
