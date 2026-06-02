import type { SalesforceData } from "./contract";

const now = new Date().toISOString();

const MOCK_DATA: Record<string, SalesforceData> = {
  "acc-helix-001": {
    accountId: "acc-helix-001",
    accountName: "Helix Payments",
    arr: 1_750_000,
    renewalDate: new Date(Date.now() + 55 * 864e5).toISOString(),
    healthScore: 24,
    opportunities: [
      { id: "opp-h1", name: "Helix Payments — Renewal FY26", stage: "Negotiation", amount: 1_575_000, closeDate: new Date(Date.now() + 45 * 864e5).toISOString().split("T")[0], probability: 40, type: "Renewal" },
      { id: "opp-h2", name: "Helix Payments — EU Expansion", stage: "Prospecting", amount: 500_000, closeDate: new Date(Date.now() + 180 * 864e5).toISOString().split("T")[0], probability: 20, type: "Upsell" },
    ],
    contacts: [
      { id: "c-h1", name: "Jordan Walsh", title: "CTO", email: "j.walsh@helixpayments.com", lastActivityDate: new Date(Date.now() - 14 * 864e5).toISOString(), engagementScore: 18 },
      { id: "c-h2", name: "Nina Osei", title: "VP Product", email: "n.osei@helixpayments.com", lastActivityDate: new Date(Date.now() - 21 * 864e5).toISOString(), engagementScore: 22 },
    ],
    lastSyncedAt: now,
  },

  "acc-clearbridge-002": {
    accountId: "acc-clearbridge-002",
    accountName: "ClearBridge Health",
    arr: 870_000,
    renewalDate: new Date(Date.now() + 210 * 864e5).toISOString(),
    healthScore: 54,
    opportunities: [
      { id: "opp-c1", name: "ClearBridge — Alberta Expansion", stage: "Discovery", amount: 220_000, closeDate: new Date(Date.now() + 120 * 864e5).toISOString().split("T")[0], probability: 35, type: "Upsell" },
    ],
    contacts: [
      { id: "c-c1", name: "Dr. Ravi Menon", title: "Chief Digital Officer", email: "r.menon@clearbridgehealth.ca", lastActivityDate: new Date(Date.now() - 7 * 864e5).toISOString(), engagementScore: 60 },
      { id: "c-c2", name: "Chloe Fournier", title: "IT Director", email: "c.fournier@clearbridgehealth.ca", lastActivityDate: new Date(Date.now() - 28 * 864e5).toISOString(), engagementScore: 30 },
    ],
    lastSyncedAt: now,
  },

  "acc-ironclad-003": {
    accountId: "acc-ironclad-003",
    accountName: "Ironclad Logistics",
    arr: 720_000,
    renewalDate: new Date(Date.now() + 490 * 864e5).toISOString(),
    healthScore: 90,
    opportunities: [
      { id: "opp-i1", name: "Ironclad — Eastern Europe Expansion", stage: "Proposal", amount: 200_000, closeDate: new Date(Date.now() + 60 * 864e5).toISOString().split("T")[0], probability: 75, type: "Upsell" },
      { id: "opp-i2", name: "Ironclad — Customs Compliance Module", stage: "Discovery", amount: 90_000, closeDate: new Date(Date.now() + 150 * 864e5).toISOString().split("T")[0], probability: 50, type: "Cross-sell" },
    ],
    contacts: [
      { id: "c-i1", name: "Pieter van Dijk", title: "Head of Technology", email: "p.vandijk@ironcladlogistics.nl", lastActivityDate: new Date(Date.now() - 3 * 864e5).toISOString(), engagementScore: 88 },
      { id: "c-i2", name: "Lena Hofer", title: "Operations Director", email: "l.hofer@ironcladlogistics.nl", lastActivityDate: new Date(Date.now() - 5 * 864e5).toISOString(), engagementScore: 82 },
    ],
    lastSyncedAt: now,
  },

  "acc-beacon-004": {
    accountId: "acc-beacon-004",
    accountName: "Beacon Analytics",
    arr: 510_000,
    renewalDate: new Date(Date.now() + 580 * 864e5).toISOString(),
    healthScore: 93,
    opportunities: [
      { id: "opp-b1", name: "Beacon Analytics — Enterprise Tier Upgrade", stage: "Negotiation", amount: 130_000, closeDate: new Date(Date.now() + 30 * 864e5).toISOString().split("T")[0], probability: 85, type: "Upsell" },
    ],
    contacts: [
      { id: "c-b1", name: "Zoe Park", title: "CEO", email: "z.park@beaconanalytics.io", lastActivityDate: new Date(Date.now() - 2 * 864e5).toISOString(), engagementScore: 92 },
      { id: "c-b2", name: "Tariq Hassan", title: "CTO", email: "t.hassan@beaconanalytics.io", lastActivityDate: new Date(Date.now() - 4 * 864e5).toISOString(), engagementScore: 87 },
    ],
    lastSyncedAt: now,
  },

  "acc-crestline-005": {
    accountId: "acc-crestline-005",
    accountName: "Crestline Capital",
    arr: 1_200_000,
    renewalDate: new Date(Date.now() + 130 * 864e5).toISOString(),
    healthScore: 41,
    opportunities: [
      { id: "opp-cr1", name: "Crestline Capital — Renewal FY26", stage: "Discovery", amount: 1_080_000, closeDate: new Date(Date.now() + 120 * 864e5).toISOString().split("T")[0], probability: 50, type: "Renewal" },
      { id: "opp-cr2", name: "Crestline — AI Rebalancing Module", stage: "Prospecting", amount: 180_000, closeDate: new Date(Date.now() + 200 * 864e5).toISOString().split("T")[0], probability: 30, type: "Upsell" },
    ],
    contacts: [
      { id: "c-cr1", name: "Oliver Hartmann", title: "COO", email: "o.hartmann@crestlinecapital.co.uk", lastActivityDate: new Date(Date.now() - 10 * 864e5).toISOString(), engagementScore: 45 },
      { id: "c-cr2", name: "Amara Diallo", title: "Engineering Lead", email: "a.diallo@crestlinecapital.co.uk", lastActivityDate: new Date(Date.now() - 6 * 864e5).toISOString(), engagementScore: 38 },
    ],
    lastSyncedAt: now,
  },
};

export function getMockSalesforceData(accountId: string): SalesforceData {
  return (
    MOCK_DATA[accountId] ?? {
      accountId,
      accountName: "Unknown",
      arr: 0,
      renewalDate: new Date().toISOString(),
      healthScore: 50,
      opportunities: [],
      contacts: [],
      lastSyncedAt: now,
    }
  );
}
