"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, Clock, ListChecks, X } from "lucide-react";
import { money, workspaceAccounts, workspaceActionItems, type WorkspaceActionItem, type WorkspaceHealth } from "@/lib/v2/workspaceData";

type CalendarView = "month" | "timeline";
type ActionStatus = "done" | "dismissed";

const healthLabels: Record<WorkspaceHealth, string> = {
  healthy: "Healthy accounts",
  "at-risk": "At risk accounts",
  critical: "Critical accounts",
};

const healthTone: Record<WorkspaceHealth, string> = {
  healthy: "border-[#BFD9C6] bg-[#F5FBF5] text-[#1F6C42]",
  "at-risk": "border-[#E8C88D] bg-[#FFF8EA] text-[#A36313]",
  critical: "border-[#EAB3A9] bg-[#FFF1EE] text-[#A63F33]",
};

const taskTypeTone: Record<WorkspaceActionItem["type"], string> = {
  "To-do": "border-[#B9CCE9] bg-[#F0F6FF] text-[#245D9A]",
  Meeting: "border-[#BFD9C6] bg-[#F3FAF2] text-[#1F6C42]",
  QBR: "border-[#E5C57D] bg-[#FFF7E2] text-[#8A5C16]",
};

const statusTone: Record<WorkspaceActionItem["status"], string> = {
  pending: "border-[#D8CAB9] bg-[#FFFCF6] text-[#6F6254]",
  done: "border-[#BFD9C6] bg-[#F3FAF2] text-[#1F6C42]",
  dismissed: "border-[#EAB3A9] bg-[#FFF1EE] text-[#A63F33]",
};

function isoDate(day: number) {
  return `2026-06-${String(day).padStart(2, "0")}`;
}

function displayDate(date: string) {
  const [, month, day] = date.split("-");
  return `${month === "06" ? "Jun" : month} ${Number(day)}`;
}

function reasonPlaceholder(status: ActionStatus) {
  return status === "done" ? "Reason this item is being marked done" : "Reason this item is being dismissed";
}

