import type { WorksphereData } from "./contract";

const now = new Date().toISOString();

function daysAgo(n: number) {
  return new Date(Date.now() - n * 864e5).toISOString();
}

const MOCK_DATA: Record<string, WorksphereData> = {
  "acc-helix-001": {
    accountId: "acc-helix-001",
    activeUsers: 18,
    totalLicenses: 30,
    utilizationPct: 60,
    engagement: {
      loginFrequency: 1.8,
      featureAdoptionPct: 29,
      lastLoginDate: daysAgo(1),
      powerUsers: 3,
      inactiveUsers: 11,
    },
    recentMeetings: [
      { id: "m-h1", title: "Helix — Platform Status Call", date: daysAgo(14), attendees: ["Jordan Walsh", "Sarah Chen"], durationMinutes: 30, hasRecording: false, sentiment: "negative" },
      { id: "m-h2", title: "Helix — API Migration Debrief", date: daysAgo(21), attendees: ["Nina Osei", "Sarah Chen", "Priya Nair"], durationMinutes: 60, hasRecording: true, sentiment: "negative" },
    ],
    npsScore: 11,
    npsSampleSize: 12,
    lastSyncedAt: now,
  },

  "acc-clearbridge-002": {
    accountId: "acc-clearbridge-002",
    activeUsers: 34,
    totalLicenses: 50,
    utilizationPct: 68,
    engagement: {
      loginFrequency: 3.2,
      featureAdoptionPct: 52,
      lastLoginDate: daysAgo(1),
      powerUsers: 8,
      inactiveUsers: 12,
    },
    recentMeetings: [
      { id: "m-c1", title: "ClearBridge — Q1 Check-in", date: daysAgo(10), attendees: ["Dr. Ravi Menon", "Sarah Chen"], durationMinutes: 45, hasRecording: false, sentiment: "neutral" },
    ],
    npsScore: 30,
    npsSampleSize: 20,
    lastSyncedAt: now,
  },

  "acc-ironclad-003": {
    accountId: "acc-ironclad-003",
    activeUsers: 62,
    totalLicenses: 70,
    utilizationPct: 89,
    engagement: {
      loginFrequency: 5.8,
      featureAdoptionPct: 81,
      lastLoginDate: daysAgo(0),
      powerUsers: 28,
      inactiveUsers: 2,
    },
    recentMeetings: [
      { id: "m-i1", title: "Ironclad — Q1 QBR", date: daysAgo(12), attendees: ["Pieter van Dijk", "Lena Hofer", "Marcus Okafor"], durationMinutes: 90, hasRecording: true, sentiment: "positive" },
      { id: "m-i2", title: "Ironclad — Expansion Scoping", date: daysAgo(5), attendees: ["Pieter van Dijk", "Marcus Okafor"], durationMinutes: 60, hasRecording: false, sentiment: "positive" },
    ],
    npsScore: 74,
    npsSampleSize: 35,
    lastSyncedAt: now,
  },

  "acc-beacon-004": {
    accountId: "acc-beacon-004",
    activeUsers: 58,
    totalLicenses: 60,
    utilizationPct: 97,
    engagement: {
      loginFrequency: 6.2,
      featureAdoptionPct: 88,
      lastLoginDate: daysAgo(0),
      powerUsers: 31,
      inactiveUsers: 1,
    },
    recentMeetings: [
      { id: "m-b1", title: "Beacon — Sprint Review", date: daysAgo(7), attendees: ["Tariq Hassan", "Marcus Okafor"], durationMinutes: 45, hasRecording: true, sentiment: "positive" },
      { id: "m-b2", title: "Beacon — Enterprise Tier Discussion", date: daysAgo(3), attendees: ["Zoe Park", "Marcus Okafor"], durationMinutes: 30, hasRecording: false, sentiment: "positive" },
    ],
    npsScore: 83,
    npsSampleSize: 42,
    lastSyncedAt: now,
  },

  "acc-nexacloud-006": {
    accountId: "acc-nexacloud-006",
    activeUsers: 82,
    totalLicenses: 90,
    utilizationPct: 91,
    engagement: {
      loginFrequency: 5.1,
      featureAdoptionPct: 79,
      lastLoginDate: daysAgo(0),
      powerUsers: 34,
      inactiveUsers: 3,
    },
    recentMeetings: [
      { id: "m-nx1", title: "NexaCloud — AI Module Expansion Workshop", date: daysAgo(6), attendees: ["Daniel Park", "Sarah Chen"], durationMinutes: 60, hasRecording: true, sentiment: "positive" },
      { id: "m-nx2", title: "NexaCloud — Platform Health Check", date: daysAgo(13), attendees: ["Maya Iqbal", "Sarah Chen"], durationMinutes: 45, hasRecording: false, sentiment: "positive" },
    ],
    npsScore: 68,
    npsSampleSize: 31,
    lastSyncedAt: now,
  },

  "acc-vertex-007": {
    accountId: "acc-vertex-007",
    activeUsers: 96,
    totalLicenses: 100,
    utilizationPct: 96,
    engagement: {
      loginFrequency: 6.4,
      featureAdoptionPct: 88,
      lastLoginDate: daysAgo(0),
      powerUsers: 52,
      inactiveUsers: 1,
    },
    recentMeetings: [
      { id: "m-vx1", title: "Vertex Systems — Executive Expansion Review", date: daysAgo(4), attendees: ["Sandra Lee", "Marcus Okafor"], durationMinutes: 60, hasRecording: true, sentiment: "positive" },
      { id: "m-vx2", title: "Vertex Systems — Delivery Standup", date: daysAgo(1), attendees: ["Ethan Brooks", "Marcus Okafor"], durationMinutes: 30, hasRecording: false, sentiment: "positive" },
    ],
    npsScore: 88,
    npsSampleSize: 44,
    lastSyncedAt: now,
  },

  "acc-medisync-008": {
    accountId: "acc-medisync-008",
    activeUsers: 44,
    totalLicenses: 80,
    utilizationPct: 55,
    engagement: {
      loginFrequency: 2.1,
      featureAdoptionPct: 48,
      lastLoginDate: daysAgo(2),
      powerUsers: 7,
      inactiveUsers: 24,
    },
    recentMeetings: [
      { id: "m-md1", title: "MediSync — Integration Escalation", date: daysAgo(3), attendees: ["Dr. Patricia Obi", "Sarah Chen"], durationMinutes: 45, hasRecording: false, sentiment: "negative" },
      { id: "m-md2", title: "MediSync — Renewal Risk Review", date: daysAgo(11), attendees: ["Liam Chen", "Sarah Chen"], durationMinutes: 60, hasRecording: true, sentiment: "negative" },
    ],
    npsScore: 32,
    npsSampleSize: 26,
    lastSyncedAt: now,
  },

  "acc-crestline-005": {
    accountId: "acc-crestline-005",
    activeUsers: 44,
    totalLicenses: 80,
    utilizationPct: 55,
    engagement: {
      loginFrequency: 2.4,
      featureAdoptionPct: 38,
      lastLoginDate: daysAgo(1),
      powerUsers: 6,
      inactiveUsers: 22,
    },
    recentMeetings: [
      { id: "m-cr1", title: "Crestline — Issue Escalation Call", date: daysAgo(5), attendees: ["Oliver Hartmann", "Sarah Chen"], durationMinutes: 45, hasRecording: false, sentiment: "negative" },
      { id: "m-cr2", title: "Crestline — Analytics Module Review", date: daysAgo(12), attendees: ["Amara Diallo", "Sarah Chen"], durationMinutes: 60, hasRecording: true, sentiment: "negative" },
    ],
    npsScore: 25,
    npsSampleSize: 28,
    lastSyncedAt: now,
  },
};

export function getMockWorksphereData(accountId: string): WorksphereData {
  return (
    MOCK_DATA[accountId] ?? {
      accountId,
      activeUsers: 0,
      totalLicenses: 0,
      utilizationPct: 0,
      engagement: { loginFrequency: 0, featureAdoptionPct: 0, lastLoginDate: now, powerUsers: 0, inactiveUsers: 0 },
      recentMeetings: [],
      npsScore: null,
      npsSampleSize: 0,
      lastSyncedAt: now,
    }
  );
}
