import {
  PrismaClient,
  AccountHealth,
  ActionStatus,
  ActionPriority,
  ActionSource,
  SignalType,
  SignalSeverity,
  DocumentType,
  QbrType,
  QbrStatus,
  KycStatus,
  InsightType,
  Role,
} from "@prisma/client";

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding KAM Intelligence database...\n");

  // ── Users ──────────────────────────────────────────────────────────────────

  const sarah = await prisma.user.upsert({
    where: { email: "sarah.chen@tkxel.com" },
    update: {},
    create: { email: "sarah.chen@tkxel.com", name: "Sarah Chen", role: Role.KAM },
  });

  const marcus = await prisma.user.upsert({
    where: { email: "marcus.okafor@tkxel.com" },
    update: {},
    create: { email: "marcus.okafor@tkxel.com", name: "Marcus Okafor", role: Role.KAM },
  });

  await prisma.user.upsert({
    where: { email: "priya.nair@tkxel.com" },
    update: {},
    create: { email: "priya.nair@tkxel.com", name: "Priya Nair", role: Role.MANAGER },
  });

  await prisma.user.upsert({
    where: { email: "daniel.west@tkxel.com" },
    update: {},
    create: { email: "daniel.west@tkxel.com", name: "Daniel West", role: Role.EXECUTIVE },
  });

  console.log("✅  Users created");

  // ── Accounts ───────────────────────────────────────────────────────────────

  // 1. Helix Payments — CRITICAL (fintech, contract expiring soon, churn imminent)
  const helix = await prisma.account.upsert({
    where: { id: "acc-helix-001" },
    update: {},
    create: {
      id: "acc-helix-001",
      name: "Helix Payments",
      industry: "Fintech",
      region: "North America",
      country: "USA",
      website: "https://helixpayments.com",
      arr: 1_750_000,
      contractStart: daysAgo(510),
      contractEnd: daysFromNow(55),
      health: AccountHealth.CRITICAL,
      healthUpdatedAt: daysAgo(2),
      kamId: sarah.id,
    },
  });

  // 2. ClearBridge Health — AT_RISK (health-tech, engagement slipping)
  const clearbridge = await prisma.account.upsert({
    where: { id: "acc-clearbridge-002" },
    update: {},
    create: {
      id: "acc-clearbridge-002",
      name: "ClearBridge Health",
      industry: "Healthcare Technology",
      region: "North America",
      country: "Canada",
      website: "https://clearbridgehealth.ca",
      arr: 870_000,
      contractStart: daysAgo(390),
      contractEnd: daysFromNow(210),
      health: AccountHealth.AT_RISK,
      healthUpdatedAt: daysAgo(6),
      kamId: sarah.id,
    },
  });

  // 3. Ironclad Logistics — HEALTHY (supply-chain SaaS, expanding)
  const ironclad = await prisma.account.upsert({
    where: { id: "acc-ironclad-003" },
    update: {},
    create: {
      id: "acc-ironclad-003",
      name: "Ironclad Logistics",
      industry: "Supply Chain & Logistics",
      region: "Europe",
      country: "Netherlands",
      website: "https://ironcladlogistics.nl",
      arr: 720_000,
      contractStart: daysAgo(240),
      contractEnd: daysFromNow(490),
      health: AccountHealth.HEALTHY,
      healthUpdatedAt: daysAgo(1),
      kamId: marcus.id,
    },
  });

  // 4. Beacon Analytics — HEALTHY (data/SaaS startup, upsell ready)
  const beacon = await prisma.account.upsert({
    where: { id: "acc-beacon-004" },
    update: {},
    create: {
      id: "acc-beacon-004",
      name: "Beacon Analytics",
      industry: "SaaS / Data",
      region: "North America",
      country: "USA",
      website: "https://beaconanalytics.io",
      arr: 510_000,
      contractStart: daysAgo(150),
      contractEnd: daysFromNow(580),
      health: AccountHealth.HEALTHY,
      healthUpdatedAt: daysAgo(1),
      kamId: marcus.id,
    },
  });

  // 5. Crestline Capital — AT_RISK (investment platform, ticket spike + sentiment drop)
  const crestline = await prisma.account.upsert({
    where: { id: "acc-crestline-005" },
    update: {},
    create: {
      id: "acc-crestline-005",
      name: "Crestline Capital",
      industry: "Financial Services",
      region: "Europe",
      country: "UK",
      website: "https://crestlinecapital.co.uk",
      arr: 1_200_000,
      contractStart: daysAgo(640),
      contractEnd: daysFromNow(130),
      health: AccountHealth.AT_RISK,
      healthUpdatedAt: daysAgo(4),
      kamId: sarah.id,
    },
  });

  // 6. NexaCloud Ltd — HEALTHY (cloud infrastructure, upsell ready, long-term partner)
  // Assigned to Sarah so her portfolio has a healthy account
  const nexacloud = await prisma.account.upsert({
    where: { id: "acc-nexacloud-006" },
    update: { kamId: sarah.id },
    create: {
      id: "acc-nexacloud-006",
      name: "NexaCloud Ltd",
      industry: "Cloud Infrastructure",
      region: "North America",
      country: "USA",
      website: "https://nexacloud.io",
      arr: 680_000,
      contractStart: daysAgo(480),
      contractEnd: daysFromNow(240),
      health: AccountHealth.HEALTHY,
      healthUpdatedAt: daysAgo(1),
      kamId: sarah.id,
    },
  });

  // 7. Vertex Systems — HEALTHY (enterprise software, strong client sentiment, expansion in progress)
  // Assigned to Sarah so her portfolio has a second healthy account
  const vertex = await prisma.account.upsert({
    where: { id: "acc-vertex-007" },
    update: { kamId: sarah.id },
    create: {
      id: "acc-vertex-007",
      name: "Vertex Systems",
      industry: "Enterprise Software",
      region: "North America",
      country: "USA",
      website: "https://vertexsystems.com",
      arr: 920_000,
      contractStart: daysAgo(720),
      contractEnd: daysFromNow(190),
      health: AccountHealth.HEALTHY,
      healthUpdatedAt: daysAgo(2),
      kamId: sarah.id,
    },
  });

  // 8. MediSync Health — AT_RISK (healthcare IT, integration delays, engagement dip)
  const medisync = await prisma.account.upsert({
    where: { id: "acc-medisync-008" },
    update: {},
    create: {
      id: "acc-medisync-008",
      name: "MediSync Health",
      industry: "Healthcare IT",
      region: "North America",
      country: "Canada",
      website: "https://medisynchealth.ca",
      arr: 450_000,
      contractStart: daysAgo(310),
      contractEnd: daysFromNow(95),
      health: AccountHealth.AT_RISK,
      healthUpdatedAt: daysAgo(3),
      kamId: sarah.id,
    },
  });

  console.log("✅  Accounts created");

  // ── Contacts ───────────────────────────────────────────────────────────────

  await prisma.accountContact.createMany({
    skipDuplicates: true,
    data: [
      // Helix Payments
      { accountId: helix.id, name: "Jordan Walsh", title: "CTO", email: "j.walsh@helixpayments.com", isPrimary: true },
      { accountId: helix.id, name: "Nina Osei", title: "VP Product", email: "n.osei@helixpayments.com", isPrimary: false },
      { accountId: helix.id, name: "Carlos Reyes", title: "Head of Engineering", email: "c.reyes@helixpayments.com", isPrimary: false },
      // ClearBridge
      { accountId: clearbridge.id, name: "Dr. Ravi Menon", title: "Chief Digital Officer", email: "r.menon@clearbridgehealth.ca", isPrimary: true },
      { accountId: clearbridge.id, name: "Chloe Fournier", title: "IT Director", email: "c.fournier@clearbridgehealth.ca", isPrimary: false },
      { accountId: clearbridge.id, name: "Ben Mackay", title: "Clinical Systems Manager", email: "b.mackay@clearbridgehealth.ca", isPrimary: false },
      // Ironclad
      { accountId: ironclad.id, name: "Pieter van Dijk", title: "Head of Technology", email: "p.vandijk@ironcladlogistics.nl", isPrimary: true },
      { accountId: ironclad.id, name: "Lena Hofer", title: "Operations Director", email: "l.hofer@ironcladlogistics.nl", isPrimary: false },
      // Beacon
      { accountId: beacon.id, name: "Zoe Park", title: "CEO", email: "z.park@beaconanalytics.io", isPrimary: true },
      { accountId: beacon.id, name: "Tariq Hassan", title: "CTO", email: "t.hassan@beaconanalytics.io", isPrimary: false },
      { accountId: beacon.id, name: "Maya Flores", title: "Head of Data Engineering", email: "m.flores@beaconanalytics.io", isPrimary: false },
      // Crestline
      { accountId: crestline.id, name: "Oliver Hartmann", title: "COO", email: "o.hartmann@crestlinecapital.co.uk", isPrimary: true },
      { accountId: crestline.id, name: "Amara Diallo", title: "Engineering Lead", email: "a.diallo@crestlinecapital.co.uk", isPrimary: false },
      { accountId: crestline.id, name: "Rebecca Stone", title: "Head of Compliance", email: "r.stone@crestlinecapital.co.uk", isPrimary: false },
      // NexaCloud
      { accountId: nexacloud.id, name: "Alex Thornton", title: "CTO", email: "a.thornton@nexacloud.io", isPrimary: true },
      { accountId: nexacloud.id, name: "Priya Sharma", title: "VP Engineering", email: "p.sharma@nexacloud.io", isPrimary: false },
      // Vertex Systems
      { accountId: vertex.id, name: "Michael Kane", title: "CEO", email: "m.kane@vertexsystems.com", isPrimary: true },
      { accountId: vertex.id, name: "Sandra Lee", title: "Head of Customer Success", email: "s.lee@vertexsystems.com", isPrimary: false },
      // MediSync
      { accountId: medisync.id, name: "Dr. Patricia Obi", title: "CIO", email: "p.obi@medisynchealth.ca", isPrimary: true },
      { accountId: medisync.id, name: "James Whitfield", title: "IT Operations Manager", email: "j.whitfield@medisynchealth.ca", isPrimary: false },
    ],
  });

  console.log("✅  Contacts created");

  // ── KPI Dimensions ─────────────────────────────────────────────────────────

  await prisma.kpiDimension.createMany({
    data: [
      // Helix Payments — struggling
      { accountId: helix.id, name: "Revenue Utilisation", category: "financial", value: 54, target: 90, unit: "%", trend: "down", trendPct: -20, period: "2025-Q1", source: "salesforce" },
      { accountId: helix.id, name: "Open Support Tickets", category: "support", value: 52, target: 10, unit: "count", trend: "up", trendPct: 140, period: "2025-Q1", source: "jira" },
      { accountId: helix.id, name: "Client Sentiment", category: "engagement", value: 11, target: 50, unit: "score", trend: "down", trendPct: -38, period: "2025-Q1", source: "manual" },
      { accountId: helix.id, name: "Feature Adoption", category: "engagement", value: 29, target: 70, unit: "%", trend: "down", trendPct: -15, period: "2025-Q1", source: "manual" },
      { accountId: helix.id, name: "Exec Engagement", category: "relationship", value: 15, target: 80, unit: "%", trend: "down", trendPct: -45, period: "2025-Q1", source: "manual" },
      { accountId: helix.id, name: "CSAT", category: "support", value: 2.8, target: 4.5, unit: "/5", trend: "down", trendPct: -22, period: "2025-Q1", source: "manual" },

      // ClearBridge — sliding
      { accountId: clearbridge.id, name: "Revenue Utilisation", category: "financial", value: 72, target: 90, unit: "%", trend: "down", trendPct: -9, period: "2025-Q1", source: "salesforce" },
      { accountId: clearbridge.id, name: "Open Support Tickets", category: "support", value: 24, target: 12, unit: "count", trend: "up", trendPct: 50, period: "2025-Q1", source: "jira" },
      { accountId: clearbridge.id, name: "Client Sentiment", category: "engagement", value: 30, target: 55, unit: "score", trend: "flat", trendPct: -2, period: "2025-Q1", source: "manual" },
      { accountId: clearbridge.id, name: "Monthly Active Users", category: "engagement", value: 59, target: 80, unit: "%", trend: "down", trendPct: -8, period: "2025-Q1", source: "manual" },
      { accountId: clearbridge.id, name: "Onboarding Completion", category: "engagement", value: 44, target: 85, unit: "%", trend: "down", trendPct: -18, period: "2025-Q1", source: "manual" },

      // Ironclad — strong
      { accountId: ironclad.id, name: "Revenue Utilisation", category: "financial", value: 96, target: 90, unit: "%", trend: "up", trendPct: 7, period: "2025-Q1", source: "salesforce" },
      { accountId: ironclad.id, name: "Open Support Tickets", category: "support", value: 3, target: 10, unit: "count", trend: "down", trendPct: -60, period: "2025-Q1", source: "jira" },
      { accountId: ironclad.id, name: "Client Sentiment", category: "engagement", value: 74, target: 60, unit: "score", trend: "up", trendPct: 14, period: "2025-Q1", source: "manual" },
      { accountId: ironclad.id, name: "Expansion ARR Pipeline", category: "financial", value: 200_000, target: 100_000, unit: "$", trend: "up", trendPct: 100, period: "2025-Q1", source: "salesforce" },
      { accountId: ironclad.id, name: "On-Time Delivery Rate", category: "engagement", value: 97, target: 90, unit: "%", trend: "up", trendPct: 5, period: "2025-Q1", source: "jira" },

      // Beacon — growing fast
      { accountId: beacon.id, name: "Revenue Utilisation", category: "financial", value: 99, target: 90, unit: "%", trend: "up", trendPct: 9, period: "2025-Q1", source: "salesforce" },
      { accountId: beacon.id, name: "Open Support Tickets", category: "support", value: 2, target: 8, unit: "count", trend: "flat", trendPct: 0, period: "2025-Q1", source: "jira" },
      { accountId: beacon.id, name: "Client Sentiment", category: "engagement", value: 83, target: 65, unit: "score", trend: "up", trendPct: 17, period: "2025-Q1", source: "manual" },
      { accountId: beacon.id, name: "Sprint Velocity", category: "engagement", value: 91, target: 80, unit: "%", trend: "up", trendPct: 11, period: "2025-Q1", source: "jira" },
      { accountId: beacon.id, name: "Daily Active Users", category: "engagement", value: 78, target: 70, unit: "%", trend: "up", trendPct: 8, period: "2025-Q1", source: "manual" },

      // Crestline — warning signs
      { accountId: crestline.id, name: "Revenue Utilisation", category: "financial", value: 67, target: 90, unit: "%", trend: "down", trendPct: -16, period: "2025-Q1", source: "salesforce" },
      { accountId: crestline.id, name: "Open Support Tickets", category: "support", value: 41, target: 15, unit: "count", trend: "up", trendPct: 95, period: "2025-Q1", source: "jira" },
      { accountId: crestline.id, name: "Client Sentiment", category: "engagement", value: 25, target: 50, unit: "score", trend: "down", trendPct: -25, period: "2025-Q1", source: "manual" },
      { accountId: crestline.id, name: "Exec Engagement", category: "relationship", value: 40, target: 75, unit: "%", trend: "down", trendPct: -22, period: "2025-Q1", source: "manual" },
      { accountId: crestline.id, name: "Bug Resolution Time", category: "support", value: 14, target: 5, unit: "days", trend: "up", trendPct: 75, period: "2025-Q1", source: "jira" },

      // NexaCloud — strong growth
      { accountId: nexacloud.id, name: "Revenue Utilisation", category: "financial", value: 108, target: 90, unit: "%", trend: "up", trendPct: 12, period: "2025-Q1", source: "salesforce" },
      { accountId: nexacloud.id, name: "Open Support Tickets", category: "support", value: 4, target: 10, unit: "count", trend: "down", trendPct: -33, period: "2025-Q1", source: "jira" },
      { accountId: nexacloud.id, name: "Client Sentiment", category: "engagement", value: 68, target: 55, unit: "score", trend: "up", trendPct: 9, period: "2025-Q1", source: "manual" },
      { accountId: nexacloud.id, name: "Platform Utilisation", category: "engagement", value: 91, target: 80, unit: "%", trend: "up", trendPct: 6, period: "2025-Q1", source: "manual" },
      { accountId: nexacloud.id, name: "Feature Adoption", category: "engagement", value: 79, target: 70, unit: "%", trend: "up", trendPct: 11, period: "2025-Q1", source: "manual" },

      // Vertex Systems — excellent
      { accountId: vertex.id, name: "Revenue Utilisation", category: "financial", value: 112, target: 90, unit: "%", trend: "up", trendPct: 18, period: "2025-Q1", source: "salesforce" },
      { accountId: vertex.id, name: "Open Support Tickets", category: "support", value: 1, target: 8, unit: "count", trend: "down", trendPct: -80, period: "2025-Q1", source: "jira" },
      { accountId: vertex.id, name: "Client Sentiment", category: "engagement", value: 88, target: 65, unit: "score", trend: "up", trendPct: 21, period: "2025-Q1", source: "manual" },
      { accountId: vertex.id, name: "Exec Engagement", category: "relationship", value: 95, target: 75, unit: "%", trend: "up", trendPct: 15, period: "2025-Q1", source: "manual" },
      { accountId: vertex.id, name: "Sprint Delivery Rate", category: "engagement", value: 98, target: 90, unit: "%", trend: "up", trendPct: 4, period: "2025-Q1", source: "jira" },

      // MediSync — at risk
      { accountId: medisync.id, name: "Revenue Utilisation", category: "financial", value: 61, target: 90, unit: "%", trend: "down", trendPct: -14, period: "2025-Q1", source: "salesforce" },
      { accountId: medisync.id, name: "Open Support Tickets", category: "support", value: 31, target: 12, unit: "count", trend: "up", trendPct: 72, period: "2025-Q1", source: "jira" },
      { accountId: medisync.id, name: "Client Sentiment", category: "engagement", value: 32, target: 55, unit: "score", trend: "down", trendPct: -19, period: "2025-Q1", source: "manual" },
      { accountId: medisync.id, name: "Integration Completion", category: "engagement", value: 48, target: 85, unit: "%", trend: "flat", trendPct: 2, period: "2025-Q1", source: "jira" },
      { accountId: medisync.id, name: "Monthly Active Users", category: "engagement", value: 55, target: 80, unit: "%", trend: "down", trendPct: -11, period: "2025-Q1", source: "manual" },
    ],
  });

  console.log("✅  KPI Dimensions created");

  // ── KAM Scores (historical — 6 per account) ────────────────────────────────
  // Oldest to newest so the sparkline shows trend clearly

  await prisma.kamScore.createMany({
    data: [
      // ── Helix Payments: CRITICAL — sharp decline ──────────────────────────
      { accountId: helix.id, overall: 71, financial: 74, csat: 69, risk: 72, relationship: 68, contractHealth: 72, projectHealth: 72, resourceHealth: 69, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "Healthy trajectory. Contract performance above target and client sentiment holding steady." },
      { accountId: helix.id, overall: 66, financial: 69, csat: 64, risk: 68, relationship: 62, contractHealth: 67, projectHealth: 67, resourceHealth: 64, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Minor engagement softening observed. Feature adoption at 45%, worth monitoring." },
      { accountId: helix.id, overall: 58, financial: 61, csat: 52, risk: 60, relationship: 55, contractHealth: 62, projectHealth: 62, resourceHealth: 52, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(90), aiNarrative: "AT_RISK transition. v4.0 migration causing early support friction and declining stakeholder sentiment." },
      { accountId: helix.id, overall: 45, financial: 50, csat: 38, risk: 42, relationship: 40, contractHealth: 55, projectHealth: 55, resourceHealth: 38, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(60), aiNarrative: "Continued deterioration. Support tickets doubled post v4.1 release. Executive engagement declining." },
      { accountId: helix.id, overall: 33, financial: 37, csat: 26, risk: 28, relationship: 28, contractHealth: 48, projectHealth: 48, resourceHealth: 26, whitespace: 50, health: AccountHealth.CRITICAL, computedAt: daysAgo(30), aiNarrative: "CRITICAL. Stakeholder sentiment collapsed. Ticket surge at 140% QoQ. Renewal conversation urgently needed." },
      { accountId: helix.id, overall: 24, financial: 30, csat: 18, risk: 14, relationship: 15, contractHealth: 42, projectHealth: 42, resourceHealth: 18, whitespace: 50, health: AccountHealth.CRITICAL, computedAt: daysAgo(1), aiNarrative: "Helix Payments is in critical condition. Open tickets are up 140% QoQ, stakeholder sentiment has collapsed, and the contract expires in 55 days with no renewal motion underway. Executive escalation is required immediately." },

      // ── ClearBridge Health: AT_RISK — gradual decline ─────────────────────
      { accountId: clearbridge.id, overall: 72, financial: 78, csat: 68, risk: 74, relationship: 70, contractHealth: 71, projectHealth: 71, resourceHealth: 68, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "Solid account. Engagement is steady and v4 interface rollout is beginning." },
      { accountId: clearbridge.id, overall: 69, financial: 75, csat: 64, risk: 71, relationship: 68, contractHealth: 68, projectHealth: 68, resourceHealth: 64, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Slight MAU softening to 67% post v4 interface launch. Early onboarding issues observed in clinical cohort." },
      { accountId: clearbridge.id, overall: 65, financial: 71, csat: 58, risk: 66, relationship: 64, contractHealth: 66, projectHealth: 66, resourceHealth: 58, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(90), aiNarrative: "MAU declining. Ticket volume increasing. Onboarding completion for new clinical staff cohort is 44%." },
      { accountId: clearbridge.id, overall: 60, financial: 66, csat: 52, risk: 60, relationship: 61, contractHealth: 62, projectHealth: 62, resourceHealth: 52, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(60), aiNarrative: "Crossed AT_RISK threshold. MAU at 62%, 18 open tickets. CDO relationship maintained but engineering engagement softening." },
      { accountId: clearbridge.id, overall: 56, financial: 62, csat: 48, risk: 55, relationship: 59, contractHealth: 56, projectHealth: 56, resourceHealth: 48, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(30), aiNarrative: "MAU at 61%, ticket count rising. SSO and data export issues concentrating in Jira backlog." },
      { accountId: clearbridge.id, overall: 54, financial: 60, csat: 46, risk: 52, relationship: 58, contractHealth: 54, projectHealth: 54, resourceHealth: 46, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(2), aiNarrative: "ClearBridge Health is showing moderate risk. MAU has declined 8% and open tickets are 100% above target, concentrated around SSO and data export. The CDO relationship remains warm but engineering-level engagement is softening. A proactive QBR within 30 days is recommended." },

      // ── Ironclad Logistics: HEALTHY — strong growth ────────────────────────
      { accountId: ironclad.id, overall: 76, financial: 79, csat: 74, risk: 80, relationship: 72, contractHealth: 75, projectHealth: 75, resourceHealth: 74, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "Strong account. All KPIs above target. Renewal booked 6 months early." },
      { accountId: ironclad.id, overall: 80, financial: 84, csat: 78, risk: 83, relationship: 76, contractHealth: 79, projectHealth: 79, resourceHealth: 78, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Continued growth. Client sentiment improved and the route optimisation module deployed successfully." },
      { accountId: ironclad.id, overall: 83, financial: 87, csat: 81, risk: 86, relationship: 80, contractHealth: 82, projectHealth: 82, resourceHealth: 81, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(90), aiNarrative: "Excellent trajectory. On-time delivery rate 96%. Pieter initiating Eastern Europe scoping." },
      { accountId: ironclad.id, overall: 86, financial: 90, csat: 84, risk: 89, relationship: 83, contractHealth: 84, projectHealth: 84, resourceHealth: 84, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(60), aiNarrative: "Outstanding quarter. Eastern Europe expansion budget approved in principle." },
      { accountId: ironclad.id, overall: 88, financial: 92, csat: 86, risk: 91, relationship: 87, contractHealth: 85, projectHealth: 85, resourceHealth: 86, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(30), aiNarrative: "Client sentiment is strong and tickets are near zero. Expansion deal in final negotiation. Case study approved." },
      { accountId: ironclad.id, overall: 90, financial: 94, csat: 87, risk: 92, relationship: 89, contractHealth: 86, projectHealth: 86, resourceHealth: 87, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(1), aiNarrative: "Ironclad Logistics is the standout performer this quarter. Client sentiment is above target, tickets are near zero, and an expansion pipeline worth €200K is in play. Recommended for case study and a co-marketing motion." },

      // ── Beacon Analytics: HEALTHY — rapidly improving ─────────────────────
      { accountId: beacon.id, overall: 74, financial: 78, csat: 72, risk: 80, relationship: 68, contractHealth: 73, projectHealth: 73, resourceHealth: 72, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "Fast-growing account. Usage consistently above growth tier limits. CEO engaged." },
      { accountId: beacon.id, overall: 79, financial: 83, csat: 77, risk: 85, relationship: 73, contractHealth: 77, projectHealth: 77, resourceHealth: 77, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Client sentiment improved. Sprint velocity 89%. Series A funding confirmed, team scaling." },
      { accountId: beacon.id, overall: 83, financial: 88, csat: 81, risk: 88, relationship: 78, contractHealth: 80, projectHealth: 80, resourceHealth: 81, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(90), aiNarrative: "Exceptional. Billing and delivery health are strong. SOC2 Type II programme begun." },
      { accountId: beacon.id, overall: 87, financial: 92, csat: 85, risk: 91, relationship: 83, contractHealth: 86, projectHealth: 86, resourceHealth: 85, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(60), aiNarrative: "Approaching top-quartile performance. Daily active users 75%, up 5% QoQ. Enterprise upgrade discussions begun." },
      { accountId: beacon.id, overall: 90, financial: 94, csat: 89, risk: 93, relationship: 86, contractHealth: 89, projectHealth: 89, resourceHealth: 89, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(30), aiNarrative: "Near-perfect account. CEO offered reference. Upgrade pathway drafted." },
      { accountId: beacon.id, overall: 93, financial: 96, csat: 92, risk: 95, relationship: 88, contractHealth: 91, projectHealth: 91, resourceHealth: 92, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(1), aiNarrative: "Beacon Analytics is the highest-scoring account in the portfolio. Billing health is strong, stakeholder sentiment is excellent, and sprint velocity consistently exceeds targets. Ideal for referral programme and an enterprise tier upsell." },

      // ── Crestline Capital: AT_RISK — moderate decline ─────────────────────
      { accountId: crestline.id, overall: 68, financial: 65, csat: 62, risk: 74, relationship: 71, contractHealth: 70, projectHealth: 70, resourceHealth: 62, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "Stable account. Billing health is acceptable and engagement footprint is growing." },
      { accountId: crestline.id, overall: 64, financial: 61, csat: 57, risk: 70, relationship: 67, contractHealth: 68, projectHealth: 68, resourceHealth: 57, whitespace: 50, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Slight revenue utilisation dip to 79%. Analytics module v2.0 delivery approaching." },
      { accountId: crestline.id, overall: 59, financial: 55, csat: 52, risk: 62, relationship: 62, contractHealth: 65, projectHealth: 65, resourceHealth: 52, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(90), aiNarrative: "AT_RISK flag. Analytics module v2.1 shipped — early ticket volume elevated." },
      { accountId: crestline.id, overall: 52, financial: 47, csat: 44, risk: 48, relationship: 57, contractHealth: 60, projectHealth: 60, resourceHealth: 44, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(60), aiNarrative: "Ticket volume spiking to 28. Client sentiment is declining. Module quality issues need urgent attention." },
      { accountId: crestline.id, overall: 46, financial: 41, csat: 38, risk: 38, relationship: 52, contractHealth: 56, projectHealth: 56, resourceHealth: 38, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(30), aiNarrative: "Continuing deterioration. 35 open tickets and COO concerns. EBR required." },
      { accountId: crestline.id, overall: 41, financial: 38, csat: 35, risk: 32, relationship: 48, contractHealth: 52, projectHealth: 52, resourceHealth: 35, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(2), aiNarrative: "Crestline Capital is deteriorating. A 95% ticket surge following the portfolio module release, combined with poor stakeholder sentiment, signals a quality crisis. With renewal in 130 days, urgent intervention and a dedicated fix sprint are necessary." },

      // ── NexaCloud Ltd: HEALTHY — steady climb ─────────────────────────────
      { accountId: nexacloud.id, overall: 74, financial: 78, csat: 70, risk: 76, relationship: 72, contractHealth: 73, projectHealth: 73, resourceHealth: 70, whitespace: 60, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "Solid start. Platform adoption ahead of target. Engineering team engaged." },
      { accountId: nexacloud.id, overall: 77, financial: 81, csat: 74, risk: 79, relationship: 75, contractHealth: 76, projectHealth: 76, resourceHealth: 74, whitespace: 65, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Continued growth. Client sentiment is improving and feature adoption is approaching target." },
      { accountId: nexacloud.id, overall: 80, financial: 84, csat: 78, risk: 82, relationship: 79, contractHealth: 79, projectHealth: 79, resourceHealth: 78, whitespace: 70, health: AccountHealth.HEALTHY, computedAt: daysAgo(90), aiNarrative: "Strong quarter. Revenue utilisation exceeded 100%. Support ticket count well below target." },
      { accountId: nexacloud.id, overall: 83, financial: 87, csat: 81, risk: 85, relationship: 82, contractHealth: 82, projectHealth: 82, resourceHealth: 81, whitespace: 75, health: AccountHealth.HEALTHY, computedAt: daysAgo(60), aiNarrative: "Platform seeing broad adoption. CTO proactive in roadmap discussions." },
      { accountId: nexacloud.id, overall: 86, financial: 90, csat: 84, risk: 88, relationship: 85, contractHealth: 84, projectHealth: 84, resourceHealth: 84, whitespace: 80, health: AccountHealth.HEALTHY, computedAt: daysAgo(30), aiNarrative: "Client sentiment is rising. Expansion conversation initiated for AI module add-on." },
      { accountId: nexacloud.id, overall: 88, financial: 92, csat: 86, risk: 90, relationship: 87, contractHealth: 85, projectHealth: 85, resourceHealth: 86, whitespace: 85, health: AccountHealth.HEALTHY, computedAt: daysAgo(1), aiNarrative: "NexaCloud is performing excellently. Billing health and stakeholder sentiment are strong, and a new AI module opportunity of ~$120K is in qualifying stage. Recommend scheduling a roadmap QBR to lock in expansion." },

      // ── Vertex Systems: HEALTHY — outstanding ─────────────────────────────
      { accountId: vertex.id, overall: 82, financial: 85, csat: 79, risk: 88, relationship: 80, contractHealth: 81, projectHealth: 81, resourceHealth: 79, whitespace: 70, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "High-performing account. Exec engagement strong. Renewal ahead of schedule." },
      { accountId: vertex.id, overall: 85, financial: 88, csat: 83, risk: 91, relationship: 84, contractHealth: 84, projectHealth: 84, resourceHealth: 83, whitespace: 75, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Client sentiment improved. Near-zero ticket count. Case study opportunity emerging." },
      { accountId: vertex.id, overall: 88, financial: 91, csat: 86, risk: 93, relationship: 87, contractHealth: 87, projectHealth: 87, resourceHealth: 86, whitespace: 80, health: AccountHealth.HEALTHY, computedAt: daysAgo(90), aiNarrative: "Excellent delivery metrics. CEO personally commended team in quarterly review." },
      { accountId: vertex.id, overall: 90, financial: 94, csat: 88, risk: 95, relationship: 89, contractHealth: 89, projectHealth: 89, resourceHealth: 88, whitespace: 82, health: AccountHealth.HEALTHY, computedAt: daysAgo(60), aiNarrative: "Premier account. Sprint delivery rate 97% and stakeholder sentiment is excellent. Whitespace for platform expansion identified." },
      { accountId: vertex.id, overall: 92, financial: 96, csat: 90, risk: 96, relationship: 91, contractHealth: 90, projectHealth: 90, resourceHealth: 90, whitespace: 85, health: AccountHealth.HEALTHY, computedAt: daysAgo(30), aiNarrative: "Outstanding quarter. Referral initiated. Executive sponsor actively promoting Tkxel internally." },
      { accountId: vertex.id, overall: 94, financial: 98, csat: 92, risk: 97, relationship: 93, contractHealth: 92, projectHealth: 92, resourceHealth: 92, whitespace: 88, health: AccountHealth.HEALTHY, computedAt: daysAgo(1), aiNarrative: "Vertex Systems is the top-performing account in the portfolio. Stakeholder sentiment is excellent, tickets are near zero, and CEO-level engagement is active. A co-marketing discussion and a $200K expansion proposal are in final review." },

      // ── MediSync Health: AT_RISK — recent slip ─────────────────────────────
      { accountId: medisync.id, overall: 73, financial: 75, csat: 70, risk: 76, relationship: 71, contractHealth: 72, projectHealth: 72, resourceHealth: 70, whitespace: 55, health: AccountHealth.HEALTHY, computedAt: daysAgo(150), aiNarrative: "On track. Integration progressing, onboarding completion at 62%." },
      { accountId: medisync.id, overall: 70, financial: 72, csat: 66, risk: 73, relationship: 68, contractHealth: 70, projectHealth: 70, resourceHealth: 66, whitespace: 55, health: AccountHealth.HEALTHY, computedAt: daysAgo(120), aiNarrative: "Integration scope expanded. Minor delivery delay flagged. Client sentiment remains stable." },
      { accountId: medisync.id, overall: 65, financial: 67, csat: 60, risk: 67, relationship: 63, contractHealth: 66, projectHealth: 66, resourceHealth: 60, whitespace: 55, health: AccountHealth.HEALTHY, computedAt: daysAgo(90), aiNarrative: "Integration delays starting to affect adoption. MAU softening. Escalation risk emerging." },
      { accountId: medisync.id, overall: 58, financial: 60, csat: 52, risk: 58, relationship: 57, contractHealth: 61, projectHealth: 61, resourceHealth: 52, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(60), aiNarrative: "AT_RISK. Tickets increasing — primarily integration and API authentication issues." },
      { accountId: medisync.id, overall: 52, financial: 54, csat: 44, risk: 48, relationship: 51, contractHealth: 57, projectHealth: 57, resourceHealth: 44, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(30), aiNarrative: "Continued slide. CIO raising concerns about integration timelines." },
      { accountId: medisync.id, overall: 48, financial: 50, csat: 40, risk: 42, relationship: 46, contractHealth: 54, projectHealth: 54, resourceHealth: 40, whitespace: 50, health: AccountHealth.AT_RISK, computedAt: daysAgo(2), aiNarrative: "MediSync is sliding. Integration delivery is 13 weeks behind schedule, stakeholder sentiment has dropped, and the contract renews in 95 days. A recovery plan and dedicated integration sprint are urgently required." },
    ],
  });

  console.log("✅  KAM Scores (historical) created");

  // ── Signals ────────────────────────────────────────────────────────────────

  await prisma.signal.createMany({
    data: [
      // Helix Payments
      { accountId: helix.id, type: SignalType.CHURN_RISK, severity: SignalSeverity.CRITICAL, title: "81% churn probability detected", description: "Model assigns 81% churn probability based on collapsing stakeholder sentiment, ticket surge, and 55-day contract expiry with no renewal initiated.", source: "ai", detectedAt: daysAgo(2) },
      { accountId: helix.id, type: SignalType.CONTRACT_EXPIRY, severity: SignalSeverity.CRITICAL, title: "Contract expires in 55 days", description: "MSA expires " + daysFromNow(55).toDateString() + ". No renewal conversation has been started.", source: "salesforce", detectedAt: daysAgo(4) },
      { accountId: helix.id, type: SignalType.TICKET_SPIKE, severity: SignalSeverity.CRITICAL, title: "Support tickets up 140% QoQ", description: "52 open tickets vs 10-ticket target. Spike aligns with the v4.1 payment gateway migration 4 weeks ago.", source: "jira", detectedAt: daysAgo(6) },
      { accountId: helix.id, type: SignalType.NPS_DECLINE, severity: SignalSeverity.WARNING, title: "Client sentiment collapsed", description: "Primary negative feedback themes: gateway downtime, slow resolution times, and insufficient proactive communication.", source: "manual", detectedAt: daysAgo(9) },
      { accountId: helix.id, type: SignalType.ENGAGEMENT_LOW, severity: SignalSeverity.WARNING, title: "Executive engagement at 15% — 5-month low", description: "Jordan Walsh (CTO) and Nina Osei (VP Product) last engaged 3 weeks ago. No exec sponsor contact in 5 months.", source: "manual", detectedAt: daysAgo(12) },
      { accountId: helix.id, type: SignalType.ENGAGEMENT_LOW, severity: SignalSeverity.WARNING, title: "Feature adoption down 15% — API marketplace stalling", description: "API marketplace feature adoption dropped from 44% to 29% since v4.1 launch. Correlates with gateway stability issues.", source: "manual", detectedAt: daysAgo(7) },

      // ClearBridge
      { accountId: clearbridge.id, type: SignalType.ENGAGEMENT_LOW, severity: SignalSeverity.WARNING, title: "Monthly active users declining — 59%", description: "MAU dropped from 67% to 59% over 7 weeks, concentrated in clinical staff cohort. Onboarding completion for new hires is only 44%.", source: "manual", detectedAt: daysAgo(6) },
      { accountId: clearbridge.id, type: SignalType.TICKET_SPIKE, severity: SignalSeverity.WARNING, title: "Support tickets 100% above target", description: "24 open tickets vs 12 target. Main themes: data export errors (7 tickets) and SSO failures (9 tickets).", source: "jira", detectedAt: daysAgo(8) },
      { accountId: clearbridge.id, type: SignalType.ENGAGEMENT_LOW, severity: SignalSeverity.INFO, title: "Chloe Fournier (IT Director) disengaged for 4 weeks", description: "No email, meeting or portal activity from the IT Director in 28 days. Risk of losing an internal champion.", source: "manual", detectedAt: daysAgo(5) },

      // Crestline Capital
      { accountId: crestline.id, type: SignalType.TICKET_SPIKE, severity: SignalSeverity.CRITICAL, title: "Ticket volume up 95% — highest ever", description: "41 open tickets, highest in account history. Issue cluster: new portfolio analytics module shipped 5 weeks ago. 25 tickets directly attributable.", source: "jira", detectedAt: daysAgo(3) },
      { accountId: crestline.id, type: SignalType.NPS_DECLINE, severity: SignalSeverity.WARNING, title: "Client sentiment deteriorated after release", description: "Recurring feedback: slow bug fixes and unpredictable release quality. Two users left negative Trustpilot reviews.", source: "manual", detectedAt: daysAgo(5) },
      { accountId: crestline.id, type: SignalType.CONTRACT_EXPIRY, severity: SignalSeverity.WARNING, title: "Renewal due in 130 days", description: "Renewal window opens in 40 days. At current health score (41/100), early commercial intervention is essential.", source: "salesforce", detectedAt: daysAgo(1) },
      { accountId: crestline.id, type: SignalType.ENGAGEMENT_LOW, severity: SignalSeverity.WARNING, title: "Revenue utilisation declined to 67%", description: "Down from 83% at contract start. At-risk seats likely reducing active usage rather than full churn, but MRR impact is real.", source: "salesforce", detectedAt: daysAgo(4) },

      // Ironclad — positive
      { accountId: ironclad.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "Eastern Europe expansion: €200K ARR in play", description: "Pieter van Dijk initiated scoping conversations for 4 new logistics hubs in Eastern Europe (Warsaw, Prague, Budapest, Bucharest). Budget likely approved before Q2 close. Estimated expansion ARR: €200K.", source: "ai", detectedAt: daysAgo(4) },
      { accountId: ironclad.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "Customs compliance module: Phase 2 interest confirmed", description: "Lena Hofer (Operations Director) confirmed interest in a cross-border customs compliance module during Q1 QBR. Estimated co-development value: €80K.", source: "manual", detectedAt: daysAgo(12) },

      // Beacon — positive
      { accountId: beacon.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "Enterprise tier upsell + referral opportunity", description: "CEO Zoe Park has offered to be a reference customer. Usage exceeds growth tier limits for 3 consecutive months — enterprise upgrade estimated at $130K incremental ARR.", source: "ai", detectedAt: daysAgo(3) },
      { accountId: beacon.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "EMEA expansion — Beacon eyeing London presence", description: "Zoe Park mentioned EMEA expansion in their all-hands. Tkxel's London network and European delivery experience is a competitive differentiator. Estimated EMEA engagement value: $85K.", source: "manual", detectedAt: daysAgo(7) },

      // NexaCloud — growth signals
      { accountId: nexacloud.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "AI module interest — $120K expansion in qualifying", description: "Alex Thornton confirmed budget interest for AI inference add-on in Q2 planning. Proposal requested by end of month.", source: "ai", detectedAt: daysAgo(3) },

      // Vertex — positive
      { accountId: vertex.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "$200K platform expansion in final review", description: "CEO has signed off on scope. Legal review in progress. Estimated close within 8 days.", source: "manual", detectedAt: daysAgo(2) },
      { accountId: vertex.id, type: SignalType.UPSELL_OPPORTUNITY, severity: SignalSeverity.INFO, title: "Co-marketing webinar opportunity", description: "Sandra Lee (Customer Success) confirmed executive participation in Tkxel's Q2 customer webinar. High visibility opportunity.", source: "manual", detectedAt: daysAgo(5) },

      // MediSync — risk signals
      { accountId: medisync.id, type: SignalType.TICKET_SPIKE, severity: SignalSeverity.WARNING, title: "Integration tickets up 72% — API auth cluster", description: "31 open tickets, majority related to HL7 FHIR API authentication failures in staging environment. Integration delivery at risk.", source: "jira", detectedAt: daysAgo(4) },
      { accountId: medisync.id, type: SignalType.NPS_DECLINE, severity: SignalSeverity.WARNING, title: "Client sentiment down — integration frustration", description: "Stakeholder feedback has worsened over 90 days. Themes: slow integration delivery, lack of technical documentation, unclear timeline.", source: "manual", detectedAt: daysAgo(6) },
      { accountId: medisync.id, type: SignalType.CONTRACT_EXPIRY, severity: SignalSeverity.WARNING, title: "Contract renewal in 95 days", description: "Renewal window approaching. Integration delays and weakening client sentiment create renewal risk. Early commercial discussion recommended.", source: "salesforce", detectedAt: daysAgo(1) },
    ],
  });

  console.log("✅  Signals created");

  // ── Actions ────────────────────────────────────────────────────────────────

  await prisma.action.createMany({
    data: [
      // Helix Payments — urgent open/in-progress
      { accountId: helix.id, ownerId: sarah.id, title: "Emergency exec call with Jordan Walsh (CTO)", description: "Open renewal conversation and present remediation plan for gateway issues. Loop in Priya as manager sponsor.", status: ActionStatus.OPEN, priority: ActionPriority.CRITICAL, source: ActionSource.AI_PROPOSED, aiConfidence: 0.94, dueDate: daysFromNow(2) },
      { accountId: helix.id, ownerId: sarah.id, title: "Prepare gateway v4.1 RCA & remediation plan", description: "Work with engineering to document root cause and commit to a fix timeline with clear milestones.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.CRITICAL, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(4) },
      { accountId: helix.id, ownerId: sarah.id, title: "Draft renewal proposal with SLA upgrade", description: "Prepare renewal terms with 10% loyalty discount contingent on 12-month commit and premium SLA tier.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.87, dueDate: daysFromNow(12) },
      { accountId: helix.id, ownerId: sarah.id, title: "Assign named support engineer to Helix tickets", description: "Coordinate with support team to assign a dedicated engineer to clear the 52 open tickets within 10 business days.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(2) },
      // Helix completed actions (history)
      { accountId: helix.id, ownerId: sarah.id, title: "Post-migration support escalation to VP Engineering", description: "Notified VP Engineering of v4.1 gateway issues. Dedicated war-room channel created.", status: ActionStatus.DONE, priority: ActionPriority.CRITICAL, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(10) },
      { accountId: helix.id, ownerId: sarah.id, title: "Share v4.1 migration impact report with Jordan Walsh", description: "Sent detailed analysis of affected transactions and preliminary root cause to CTO.", status: ActionStatus.DONE, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(5) },

      // ClearBridge
      { accountId: clearbridge.id, ownerId: sarah.id, title: "Schedule QBR with Dr. Ravi Menon (CDO)", description: "Run a proactive QBR focused on platform value and MAU recovery plan.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.86, dueDate: daysFromNow(18) },
      { accountId: clearbridge.id, ownerId: sarah.id, title: "Resolve SSO and data export ticket cluster", description: "Escalate the 9 SSO-related and 7 export-related tickets to engineering for a targeted fix sprint.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(7) },
      { accountId: clearbridge.id, ownerId: sarah.id, title: "Personal outreach to Chloe Fournier (IT Director)", description: "Chloe hasn't engaged in 4 weeks. Brief personal check-in and share Q2 product roadmap highlights.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.AI_PROPOSED, aiConfidence: 0.74, dueDate: daysFromNow(5) },
      { accountId: clearbridge.id, ownerId: sarah.id, title: "Launch onboarding sprint for clinical staff cohort", description: "Design targeted 2-week onboarding programme for 200+ clinical staff who adopted v4 interface in past 60 days.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.81, dueDate: daysFromNow(14) },
      // ClearBridge completed
      { accountId: clearbridge.id, ownerId: sarah.id, title: "Share v4 interface training guide with Ben Mackay", description: "Sent navigation guide and recorded walkthrough to Clinical Systems Manager for distribution.", status: ActionStatus.DONE, priority: ActionPriority.MEDIUM, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(8) },

      // Ironclad — growth
      { accountId: ironclad.id, ownerId: marcus.id, title: "Submit Eastern Europe expansion proposal", description: "Build commercial proposal for 4 new hubs: Warsaw, Prague, Bucharest, Budapest. Target close within Q2.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(14) },
      { accountId: ironclad.id, ownerId: marcus.id, title: "Nominate Ironclad for Tkxel case study", description: "Coordinate with marketing to document delivery outcomes, client feedback, and ROI metrics for a public case study.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.AI_PROPOSED, aiConfidence: 0.80, dueDate: daysFromNow(30) },
      { accountId: ironclad.id, ownerId: marcus.id, title: "Scope customs compliance module with Lena Hofer", description: "Phase 2 discovery: document requirements for cross-border customs automation. Estimated value €80K.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(21) },
      // Ironclad completed
      { accountId: ironclad.id, ownerId: marcus.id, title: "Conduct Q1 2025 QBR with Pieter and Lena", description: "Full quarterly review. All KPIs green. Eastern Europe expansion scoped. Case study approved.", status: ActionStatus.DONE, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(12) },
      { accountId: ironclad.id, ownerId: marcus.id, title: "Deliver route optimisation module Phase 2", description: "Phase 2 delivery complete. On-time, zero critical bugs. Client feedback improved following release.", status: ActionStatus.DONE, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(45) },

      // Beacon
      { accountId: beacon.id, ownerId: marcus.id, title: "Initiate referral conversation with Zoe Park (CEO)", description: "Follow up on Zoe's offer to be a reference customer. Align with marketing on logistics and incentives.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.AI_PROPOSED, aiConfidence: 0.83, dueDate: daysFromNow(10) },
      { accountId: beacon.id, ownerId: marcus.id, title: "Present enterprise tier upgrade to Tariq Hassan (CTO)", description: "Usage consistently exceeds growth tier limits. Present enterprise pricing with advanced SLA and dedicated CSM.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.89, dueDate: daysFromNow(12) },
      { accountId: beacon.id, ownerId: marcus.id, title: "Support Beacon's SOC2 Type II readiness programme", description: "Tkxel to provide SOC2 advisory support as part of enterprise tier value. Maya Flores is leading internally.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(45) },
      // Beacon completed
      { accountId: beacon.id, ownerId: marcus.id, title: "Deliver Q1 data pipeline sprint — 4 features", description: "All 4 features shipped on schedule. Sprint velocity 91%. Zero critical post-release bugs.", status: ActionStatus.DONE, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(18) },

      // Crestline
      { accountId: crestline.id, ownerId: sarah.id, title: "RCA on portfolio analytics module issues", description: "41 tickets trace back to the analytics module. Full RCA needed before any further releases.", status: ActionStatus.OPEN, priority: ActionPriority.CRITICAL, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(3) },
      { accountId: crestline.id, ownerId: sarah.id, title: "EBR with Oliver Hartmann (COO)", description: "COO needs a direct account health briefing. Prepare transparent recovery roadmap with committed timelines.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.91, dueDate: daysFromNow(9) },
      { accountId: crestline.id, ownerId: sarah.id, title: "Open renewal conversation now — 130 days out", description: "Don't wait for the 90-day window. Start commercial discussion with a health recovery narrative to de-risk renewal.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.85, dueDate: daysFromNow(14) },
      { accountId: crestline.id, ownerId: sarah.id, title: "Escalate analytics module bugs to Amara Diallo (Eng Lead)", description: "Direct engineering-to-engineering escalation needed. 25 of 41 tickets are addressable in a focused sprint.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.CRITICAL, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(5) },
      // Crestline completed
      { accountId: crestline.id, ownerId: sarah.id, title: "Notify Rebecca Stone (Compliance) of reporting module delay", description: "FCA reporting module delay communicated. Rebecca acknowledged, tolerance window is 3 weeks.", status: ActionStatus.DONE, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(6) },

      // NexaCloud — expansion focus
      { accountId: nexacloud.id, ownerId: marcus.id, title: "Schedule AI module expansion roadmap QBR", description: "Book a joint roadmap session with Alex Thornton to scope the AI/ML add-on and agree on delivery timeline.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.88, dueDate: daysFromNow(12) },
      { accountId: nexacloud.id, ownerId: marcus.id, title: "Prepare $120K AI module commercial proposal", description: "Build pricing options for the AI inference and model training add-on. Include 12-month and 24-month commit tiers.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(18) },
      { accountId: nexacloud.id, ownerId: marcus.id, title: "Nominate NexaCloud for cloud case study", description: "Billing health and client sentiment are strong. Good case study candidate for cloud infrastructure vertical.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.AI_PROPOSED, aiConfidence: 0.77, dueDate: daysFromNow(30) },

      // Vertex Systems — maintain + expand
      { accountId: vertex.id, ownerId: marcus.id, title: "Close $200K platform expansion proposal", description: "Michael Kane's legal team is reviewing. Coordinate with Tkxel legal to align on SLA terms and contract structure.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(8) },
      { accountId: vertex.id, ownerId: marcus.id, title: "Launch co-marketing initiative with Sandra Lee", description: "Sandra confirmed interest in a joint webinar. Coordinate with Tkxel marketing on content and audience strategy.", status: ActionStatus.OPEN, priority: ActionPriority.MEDIUM, source: ActionSource.AI_PROPOSED, aiConfidence: 0.82, dueDate: daysFromNow(25) },
      { accountId: vertex.id, ownerId: marcus.id, title: "Deliver Vertex premier support onboarding", description: "Transition account to premier support tier. Set up dedicated Slack channel and assign named CSE.", status: ActionStatus.DONE, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysAgo(10) },

      // MediSync — recovery
      { accountId: medisync.id, ownerId: sarah.id, title: "Escalate integration delays to CIO (Dr. Patricia Obi)", description: "CIO raised concerns at last check-in. Prepare honest assessment and revised timeline with buffer. Request 2-week extension.", status: ActionStatus.OPEN, priority: ActionPriority.CRITICAL, source: ActionSource.AI_PROPOSED, aiConfidence: 0.90, dueDate: daysFromNow(3) },
      { accountId: medisync.id, ownerId: sarah.id, title: "Assign dedicated integration engineer to MediSync", description: "Integration complexity is beyond standard delivery. A named senior integration engineer will unblock the 5 stalled API tasks.", status: ActionStatus.IN_PROGRESS, priority: ActionPriority.HIGH, source: ActionSource.HUMAN_CREATED, dueDate: daysFromNow(5) },
      { accountId: medisync.id, ownerId: sarah.id, title: "Initiate client sentiment recovery plan", description: "Stakeholder sentiment has weakened over 90 days. Design a 30-day touchpoint programme: weekly check-ins, product updates, quick wins.", status: ActionStatus.OPEN, priority: ActionPriority.HIGH, source: ActionSource.AI_PROPOSED, aiConfidence: 0.84, dueDate: daysFromNow(10) },
    ],
  });

  console.log("✅  Actions created");

  // ── Documents ──────────────────────────────────────────────────────────────

  await prisma.document.createMany({
    data: [
      // Helix Payments
      { accountId: helix.id, name: "Helix Payments MSA 2023.pdf", type: DocumentType.MSA, mimeType: "application/pdf", fileSize: 430_000, uploadedById: sarah.id },
      { accountId: helix.id, name: "Helix Payments SOW — Gateway Platform v2.pdf", type: DocumentType.SOW, mimeType: "application/pdf", fileSize: 220_000, uploadedById: sarah.id },
      { accountId: helix.id, name: "Helix Payments — v4.1 Migration Impact Report.pdf", type: DocumentType.OTHER, mimeType: "application/pdf", fileSize: 185_000, uploadedById: sarah.id },
      { accountId: helix.id, name: "Helix Payments — Renewal Proposal DRAFT.pdf", type: DocumentType.PROPOSAL, mimeType: "application/pdf", fileSize: 140_000, uploadedById: sarah.id },
      { accountId: helix.id, name: "Helix Payments — Q1 2025 QBR Deck.pdf", type: DocumentType.QBR_DECK, mimeType: "application/pdf", fileSize: 960_000, uploadedById: sarah.id },

      // ClearBridge
      { accountId: clearbridge.id, name: "ClearBridge Health Contract 2024.pdf", type: DocumentType.CONTRACT, mimeType: "application/pdf", fileSize: 370_000, uploadedById: sarah.id },
      { accountId: clearbridge.id, name: "ClearBridge Health NDA 2024.pdf", type: DocumentType.NDA, mimeType: "application/pdf", fileSize: 95_000, uploadedById: sarah.id },
      { accountId: clearbridge.id, name: "ClearBridge Health — v4 Interface Training Guide.pdf", type: DocumentType.OTHER, mimeType: "application/pdf", fileSize: 220_000, uploadedById: sarah.id },
      { accountId: clearbridge.id, name: "ClearBridge Health — MAU Recovery Plan.pdf", type: DocumentType.OTHER, mimeType: "application/pdf", fileSize: 160_000, uploadedById: sarah.id },

      // Ironclad
      { accountId: ironclad.id, name: "Ironclad Logistics SOW — Supply Chain Platform.pdf", type: DocumentType.SOW, mimeType: "application/pdf", fileSize: 295_000, uploadedById: marcus.id },
      { accountId: ironclad.id, name: "Ironclad Logistics — Eastern Europe Expansion Proposal.pdf", type: DocumentType.PROPOSAL, mimeType: "application/pdf", fileSize: 380_000, uploadedById: marcus.id },
      { accountId: ironclad.id, name: "Ironclad Logistics — Q1 2025 QBR Summary.pdf", type: DocumentType.QBR_DECK, mimeType: "application/pdf", fileSize: 740_000, uploadedById: marcus.id },
      { accountId: ironclad.id, name: "Ironclad Logistics — Case Study DRAFT.pdf", type: DocumentType.OTHER, mimeType: "application/pdf", fileSize: 210_000, uploadedById: marcus.id },

      // Beacon
      { accountId: beacon.id, name: "Beacon Analytics SOW — Platform Engineering.pdf", type: DocumentType.SOW, mimeType: "application/pdf", fileSize: 160_000, uploadedById: marcus.id },
      { accountId: beacon.id, name: "Beacon Analytics NDA 2024.pdf", type: DocumentType.NDA, mimeType: "application/pdf", fileSize: 88_000, uploadedById: marcus.id },
      { accountId: beacon.id, name: "Beacon Analytics — Enterprise Tier Proposal.pdf", type: DocumentType.PROPOSAL, mimeType: "application/pdf", fileSize: 195_000, uploadedById: marcus.id },
      { accountId: beacon.id, name: "Beacon Analytics — SOC2 Readiness Assessment.pdf", type: DocumentType.OTHER, mimeType: "application/pdf", fileSize: 320_000, uploadedById: marcus.id },

      // Crestline
      { accountId: crestline.id, name: "Crestline Capital MSA 2022.pdf", type: DocumentType.MSA, mimeType: "application/pdf", fileSize: 520_000, uploadedById: sarah.id },
      { accountId: crestline.id, name: "Crestline Capital SOW — Analytics Module.pdf", type: DocumentType.SOW, mimeType: "application/pdf", fileSize: 190_000, uploadedById: sarah.id },
      { accountId: crestline.id, name: "Crestline Capital — Analytics Module v2.1 RCA.pdf", type: DocumentType.OTHER, mimeType: "application/pdf", fileSize: 145_000, uploadedById: sarah.id },
      { accountId: crestline.id, name: "Crestline Capital — Renewal Presentation.pdf", type: DocumentType.PROPOSAL, mimeType: "application/pdf", fileSize: 880_000, uploadedById: sarah.id },
    ],
  });

  console.log("✅  Documents created");

  // ── KYC Versions ───────────────────────────────────────────────────────────

  await prisma.kycVersion.createMany({
    data: [
      {
        accountId: helix.id,
        authorId: sarah.id,
        version: 2,
        status: KycStatus.APPROVED,
        executiveSummary: "Helix Payments is a US-based embedded payments infrastructure provider serving 50+ neobanks and fintechs. At $1.75M ARR, it is the second-largest account in the portfolio and currently at critical renewal risk.",
        businessModel: "B2B SaaS — API-first payment gateway. Revenue from usage-based processing fees plus platform subscription.",
        keyStakeholders: JSON.stringify([{ name: "Jordan Walsh", role: "CTO", influence: "Decision Maker" }, { name: "Nina Osei", role: "VP Product", influence: "Influencer" }, { name: "Carlos Reyes", role: "Head of Engineering", influence: "Technical Gatekeeper" }]),
        strategicGoals: "Expand API marketplace to 150 integrations by Q4 2025. Launch in the EU market Q3 2025.",
        riskFactors: "Critical: 81% churn probability, poor stakeholder sentiment, contract expiry in 55 days, gateway stability issues post v4.1 migration.",
        expansionOpportunity: "EU expansion support, SRE engagement, and premium SLA tier represent a potential $500K upsell.",
        csatHistory: "Stakeholder sentiment has declined across recent periods. CSAT score 2.8/5 on last survey. Satisfaction collapse correlates directly with v4.1 gateway migration in February 2025. Executive sponsor last engaged 5 months ago.",
        competitiveLandscape: "Primary threat: Stripe Treasury and Adyen Embedded Finance — both actively pitching Helix. Secondary risk from ModernFi (backed by a16z). Tkxel differentiated on API customisation depth and white-glove migration support, but relationship damage has eroded this advantage.",
        financialOverview: "ARR $1.75M. Annual contract, auto-renewal clause, expires in 55 days. No outstanding invoices. Q4 2024 revenue utilisation 87% — down from 95%. Expansion fee waiver granted for v4 migration (credit $42K applied). Next renewal target: $1.9M (+9%).",
        submittedAt: daysAgo(28),
        approvedAt: daysAgo(22),
      },
      {
        accountId: clearbridge.id,
        authorId: sarah.id,
        version: 1,
        status: KycStatus.SUBMITTED,
        executiveSummary: "ClearBridge Health is a Canadian health-tech company building digital clinical tools for regional hospital networks across Ontario and British Columbia. Serves 16 hospital networks with 1,400+ active clinical users.",
        businessModel: "B2B SaaS — annual subscription per hospital network. Serves 16 hospital networks.",
        keyStakeholders: JSON.stringify([{ name: "Dr. Ravi Menon", role: "Chief Digital Officer", influence: "Decision Maker" }, { name: "Chloe Fournier", role: "IT Director", influence: "Influencer" }, { name: "Ben Mackay", role: "Clinical Systems Manager", influence: "End-User Champion" }]),
        strategicGoals: "Reach 80% MAU within 18 months. Expand to 4 additional hospital networks in Alberta.",
        riskFactors: "Declining MAU (59%), unresolved SSO/export issues, softening engagement at engineering level. Onboarding completion at 44% for new cohort.",
        expansionOpportunity: "Alberta expansion and a new patient-facing mobile module represent ~$220K upsell.",
        csatHistory: "Client sentiment is down from earlier periods. CSAT stable at 3.6/5. CDO (Dr. Ravi Menon) satisfaction high — engineering-level trust declining. Last executive check-in 6 weeks ago. Two formal complaints filed via IT Director in Q1 around SSO reliability.",
        competitiveLandscape: "Oracle Health and Epic MyChart are embedded with procurement. Tkxel differentiates on mid-market pricing and integration flexibility. No active competitive evaluation known but renewal proximity increases displacement risk. Secondary threat from MedTech startups (Medisafe, Validic) for point-solution displacement.",
        financialOverview: "ARR $980K. Multi-year contract, Year 2 of 3. Annual invoicing — current year paid in full. Revenue utilisation 91%. Implementation services revenue $120K (one-time, fully recognised). Next review milestone: Alberta pilot funding approval Q3 2025 (est. $180K incremental).",
        submittedAt: daysAgo(8),
      },
      {
        accountId: ironclad.id,
        authorId: marcus.id,
        version: 1,
        status: KycStatus.APPROVED,
        executiveSummary: "Ironclad Logistics is a Dutch supply-chain SaaS company providing route optimisation and fleet management to 250+ enterprise clients across Western Europe.",
        businessModel: "B2B SaaS + implementation services. ARR of €720K with NRR consistently above 118%.",
        keyStakeholders: JSON.stringify([{ name: "Pieter van Dijk", role: "Head of Technology", influence: "Decision Maker" }, { name: "Lena Hofer", role: "Operations Director", influence: "Champion" }]),
        strategicGoals: "Expand to Eastern Europe (PL, CZ, HU, RO) in 2025. Launch cross-border customs compliance module.",
        riskFactors: "Low risk. Primary watch item: scope management during rapid expansion phase.",
        expansionOpportunity: "Eastern European expansion worth €200K ARR. Co-development of a customs compliance module (est. €80K).",
        csatHistory: "Client sentiment is strong and improving. CSAT 4.7/5. Pieter van Dijk is an active reference customer — spoke at Tkxel's logistics webinar in March. No complaints in past 18 months. On-time delivery rate 97%.",
        competitiveLandscape: "No active competitive evaluation. SAP TM evaluated and declined 18 months ago due to cost and implementation complexity. Tkxel's mid-market positioning and speed of deployment are key differentiators. Key risk: if Ironclad reaches €5M ARR, SAP and Oracle may re-engage at board level.",
        financialOverview: "ARR €720K (~$790K). Renewed 6 months early on a 2-year term. NRR 118% including services. Revenue utilisation 97%. Expansion budget of €200K for Eastern Europe approved in principle by board — formal PO expected Q2 2025. No outstanding invoices.",
        submittedAt: daysAgo(55),
        approvedAt: daysAgo(50),
      },
      {
        accountId: beacon.id,
        authorId: marcus.id,
        version: 1,
        status: KycStatus.APPROVED,
        executiveSummary: "Beacon Analytics is a high-growth US SaaS startup building real-time data observability tools for engineering teams. Series A funded ($18M), 70 employees.",
        businessModel: "PLG SaaS — freemium → growth → enterprise tiers. Currently on growth tier, consistently exceeding limits.",
        keyStakeholders: JSON.stringify([{ name: "Zoe Park", role: "CEO", influence: "Decision Maker" }, { name: "Tariq Hassan", role: "CTO", influence: "Technical Sponsor" }, { name: "Maya Flores", role: "Head of Data Engineering", influence: "Power User" }]),
        strategicGoals: "Reach $6M ARR by end of 2025. Achieve SOC2 Type II. Launch in EMEA.",
        riskFactors: "Fast-scaling startup — key person risk. Competitive pressure from incumbents in observability space.",
        expansionOpportunity: "Enterprise tier upgrade at $130K incremental ARR. Co-marketing and referral programme. EMEA expansion support est. $85K.",
        csatHistory: "Client sentiment is excellent and improving. CSAT 4.8/5. CEO Zoe Park offered to be a reference in January. Positive Slack community feedback. Zero support escalations in 6 months.",
        competitiveLandscape: "Datadog and Grafana Cloud are primary competitors. Monte Carlo is emerging in data observability. Tkxel differentiated by customisation speed and Beacon's specific real-time streaming requirements. Beacon evaluated Datadog in Q4 2024 and chose to stay — documented in account notes.",
        financialOverview: "ARR $420K on growth tier. Series A ($18M) closed Feb 2025 — finances healthy. Monthly invoicing, consistently on-time. Revenue utilisation 94%. Enterprise upgrade proposal submitted ($550K ARR) — decision expected Q2 2025. No outstanding invoices.",
        submittedAt: daysAgo(40),
        approvedAt: daysAgo(35),
      },
      {
        accountId: crestline.id,
        authorId: sarah.id,
        version: 3,
        status: KycStatus.APPROVED,
        executiveSummary: "Crestline Capital is a UK-based investment platform serving independent financial advisers and wealth managers. FCA regulated. $1.2M ARR, 1,200 active seats.",
        businessModel: "B2B SaaS — per-seat subscription. Revenue from platform access plus optional compliance reporting module.",
        keyStakeholders: JSON.stringify([{ name: "Oliver Hartmann", role: "COO", influence: "Decision Maker" }, { name: "Amara Diallo", role: "Engineering Lead", influence: "Technical Gatekeeper" }, { name: "Rebecca Stone", role: "Head of Compliance", influence: "Regulatory Gatekeeper" }]),
        strategicGoals: "Launch AI-powered portfolio rebalancing by Q3 2025. Grow to 1,600 seats by year-end.",
        riskFactors: "95% ticket surge and poor client sentiment following analytics module release. Renewal in 130 days. FCA compliance adds delivery pressure.",
        expansionOpportunity: "AI rebalancing co-development and seat expansion to 1,600 represent ~$320K opportunity.",
        csatHistory: "Client sentiment has deteriorated since Q3 2024. CSAT 3.2/5. Oliver Hartmann (COO) expressed frustration on a call in March over bug resolution times. Formal complaint letter submitted to Tkxel account director Feb 28. Two escalated tickets unresolved for 14+ days.",
        competitiveLandscape: "Intelliflo (Adviser Cloud) and Iress are the primary incumbent alternatives. FNZ Altus actively pitching for full-platform replacement. Tkxel's risk: the analytics module failure gives FNZ a direct opening. Crestline's compliance team has started an informal RFP process (not officially confirmed).",
        financialOverview: "ARR $1.2M. Annual contract, Year 1 of 1 — renewal in 130 days. Quarterly invoicing — Q1 2025 invoice paid 18 days late. Revenue utilisation 88%. Overdue balance: $0 (cleared). AI rebalancing co-development SOW value: $180K (not yet signed). Renewal target: $1.35M (+13%).",
        submittedAt: daysAgo(12),
        approvedAt: daysAgo(9),
      },
    ],
  });

  console.log("✅  KYC Versions created");

  // ── QBR Sessions (all 5 accounts) ─────────────────────────────────────────

  // 1. Helix Payments — Emergency QBR (upcoming)
  const helixQbr = await prisma.qbrSession.create({
    data: {
      accountId: helix.id,
      createdById: sarah.id,
      type: QbrType.QBR,
      status: QbrStatus.SCHEDULED,
      title: "Helix Payments — Emergency QBR",
      scheduledAt: daysFromNow(7),
      attendees: JSON.stringify(["Jordan Walsh", "Nina Osei", "Sarah Chen", "Priya Nair"]),
      notes: "Focus: gateway remediation update, renewal terms, SLA upgrade proposal. Pre-read: v4.1 RCA and KAM score dashboard.",
    },
  });

  await prisma.qbrItem.createMany({
    data: [
      { sessionId: helixQbr.id, order: 1, category: "review", title: "Q1 2025 Performance Review", content: "Walk through KPIs vs targets. Acknowledge client sentiment and ticket issues directly — no sugarcoating.", status: "pending" },
      { sessionId: helixQbr.id, order: 2, category: "risk", title: "Gateway v4.1 — RCA & Fix Timeline", content: "Engineering to present root cause, affected transaction volume, and committed resolution milestones with dates.", status: "pending" },
      { sessionId: helixQbr.id, order: 3, category: "action", title: "Renewal Proposal Presentation", content: "Present 12-month renewal with 10% loyalty discount, premium SLA tier, and named support engineer commitment.", status: "pending" },
      { sessionId: helixQbr.id, order: 4, category: "expansion", title: "EU Launch Support Roadmap", content: "Overview of Tkxel capabilities to support Helix's planned EU market entry — SRE, compliance, and data residency support.", status: "pending" },
      { sessionId: helixQbr.id, order: 5, category: "action", title: "Define Success Metrics for Recovery", content: "Agree measurable milestones: client sentiment target for Q2, ticket resolution SLA, and named KPIs for renewal decision.", status: "pending" },
    ],
  });

  // 2. Ironclad Logistics — Q1 QBR (completed)
  const ironcladQbr = await prisma.qbrSession.create({
    data: {
      accountId: ironclad.id,
      createdById: marcus.id,
      type: QbrType.QBR,
      status: QbrStatus.COMPLETED,
      title: "Ironclad Logistics — Q1 2025 QBR",
      scheduledAt: daysAgo(12),
      conductedAt: daysAgo(12),
      attendees: JSON.stringify(["Pieter van Dijk", "Lena Hofer", "Marcus Okafor"]),
      aiSummary: "Exceptional quarter. All sprint commitments delivered on time, client sentiment is above target, and the Eastern Europe expansion proposal is being fast-tracked. Pieter confirmed budget approval is likely before end of Q2. Lena raised interest in the customs compliance module for Phase 2. Marcus to submit formal proposal within 2 weeks.",
    },
  });

  await prisma.qbrItem.createMany({
    data: [
      { sessionId: ironcladQbr.id, order: 1, category: "review", title: "Q1 2025 Highlights", content: "Client sentiment above target. 4/4 sprint milestones delivered. Tickets near zero. Billing health strong.", status: "discussed" },
      { sessionId: ironcladQbr.id, order: 2, category: "expansion", title: "Eastern Europe Expansion Scoping", content: "4 hubs: Warsaw, Prague, Budapest, Bucharest. Estimated 7-month engagement. Budget likely before Q2 close.", status: "resolved" },
      { sessionId: ironcladQbr.id, order: 3, category: "action", title: "Case Study & Co-Marketing", content: "Pieter approved ROI case study. Joint webinar on supply chain digitisation proposed for Q2.", status: "resolved" },
      { sessionId: ironcladQbr.id, order: 4, category: "expansion", title: "Phase 2 — Customs Compliance Module", content: "Lena confirmed interest in cross-border customs module. Marcus to scope requirements and submit proposal.", status: "discussed" },
    ],
  });

  // 3. ClearBridge Health — Proactive QBR (scheduled)
  const clearbridgeQbr = await prisma.qbrSession.create({
    data: {
      accountId: clearbridge.id,
      createdById: sarah.id,
      type: QbrType.QBR,
      status: QbrStatus.SCHEDULED,
      title: "ClearBridge Health — Q1 Recovery QBR",
      scheduledAt: daysFromNow(18),
      attendees: JSON.stringify(["Dr. Ravi Menon", "Chloe Fournier", "Sarah Chen"]),
      notes: "Agenda: MAU recovery plan, onboarding sprint update, SSO/export ticket resolution status. Frame as a partnership review, not an apology session.",
    },
  });

  await prisma.qbrItem.createMany({
    data: [
      { sessionId: clearbridgeQbr.id, order: 1, category: "review", title: "Q1 2025 Platform Health Review", content: "Review MAU trends, ticket resolution progress, and KPI performance vs targets.", status: "pending" },
      { sessionId: clearbridgeQbr.id, order: 2, category: "action", title: "Onboarding Recovery Sprint Plan", content: "Present 2-week onboarding sprint for clinical staff cohort. Target: MAU from 59% → 72% by end of Q2.", status: "pending" },
      { sessionId: clearbridgeQbr.id, order: 3, category: "risk", title: "SSO & Data Export — Resolution Timeline", content: "Engineering update on the 16 open tickets. Committed fix dates and testing plan.", status: "pending" },
      { sessionId: clearbridgeQbr.id, order: 4, category: "expansion", title: "Alberta Expansion — Early Scoping", content: "Explore timeline and requirements for expanding to 4 Alberta hospital networks.", status: "pending" },
    ],
  });

  // 4. Beacon Analytics — Q1 QBR (completed)
  const beaconQbr = await prisma.qbrSession.create({
    data: {
      accountId: beacon.id,
      createdById: marcus.id,
      type: QbrType.QBR,
      status: QbrStatus.COMPLETED,
      title: "Beacon Analytics — Q1 2025 QBR",
      scheduledAt: daysAgo(20),
      conductedAt: daysAgo(20),
      attendees: JSON.stringify(["Zoe Park", "Tariq Hassan", "Marcus Okafor"]),
      aiSummary: "Beacon's best quarter on record. Client sentiment is excellent, all sprint commitments delivered ahead of schedule, and stakeholder engagement is strong. Zoe confirmed Series A close at $18M and outlined EMEA expansion plans. Enterprise tier upgrade proposal requested — Tariq to review pricing and share back within one week. Marcus to align with Tkxel marketing on referral programme.",
    },
  });

  await prisma.qbrItem.createMany({
    data: [
      { sessionId: beaconQbr.id, order: 1, category: "review", title: "Q1 2025 Highlights", content: "Client sentiment above target. All 4 data pipeline features shipped on schedule. Stakeholder engagement is strong. Billing health is strong.", status: "discussed" },
      { sessionId: beaconQbr.id, order: 2, category: "expansion", title: "Series A & EMEA Expansion", content: "Zoe confirmed $18M Series A close. EMEA expansion planned H2 2025 — Tkxel's European delivery network is a strong fit.", status: "discussed" },
      { sessionId: beaconQbr.id, order: 3, category: "action", title: "Enterprise Tier Upgrade Proposal", content: "Tariq to review enterprise pricing. Marcus to follow up with commercial team. Target close: 30 days.", status: "resolved" },
      { sessionId: beaconQbr.id, order: 4, category: "action", title: "Reference Customer & Referral Programme", content: "Zoe happy to be reference customer. Marketing to scope co-branded case study and referral incentive structure.", status: "discussed" },
    ],
  });

  // 5. Crestline Capital — Emergency EBR (upcoming)
  const crestlineEbr = await prisma.qbrSession.create({
    data: {
      accountId: crestline.id,
      createdById: sarah.id,
      type: QbrType.DBR,
      status: QbrStatus.SCHEDULED,
      title: "Crestline Capital — Emergency EBR",
      scheduledAt: daysFromNow(9),
      attendees: JSON.stringify(["Oliver Hartmann", "Amara Diallo", "Sarah Chen", "Priya Nair"]),
      notes: "This is a damage control session. Come with RCA, committed fix sprint plan, and a renewal narrative that reassures Oliver. Do NOT show the full ticket list — lead with resolution progress.",
    },
  });

  await prisma.qbrItem.createMany({
    data: [
      { sessionId: crestlineEbr.id, order: 1, category: "review", title: "Analytics Module — RCA & Fix Sprint", content: "Present root cause of v2.1 issues. Amara to confirm fix sprint scope: 25 tickets in 8 business days.", status: "pending" },
      { sessionId: crestlineEbr.id, order: 2, category: "risk", title: "Customer Sentiment Recovery", content: "Acknowledge the sentiment drop. Share recovery plan: proactive stakeholder communication, hotfix milestones, and feedback loop.", status: "pending" },
      { sessionId: crestlineEbr.id, order: 3, category: "action", title: "Renewal Commercial Discussion", content: "130 days to renewal. Present health recovery roadmap as the foundation for a renewed commercial relationship.", status: "pending" },
      { sessionId: crestlineEbr.id, order: 4, category: "expansion", title: "AI Rebalancing Co-Development — Early Signal", content: "Oliver has mentioned interest in AI rebalancing. Early scoping discussion to show forward momentum beyond current issues.", status: "pending" },
    ],
  });

  console.log("✅  QBR Sessions created");

  // AI Pulse Insights are intentionally NOT seeded.
  // They are generated live by the configured AI provider when a user clicks
  // "Generate AI Insight" on the AI Pulse page (POST /api/ai/pulse).

  console.log("✅  AI Pulse Insights skipped (generated live via configured AI provider)");

  // ── Activity Logs ──────────────────────────────────────────────────────────

  await prisma.activityLog.createMany({
    data: [
      { userId: sarah.id, accountId: helix.id, action: "signal.created", entity: "Signal", metadata: { type: "CHURN_RISK" } },
      { userId: sarah.id, accountId: helix.id, action: "action.created", entity: "Action", metadata: { title: "Emergency exec call with Jordan Walsh" } },
      { userId: sarah.id, accountId: helix.id, action: "qbr.created", entity: "QbrSession", metadata: { title: "Helix Payments Emergency QBR" } },
      { userId: sarah.id, accountId: crestline.id, action: "signal.created", entity: "Signal", metadata: { type: "TICKET_SPIKE" } },
      { userId: sarah.id, accountId: crestline.id, action: "qbr.created", entity: "QbrSession", metadata: { title: "Crestline Capital Emergency EBR" } },
      { userId: sarah.id, accountId: clearbridge.id, action: "qbr.created", entity: "QbrSession", metadata: { title: "ClearBridge Health Q1 Recovery QBR" } },
      { userId: marcus.id, accountId: ironclad.id, action: "qbr.completed", entity: "QbrSession", metadata: { title: "Ironclad Logistics Q1 2025 QBR" } },
      { userId: marcus.id, accountId: beacon.id, action: "qbr.completed", entity: "QbrSession", metadata: { title: "Beacon Analytics Q1 2025 QBR" } },
      { userId: marcus.id, accountId: beacon.id, action: "action.created", entity: "Action", metadata: { title: "Initiate referral conversation with Zoe Park" } },
      { userId: marcus.id, accountId: ironclad.id, action: "action.updated", entity: "Action", metadata: { title: "Submit Eastern Europe expansion proposal", status: "IN_PROGRESS" } },
    ],
  });

  console.log("✅  Activity Logs created");

  // ── Touchpoints ────────────────────────────────────────────────────────────

  await prisma.touchpoint.createMany({
    data: [
      // Helix Payments — escalating crisis pattern
      { accountId: helix.id, type: "MEETING", date: daysAgo(3),  loggedBy: "Sarah Chen", stakeholders: "Jordan Walsh, Nina Osei", notes: "Emergency call triggered by CTO email. Jordan is frustrated with v4.1 gateway instability. Agreed to share RCA within 48 hours. Temperature: cold." },
      { accountId: helix.id, type: "EMAIL",   date: daysAgo(8),  loggedBy: "Sarah Chen", stakeholders: "Jordan Walsh", notes: "Sent migration impact report and preliminary root cause summary. Jordan acknowledged receipt, tone neutral." },
      { accountId: helix.id, type: "CALL",    date: daysAgo(18), loggedBy: "Sarah Chen", stakeholders: "Carlos Reyes", notes: "Engineering-to-engineering call on v4.1 deployment. Carlos confirmed 52 tickets traced to payment gateway timeout regression. Fix ETA 10 days." },
      { accountId: helix.id, type: "MEETING", date: daysAgo(35), loggedBy: "Sarah Chen", stakeholders: "Jordan Walsh, Nina Osei, Carlos Reyes", notes: "Quarterly check-in pre-issues. All KPIs reviewed, client sentiment declining. Jordan flagged concerns about EU launch readiness. Follow-up action set." },
      { accountId: helix.id, type: "EMAIL",   date: daysAgo(52), loggedBy: "Sarah Chen", stakeholders: "Nina Osei", notes: "Shared v4 roadmap preview with VP Product. Positive reception. Nina confirmed budget review in Q2 for EU expansion." },

      // ClearBridge Health — proactive engagement
      { accountId: clearbridge.id, type: "MEETING", date: daysAgo(5),  loggedBy: "Sarah Chen", stakeholders: "Dr. Ravi Menon", notes: "CDO check-in. Ravi concerned about MAU decline. Agreed to share recovery plan and onboarding sprint proposal within one week. Relationship remains warm." },
      { accountId: clearbridge.id, type: "CALL",    date: daysAgo(14), loggedBy: "Sarah Chen", stakeholders: "Chloe Fournier", notes: "Attempted re-engagement with IT Director after 4 weeks of silence. Brief call, Chloe mentioned heavy workload. Shared v4 training guide. Will follow up in 2 weeks." },
      { accountId: clearbridge.id, type: "EMAIL",   date: daysAgo(21), loggedBy: "Sarah Chen", stakeholders: "Ben Mackay", notes: "Sent clinical staff navigation guide and recorded walkthrough for v4 interface. Ben confirmed distribution to 200+ staff." },
      { accountId: clearbridge.id, type: "MEETING", date: daysAgo(40), loggedBy: "Sarah Chen", stakeholders: "Dr. Ravi Menon, Chloe Fournier", notes: "Routine QBR prep. Discussed MAU targets and onboarding completion rates. Ravi approved Alberta expansion scoping for H2 2025." },

      // Ironclad Logistics — healthy cadence
      { accountId: ironclad.id, type: "QBR",     date: daysAgo(12), loggedBy: "Marcus Okafor", stakeholders: "Pieter van Dijk, Lena Hofer", notes: "Q1 QBR completed. Exceptional metrics across all KPIs. Eastern Europe expansion budget likely approved before Q2 close. Case study approved. Customs compliance module scoped for Phase 2." },
      { accountId: ironclad.id, type: "CALL",    date: daysAgo(25), loggedBy: "Marcus Okafor", stakeholders: "Pieter van Dijk", notes: "Mid-quarter check-in. Pieter confirmed EE expansion board discussion planned for next month. Very positive tone." },
      { accountId: ironclad.id, type: "MEETING", date: daysAgo(45), loggedBy: "Marcus Okafor", stakeholders: "Lena Hofer", notes: "Operations review. Lena confirmed Phase 2 interest in customs compliance module. Requirements document requested." },
      { accountId: ironclad.id, type: "EMAIL",   date: daysAgo(60), loggedBy: "Marcus Okafor", stakeholders: "Pieter van Dijk", notes: "Shared route optimisation Phase 2 delivery confirmation. Pieter gave positive client feedback. Offered co-marketing opportunity." },

      // Beacon Analytics — growth momentum
      { accountId: beacon.id, type: "QBR",     date: daysAgo(20), loggedBy: "Marcus Okafor", stakeholders: "Zoe Park, Tariq Hassan", notes: "Best QBR on record. Client sentiment excellent, Series A confirmed at $18M. Enterprise upgrade proposal requested by Tariq. Zoe offered to be a reference customer. Referral discussion initiated." },
      { accountId: beacon.id, type: "MEETING", date: daysAgo(38), loggedBy: "Marcus Okafor", stakeholders: "Tariq Hassan", notes: "Technical deep-dive on enterprise tier features. Tariq reviewed advanced SLA terms. Positive signals on upgrade timeline." },
      { accountId: beacon.id, type: "CALL",    date: daysAgo(55), loggedBy: "Marcus Okafor", stakeholders: "Maya Flores", notes: "Engineering check-in post data pipeline sprint delivery. Maya confirmed all 4 features performing in production. Sprint velocity at 91%." },
      { accountId: beacon.id, type: "EMAIL",   date: daysAgo(70), loggedBy: "Marcus Okafor", stakeholders: "Zoe Park", notes: "Shared SOC2 Type II advisory framework. Zoe confirmed Maya Flores leading internally. Tkxel to provide advisory support as part of enterprise tier value." },

      // Crestline Capital — damage control
      { accountId: crestline.id, type: "CALL",    date: daysAgo(2),  loggedBy: "Sarah Chen", stakeholders: "Amara Diallo", notes: "Engineering escalation call. Amara confirmed 25 of 41 tickets are addressable in a focused sprint. Fix timeline: 8 business days. Sprint kick-off tomorrow." },
      { accountId: crestline.id, type: "MEETING", date: daysAgo(10), loggedBy: "Sarah Chen", stakeholders: "Oliver Hartmann", notes: "COO raised serious concerns about analytics module quality. Presented preliminary RCA. Oliver demanded committed fix dates and a senior point of contact. Temperature: very cold." },
      { accountId: crestline.id, type: "EMAIL",   date: daysAgo(15), loggedBy: "Sarah Chen", stakeholders: "Rebecca Stone", notes: "Communicated FCA reporting module delay to Head of Compliance. Rebecca acknowledged, flagged 3-week tolerance window. Urgency elevated." },
      { accountId: crestline.id, type: "MEETING", date: daysAgo(30), loggedBy: "Sarah Chen", stakeholders: "Oliver Hartmann, Amara Diallo", notes: "Monthly check-in. Analytics module v2.1 shipped. Initial feedback cautiously positive. Ticket volume not yet elevated at this stage." },

      // NexaCloud Ltd — expansion focus
      { accountId: nexacloud.id, type: "MEETING", date: daysAgo(6),  loggedBy: "Sarah Chen", stakeholders: "Alex Thornton", notes: "AI module discovery session. Alex confirmed Q2 budget interest for AI inference add-on. Proposal requested by end of month. Excellent engagement." },
      { accountId: nexacloud.id, type: "QBR",     date: daysAgo(28), loggedBy: "Sarah Chen", stakeholders: "Alex Thornton, Priya Sharma", notes: "Q1 QBR. Billing health and client sentiment strong. Expansion discussion confirmed. AI module opportunity scoped at $120K." },
      { accountId: nexacloud.id, type: "CALL",    date: daysAgo(50), loggedBy: "Sarah Chen", stakeholders: "Priya Sharma", notes: "Engineering cadence call. VP Engineering confirmed all sprint deliverables on track. Feature adoption growing week-over-week." },

      // Vertex Systems — champion account
      { accountId: vertex.id, type: "MEETING", date: daysAgo(4),  loggedBy: "Marcus Okafor", stakeholders: "Michael Kane", notes: "CEO briefing on $200K expansion proposal. Legal review in progress. Michael very supportive. Expected close within 8 days." },
      { accountId: vertex.id, type: "CALL",    date: daysAgo(15), loggedBy: "Marcus Okafor", stakeholders: "Sandra Lee", notes: "Customer success alignment call. Sandra confirmed Q2 webinar participation. Co-marketing content strategy discussed." },
      { accountId: vertex.id, type: "QBR",     date: daysAgo(32), loggedBy: "Marcus Okafor", stakeholders: "Michael Kane, Sandra Lee", notes: "Q1 QBR. Client sentiment excellent, zero tickets, 98% sprint delivery rate. CEO personally commended the team. Platform expansion proposal well received." },
      { accountId: vertex.id, type: "EMAIL",   date: daysAgo(60), loggedBy: "Marcus Okafor", stakeholders: "Michael Kane", notes: "Sent premier support onboarding confirmation. Dedicated Slack channel and named CSE assigned. Michael replied within the hour with positive feedback." },

      // MediSync Health — recovery mode
      { accountId: medisync.id, type: "CALL",    date: daysAgo(4),  loggedBy: "Sarah Chen", stakeholders: "Dr. Patricia Obi", notes: "CIO escalation call. Patricia frustrated with integration timeline delays. Requested honest assessment and revised milestones. Promised response within 48 hours." },
      { accountId: medisync.id, type: "MEETING", date: daysAgo(18), loggedBy: "Sarah Chen", stakeholders: "James Whitfield", notes: "IT Operations review. James flagged HL7 FHIR API authentication failures in staging. 31 open tickets discussed. Dedicated integration engineer assignment requested." },
      { accountId: medisync.id, type: "EMAIL",   date: daysAgo(35), loggedBy: "Sarah Chen", stakeholders: "Dr. Patricia Obi", notes: "Sent revised integration timeline with 2-week buffer. CIO acknowledged and agreed to revised milestone dates, pending board sign-off." },
    ],
  });

  console.log("✅  Touchpoints created");

  // ── Escalations ────────────────────────────────────────────────────────────

  await prisma.escalation.createMany({
    data: [
      // Helix Payments — critical, two open escalations
      {
        accountId: helix.id,
        type: "COMMERCIAL",
        severity: "CRITICAL",
        description: "Contract expires in 55 days with no renewal motion underway. Client sentiment collapse and ticket surge create a high-risk renewal scenario. Immediate executive intervention required. Escalated to account director and senior leadership.",
        linkedProject: "Helix Payments MSA Renewal",
        openedById: sarah.id,
        status: "OPEN",
        openedAt: daysAgo(4),
      },
      {
        accountId: helix.id,
        type: "DELIVERY",
        severity: "HIGH",
        description: "v4.1 payment gateway migration caused a 140% spike in support tickets. 52 tickets remain open against a 10-ticket SLA target. Root cause: timeout regression in gateway authentication middleware. Fix sprint underway.",
        linkedProject: "Helix Gateway v4.1",
        openedById: sarah.id,
        resolutionNotes: null,
        status: "IN_PROGRESS",
        openedAt: daysAgo(12),
      },

      // ClearBridge Health — engagement issue
      {
        accountId: clearbridge.id,
        type: "RELATIONSHIP",
        severity: "MEDIUM",
        description: "IT Director Chloe Fournier disengaged for 4+ weeks. Engineering-level relationship weakening. CDO relationship remains strong but loss of IT Director as internal champion poses a risk during renewal cycle.",
        openedById: sarah.id,
        status: "OPEN",
        openedAt: daysAgo(5),
      },

      // Crestline Capital — quality crisis
      {
        accountId: crestline.id,
        type: "DELIVERY",
        severity: "HIGH",
        description: "Analytics module v2.1 released 5 weeks ago is causing 25 of 41 open tickets. Bug resolution time averaging 14 days vs 5-day SLA. COO has raised concerns formally. Fix sprint initiated targeting 8-day resolution window.",
        linkedProject: "Crestline Analytics Module v2.1",
        openedById: sarah.id,
        status: "IN_PROGRESS",
        openedAt: daysAgo(10),
      },
      {
        accountId: crestline.id,
        type: "COMMERCIAL",
        severity: "MEDIUM",
        description: "FCA reporting module delivery delayed by 3 weeks. Head of Compliance flagged regulatory exposure. If unresolved before renewal window, risk of contractual penalties and price concession demands.",
        linkedProject: "Crestline FCA Reporting Module",
        openedById: sarah.id,
        status: "OPEN",
        openedAt: daysAgo(7),
      },

      // MediSync Health — integration delays
      {
        accountId: medisync.id,
        type: "DELIVERY",
        severity: "HIGH",
        description: "HL7 FHIR integration delivery is 13 weeks behind the original schedule. API authentication failures in staging blocking go-live. CIO has escalated to Tkxel account director. Dedicated senior integration engineer assigned as of today.",
        linkedProject: "MediSync HL7 FHIR Integration",
        openedById: sarah.id,
        status: "IN_PROGRESS",
        openedAt: daysAgo(8),
      },

      // Ironclad — resolved escalation (shows lifecycle)
      {
        accountId: ironclad.id,
        type: "DELIVERY",
        severity: "LOW",
        description: "Minor scope expansion in route optimisation Phase 2 caused a 2-week delay. Communicated proactively to Pieter. Additional resource allocated. Resolved without client impact.",
        linkedProject: "Ironclad Route Optimisation Phase 2",
        openedById: marcus.id,
        resolutionNotes: "Scope agreed and delivery extended by 2 weeks with client agreement. No commercial impact. Delivered on revised date.",
        status: "RESOLVED",
        openedAt: daysAgo(55),
        closedAt: daysAgo(42),
      },
    ],
  });

  console.log("✅  Escalations created");

  // ── Opportunities ──────────────────────────────────────────────────────────

  await prisma.opportunity.createMany({
    data: [
      // Ironclad — expansion pipeline
      {
        accountId: ironclad.id,
        serviceLine: "Platform Engineering",
        description: "Eastern Europe expansion covering 4 new logistics hubs: Warsaw, Prague, Budapest, and Bucharest. Route optimisation platform deployment, local data residency compliance, and carrier API integrations.",
        estimatedValue: 220_000,
        effort: "HIGH",
        probability: 0.80,
        status: "QUALIFYING",
        source: "KAM",
        nextAction: "Submit formal proposal and commercial terms by end of week",
      },
      {
        accountId: ironclad.id,
        serviceLine: "Managed Services",
        description: "Cross-border customs compliance module for EU/EEA shipments. Co-development with Ironclad team. Phase 2 of platform engagement.",
        estimatedValue: 88_000,
        effort: "MEDIUM",
        probability: 0.65,
        status: "IDENTIFIED",
        source: "KAM",
        nextAction: "Complete requirements scoping with Lena Hofer",
      },

      // Beacon — upgrade and expansion
      {
        accountId: beacon.id,
        serviceLine: "Platform Engineering",
        description: "Enterprise tier upgrade for Beacon Analytics. Includes advanced SLA, dedicated CSM, SOC2 advisory, and EMEA delivery support. Usage has exceeded growth tier limits for 3 consecutive months.",
        estimatedValue: 130_000,
        effort: "LOW",
        probability: 0.88,
        status: "PROPOSAL",
        source: "AI",
        nextAction: "Tariq Hassan reviewing commercial terms - follow up by end of week",
      },
      {
        accountId: beacon.id,
        serviceLine: "Managed Services",
        description: "EMEA expansion support for Beacon Analytics London launch in H2 2025. Includes UK entity setup advisory, data residency compliance, and GDPR implementation.",
        estimatedValue: 85_000,
        effort: "MEDIUM",
        probability: 0.60,
        status: "IDENTIFIED",
        source: "AI",
        nextAction: "Prepare EMEA expansion proposal aligned to enterprise upgrade timeline",
      },

      // NexaCloud — AI add-on
      {
        accountId: nexacloud.id,
        serviceLine: "AI Enablement",
        description: "AI inference and model training add-on for NexaCloud platform. Covers vector search infrastructure, ML pipeline deployment, and on-demand GPU provisioning. Alex Thornton confirmed Q2 budget interest.",
        estimatedValue: 120_000,
        effort: "MEDIUM",
        probability: 0.75,
        status: "QUALIFYING",
        source: "AI",
        nextAction: "Prepare commercial proposal with 12-month and 24-month commit tiers",
      },
      {
        accountId: nexacloud.id,
        serviceLine: "Managed Services",
        description: "Proactive cloud cost optimisation engagement. NexaCloud at 108% revenue utilisation - rightsizing and reserved instance planning can reduce costs 15-20% while maintaining performance.",
        estimatedValue: 40_000,
        effort: "LOW",
        probability: 0.70,
        status: "IDENTIFIED",
        source: "KAM",
        nextAction: "Schedule cost analysis workshop with VP Engineering",
      },

      // Vertex — flagship expansion
      {
        accountId: vertex.id,
        serviceLine: "Platform Engineering",
        description: "Platform licence expansion from 800 to 1,200 seats. Includes advanced workflow automation module and enterprise SSO. CEO has signed off on scope; legal review in progress.",
        estimatedValue: 200_000,
        effort: "LOW",
        probability: 0.92,
        status: "PROPOSAL",
        source: "KAM",
        nextAction: "Align with Tkxel legal on SLA terms - close expected within 8 days",
      },
      {
        accountId: vertex.id,
        serviceLine: "Managed Services",
        description: "Co-marketing initiative: joint webinar on enterprise software modernisation with Michael Kane as keynote speaker. Estimated pipeline contribution $50K from qualified leads.",
        estimatedValue: 15_000,
        effort: "LOW",
        probability: 0.85,
        status: "QUALIFYING",
        source: "KAM",
        nextAction: "Coordinate with Tkxel marketing on content and audience strategy",
      },

      // Crestline — conditional expansion (at risk)
      {
        accountId: crestline.id,
        serviceLine: "AI Enablement",
        description: "AI-powered portfolio rebalancing co-development. Oliver Hartmann has expressed interest but current delivery issues must be resolved first. Conditional on successful fix sprint and EBR outcome.",
        estimatedValue: 180_000,
        effort: "HIGH",
        probability: 0.35,
        status: "IDENTIFIED",
        source: "KAM",
        nextAction: "Do not advance until analytics module issues resolved and COO relationship restored",
      },

      // ClearBridge — expansion pending recovery
      {
        accountId: clearbridge.id,
        serviceLine: "Platform Engineering",
        description: "Alberta hospital network expansion - 4 new networks in Edmonton and Calgary. CDO has approved scoping for H2 2025. Dependent on MAU recovery and SSO stability.",
        estimatedValue: 220_000,
        effort: "HIGH",
        probability: 0.55,
        status: "IDENTIFIED",
        source: "KAM",
        nextAction: "Include Alberta expansion in upcoming QBR agenda",
      },
    ],
  });

  console.log("✅  Opportunities created");

  // ── Score Overrides ────────────────────────────────────────────────────────

  await prisma.scoreOverride.createMany({
    data: [
      // Helix — PENDING: KAM requesting CSAT uplift based on verbal feedback
      {
        accountId: helix.id,
        kpiKey: "csat",
        previousValue: 18,
        requestedValue: 28,
        reason: "Jordan Walsh verbally confirmed during the emergency call that internal CSAT survey results are higher than our system shows. The 11/100 score reflects Jira ticket sentiment only, not the broader team satisfaction. Requesting +10pt adjustment pending survey data upload.",
        requestedById: sarah.id,
        status: "PENDING",
        createdAt: daysAgo(2),
      },

      // ClearBridge — APPROVED: Manager confirmed relationship score should be higher
      {
        accountId: clearbridge.id,
        kpiKey: "relationship",
        previousValue: 58,
        requestedValue: 70,
        approvedValue: 68,
        reason: "CDO Dr. Ravi Menon attended Tkxel executive dinner and confirmed strong personal relationship with senior leadership. System score does not capture this executive-level engagement. Adjusted to 68 by manager after verification.",
        requestedById: sarah.id,
        approvedById: marcus.id,
        status: "APPROVED",
        createdAt: daysAgo(8),
      },

      // Ironclad — APPROVED: Financial score adjusted for confirmed expansion ARR
      {
        accountId: ironclad.id,
        kpiKey: "financial",
        previousValue: 88,
        requestedValue: 96,
        approvedValue: 94,
        reason: "Eastern Europe expansion PO confirmed verbally by Pieter van Dijk. This represents a 28% ARR increase (EUR 200K) not yet reflected in Salesforce. Score adjusted to reflect confirmed financial trajectory.",
        requestedById: marcus.id,
        approvedById: marcus.id,
        status: "APPROVED",
        createdAt: daysAgo(6),
      },

      // Beacon — DECLINED: Requested override was too aggressive
      {
        accountId: beacon.id,
        kpiKey: "whitespace",
        previousValue: 85,
        requestedValue: 98,
        reason: "Requesting maximum whitespace score given enterprise upgrade proposal is in final stage. Both CEO and CTO are engaged, EMEA expansion is confirmed. Score should reflect near-certain close.",
        requestedById: marcus.id,
        status: "DECLINED",
        createdAt: daysAgo(5),
      },

      // Crestline — PENDING: Requesting risk score reduction post-sprint commitment
      {
        accountId: crestline.id,
        kpiKey: "risk",
        previousValue: 32,
        requestedValue: 45,
        reason: "Amara Diallo has formally committed to resolving 25 of 41 tickets within 8 business days via a dedicated fix sprint. The current risk score does not reflect this committed remediation plan. Requesting uplift conditional on sprint completion.",
        requestedById: sarah.id,
        status: "PENDING",
        createdAt: daysAgo(1),
      },

      // NexaCloud — APPROVED: Whitespace adjusted for confirmed AI module interest
      {
        accountId: nexacloud.id,
        kpiKey: "whitespace",
        previousValue: 82,
        requestedValue: 90,
        approvedValue: 88,
        reason: "Alex Thornton confirmed Q2 budget allocation for AI module in discovery call. This represents a significant expansion opportunity not yet in the scoring pipeline. Override approved by manager pending proposal submission.",
        requestedById: sarah.id,
        approvedById: marcus.id,
        status: "APPROVED",
        createdAt: daysAgo(4),
      },
    ],
  });

  console.log("✅  Score Overrides created");

  // ── Questionnaire Responses ────────────────────────────────────────────────

  await prisma.questionnaireResponse.createMany({
    data: [
      // Helix Payments — critical account, low scores
      { accountId: helix.id, section: "csat", questionId: "csat_overall", response: "18", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: helix.id, section: "csat", questionId: "nps_score", response: "11", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: helix.id, section: "risk", questionId: "open_tickets", response: "52", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: helix.id, section: "risk", questionId: "churn_risk_flag", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: helix.id, section: "contract", questionId: "renewal_risk", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: helix.id, section: "relationship", questionId: "exec_engagement", response: "15", inputType: "SCALE", prepopulated: true, confirmedBy: null },

      // ClearBridge — at risk, mixed signals
      { accountId: clearbridge.id, section: "csat", questionId: "csat_overall", response: "62", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: clearbridge.id, section: "csat", questionId: "nps_score", response: "30", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: clearbridge.id, section: "relationship", questionId: "exec_engagement", response: "75", inputType: "SCALE", prepopulated: false, confirmedBy: "KAM" },
      { accountId: clearbridge.id, section: "risk", questionId: "open_tickets", response: "24", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: clearbridge.id, section: "contract", questionId: "renewal_risk", response: "false", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },

      // Ironclad — healthy, high scores
      { accountId: ironclad.id, section: "csat", questionId: "csat_overall", response: "88", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: ironclad.id, section: "csat", questionId: "nps_score", response: "74", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: ironclad.id, section: "relationship", questionId: "exec_engagement", response: "92", inputType: "SCALE", prepopulated: false, confirmedBy: "KAM" },
      { accountId: ironclad.id, section: "whitespace", questionId: "upsell_readiness", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: ironclad.id, section: "financial", questionId: "arr_utilisation", response: "96", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },

      // Beacon — excellent, strong signals
      { accountId: beacon.id, section: "csat", questionId: "csat_overall", response: "92", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: beacon.id, section: "csat", questionId: "nps_score", response: "83", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: beacon.id, section: "whitespace", questionId: "upsell_readiness", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: beacon.id, section: "financial", questionId: "arr_utilisation", response: "99", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: beacon.id, section: "relationship", questionId: "exec_engagement", response: "88", inputType: "SCALE", prepopulated: false, confirmedBy: "KAM" },

      // Crestline — AT_RISK, quality issues
      { accountId: crestline.id, section: "csat", questionId: "csat_overall", response: "38", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: crestline.id, section: "csat", questionId: "nps_score", response: "25", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: crestline.id, section: "risk", questionId: "open_tickets", response: "41", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: crestline.id, section: "risk", questionId: "churn_risk_flag", response: "false", inputType: "BOOLEAN", prepopulated: true, confirmedBy: null },
      { accountId: crestline.id, section: "contract", questionId: "renewal_risk", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },

      // NexaCloud — healthy, expansion ready
      { accountId: nexacloud.id, section: "csat", questionId: "csat_overall", response: "86", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: nexacloud.id, section: "whitespace", questionId: "upsell_readiness", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: nexacloud.id, section: "financial", questionId: "arr_utilisation", response: "108", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: nexacloud.id, section: "relationship", questionId: "exec_engagement", response: "85", inputType: "SCALE", prepopulated: false, confirmedBy: "KAM" },

      // Vertex Systems — champion account
      { accountId: vertex.id, section: "csat", questionId: "csat_overall", response: "93", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: vertex.id, section: "csat", questionId: "nps_score", response: "88", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: vertex.id, section: "whitespace", questionId: "upsell_readiness", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: vertex.id, section: "relationship", questionId: "exec_engagement", response: "95", inputType: "SCALE", prepopulated: false, confirmedBy: "KAM" },
      { accountId: vertex.id, section: "financial", questionId: "arr_utilisation", response: "112", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },

      // MediSync Health — at risk, integration issues
      { accountId: medisync.id, section: "csat", questionId: "csat_overall", response: "42", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: medisync.id, section: "csat", questionId: "nps_score", response: "32", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: medisync.id, section: "risk", questionId: "open_tickets", response: "31", inputType: "SCALE", prepopulated: true, confirmedBy: "KAM" },
      { accountId: medisync.id, section: "contract", questionId: "renewal_risk", response: "true", inputType: "BOOLEAN", prepopulated: true, confirmedBy: "KAM" },
      { accountId: medisync.id, section: "relationship", questionId: "exec_engagement", response: "52", inputType: "SCALE", prepopulated: false, confirmedBy: null },
    ],
  });

  console.log("✅  Questionnaire Responses created");

  console.log("\n🎉  Seed complete!\n");
  console.log("   Portfolio summary:");
  console.log("   🔴  Helix Payments     — CRITICAL  ($1.75M ARR, renewal in 55d)");
  console.log("   🟡  ClearBridge Health — AT_RISK   ($870K ARR, renewal in 210d)");
  console.log("   🟢  Ironclad Logistics — HEALTHY   ($720K ARR, expansion €200K pending)");
  console.log("   🟢  Beacon Analytics   — HEALTHY   ($510K ARR, enterprise upsell $130K)");
  console.log("   🟡  Crestline Capital  — AT_RISK   ($1.2M ARR, renewal in 130d)\n");
  console.log("   Data density:");
  console.log("   📊  48 KAM scores (6 per account, historical trend)");
  console.log("   🔔  signals across all accounts");
  console.log("   ✅  actions (open + in-progress + done)");
  console.log("   📁  documents");
  console.log("   🤝  QBR/EBR sessions (all accounts)");
  console.log("   🧠  AI pulse insights");
  console.log("   📍  Touchpoints (3-5 per account)");
  console.log("   🚨  Escalations (AT_RISK and CRITICAL accounts)");
  console.log("   💡  Opportunities (HEALTHY and expanding accounts)");
  console.log("   🔧  Score Overrides (PENDING, APPROVED, DECLINED)");
  console.log("   📋  Questionnaire Responses (4-6 per account)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