export function HomePage() {
  const [calendarView, setCalendarView] = useState<CalendarView>("timeline");
  const [expandedHealth, setExpandedHealth] = useState<WorkspaceHealth | "renewals" | null>(null);
  const [selectedDate, setSelectedDate] = useState("2026-06-08");
  const [items, setItems] = useState<WorkspaceActionItem[]>(workspaceActionItems);
  const [reasonTarget, setReasonTarget] = useState<{ id: string; status: ActionStatus } | null>(null);
  const [reason, setReason] = useState("");

  const groupedByDate = useMemo(() => {
    return items.reduce<Record<string, WorkspaceActionItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [items]);

  const healthStats = useMemo(() => {
    return (["healthy", "at-risk", "critical"] as WorkspaceHealth[]).map((health) => {
      const accounts = workspaceAccounts.filter((account) => account.health === health);
      const arr = accounts.reduce((sum, account) => sum + account.arr, 0);
      return { health, accounts, arr };
    });
  }, []);

  const renewalSoon = workspaceAccounts.filter((account) => account.renewalDays < 90);
  const selectedItems = groupedByDate[selectedDate] || [];

  function submitReason() {
    if (!reasonTarget || !reason.trim()) return;
    setItems((current) =>
      current.map((item) =>
        item.id === reasonTarget.id
          ? {
              ...item,
              status: reasonTarget.status,
            }
          : item,
      ),
    );
    setReasonTarget(null);
    setReason("");
  }

  return (
    <main className="min-h-screen px-5 py-5">
      <section className="mx-auto max-w-[1500px] space-y-5">
        <div className="rounded-[34px] border border-[#E4D5C4] bg-[#FFF8ED] p-5 shadow-[0_24px_70px_-56px_rgba(32,38,32,0.6)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[clamp(44px,7vw,86px)] font-black leading-none tracking-[-0.06em] text-[#1F2722]">Home</h1>
            </div>
            <div className="rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] px-4 py-3 text-right">
              <p className="text-[13px] font-bold text-[#75685A]">Open actions</p>
              <p className="text-3xl font-black tracking-[-0.04em] text-[#1F2722]">{items.filter((item) => item.status === "pending").length}</p>
            </div>
          </div>

          <div className="relative mt-5 grid gap-3 overflow-visible lg:grid-cols-4">
            {healthStats.map((stat) => (
              <button
                key={stat.health}
                type="button"
                onClick={() => setExpandedHealth(expandedHealth === stat.health ? null : stat.health)}
                className={`relative min-h-52 overflow-visible rounded-3xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${healthTone[stat.health]} ${
                  expandedHealth === stat.health ? "z-20 -translate-y-1 scale-[1.015] shadow-[0_24px_54px_-30px_rgba(31,39,34,0.42)]" : "z-0"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[16px] font-black">{healthLabels[stat.health]}</p>
                  <ChevronDown className={`h-4 w-4 transition ${expandedHealth === stat.health ? "rotate-180" : ""}`} />
                </div>
                <p className="mt-3 text-4xl font-black tracking-[-0.05em]">{stat.accounts.length}</p>
                {expandedHealth === stat.health ? (
                  <div className="absolute inset-x-3 top-[6.75rem] rounded-3xl border border-white/80 bg-[rgba(255,252,246,0.92)] p-3 shadow-[0_24px_56px_-34px_rgba(31,39,34,0.48)] [backdrop-filter:blur(16px)]">
                    <div className="space-y-2">
                    {stat.accounts.slice(0, 5).map((account) => (
                      <div key={account.id} className="flex items-center justify-between rounded-2xl bg-white/66 px-3 py-2 text-[12px] font-bold">
                        <span>{account.name}</span>
                        <span>{account.score}/100</span>
                      </div>
                    ))}
                    </div>
                    <p className="text-[12px] font-bold opacity-75">{money(stat.arr)} ARR</p>
                  </div>
                ) : null}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setExpandedHealth(expandedHealth === "renewals" ? null : "renewals")}
              className={`relative min-h-52 overflow-visible rounded-3xl border border-[#D7C6B4] bg-[#FFFCF6] p-4 text-left text-[#25352E] transition-all duration-200 hover:-translate-y-0.5 ${
                expandedHealth === "renewals" ? "z-20 -translate-y-1 scale-[1.015] shadow-[0_24px_54px_-30px_rgba(31,39,34,0.42)]" : "z-0"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[16px] font-black">Renewals under 90d</p>
                <ChevronDown className={`h-4 w-4 transition ${expandedHealth === "renewals" ? "rotate-180" : ""}`} />
              </div>
              <p className="mt-3 text-4xl font-black tracking-[-0.05em]">{renewalSoon.length}</p>
              {expandedHealth === "renewals" ? (
                <div className="absolute inset-x-3 top-[6.75rem] space-y-2 rounded-3xl border border-white/80 bg-[rgba(255,252,246,0.92)] p-3 shadow-[0_24px_56px_-34px_rgba(31,39,34,0.48)] [backdrop-filter:blur(16px)]">
                  {renewalSoon.map((account) => (
                    <div key={account.id} className="flex items-center justify-between rounded-2xl bg-[#F7F1E7] px-3 py-2 text-[12px] font-bold">
                      <span>{account.name}</span>
                      <span>{account.renewalDays}d</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </button>
          </div>
        </div>

        <section className="rounded-[30px] border border-[#E1D3C2] bg-[#FFFCF6] p-4 shadow-[0_24px_70px_-58px_rgba(32,38,32,0.65)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#25352E]" />
              <h2 className="text-xl font-black tracking-[-0.03em] text-[#25352E]">Calendar</h2>
            </div>
            <div className="inline-flex rounded-full border border-[#E1D3C2] bg-[#F8F0E6] p-1">
              {(["month", "timeline"] as CalendarView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCalendarView(view)}
                  className={`rounded-full px-4 py-2 text-[13px] font-black ${calendarView === view ? "bg-[#25352E] text-[#FFF9EF]" : "text-[#6F6254]"}`}
                >
                  {view === "month" ? "Month" : "Timeline"}
                </button>
              ))}
            </div>
          </div>

          {calendarView === "month" ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="grid grid-cols-7 overflow-hidden rounded-3xl border border-[#E1D3C2] bg-[#FFF8ED]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <div key={day} className="border-b border-[#E1D3C2] px-3 py-2 text-[12px] font-black text-[#827365]">
                    {day}
                  </div>
                ))}
                {Array.from({ length: 30 }, (_, index) => {
                  const day = index + 1;
                  const date = isoDate(day);
                  const dayItems = groupedByDate[date] || [];
                  const active = selectedDate === date;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`min-h-28 border-b border-r border-[#E9DECF] p-2 text-left transition hover:bg-[#F5EBDD] ${active ? "bg-[#EAF2E7]" : "bg-[#FFFCF6]"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-black ${active ? "bg-[#25352E] text-[#FFF9EF]" : "text-[#25352E]"}`}>{day}</span>
                        {dayItems.length ? <span className="text-[11px] font-black text-[#8C7B69]">{dayItems.length}</span> : null}
                      </div>
                      <div className="mt-2 space-y-1">
                        {dayItems.slice(0, 2).map((item) => (
                          <p key={item.id} className="truncate rounded-full bg-[#F1E7D9] px-2 py-1 text-[11px] font-bold text-[#25352E]">
                            {item.title}
                          </p>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <DayPanel date={selectedDate} items={selectedItems} onAction={(id, status) => setReasonTarget({ id, status })} />
            </div>
          ) : (
            <div className="relative mt-5 overflow-hidden rounded-[28px] border border-[#E1D3C2] bg-[linear-gradient(135deg,#FFF9EF_0%,#F8EFE2_48%,#EEF6EE_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="grid gap-4 lg:grid-cols-3">
                {["2026-06-08", "2026-06-09", "2026-06-10"].map((date, index) => {
                  const dayItems = groupedByDate[date] || [];
                  const doneCount = dayItems.filter((item) => item.status === "done").length;
                  const pendingCount = dayItems.filter((item) => item.status === "pending").length;
                  return (
                    <section key={date} className="relative flex min-h-[22rem] flex-col rounded-[26px] border border-[#D8CAB9] bg-[rgba(255,252,246,0.84)] p-4 shadow-[0_22px_52px_-38px_rgba(31,39,34,0.56)] [backdrop-filter:blur(14px)]">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[20px] font-black tracking-[-0.05em] text-[#25352E]">{displayDate(date)}</p>
                          <p className="mt-1 text-[12px] font-bold text-[#7D6E5F]">{pendingCount} pending · {doneCount} done</p>
                        </div>
                        <Clock className="h-4 w-4 text-[#827365]" />
                      </div>
                      <div className="flex flex-1 flex-col gap-3">
                        {dayItems.length ? (
                          dayItems.map((item) => (
                            <article key={item.id} className={`flex min-h-36 flex-col rounded-2xl border p-3 shadow-[0_14px_34px_-30px_rgba(31,39,34,0.58)] ${statusTone[item.status]}`}>
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => item.status === "pending" ? setReasonTarget({ id: item.id, status: "done" }) : undefined}
                                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                                    item.status === "done"
                                      ? "border-[#1F6C42] bg-[#1F6C42] text-[#FFF9EF]"
                                      : item.status === "dismissed"
                                        ? "border-[#A63F33] bg-[#FFF1EE] text-[#A63F33]"
                                        : "border-[#BCA994] bg-white/78 text-transparent hover:border-[#25352E] hover:text-[#25352E]"
                                  }`}
                                  aria-label={`Mark ${item.title} done`}
                                >
                                  {item.status === "done" ? <Check className="h-3.5 w-3.5" /> : item.status === "dismissed" ? <X className="h-3.5 w-3.5" /> : <Check className="h-3 w-3" />}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${taskTypeTone[item.type]}`}>{item.type}</span>
                                    <span className="text-[12px] font-black text-[#7D6E5F]">{item.accountName}</span>
                                  </div>
                                  <p className="mt-2 text-[14px] font-black leading-snug text-[#25352E]">{item.title}</p>
                                  <p className="mt-1 text-[12px] font-semibold leading-relaxed text-[#75685A]">{item.details}</p>
                                </div>
                              </div>
                              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                                <span className="rounded-full border border-[#D8CAB9] bg-white/58 px-2.5 py-1 text-[11px] font-black capitalize text-[#6F6254]">{item.status}</span>
                                {item.status === "pending" ? (
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => setReasonTarget({ id: item.id, status: "done" })} className="rounded-full bg-[#25352E] px-3 py-1.5 text-[12px] font-black text-[#FFF9EF]">
                                      Done
                                    </button>
                                    <button type="button" onClick={() => setReasonTarget({ id: item.id, status: "dismissed" })} className="rounded-full border border-[#D9C8B4] bg-white/56 px-3 py-1.5 text-[12px] font-black text-[#6F6254]">
                                      Dismiss
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </article>
                          ))
                        ) : (
                          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[#D8CAB9] bg-white/42 p-5 text-center">
                            <p className="text-[13px] font-bold text-[#75685A]">No actions scheduled.</p>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </section>

      {reasonTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1F2722]/24 p-4 [backdrop-filter:blur(8px)]">
          <div className="w-full max-w-md rounded-3xl border border-[#E1D3C2] bg-[#FFF9EF] p-4 shadow-[0_28px_80px_-46px_rgba(31,39,34,0.8)]">
            <div className="flex items-center justify-between">
              <p className="text-lg font-black text-[#25352E]">{reasonTarget.status === "done" ? "Mark done" : "Dismiss item"}</p>
              <button type="button" onClick={() => setReasonTarget(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#DED1C2]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonPlaceholder(reasonTarget.status)}
              className="mt-4 h-28 w-full resize-none rounded-2xl border border-[#D9C8B4] bg-[#FFFCF6] p-3 text-[14px] font-semibold outline-none focus:border-[#25352E]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setReasonTarget(null)} className="rounded-full border border-[#D9C8B4] px-4 py-2 text-[13px] font-black text-[#6F6254]">
                Cancel
              </button>
              <button
                type="button"
                disabled={!reason.trim()}
                onClick={submitReason}
                className="rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#AFA79C]"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function DayPanel({ date, items, onAction }: { date: string; items: WorkspaceActionItem[]; onAction: (id: string, status: ActionStatus) => void }) {
  return (
    <aside className="rounded-3xl border border-[#E1D3C2] bg-[#FFF8ED] p-4">
      <div className="flex items-center justify-between">
        <p className="text-lg font-black text-[#25352E]">{displayDate(date)}</p>
        <span className="rounded-full border border-[#D9C8B4] px-3 py-1 text-[12px] font-black text-[#6F6254]">{items.length} items</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[#E1D3C2] bg-[#FFFCF6] p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[#CDBDAA] px-2 py-1 text-[11px] font-black text-[#655848]">{item.type}</span>
                <span className="text-[12px] font-bold text-[#827365]">{item.accountName}</span>
              </div>
              <p className="mt-2 text-[14px] font-black text-[#25352E]">{item.title}</p>
              <p className="mt-1 text-[12px] font-semibold leading-relaxed text-[#75685A]">{item.details}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => onAction(item.id, "done")} className="rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-black text-[#FFF9EF]">
                  Done
                </button>
                <button type="button" onClick={() => onAction(item.id, "dismissed")} className="rounded-full border border-[#D9C8B4] px-3 py-2 text-[12px] font-black text-[#6F6254]">
                  Dismiss
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-[#D9C8B4] p-5 text-center">
            <ListChecks className="mx-auto h-5 w-5 text-[#8B7D6E]" />
            <p className="mt-2 text-[13px] font-bold text-[#75685A]">No actions scheduled.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
