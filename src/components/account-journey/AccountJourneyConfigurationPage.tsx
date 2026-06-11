"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarDays, Check, Loader2, Pencil, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import {
  defaultAccountJourneyItems,
  journeyOffsetLabel,
  journeyRecurrenceOptions,
  normalizeJourneyRecurrence,
  normalizeJourneyTemplateItem,
  type DefaultJourneyItem,
} from "@/lib/v2/configuration";
import type { WorkspaceTaskType } from "@/lib/v2/workspaceData";

const storageKey = "kamazing:account-journey-config";
const legacyStorageKey = "dotkam:account-journey-config";
const taskTypes: WorkspaceTaskType[] = ["To-do", "Meeting", "QBR"];

type PendingJourneyChange =
  | { kind: "add"; summary: string; item: DefaultJourneyItem }
  | { kind: "remove"; summary: string; id: string; title: string }
  | { kind: "update"; summary: string; id: string; title: string; patch: Partial<DefaultJourneyItem> };

function loadJourney() {
  if (typeof window === "undefined") return defaultAccountJourneyItems;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || window.localStorage.getItem(legacyStorageKey) || "[]");
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed.map((item) => normalizeJourneyTemplateItem(item as Partial<DefaultJourneyItem>))
      : defaultAccountJourneyItems;
  } catch {
    return defaultAccountJourneyItems;
  }
}

function emptyJourneyItem(): DefaultJourneyItem {
  return {
    id: `journey-custom-${Date.now()}`,
    type: "To-do",
    title: "",
    offsetDays: 30,
    recurrence: "Does not repeat",
    detail: "",
  };
}

