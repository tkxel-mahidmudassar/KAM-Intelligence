"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Clock, ListChecks, X } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { readCachedApiAccounts, writeCachedApiAccounts, type CachedApiAccount } from "@/lib/v2/accountCache";
import { associatePortfolio, portfolioAccounts, type PortfolioAccount, type PortfolioHealth } from "@/lib/v2/portfolioData";
import { money, type WorkspaceAccount, type WorkspaceActionItem, type WorkspaceHealth } from "@/lib/v2/workspaceData";

type CalendarView = "month" | "timeline";
type ActionStatus = "done" | "dismissed";

type ApiAccount = {
  id: string;
  name?: string | null;
  industry?: string | null;
  country?: string | null;
  arr?: number | null;
  health?: "HEALTHY" | "AT_RISK" | "CRITICAL" | string | null;
  contractEnd?: string | null;
  kam?: { name?: string | null } | null;
  kamScores?: Array<{ overall?: number | null; computedAt?: string | null }>;
  signals?: Array<{ id?: string; title?: string | null; description?: string | null; severity?: string | null; detectedAt?: string | null }>;
  _count?: { actions?: number; documents?: number };
};

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  const [, month, day] = date.split("-");
  return `${month === "06" ? "Jun" : month} ${Number(day)}`;
}

function accountHealth(value?: string | null): WorkspaceHealth {
  if (value === "CRITICAL") return "critical";
  if (value === "AT_RISK") return "at-risk";
  return "healthy";
}

function portfolioHealth(value: PortfolioHealth): WorkspaceHealth {
  if (value === "CRITICAL") return "critical";
  if (value === "AT_RISK") return "at-risk";
  return "healthy";
}

function daysUntil(dateValue?: string | null) {
  if (!dateValue) return 180;
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 180;
  return Math.max(0, Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24)));
}

function accountScore(account: ApiAccount, health: WorkspaceHealth) {
  const latestScore = Number(account.kamScores?.[0]?.overall);
  if (Number.isFinite(latestScore)) return Math.round(latestScore);
  if (health === "critical") return 35;
  if (health === "at-risk") return 58;
  return 82;
}

function mapApiAccount(account: ApiAccount): WorkspaceAccount {
  const health = accountHealth(account.health);
  return {
    id: String(account.id),
    name: String(account.name ?? "Unnamed account"),
    industry: String(account.industry ?? "Industry not set"),
    country: String(account.country ?? "Country not set"),
    arr: Number(account.arr ?? 0),
    score: accountScore(account, health),
    health,
    renewalDays: daysUntil(account.contractEnd),
    owner: account.kam?.name ?? "Owner not set",
  };
}

function mapPortfolioAccount(account: PortfolioAccount): WorkspaceAccount {
  return {
    id: account.id,
    name: account.name,
    industry: account.industry,
    country: account.country,
    arr: account.arr,
    score: account.healthScore,
    health: portfolioHealth(account.health),
    renewalDays: account.renewalDays,
    owner: account.kamOwner,
  };
}

function buildVisibleAccounts(role: string, apiAccounts: ApiAccount[]) {
  const demoAccounts = (role === "ASSOCIATE" ? associatePortfolio : portfolioAccounts).map(mapPortfolioAccount);
  const demoNames = new Set(demoAccounts.map((account) => account.name.toLowerCase()));
  const persistedAccounts = apiAccounts
    .filter((account) => !String(account.id ?? "").startsWith("acc-"))
    .map(mapApiAccount)
    .filter((account) => !demoNames.has(account.name.toLowerCase()));

  return [...persistedAccounts, ...demoAccounts];
}

function applyHomeAccountsFromApi(
  role: string,
  apiAccounts: ApiAccount[],
  setAccounts: (accounts: WorkspaceAccount[]) => void,
  setItems: (items: WorkspaceActionItem[]) => void,
) {
  const mappedAccounts = buildVisibleAccounts(role, apiAccounts);
  setAccounts(mappedAccounts);
  setItems(buildAccountActions(mappedAccounts, apiAccounts));
}

