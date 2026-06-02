/** Normalised shape returned by the Salesforce adapter */
export interface SalesforceOpportunity {
  id: string;
  name: string;
  stage: string;          // "Prospecting" | "Negotiation" | "Closed Won" | etc.
  amount: number;
  closeDate: string;      // ISO date
  probability: number;    // 0-100
  type: "New" | "Renewal" | "Upsell" | "Cross-sell";
}

export interface SalesforceContact {
  id: string;
  name: string;
  title: string;
  email: string;
  lastActivityDate: string;
  engagementScore: number; // 0-100
}

export interface SalesforceData {
  accountId: string;
  accountName: string;
  arr: number;
  renewalDate: string;
  healthScore: number;      // 0-100 from Salesforce
  opportunities: SalesforceOpportunity[];
  contacts: SalesforceContact[];
  lastSyncedAt: string;
}
