import { PrismaClient, AccountHealth, DocumentType, Role } from "@prisma/client";
import { portfolioAccounts } from "../src/lib/v2/portfolioData";

const prisma = new PrismaClient();

const resources = [
  { name: "Hassan Ali", role: "Delivery Lead", pod: "Account Delivery", location: "Lahore, Pakistan", startDate: "Jan 2026" },
  { name: "Sara Iqbal", role: "Solution Architect", pod: "Platform Engineering", location: "Karachi, Pakistan", startDate: "Feb 2026" },
  { name: "Bilal Khan", role: "Senior Backend Engineer", pod: "Core Delivery", location: "Islamabad, Pakistan", startDate: "Jan 2026" },
  { name: "Mina Farooq", role: "QA Automation Engineer", pod: "Quality Engineering", location: "Lahore, Pakistan", startDate: "Mar 2026" },
];

const journey = [
  {
    title: "Executive kickoff completed",
    type: "Meeting",
    dateLabel: "Apr 18",
    detail: "Confirmed executive sponsor, delivery cadence, and first ninety-day success markers.",
    status: "COMPLETED",
  },
  {
    title: "Validate renewal decision map",
    type: "To-do",
    dateLabel: "Jun 12",
    detail: "Confirm economic buyer, technical sponsor, procurement path, and success criteria.",
    status: "UPCOMING",
  },
  {
    title: "Executive sponsor sync",
    type: "Meeting",
    dateLabel: "Jun 18",
    detail: "Align on current workstream status and expansion timing.",
    status: "UPCOMING",
  },
  {
    title: "Prepare next QBR narrative",
    type: "QBR",
    dateLabel: "Jun 27",
    detail: "Build the account story around delivery health, value realized, and next whitespace bet.",
    status: "UPCOMING",
  },
];

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function emailForName(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}@tkxel.com`;
}

async function userByName(name: string, role: Role, managerId?: string) {
  return prisma.user.upsert({
    where: { email: emailForName(name) },
    update: { name, role, managerId },
    create: { email: emailForName(name), name, role, managerId },
  });
}

async function main() {
  const kam = await userByName("Sarah Chen", Role.KAM);
  const associates = new Map<string, Awaited<ReturnType<typeof userByName>>>();
  for (const owner of new Set(portfolioAccounts.map((account) => account.associateOwner))) {
    associates.set(owner, await userByName(owner, Role.ASSOCIATE, kam.id));
  }

  for (const account of portfolioAccounts) {
    const associateOwner = associates.get(account.associateOwner);
    const persisted = await prisma.account.upsert({
      where: { sourceKey: account.id },
      update: {
        name: account.name,
        industry: account.industry,
        segment: account.segment ?? account.deliveryModel,
        deliveryModel: account.deliveryModel,
        currentWork: account.currentWork,
        relationshipSignal: account.relationshipSignal,
        region: account.region,
        country: account.country,
        logoUrl: account.logoUrl,
        arr: account.arr,
        health: account.health as AccountHealth,
        healthUpdatedAt: new Date(),
        kamId: kam.id,
        associateOwnerId: associateOwner?.id,
        contractEnd: daysFromNow(account.renewalDays),
      },
      create: {
        sourceKey: account.id,
        name: account.name,
        industry: account.industry,
        segment: account.segment ?? account.deliveryModel,
        deliveryModel: account.deliveryModel,
        currentWork: account.currentWork,
        relationshipSignal: account.relationshipSignal,
        region: account.region,
        country: account.country,
        logoUrl: account.logoUrl,
        arr: account.arr,
        health: account.health as AccountHealth,
        healthUpdatedAt: new Date(),
        kamId: kam.id,
        associateOwnerId: associateOwner?.id,
        contractStart: daysFromNow(-365),
        contractEnd: daysFromNow(account.renewalDays),
      },
    });

    await prisma.accountContact.deleteMany({ where: { accountId: persisted.id } });
    await prisma.accountContact.create({
      data: {
        accountId: persisted.id,
        name: account.contactName,
        title: "Primary stakeholder",
        email: `${account.contactName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}@example.com`,
        phone: "Mobile not set",
        location: account.country,
        timeZone: "Time zone not set",
        hierarchyRank: 1,
        isPrimary: true,
      },
    });

    await prisma.accountResource.deleteMany({ where: { accountId: persisted.id } });
    await prisma.accountResource.createMany({
      data: resources.map((resource) => ({ ...resource, accountId: persisted.id })),
    });

    await prisma.accountJourneyItem.deleteMany({ where: { accountId: persisted.id } });
    await prisma.accountJourneyItem.createMany({
      data: journey.map((item, index) => ({
        ...item,
        accountId: persisted.id,
        sortOrder: index + 1,
        completedAt: item.status === "COMPLETED" ? daysFromNow(-30) : null,
      })),
    });

    await prisma.document.deleteMany({
      where: {
        accountId: persisted.id,
        tags: "v2-static-import",
      },
    });
    await prisma.document.createMany({
      data: [
        {
          accountId: persisted.id,
          name: `${account.name} account brief`,
          type: DocumentType.OTHER,
          tags: "v2-static-import",
          extractedText: `${account.name}: ${account.currentWork}. ${account.relationshipSignal}`,
          signalStatus: "PROCESSED",
        },
        {
          accountId: persisted.id,
          name: `${account.name} renewal notes`,
          type: DocumentType.CONTRACT,
          tags: "v2-static-import",
          extractedText: `Renewal in ${account.renewalDays} days. ARR ${account.arr}.`,
          signalStatus: "PROCESSED",
        },
      ],
    });

    await prisma.kamScore.deleteMany({ where: { accountId: persisted.id } });
    await prisma.kamScore.create({
      data: {
        accountId: persisted.id,
        overall: account.healthScore,
        relationship: account.health === "HEALTHY" ? 82 : account.health === "AT_RISK" ? 58 : 35,
        risk: account.health === "HEALTHY" ? 78 : account.health === "AT_RISK" ? 52 : 30,
        contractHealth: account.renewalDays <= 90 ? 45 : 78,
        projectHealth: account.health === "CRITICAL" ? 34 : 76,
        resourceHealth: 74,
        financial: account.arr >= 1_000_000 ? 82 : 70,
        whitespace: account.relationshipSignal.toLowerCase().includes("expansion") ? 86 : 62,
        health: account.health as AccountHealth,
        aiNarrative: `${account.name} imported from the V2 portfolio baseline.`,
      },
    });
  }

  console.log(`Imported ${portfolioAccounts.length} V2 accounts into the database.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