function buildAccountActions(accounts: WorkspaceAccount[], apiAccounts: ApiAccount[]): WorkspaceActionItem[] {
  const signalActions = apiAccounts.flatMap((account, index) => {
    const signals = account.signals ?? [];
    return signals.slice(0, 2).map((signal, signalIndex): WorkspaceActionItem => ({
      id: `signal-${account.id}-${signal.id ?? signalIndex}`,
      accountId: String(account.id),
      accountName: String(account.name ?? "Unnamed account"),
      title: signal.title || "Review account signal",
      details: signal.description || "A live account signal needs review.",
      type: signalIndex === 0 ? "To-do" : "Meeting",
      date: addDaysIso(index + signalIndex + 1),
      status: "pending",
    }));
  });

  const renewalActions = accounts
    .filter((account) => account.renewalDays < 90)
    .slice(0, 6)
    .map((account, index): WorkspaceActionItem => ({
      id: `renewal-${account.id}`,
      accountId: account.id,
      accountName: account.name,
      title: "Renewal readiness review",
      details: `${account.renewalDays} days to renewal. Confirm stakeholders, risks, and commercial next steps.`,
      type: "QBR",
      date: addDaysIso(index + 1),
      status: "pending",
    }));

  const healthActions = accounts
    .filter((account) => account.health !== "healthy")
    .slice(0, 6)
    .map((account, index): WorkspaceActionItem => ({
      id: `health-${account.id}`,
      accountId: account.id,
      accountName: account.name,
      title: account.health === "critical" ? "Recovery plan review" : "Risk mitigation checkpoint",
      details: `Current score is ${account.score}/100. Review the latest health drivers and confirm an owner.`,
      type: account.health === "critical" ? "Meeting" : "To-do",
      date: addDaysIso(index + 2),
      status: "pending",
    }));

  const byId = new Map<string, WorkspaceActionItem>();
  [...signalActions, ...renewalActions, ...healthActions].forEach((item) => byId.set(item.id, item));
  return [...byId.values()].slice(0, 12);
}

function reasonPlaceholder(status: ActionStatus) {
  return status === "done" ? "Reason this item is being marked done" : "Reason this item is being dismissed";
}

