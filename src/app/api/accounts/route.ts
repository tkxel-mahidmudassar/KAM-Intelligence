import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, getUserIdFromRequest, ok, created, badRequest, serverError, guard, kamWhere } from "@/lib/api";
import { accountResponseInclude, resolveUserId } from "@/lib/accounts/accountApi";
import { getSalesforceAdapter } from "@/lib/adapters/salesforce";
import { getJiraAdapter } from "@/lib/adapters/jira";

async function resolveKamId(kamId?: string | null, kamOwnerName?: string | null) {
  return resolveUserId({ userId: kamId, userName: kamOwnerName, role: "KAM", fallbackRole: "KAM" });
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
    const associateUserId = headerUserId ?? (await prisma.user.findFirst({
      where: { role: "ASSOCIATE" },
      orderBy: { createdAt: "asc" },
    }))?.id ?? "";
    const where = role === "ASSOCIATE" ? { associateOwnerId: associateUserId } : kamWhere(role, kamUserId);

    const accounts = await prisma.account.findMany({
      where,
      include: accountResponseInclude,
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
    const {
      sourceKey,
      name,
      industry,
      segment,
      deliveryModel,
      currentWork,
      relationshipSignal,
      website,
      logoUrl,
      region,
      country,
      arr,
      kamId,
      kamOwnerName,
      associateOwnerId,
      associateOwnerName,
      contractStart,
      contractEnd,
      health,
    } = body;

    if (!name) return badRequest("name is required");
    const resolvedKamId = await resolveKamId(kamId, kamOwnerName);
    const resolvedAssociateOwnerId = await resolveUserId({
      userId: associateOwnerId,
      userName: associateOwnerName,
      role: "ASSOCIATE",
    });

    const account = await prisma.account.create({
      data: {
        sourceKey,
        name,
        industry,
        segment,
        deliveryModel,
        currentWork,
        relationshipSignal,
        website,
        logoUrl,
        region,
        country,
        arr: arr ?? 0,
        health,
        healthUpdatedAt: health ? new Date() : undefined,
        kamId:         resolvedKamId,
        associateOwnerId: resolvedAssociateOwnerId,
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd:   contractEnd   ? new Date(contractEnd)   : null,
      },
      include: accountResponseInclude,
    });

    return created(account);
  } catch (err) {
    return serverError(err);
  }
}
