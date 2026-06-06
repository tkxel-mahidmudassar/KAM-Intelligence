import type { JiraData, JiraTicket } from "./contract";

const now = new Date().toISOString();

function daysAgo(n: number) {
  return new Date(Date.now() - n * 864e5).toISOString();
}

const MOCK_DATA: Record<string, JiraData> = {
  "acc-helix-001": {
    accountId: "acc-helix-001",
    projectKey: "HLX",
    openTickets: 52,
    criticalTickets: 8,
    avgResolutionDays: 12.4,
    activeSprint: {
      id: "sp-hlx-14",
      name: "Helix Sprint 14",
      state: "active",
      startDate: daysAgo(7),
      endDate: new Date(Date.now() + 7 * 864e5).toISOString(),
      completedPoints: 18,
      totalPoints: 42,
      velocity: 43,
    },
    tickets: [
      { id: "t-h1", key: "HLX-201", summary: "Payment gateway timeout on high-volume transactions", status: "Open", priority: "Blocker", type: "Incident", createdAt: daysAgo(5), updatedAt: daysAgo(1), resolvedAt: null, assignee: null, labels: ["gateway", "v4.1"] },
      { id: "t-h2", key: "HLX-198", summary: "API rate limiting inconsistency post v4.1 migration", status: "In Progress", priority: "Critical", type: "Bug", createdAt: daysAgo(8), updatedAt: daysAgo(2), resolvedAt: null, assignee: "eng-team", labels: ["api", "v4.1"] },
      { id: "t-h3", key: "HLX-195", summary: "Webhook delivery failures for card_updated events", status: "Open", priority: "Critical", type: "Bug", createdAt: daysAgo(10), updatedAt: daysAgo(3), resolvedAt: null, assignee: null, labels: ["webhooks"] },
      { id: "t-h4", key: "HLX-188", summary: "Sandbox environment out of sync with production schema", status: "Open", priority: "Major", type: "Bug", createdAt: daysAgo(14), updatedAt: daysAgo(5), resolvedAt: null, assignee: null, labels: ["sandbox"] },
      { id: "t-h5", key: "HLX-180", summary: "Dashboard analytics not reflecting real-time data", status: "Open", priority: "Major", type: "Bug", createdAt: daysAgo(18), updatedAt: daysAgo(6), resolvedAt: null, assignee: null, labels: ["dashboard"] },
    ],
    lastSyncedAt: now,
  },

  "acc-clearbridge-002": {
    accountId: "acc-clearbridge-002",
    projectKey: "CBH",
    openTickets: 24,
    criticalTickets: 2,
    avgResolutionDays: 7.1,
    activeSprint: {
      id: "sp-cbh-9",
      name: "ClearBridge Sprint 9",
      state: "active",
      startDate: daysAgo(5),
      endDate: new Date(Date.now() + 9 * 864e5).toISOString(),
      completedPoints: 22,
      totalPoints: 38,
      velocity: 58,
    },
    tickets: [
      { id: "t-c1", key: "CBH-88", summary: "SSO login failure for Okta-federated users", status: "In Progress", priority: "Critical", type: "Bug", createdAt: daysAgo(9), updatedAt: daysAgo(1), resolvedAt: null, assignee: "eng-sso", labels: ["sso", "auth"] },
      { id: "t-c2", key: "CBH-85", summary: "CSV export corrupted for date range > 90 days", status: "Open", priority: "Major", type: "Bug", createdAt: daysAgo(12), updatedAt: daysAgo(4), resolvedAt: null, assignee: null, labels: ["export"] },
      { id: "t-c3", key: "CBH-79", summary: "Clinical workflow v4 navigation — staff confusion reported", status: "Open", priority: "Major", type: "Story", createdAt: daysAgo(16), updatedAt: daysAgo(7), resolvedAt: null, assignee: null, labels: ["ux", "v4"] },
    ],
    lastSyncedAt: now,
  },

  "acc-ironclad-003": {
    accountId: "acc-ironclad-003",
    projectKey: "ILC",
    openTickets: 3,
    criticalTickets: 0,
    avgResolutionDays: 2.8,
    activeSprint: {
      id: "sp-ilc-21",
      name: "Ironclad Sprint 21",
      state: "active",
      startDate: daysAgo(6),
      endDate: new Date(Date.now() + 8 * 864e5).toISOString(),
      completedPoints: 34,
      totalPoints: 40,
      velocity: 85,
    },
    tickets: [
      { id: "t-i1", key: "ILC-312", summary: "Minor UI polish on route optimisation map view", status: "In Progress", priority: "Minor", type: "Task", createdAt: daysAgo(4), updatedAt: daysAgo(1), resolvedAt: null, assignee: "ux-team", labels: ["ui"] },
      { id: "t-i2", key: "ILC-310", summary: "Add support for multi-stop route export (PDF)", status: "Open", priority: "Minor", type: "Story", createdAt: daysAgo(6), updatedAt: daysAgo(2), resolvedAt: null, assignee: null, labels: ["export"] },
    ],
    lastSyncedAt: now,
  },

  "acc-beacon-004": {
    accountId: "acc-beacon-004",
    projectKey: "BCN",
    openTickets: 2,
    criticalTickets: 0,
    avgResolutionDays: 1.9,
    activeSprint: {
      id: "sp-bcn-18",
      name: "Beacon Sprint 18",
      state: "active",
      startDate: daysAgo(4),
      endDate: new Date(Date.now() + 10 * 864e5).toISOString(),
      completedPoints: 41,
      totalPoints: 45,
      velocity: 91,
    },
    tickets: [
      { id: "t-b1", key: "BCN-204", summary: "Increase retention window for query history to 90 days", status: "In Progress", priority: "Minor", type: "Story", createdAt: daysAgo(3), updatedAt: daysAgo(1), resolvedAt: null, assignee: "be-team", labels: ["data-retention"] },
    ],
    lastSyncedAt: now,
  },

  "acc-nexacloud-006": {
    accountId: "acc-nexacloud-006",
    projectKey: "NXC",
    openTickets: 4,
    criticalTickets: 0,
    avgResolutionDays: 2.6,
    activeSprint: {
      id: "sp-nxc-12",
      name: "NexaCloud Sprint 12",
      state: "active",
      startDate: daysAgo(5),
      endDate: new Date(Date.now() + 9 * 864e5).toISOString(),
      completedPoints: 36,
      totalPoints: 42,
      velocity: 86,
    },
    tickets: [
      { id: "t-nx1", key: "NXC-144", summary: "AI module export polish before expansion demo", status: "In Progress", priority: "Minor", type: "Task", createdAt: daysAgo(3), updatedAt: daysAgo(1), resolvedAt: null, assignee: "growth-team", labels: ["ai-module", "expansion"] },
      { id: "t-nx2", key: "NXC-139", summary: "Document autosave occasionally delays under large payloads", status: "Open", priority: "Minor", type: "Bug", createdAt: daysAgo(6), updatedAt: daysAgo(2), resolvedAt: null, assignee: null, labels: ["autosave"] },
    ],
    lastSyncedAt: now,
  },

  "acc-vertex-007": {
    accountId: "acc-vertex-007",
    projectKey: "VTX",
    openTickets: 1,
    criticalTickets: 0,
    avgResolutionDays: 1.4,
    activeSprint: {
      id: "sp-vtx-19",
      name: "Vertex Sprint 19",
      state: "active",
      startDate: daysAgo(4),
      endDate: new Date(Date.now() + 10 * 864e5).toISOString(),
      completedPoints: 49,
      totalPoints: 50,
      velocity: 98,
    },
    tickets: [
      { id: "t-vx1", key: "VTX-222", summary: "Finalize $200K platform expansion proposal artifacts", status: "In Progress", priority: "Minor", type: "Task", createdAt: daysAgo(2), updatedAt: daysAgo(0), resolvedAt: null, assignee: "solutions-team", labels: ["expansion", "proposal"] },
    ],
    lastSyncedAt: now,
  },

  "acc-medisync-008": {
    accountId: "acc-medisync-008",
    projectKey: "MDS",
    openTickets: 31,
    criticalTickets: 6,
    avgResolutionDays: 11.7,
    activeSprint: {
      id: "sp-mds-7",
      name: "MediSync Sprint 7",
      state: "active",
      startDate: daysAgo(8),
      endDate: new Date(Date.now() + 6 * 864e5).toISOString(),
      completedPoints: 18,
      totalPoints: 38,
      velocity: 47,
    },
    tickets: [
      { id: "t-md1", key: "MDS-91", summary: "Integration mapping failures on clinical data import", status: "Open", priority: "Critical", type: "Incident", createdAt: daysAgo(4), updatedAt: daysAgo(1), resolvedAt: null, assignee: null, labels: ["integration", "clinical-import"] },
      { id: "t-md2", key: "MDS-88", summary: "Eligibility sync jobs timing out for enterprise tenants", status: "In Progress", priority: "Critical", type: "Bug", createdAt: daysAgo(7), updatedAt: daysAgo(2), resolvedAt: null, assignee: "integration-team", labels: ["sync"] },
      { id: "t-md3", key: "MDS-84", summary: "Slow patient record lookup during peak hours", status: "Open", priority: "Major", type: "Bug", createdAt: daysAgo(12), updatedAt: daysAgo(3), resolvedAt: null, assignee: null, labels: ["performance"] },
    ],
    lastSyncedAt: now,
  },

  "acc-crestline-005": {
    accountId: "acc-crestline-005",
    projectKey: "CRL",
    openTickets: 41,
    criticalTickets: 5,
    avgResolutionDays: 10.2,
    activeSprint: {
      id: "sp-crl-16",
      name: "Crestline Sprint 16",
      state: "active",
      startDate: daysAgo(8),
      endDate: new Date(Date.now() + 6 * 864e5).toISOString(),
      completedPoints: 12,
      totalPoints: 38,
      velocity: 32,
    },
    tickets: [
      { id: "t-cr1", key: "CRL-178", summary: "Portfolio analytics chart renders incorrect allocation %", status: "Open", priority: "Critical", type: "Bug", createdAt: daysAgo(6), updatedAt: daysAgo(1), resolvedAt: null, assignee: null, labels: ["analytics", "v2.1"] },
      { id: "t-cr2", key: "CRL-175", summary: "Rebalancing suggestions not persisting after page refresh", status: "Open", priority: "Critical", type: "Bug", createdAt: daysAgo(7), updatedAt: daysAgo(2), resolvedAt: null, assignee: null, labels: ["analytics", "v2.1"] },
      { id: "t-cr3", key: "CRL-170", summary: "PDF report export fails for portfolios > 50 holdings", status: "In Progress", priority: "Major", type: "Bug", createdAt: daysAgo(10), updatedAt: daysAgo(2), resolvedAt: null, assignee: "be-team", labels: ["export", "analytics"] },
      { id: "t-cr4", key: "CRL-164", summary: "FCA compliance audit trail missing entries for bulk actions", status: "Open", priority: "Critical", type: "Bug", createdAt: daysAgo(14), updatedAt: daysAgo(4), resolvedAt: null, assignee: null, labels: ["compliance", "audit"] },
      { id: "t-cr5", key: "CRL-158", summary: "Benchmark comparison data stale by up to 48h", status: "Open", priority: "Major", type: "Bug", createdAt: daysAgo(18), updatedAt: daysAgo(5), resolvedAt: null, assignee: null, labels: ["analytics", "data"] },
    ],
    lastSyncedAt: now,
  },
};

export function getMockJiraData(accountId: string): JiraData {
  return (
    MOCK_DATA[accountId] ?? {
      accountId,
      projectKey: "UNK",
      openTickets: 0,
      criticalTickets: 0,
      avgResolutionDays: 0,
      tickets: [],
      activeSprint: null,
      lastSyncedAt: now,
    }
  );
}
