export type WorkspaceHealth = "healthy" | "at-risk" | "critical";
export type WorkspaceTaskType = "To-do" | "Meeting" | "QBR";

export interface WorkspaceAccount {
  id: string;
  name: string;
  industry: string;
  country: string;
  arr: number;
  score: number;
  health: WorkspaceHealth;
  renewalDays: number;
  owner: string;
}

export interface WorkspaceActionItem {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  details: string;
  type: WorkspaceTaskType;
  date: string;
  status: "pending" | "done" | "dismissed";
}

export const workspaceAccounts: WorkspaceAccount[] = [
  { id: "acc-stripe", name: "Stripe", industry: "Fintech", country: "USA", arr: 2900000, score: 92, health: "healthy", renewalDays: 244, owner: "Aisha Khan" },
  { id: "acc-shopify", name: "Shopify", industry: "Commerce Platform", country: "Canada", arr: 2400000, score: 90, health: "healthy", renewalDays: 302, owner: "Aisha Khan" },
  { id: "acc-maersk", name: "Maersk", industry: "Logistics", country: "Denmark", arr: 2100000, score: 58, health: "at-risk", renewalDays: 96, owner: "Aisha Khan" },
  { id: "acc-pfizer", name: "Pfizer", industry: "Pharmaceuticals", country: "USA", arr: 2000000, score: 88, health: "healthy", renewalDays: 418, owner: "Aisha Khan" },
  { id: "acc-siemens", name: "Siemens", industry: "Industrial Technology", country: "Germany", arr: 1900000, score: 86, health: "healthy", renewalDays: 275, owner: "Aisha Khan" },
  { id: "acc-emirates", name: "Emirates", industry: "Aviation", country: "UAE", arr: 1800000, score: 61, health: "at-risk", renewalDays: 132, owner: "Aisha Khan" },
  { id: "acc-unilever", name: "Unilever", industry: "Consumer Goods", country: "UK", arr: 1600000, score: 84, health: "healthy", renewalDays: 351, owner: "Aisha Khan" },
  { id: "acc-dhl", name: "DHL", industry: "Logistics", country: "Germany", arr: 1500000, score: 83, health: "healthy", renewalDays: 287, owner: "Aisha Khan" },
  { id: "acc-adidas", name: "Adidas", industry: "Retail and Apparel", country: "Germany", arr: 1400000, score: 54, health: "at-risk", renewalDays: 74, owner: "Aisha Khan" },
  { id: "acc-bp", name: "BP", industry: "Energy", country: "UK", arr: 1300000, score: 38, health: "critical", renewalDays: 48, owner: "Omar Farooq" },
  { id: "acc-fedex", name: "FedEx", industry: "Logistics", country: "USA", arr: 815000, score: 42, health: "critical", renewalDays: 39, owner: "Omar Farooq" },
];

export const workspaceActionItems: WorkspaceActionItem[] = [
  {
    id: "act-risk-owner",
    accountId: "acc-maersk",
    accountName: "Maersk",
    title: "Confirm mitigation owner for delivery risk",
    details: "Review blocker history and assign a named owner before the renewal checkpoint.",
    type: "To-do",
    date: "2026-06-08",
    status: "pending",
  },
  {
    id: "act-sponsor-sync",
    accountId: "acc-stripe",
    accountName: "Stripe",
    title: "Executive sponsor sync",
    details: "Align on payments modernization status and next expansion timing.",
    type: "Meeting",
    date: "2026-06-08",
    status: "pending",
  },
  {
    id: "act-qbr-stripe",
    accountId: "acc-stripe",
    accountName: "Stripe",
    title: "Prepare QBR narrative",
    details: "Build the account story around delivery health, value realized, and next whitespace bet.",
    type: "QBR",
    date: "2026-06-09",
    status: "pending",
  },
  {
    id: "act-fedex-recovery",
    accountId: "acc-fedex",
    accountName: "FedEx",
    title: "Recovery plan review",
    details: "Document the execution plan and confirm what must change before the next steering call.",
    type: "Meeting",
    date: "2026-06-10",
    status: "pending",
  },
  {
    id: "act-emirates-scope",
    accountId: "acc-emirates",
    accountName: "Emirates",
    title: "Lock scope-change governance",
    details: "Confirm passenger dashboard scope decisions, change-control owner, and next milestone acceptance criteria.",
    type: "Meeting",
    date: "2026-06-10",
    status: "pending",
  },
  {
    id: "act-bp-commercial",
    accountId: "acc-bp",
    accountName: "BP",
    title: "Commercial path check",
    details: "Confirm buyer path, procurement blockers, and commercial decision owner.",
    type: "To-do",
    date: "2026-06-11",
    status: "pending",
  },
  {
    id: "act-adidas-renewal",
    accountId: "acc-adidas",
    accountName: "Adidas",
    title: "Renewal readiness review",
    details: "Validate renewal timeline and map missing sponsor commitments.",
    type: "QBR",
    date: "2026-06-12",
    status: "pending",
  },
];

export const defaultKpiWeights = [
  { id: "relationship", name: "Relationship Score", weight: 20 },
  { id: "contract-health", name: "Contract Health Score", weight: 15 },
  { id: "customer-success", name: "CSAT Score", weight: 15 },
  { id: "risk", name: "Risk Score", weight: 15 },
  { id: "resource-health", name: "Resource Health Score", weight: 10 },
  { id: "project-health", name: "Project Health Score", weight: 10 },
  { id: "financial-health", name: "Financial Score", weight: 10 },
  { id: "whitespace", name: "Whitespace Analysis", weight: 5 },
];

export const integrationMocks = [
  "Salesforce",
  "Gmail",
  "Jira",
  "Worksphere",
  "Finance Invoice Tracking",
  "LLM",
];

export function money(value: number) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${value}`;
}
