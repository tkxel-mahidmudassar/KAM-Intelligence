import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, created, badRequest, serverError, guard, kamWhere } from "@/lib/api";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
import { getJiraAdapter } from "@/lib/adapters/jira";

async function resolveKamId(kamId?: string | null, kamOwnerName?: string | null) {
  if (kamId) return kamId;

  const ownerName = kamOwnerName?.trim();
  if (ownerName) {
    const matchedKam = await prisma.user.findFirst({
      where: {
        role: "KAM",
        OR: [
          { name: ownerName },
          { email: ownerName },
          { name: { contains: ownerName } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (matchedKam) return matchedKam.id;
  }

  const fallbackKam = await prisma.user.findFirst({
    where: { role: "KAM" },
    orderBy: { createdAt: "asc" },
  });
  return fallbackKam?.id ?? null;
}

// GET /api/accounts
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:view");
    if (denied) return denied;

    // Resolve the current KAM user ID: prefer x-user-id header (set from login context),
    // fall back to first KAM user for backwards compat (POC identity hack)
    const headerUserId = getUserIdFromRequest(req);
    const kamUserId = headerUserId ?? (await prisma.user.findFirst({
      where: { role: "KAM" },
      orderBy: { createdAt: "asc" },
    }))?.id ?? "";
    const where = kamWhere(role, kamUserId);

    const accounts = await prisma.account.findMany({
      where,
      include: {
        kam: { select: { id: true, name: true, email: true } },
        kamScores: { orderBy: { computedAt: "desc" }, take: 8 },
        signals: { where: { isResolved: false }, orderBy: { detectedAt: "desc" }, take: 3 },
        _count: { select: { actions: true, documents: true } },
      },
      orderBy: [
        { health: "asc" }, // CRITICAL first
        { arr: "desc" },
      ],
    });

    return ok(accounts);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/accounts
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:create");
    if (denied) return denied;

    const body = await req.json();
    const { name, industry, segment, website, logoUrl, region, country, arr, kamId, kamOwnerName, contractStart, contractEnd } = body;

    if (!name) return badRequest("name is required");
    const resolvedKamId = await resolveKamId(kamId, kamOwnerName);

    const account = await prisma.account.create({
      data: {
        name,
        industry,
        segment,
        website,
        logoUrl,
        region,
        country,
        arr: arr ?? 0,
        kamId:         resolvedKamId,
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd:   contractEnd   ? new Date(contractEnd)   : null,
      },
      include: {
        kam: { select: { id: true, name: true, email: true } },
      },
    });

    return created(account);
  } catch (err) {
    return serverError(err);
  }
}