export function HomePage() {
  const router = useRouter();
  const { role } = useRole();
  const [calendarView, setCalendarView] = useState<CalendarView>("timeline");
  const [expandedHealth, setExpandedHealth] = useState<WorkspaceHealth | "renewals" | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
  const [items, setItems] = useState<WorkspaceActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reasonTarget, setReasonTarget] = useState<{ id: string; status: ActionStatus } | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadHomeData() {
      const cachedAccounts = readCachedApiAccounts(role) as ApiAccount[] | null;
      if (cachedAccounts) {
        applyHomeAccountsFromApi(role, cachedAccounts, setAccounts, setItems);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setLoadError("");
      try {
        const response = await fetch("/api/accounts", { headers: { "x-role": role } });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Home data failed to load");
        }
        const apiAccounts = Array.isArray(payload.data) ? payload.data as ApiAccount[] : [];
        writeCachedApiAccounts(role, apiAccounts as unknown as CachedApiAccount[]);
        if (cancelled) return;
        applyHomeAccountsFromApi(role, apiAccounts, setAccounts, setItems);
      } catch (error) {
        if (!cancelled && !cachedAccounts) {
          setAccounts([]);
          setItems([]);
          setLoadError(error instanceof Error ? error.message : "Home data failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadHomeData();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const groupedByDate = useMemo(() => {
    return items.reduce<Record<string, WorkspaceActionItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [items]);

  const healthStats = useMemo(() => {
    return (["healthy", "at-risk", "critical"] as WorkspaceHealth[]).map((health) => {
      const matchingAccounts = accounts.filter((account) => account.health === health);
      const arr = matchingAccounts.reduce((sum, account) => sum + account.arr, 0);
      return { health, accounts: matchingAccounts, arr };
    });
  }, [accounts]);

  const renewalSoon = accounts.filter((account) => account.renewalDays < 90);
  const selectedItems = groupedByDate[selectedDate] || [];
  const timelineDates = useMemo(() => {
    const dates = Object.keys(groupedByDate).sort();
    if (dates.length > 0) return dates.slice(0, 3);
    return [todayIsoDate(), addDaysIso(1), addDaysIso(2)];
  }, [groupedByDate]);

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

  function openAccount(accountId: string) {
    router.push(`/portfolio?focus=home-account&target=${accountId}`);
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
              <p className="text-3xl font-black tracking-[-0.04em] text-[#1F2722]">{loading ? "..." : items.filter((item) => item.status === "pending").length}</p>
            </div>
          </div>

          {loadError ? (
            <div className="mt-4 rounded-2xl border border-[#EAB3A9] bg-[#FFF1EE] p-3 text-[13px] font-bold text-[#A63F33]">
              {loadError}
            </div>
          ) : null}

          {expandedHealth ? (
            <button
              type="button"
              aria-label="Close expanded account summary"
              onClick={() => setExpandedHealth(null)}
              className="fixed inset-0 z-20 bg-[#1F2722]/18 [backdrop-filter:blur(1px)]"
            />
          ) : null}

          <div className="relative z-30 mt-5 grid gap-3 overflow-visible lg:grid-cols-4">
            {healthStats.map((stat) => (
              <article
                key={stat.health}
                className={`relative min-h-36 overflow-visible rounded-3xl border text-left transition-all duration-200 hover:-translate-y-0.5 ${healthTone[stat.health]} ${
                  expandedHealth === stat.health ? "z-40 -translate-y-1 scale-[1.015] shadow-[0_30px_72px_-34px_rgba(31,39,34,0.56)]" : "z-0"
                  }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedHealth(expandedHealth === stat.health ? null : stat.health)}
                  className="flex min-h-36 w-full flex-col justify-center rounded-3xl p-4 text-left"
                  aria-expanded={expandedHealth === stat.health}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[16px] font-black">{healthLabels[stat.health]}</p>
                    <ChevronDown className={`h-4 w-4 transition ${expandedHealth === stat.health ? "rotate-180" : ""}`} />
                  </div>
                  <p className="mt-3 text-4xl font-black tracking-[-0.05em]">{loading ? "..." : stat.accounts.length}</p>
                </button>
                {expandedHealth === stat.health ? (
                  <div className="absolute inset-x-3 top-[5.75rem] rounded-3xl border border-white/80 bg-[rgba(255,252,246,0.96)] p-3 shadow-[0_28px_68px_-34px_rgba(31,39,34,0.58)] [backdrop-filter:blur(16px)]">
                    <div className="space-y-2">
                      {stat.accounts.slice(0, 5).map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => openAccount(account.id)}
                          className="flex w-full items-center justify-between rounded-2xl bg-white/72 px-3 py-2 text-[12px] font-bold transition hover:bg-[#25352E] hover:text-[#FFF9EF]"
                        >
                          <span>{account.name}</span>
                          <span>{account.score}/100</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[12px] font-bold opacity-75">{money(stat.arr)} ARR</p>
                  </div>
                ) : null}
              </article>
            ))}

            <article
              className={`relative min-h-36 overflow-visible rounded-3xl border border-[#D7C6B4] bg-[#FFFCF6] text-left text-[#25352E] transition-all duration-200 hover:-translate-y-0.5 ${
                expandedHealth === "renewals" ? "z-40 -translate-y-1 scale-[1.015] shadow-[0_30px_72px_-34px_rgba(31,39,34,0.56)]" : "z-0"
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedHealth(expandedHealth === "renewals" ? null : "renewals")}
                className="flex min-h-36 w-full flex-col justify-center rounded-3xl p-4 text-left"
                aria-expanded={expandedHealth === "renewals"}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[16px] font-black">Renewals under 90d</p>
                  <ChevronDown className={`h-4 w-4 transition ${expandedHealth === "renewals" ? "rotate-180" : ""}`} />
                </div>
                <p className="mt-3 text-4xl font-black tracking-[-0.05em]">{loading ? "..." : renewalSoon.length}</p>
              </button>
              {expandedHealth === "renewals" ? (
                <div className="absolute inset-x-3 top-[5.75rem] space-y-2 rounded-3xl border border-white/80 bg-[rgba(255,252,246,0.96)] p-3 shadow-[0_28px_68px_-34px_rgba(31,39,34,0.58)] [backdrop-filter:blur(16px)]">
                  {renewalSoon.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => openAccount(account.id)}
                      className="flex w-full items-center justify-between rounded-2xl bg-[#F7F1E7] px-3 py-2 text-[12px] font-bold transition hover:bg-[#25352E] hover:text-[#FFF9EF]"
                    >
                      <span>{account.name}</span>
                      <span>{account.renewalDays}d</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
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
            <div className="relative mt-5 overflow-hidden rounded-[30px] border border-[#D9CCE2] bg-[radial-gradient(circle_at_10%_20%,rgba(255,255,255,0.78),transparent_28%),linear-gradient(135deg,#EFE6F7_0%,#E6D8F3_42%,#F8EFE2_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <div className="pointer-events-none absolute left-8 right-8 top-[5.8rem] hidden h-[3px] rounded-full bg-[#8F6AC8]/38 lg:block" />
              <div className="grid gap-5 lg:grid-cols-3">
                {timelineDates.map((date, index) => {
                  const dayItems = groupedByDate[date] || [];
                  const doneCount = dayItems.filter((item) => item.status === "done").length;
                  const pendingCount = dayItems.filter((item) => item.status === "pending").length;
                  const complete = dayItems.length > 0 && pendingCount === 0;
                  return (
                    <section key={date} className="relative flex min-h-[25rem] flex-col pt-2">
                      <div className="relative z-10 mb-7 flex items-start justify-between gap-3 rounded-[24px] border border-white/58 bg-[rgba(255,252,246,0.52)] px-4 py-3 shadow-[0_18px_45px_-38px_rgba(59,40,91,0.72)] [backdrop-filter:blur(16px)]">
                        <div>
                          <p className="text-[22px] font-black tracking-[-0.05em] text-[#25352E]">{displayDate(date)}</p>
                          <div className="mt-1 flex items-center gap-2 text-[12px] font-black text-[#6F6254]">
                            <span>{pendingCount} pending</span>
                            <span className="h-1 w-1 rounded-full bg-[#8F6AC8]/55" />
                            <span>{doneCount} done</span>
                          </div>
                        </div>
                        <div className={`absolute left-1/2 top-[calc(100%+0.35rem)] z-20 inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-[#EFE6F7] shadow-[0_16px_30px_-18px_rgba(70,45,112,0.72)] ${
                          complete ? "bg-[#6F4FB1] text-white" : "bg-[#F5EDF9] text-[#6F4FB1]"
                        }`}>
                          {complete ? <Check className="h-5 w-5" /> : <Clock className="h-4 w-4" />}
                        </div>
                      </div>
                      <div className={`relative flex flex-1 flex-col gap-3 rounded-[28px] border p-4 shadow-[0_24px_62px_-42px_rgba(59,40,91,0.74)] ${
                        index % 2 === 0
                          ? "border-[#CDBAE8] bg-[rgba(128,92,190,0.22)]"
                          : "border-[#E2CFB7] bg-[rgba(255,249,239,0.68)]"
                      } [backdrop-filter:blur(14px)]`}>
                        {dayItems.length ? (
                          dayItems.map((item) => (
                            <article key={item.id} className={`flex min-h-[11rem] flex-col rounded-[22px] border p-3 shadow-[0_18px_36px_-30px_rgba(59,40,91,0.66)] ${
                              item.status === "done"
                                ? "border-[#BFD9C6] bg-[#F3FAF2]"
                                : item.status === "dismissed"
                                  ? "border-[#EAB3A9] bg-[#FFF1EE]"
                                  : "border-white/68 bg-[rgba(255,252,246,0.76)]"
                            }`}>
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
                                  <p className="mt-2 text-[15px] font-black leading-snug text-[#25352E]">{item.title}</p>
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