export function AccountJourneyConfigurationPage() {
  const [items, setItems] = useState<DefaultJourneyItem[]>(defaultAccountJourneyItems);
  const [savedItems, setSavedItems] = useState<DefaultJourneyItem[]>(defaultAccountJourneyItems);
  const [editingItem, setEditingItem] = useState<DefaultJourneyItem | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([
    { role: "assistant", text: "Tell me what to change in the default account journey. I can add, edit, or remove items, then you can save the final version." },
  ]);
  const [pendingChanges, setPendingChanges] = useState<PendingJourneyChange[]>([]);
  const [status, setStatus] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [savingJourney, setSavingJourney] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState("");
  const [applyingChanges, setApplyingChanges] = useState(false);

  useEffect(() => {
    const loaded = loadJourney();
    setItems(loaded);
    setSavedItems(loaded);
  }, []);

  const sortedItems = useMemo(() => {
    return [...items].map(normalizeJourneyTemplateItem).sort((a, b) => a.offsetDays - b.offsetDays);
  }, [items]);

  async function saveJourney() {
    if (savingJourney) return;
    setSavingJourney(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(items));
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      setSavedItems(items);
      setStatus("Account journey configuration saved.");
    } finally {
      setSavingJourney(false);
    }
  }

  function cancelChanges() {
    if (savingJourney) return;
    setItems(savedItems);
    setStatus("Unsaved changes discarded.");
  }

  async function upsertItem(item: DefaultJourneyItem) {
    if (savingItem) return;
    const cleanTitle = item.title.trim();
    if (!cleanTitle) return;
    setSavingItem(true);
    try {
      setItems((current) => {
        const exists = current.some((journeyItem) => journeyItem.id === item.id);
        if (exists) return current.map((journeyItem) => (journeyItem.id === item.id ? { ...item, title: cleanTitle } : journeyItem));
        return [{ ...item, title: cleanTitle }, ...current];
      });
      if (typeof window !== "undefined") {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      setEditingItem(null);
    } finally {
      setSavingItem(false);
    }
  }

  async function deleteItem(id: string) {
    if (deletingItemId) return;
    setDeletingItemId(id);
    try {
      setItems((current) => current.filter((item) => item.id !== id));
      if (typeof window !== "undefined") {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    } finally {
      setDeletingItemId("");
    }
  }

  async function applyPendingChanges() {
    if (applyingChanges) return;
    if (pendingChanges.length === 0) return;
    setApplyingChanges(true);
    try {
      setItems((current) => {
        let nextItems = [...current];
        pendingChanges.forEach((change) => {
          if (change.kind === "add") {
            nextItems = [normalizeJourneyTemplateItem(change.item), ...nextItems];
          }
          if (change.kind === "remove") {
            nextItems = nextItems.filter((item) => item.id !== change.id);
          }
          if (change.kind === "update") {
            nextItems = nextItems.map((item) => (
              item.id === change.id ? normalizeJourneyTemplateItem({ ...item, ...change.patch }) : item
            ));
          }
        });
        return nextItems;
      });
      if (typeof window !== "undefined") {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      setChatMessages((current) => [...current, { role: "assistant", text: `Applied ${pendingChanges.length} journey change${pendingChanges.length === 1 ? "" : "s"} to the draft.` }]);
      setPendingChanges([]);
    } finally {
      setApplyingChanges(false);
    }
  }

  function valueToOffsetDays(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    const raw = String(value || "").trim();
    const dayMatch = raw.match(/\bday\s*(\d+)\b/i);
    if (dayMatch) return Number(dayMatch[1]);
    const weekMatch = raw.match(/\b(\d+)\s*weeks?\b/i);
    if (weekMatch) return Number(weekMatch[1]) * 7;
    const monthMatch = raw.match(/\b(\d+)\s*months?\b/i);
    if (monthMatch) return Number(monthMatch[1]) * 30;
    const daysAfterMatch = raw.match(/\b(\d+)\s*days?\s*after\b/i);
    if (daysAfterMatch) return Number(daysAfterMatch[1]);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return 30;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function proposalChangesFromAgent(journeyItems: Array<Record<string, unknown>>) {
    return journeyItems.slice(0, 12).map((agentItem) => {
      const title = String(agentItem.title || "").trim();
      const type = taskTypes.includes(agentItem.type as WorkspaceTaskType) ? agentItem.type as WorkspaceTaskType : "To-do";
      const recurrence = normalizeJourneyRecurrence(String(agentItem.recurrence || "Does not repeat"));
      const detail = String(agentItem.reasoningSummary || agentItem.proposedValue || "Suggested by the journey assistant.").trim();
      const offsetDays = valueToOffsetDays(agentItem.offsetDays ?? agentItem.dueDate ?? agentItem.proposedValue ?? "");
      const existing = items.find((item) => item.title.toLowerCase() === title.toLowerCase());
      if (existing) {
        return {
          kind: "update" as const,
          id: existing.id,
          title: existing.title,
          summary: `Update "${existing.title}" from the journey assistant recommendation.`,
          patch: { type, title, recurrence, detail, offsetDays },
        };
      }
      return {
        kind: "add" as const,
        summary: `Add "${title}" as a ${type} starting ${journeyOffsetLabel(offsetDays).toLowerCase()}.`,
        item: normalizeJourneyTemplateItem({
          id: `journey-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type,
          title,
          offsetDays,
          recurrence,
          detail,
        }),
      };
    }).filter((change) => change.kind !== "add" || change.item.title);
  }

  async function handleAssistant() {
    const prompt = chatPrompt.trim();
    if (!prompt || assistantBusy) return;
    const lower = prompt.toLowerCase();
    let reply = "I need a more specific instruction, like add a steering committee meeting, remove Day 45, or update renewal items.";
    let proposedChanges: PendingJourneyChange[] = [];

    if ((lower.includes("apply") || lower.includes("accept") || lower.includes("yes")) && pendingChanges.length > 0) {
      setChatMessages((current) => [...current, { role: "user", text: prompt }]);
      setChatPrompt("");
      void applyPendingChanges();
      return;
    }

    setAssistantBusy(true);
    try {
      const response = await fetch("/api/v2/onboarding/journey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "KAM",
          mode: "enhance",
          prompt,
          draft: { workflow: "Account journey configuration template" },
          documents: [],
          journey: items.map((item) => ({
            type: item.type,
            title: item.title,
            offsetDays: item.offsetDays,
            dueDate: `Day ${item.offsetDays}`,
            recurrence: item.recurrence,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Journey assistant failed");
      proposedChanges = proposalChangesFromAgent(Array.isArray(payload.journeyItems) ? payload.journeyItems : []);
      reply = String(payload.assistantReply || "I drafted journey changes from your instruction.");
      if (proposedChanges.length === 0) {
        reply = `${reply} I did not find a safe change to apply, so please be more specific about the item title or interval.`;
      }
    } catch {
      if (lower.includes("delete") || lower.includes("remove")) {
      const match = items.find((item) => {
        const title = item.title.toLowerCase();
        return lower.includes(title) || lower.includes(title.slice(0, 12)) || lower.includes(`day ${item.offsetDays}`) || lower.includes(item.recurrence.toLowerCase());
      });
      if (match) {
        proposedChanges = [{ kind: "remove", id: match.id, title: match.title, summary: `Remove "${match.title}" from the default journey.` }];
        reply = `I found 1 proposed removal. Review it and click Apply suggestion if it is right.`;
      } else {
        reply = "I could not confidently match an item to remove. Mention the exact title or interval.";
      }
    } else if (lower.includes("add") || lower.includes("create")) {
      const inferredType: WorkspaceTaskType = lower.includes("qbr") ? "QBR" : lower.includes("meeting") || lower.includes("sync") ? "Meeting" : "To-do";
      const title = prompt.replace(/^(add|create)\s+/i, "").trim() || "New journey item";
      const nextItem = {
        ...emptyJourneyItem(),
        id: `journey-ai-${Date.now()}`,
        type: inferredType,
        title,
        recurrence: "Monthly",
        detail: "Added from the journey assistant.",
      };
      proposedChanges = [{ kind: "add", item: nextItem, summary: `Add "${nextItem.title}" as a ${nextItem.type} starting ${journeyOffsetLabel(nextItem.offsetDays).toLowerCase()}.` }];
      reply = `I drafted 1 new journey item. Review it and click Apply suggestion if it is right.`;
    } else if (lower.includes("renewal")) {
      proposedChanges = items
        .filter((item) => item.title.toLowerCase().includes("renewal"))
        .map((item) => ({
          kind: "update" as const,
          id: item.id,
          title: item.title,
          summary: `Sharpen "${item.title}" with renewal owner, budget, decision process, commercial risk, and next approval step.`,
          patch: { detail: "Review renewal owner, budget, decision process, commercial risk, and next approval step." },
        }));
      reply = proposedChanges.length > 0
        ? `I found ${proposedChanges.length} renewal change${proposedChanges.length === 1 ? "" : "s"}. Review and apply if they are right.`
        : "I could not find a renewal item to update.";
    } else if (lower.includes("qbr")) {
      proposedChanges = items
        .filter((item) => item.type === "QBR")
        .map((item) => ({
          kind: "update" as const,
          id: item.id,
          title: item.title,
          summary: `Update "${item.title}" with value delivered, delivery health, risks, decisions, and expansion opportunities.`,
          patch: { detail: "Prepare value delivered, delivery health, risks, decisions needed, and expansion opportunities." },
        }));
      reply = proposedChanges.length > 0
        ? `I found ${proposedChanges.length} QBR change${proposedChanges.length === 1 ? "" : "s"}. Review and apply if they are right.`
        : "I could not find a QBR item to update.";
    }
    } finally {
      setAssistantBusy(false);
    }

    setPendingChanges(proposedChanges);
    setChatMessages((current) => [...current, { role: "user", text: prompt }, { role: "assistant", text: reply }]);
    setChatPrompt("");
  }

  return (
    <main className="min-h-screen px-5 py-5">
      <section className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[36px] border border-[#E2D8CC] bg-[#FFF9EF] p-6 shadow-[0_24px_70px_-58px_rgba(32,38,32,0.58)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[clamp(40px,6vw,78px)] font-black leading-none tracking-[-0.08em] text-[#1F2722]">Account journey configuration</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setEditingItem(emptyJourneyItem())} className="inline-flex items-center gap-2 rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-3 text-[13px] font-black text-[#25352E] hover:bg-white">
                <Plus className="h-4 w-4" />
                Add item
              </button>
              <button type="button" onClick={cancelChanges} disabled={savingJourney} className="rounded-full border border-[#D8CAB9] bg-white/70 px-4 py-3 text-[13px] font-black text-[#6F6254] hover:bg-white disabled:cursor-not-allowed disabled:opacity-55">
                Cancel
              </button>
              <button type="button" onClick={() => void saveJourney()} disabled={savingJourney} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-3 text-[13px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/45">
                {savingJourney ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {savingJourney ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
          {status ? <p className="mt-4 rounded-2xl border border-[#B7D8C3] bg-[#EEF8F1] px-4 py-3 text-[13px] font-black text-[#23633E]">{status}</p> : null}
        </section>

        <section className="rounded-[32px] border border-[#E2D8CC] bg-[#FFF9EF] p-4 shadow-[0_24px_70px_-58px_rgba(32,38,32,0.58)]">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#25352E]" />
            <h2 className="text-[20px] font-black tracking-[-0.04em] text-[#1F2722]">Default journey timeline</h2>
          </div>
          <div className="mt-5 overflow-x-auto pb-3">
            <div className="relative flex min-w-max gap-5 px-2 pt-8">
              <div className="absolute left-8 right-8 top-11 h-1 rounded-full bg-gradient-to-r from-[#BFA78A] via-[#A7C7B4] to-[#E8BE86]" />
              {sortedItems.map((item) => (
                <article key={item.id} className="relative w-72 rounded-[24px] border border-[#D8CAB9] bg-[#FFFCF6] p-4 shadow-[0_18px_46px_-36px_rgba(55,43,28,0.55)]">
                  <div className="absolute -top-7 left-4 rounded-full border border-[#D8CAB9] bg-[#25352E] px-3 py-2 text-[12px] font-black text-[#FFF9EF] shadow-[0_10px_24px_-16px_rgba(32,38,32,0.9)]">
                    Day {item.offsetDays}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="rounded-full border border-[#D8CAB9] bg-[#FFF9EF] px-2 py-1 text-[11px] font-black text-[#6F6254]">{item.type}</span>
                      <h3 className="mt-3 text-[15px] font-black leading-tight text-[#1F2722]">{item.title}</h3>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setEditingItem(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#D8CAB9] bg-white/70 text-[#6F6254] hover:text-[#25352E]" aria-label={`Edit ${item.title}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void deleteItem(item.id)} disabled={Boolean(deletingItemId)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E2B7AF] bg-white/70 text-[#B33D32] disabled:cursor-not-allowed disabled:opacity-55" aria-label={`Delete ${item.title}`}>
                        {deletingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] font-bold text-[#7D6E5F]">{journeyOffsetLabel(item.offsetDays)}</p>
                  <p className="mt-1 text-[12px] font-bold text-[#7D6E5F]">{item.recurrence}</p>
                  <p className="mt-3 text-[13px] font-bold leading-relaxed text-[#25352E]">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[32px] border border-[#D8CAB9] bg-[#FFF9EF] shadow-[0_20px_58px_-46px_rgba(32,38,32,0.48)]">
          <div className="grid min-h-[420px] lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="relative border-b border-[#E5DACD] bg-[#F7F1E7] p-5 lg:border-b-0 lg:border-r">
              <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(#D8CAB9_1px,transparent_1px)] [background-size:18px_18px]" />
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[#25352E] text-[#FFF9EF] shadow-[0_16px_40px_-28px_rgba(32,38,32,0.9)]">
                  <Bot className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-[28px] font-black tracking-[-0.06em] text-[#1F2722]">Journey assistant</h2>
                <div className="mt-5 space-y-2">
                  {["Add a QBR before renewal", "Remove the Day 45 review", "Make renewal steps quarterly"].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setChatPrompt(suggestion)}
                      className="flex w-full items-center gap-2 rounded-2xl border border-[#D8CAB9] bg-white/70 px-3 py-2 text-left text-[12px] font-black text-[#25352E] hover:bg-white"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#B7782F]" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <aside className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`rounded-2xl border px-3 py-2 text-[13px] font-bold leading-relaxed ${
                  message.role === "assistant" ? "border-[#D8CAB9] bg-white/70 text-[#25352E]" : "ml-auto max-w-[86%] border-[#25352E] bg-[#25352E] text-[#FFF9EF]"
                }`}>
                  {message.text}
                </div>
              ))}
              {pendingChanges.length > 0 ? (
                <div className="rounded-2xl border border-[#D8CAB9] bg-[#FFF9EF] p-3 shadow-[0_18px_40px_-34px_rgba(32,38,32,0.48)]">
                  <div className="space-y-2">
                    {pendingChanges.map((change, index) => (
                      <p key={`${change.kind}-${change.summary}-${index}`} className="rounded-xl border border-[#E5DACD] bg-white/70 px-3 py-2 text-[12px] font-bold leading-relaxed text-[#25352E]">
                        {change.summary}
                      </p>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void applyPendingChanges()} disabled={applyingChanges} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-3 py-2 text-[12px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/45">
                      {applyingChanges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {applyingChanges ? "Applying..." : "Apply suggestion"}
                    </button>
                    <button type="button" onClick={() => setPendingChanges([])} disabled={applyingChanges} className="rounded-full border border-[#D8CAB9] bg-white/70 px-3 py-2 text-[12px] font-black text-[#6F6254] disabled:cursor-not-allowed disabled:opacity-55">
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
              </div>
              <div className="border-t border-[#E5DACD] bg-[#FFF9EF] p-3">
                <div className="flex items-end gap-2 rounded-[24px] border border-[#D8CAB9] bg-white/80 p-2 shadow-inner">
                  <textarea
                    value={chatPrompt}
                    onChange={(event) => setChatPrompt(event.target.value)}
                    placeholder="Ask the assistant to add, edit, or remove journey items"
                    className="min-h-14 flex-1 resize-none bg-transparent px-3 py-2 text-[13px] font-bold text-[#25352E] outline-none placeholder:text-[#A69A8B]"
                  />
                  <button type="button" onClick={() => void handleAssistant()} disabled={!chatPrompt.trim() || assistantBusy} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25352E] text-[#FFF9EF] disabled:bg-[#25352E]/35" aria-label="Send journey instruction">
                    {assistantBusy ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </section>

      {editingItem ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1F2722]/34 px-5 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#D8CAB9] bg-[#FFF9EF] p-5 shadow-[0_34px_110px_-56px_rgba(43,32,19,0.78)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[24px] font-black tracking-[-0.05em] text-[#1F2722]">Journey item</h2>
              <button type="button" onClick={() => setEditingItem(null)} disabled={savingItem} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#D8CAB9] text-[#6F6254] disabled:cursor-not-allowed disabled:opacity-55" aria-label="Close journey item editor">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-black text-[#6F6254]">Type</span>
                <select value={editingItem.type} onChange={(event) => setEditingItem({ ...editingItem, type: event.target.value as WorkspaceTaskType })} className="mt-2 h-11 w-full rounded-xl border border-[#D8CAB9] bg-white/70 px-3 text-[13px] font-black outline-none">
                  {taskTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[12px] font-black text-[#6F6254]">Starts after account creation</span>
                <div className="mt-2 flex h-11 overflow-hidden rounded-xl border border-[#D8CAB9] bg-white/70">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editingItem.offsetDays}
                    onChange={(event) => setEditingItem({ ...editingItem, offsetDays: Math.max(0, Number(event.target.value) || 0) })}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] font-black outline-none"
                  />
                  <span className="inline-flex h-full items-center border-l border-[#D8CAB9] px-3 text-[12px] font-black text-[#7D6E5F]">days</span>
                </div>
              </label>
              <label className="block md:col-span-2">
                <span className="text-[12px] font-black text-[#6F6254]">Title</span>
                <input value={editingItem.title} onChange={(event) => setEditingItem({ ...editingItem, title: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#D8CAB9] bg-white/70 px-3 text-[13px] font-black outline-none" />
              </label>
              <label className="block">
                <span className="text-[12px] font-black text-[#6F6254]">Recurrence</span>
                <select value={normalizeJourneyRecurrence(editingItem.recurrence)} onChange={(event) => setEditingItem({ ...editingItem, recurrence: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#D8CAB9] bg-white/70 px-3 text-[13px] font-black outline-none">
                  {journeyRecurrenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-[12px] font-black text-[#6F6254]">Details</span>
                <textarea value={editingItem.detail} onChange={(event) => setEditingItem({ ...editingItem, detail: event.target.value })} className="mt-2 min-h-28 w-full rounded-xl border border-[#D8CAB9] bg-white/70 p-3 text-[13px] font-bold outline-none" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingItem(null)} disabled={savingItem} className="rounded-full border border-[#D8CAB9] px-4 py-2 text-[13px] font-black text-[#6F6254] disabled:cursor-not-allowed disabled:opacity-55">Cancel</button>
              <button type="button" onClick={() => void upsertItem(editingItem)} disabled={savingItem} className="inline-flex items-center gap-2 rounded-full bg-[#25352E] px-4 py-2 text-[13px] font-black text-[#FFF9EF] disabled:cursor-not-allowed disabled:bg-[#25352E]/45">
                {savingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {savingItem ? "Saving..." : "Save item"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
