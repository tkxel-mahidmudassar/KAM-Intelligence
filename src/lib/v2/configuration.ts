import type { WorkspaceTaskType } from "@/lib/v2/workspaceData";

export interface DefaultJourneyItem {
  id: string;
  type: WorkspaceTaskType;
  title: string;
  offsetDays: number;
  /**
   * Backward-compatible only. Journey templates should use offsetDays, then
   * account setup resolves the offset into a real dueDate for that account.
   */
  dueDate?: string;
  recurrence: string;
  detail: string;
}

export interface DocumentTypeConfig {
  type: string;
  extracts: string;
  affects: string;
}

export const journeyRecurrenceOptions = ["Does not repeat", "Daily", "Weekly", "Bi-weekly", "Monthly", "Quarterly", "Yearly"] as const;

export const defaultAccountJourneyItems: DefaultJourneyItem[] = [
  { id: "journey-day-0-assignment", type: "To-do", title: "Account assignment and sales handover", offsetDays: 0, recurrence: "Does not repeat", detail: "Confirm owner, sales context, commercial notes, and immediate risk flags." },
  { id: "journey-day-1-ai-monitoring", type: "To-do", title: "AI monitoring and exception management", offsetDays: 1, recurrence: "Daily", detail: "Track score movement, document-derived proposals, dismissals, and rule learning." },
  { id: "journey-day-7-discovery", type: "To-do", title: "Discovery and KYC review", offsetDays: 7, recurrence: "Does not repeat", detail: "Validate the account profile, source files, stakeholder map, and KYC draft." },
  { id: "journey-day-14-stakeholders", type: "Meeting", title: "Stakeholder mapping and relationship planning", offsetDays: 14, recurrence: "Does not repeat", detail: "Confirm economic buyer, technical sponsor, operational owners, and contact cadence." },
  { id: "journey-day-30-health", type: "To-do", title: "Initial account health review", offsetDays: 30, recurrence: "Does not repeat", detail: "Review KPI scores, sub-parameter movement, risks, and playbook-driven next steps." },
  { id: "journey-day-45-exec", type: "Meeting", title: "Executive alignment review", offsetDays: 45, recurrence: "Does not repeat", detail: "Align sponsor priorities, current delivery confidence, and escalation ownership." },
  { id: "journey-day-60-delivery", type: "Meeting", title: "Delivery governance review", offsetDays: 60, recurrence: "Does not repeat", detail: "Review sprint progress, blockers, resourcing, scope control, and delivery risks." },
  { id: "journey-day-90-qbr", type: "QBR", title: "First quarterly business review", offsetDays: 90, recurrence: "Quarterly", detail: "Present value delivered, health movement, risks, decisions, and next-quarter plan." },
  { id: "journey-monthly-review", type: "To-do", title: "Monthly account review", offsetDays: 30, recurrence: "Monthly", detail: "Refresh account health, documents, contacts, actions, and AI rule feedback." },
  { id: "journey-quarterly-qbr", type: "QBR", title: "Quarterly business review package", offsetDays: 90, recurrence: "Quarterly", detail: "Generate and review the recurring QBR package using account evidence." },
  { id: "journey-semiannual-strategy", type: "Meeting", title: "Semi-annual strategic review", offsetDays: 180, recurrence: "Yearly", detail: "Revisit account strategy, expansion posture, executive coverage, and renewal path." },
  { id: "journey-renewal-readiness", type: "To-do", title: "Renewal readiness assessment", offsetDays: 120, recurrence: "Does not repeat", detail: "Confirm renewal date, commercial owner, satisfaction signals, and contractual risk." },
  { id: "journey-renewal-planning", type: "Meeting", title: "Renewal planning and budget validation", offsetDays: 150, recurrence: "Does not repeat", detail: "Validate renewal budget, scope appetite, sponsor alignment, and procurement path." },
  { id: "journey-renewal-execution", type: "Meeting", title: "Renewal execution and proposal submission", offsetDays: 180, recurrence: "Does not repeat", detail: "Submit renewal proposal, confirm stakeholders, and lock the negotiation plan." },
  { id: "journey-renewal-finalization", type: "To-do", title: "Renewal finalization and account plan update", offsetDays: 210, recurrence: "Does not repeat", detail: "Close renewal actions and update the next account plan." },
];

export function offsetFromLegacyDueDate(dueDate?: string) {
  if (!dueDate) return 30;
  const parsed = new Date(`${dueDate}T00:00:00`);
  const baseline = new Date("2026-06-07T00:00:00");
  if (Number.isNaN(parsed.getTime())) return 30;
  return Math.max(0, Math.round((parsed.getTime() - baseline.getTime()) / (24 * 60 * 60 * 1000)));
}

export function journeyDateFromOffset(offsetDays: number, baseDate = new Date()) {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + Math.max(0, Math.round(offsetDays)));
  return date.toISOString().slice(0, 10);
}

export function journeyOffsetLabel(offsetDays: number) {
  if (offsetDays === 0) return "On account creation";
  if (offsetDays === 1) return "1 day after account creation";
  if (offsetDays % 30 === 0) {
    const months = offsetDays / 30;
    return `${months} ${months === 1 ? "month" : "months"} after account creation`;
  }
  if (offsetDays % 7 === 0) {
    const weeks = offsetDays / 7;
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} after account creation`;
  }
  return `${offsetDays} days after account creation`;
}

export function normalizeJourneyRecurrence(value?: string) {
  if (!value || value === "Once" || value === "One-time") return "Does not repeat";
  if (value === "Bi-yearly") return "Yearly";
  return journeyRecurrenceOptions.includes(value as (typeof journeyRecurrenceOptions)[number])
    ? value
    : "Does not repeat";
}

export function normalizeJourneyTemplateItem(item: Partial<DefaultJourneyItem>): DefaultJourneyItem {
  return {
    id: item.id ?? `journey-${Date.now()}`,
    type: item.type === "Meeting" || item.type === "QBR" ? item.type : "To-do",
    title: item.title ?? "Journey item",
    offsetDays: typeof item.offsetDays === "number" ? Math.max(0, Math.round(item.offsetDays)) : offsetFromLegacyDueDate(item.dueDate),
    recurrence: normalizeJourneyRecurrence(item.recurrence),
    detail: item.detail ?? "",
  };
}

export const accountDocumentTypes: DocumentTypeConfig[] = [
  {
    type: "Charter",
    extracts: "Account purpose, sponsor expectations, success criteria, engagement scope, governance model",
    affects: "Account profile, KYC Brief, Account Journey, Relationship Score, Project Health Score",
  },
  {
    type: "Meeting minutes",
    extracts: "Executive engagement, customer confidence, issue resolution, risk flags, whitespace signals",
    affects: "Relationship Score, CSAT Score, Risk Score, Whitespace Analysis, KYC Brief",
  },
  {
    type: "Contract document",
    extracts: "Auto-renewal clause, price hike clauses, termination terms, renewal timing, commercial protections",
    affects: "Contract Health Score, Financial Score, KYC Brief",
  },
  {
    type: "Statement of Work (SOW)",
    extracts: "Scope, service lines, deliverables, commercial terms, delivery obligations",
    affects: "Engagement History, Project Health Score, Financial Score, Whitespace Analysis",
  },
  {
    type: "Proposal",
    extracts: "Services pitched, pricing signals, accepted vs. rejected scope, expansion intent",
    affects: "Engagement History, Whitespace Analysis, Financial Score",
  },
  {
    type: "Project documentation",
    extracts: "Delivery history, tech stack, team composition, milestones, blockers, sprint evidence",
    affects: "Project Health Score, Resource Health Score, Risk Score",
  },
  {
    type: "Previous KYC brief",
    extracts: "Historical account intelligence, prior stakeholder map, risks, opportunities, competitors",
    affects: "All KYC sections",
  },
  {
    type: "Project status report",
    extracts: "Delivery quality narrative, blockers, velocity commentary, milestone movement",
    affects: "Project Health Score, Risk Score, Resource Health Score",
  },
  {
    type: "Financial file",
    extracts: "Invoices, revenue, collections, expansion commercial signals, outstanding balances",
    affects: "Financial Score, ARR, Contract Health Score",
  },
  {
    type: "Other",
    extracts: "Any account evidence that does not fit a standard category",
    affects: "Account profile, KYC Brief, score proposals, account journey",
  },
];

export const documentGenerationTypes = ["QBR", "MBR", "DBR", "EBR", "KYC", "Account Brief", "Renewal Plan", "Executive Summary"];
export const documentOutputFormats = ["pptx", "docx", "pdf", "xlsx"] as const;
