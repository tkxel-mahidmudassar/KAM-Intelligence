import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guard, notFound, ok, serverError, getRoleFromRequest } from "@/lib/api";
import { findAccountForResponse } from "@/lib/accounts/accountApi";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!account) return notFound("Account");

    const body = await req.json();
    if (!body.name) return badRequest("name is required");
    const podName = typeof body.pod === "string" ? body.pod.trim() : "";
    const sowName = typeof body.sowName === "string" ? body.sowName.trim() : "";
    const pod = sowName ? `${podName || "Unassigned pod"} · SOW: ${sowName}` : podName || null;

    await prisma.accountResource.create({
      data: {
        accountId,
        name: String(body.name).trim(),
        role: typeof body.role === "string" ? body.role.trim() || null : null,
        pod,
        location: typeof body.location === "string" ? body.location.trim() || null : null,
        startDate: typeof body.startDate === "string" ? body.startDate.trim() || null : null,
      },
    });

    return ok(await findAccountForResponse(accountId));
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const body = await req.json();
    const resourceId = body.id ?? body.resourceId;
    if (!resourceId) return badRequest("resource id is required");

    const existing = await prisma.accountResource.findFirst({ where: { id: resourceId, accountId } });
    if (!existing) return notFound("Resource");

    await prisma.accountResource.update({
      where: { id: resourceId },
      data: {
        name: body.name ?? existing.name,
        role: body.role !== undefined ? body.role : existing.role,
        pod: body.pod !== undefined ? body.pod : existing.pod,
        location: body.location !== undefined ? body.location : existing.location,
        startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
      },
    });

    return ok(await findAccountForResponse(accountId));
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "account:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const resourceId = searchParams.get("id") ?? searchParams.get("resourceId");
    if (!resourceId) return badRequest("resource id is required");

    const existing = await prisma.accountResource.findFirst({ where: { id: resourceId, accountId } });
    if (!existing) return notFound("Resource");

    await prisma.accountResource.delete({ where: { id: resourceId } });
    return ok(await findAccountForResponse(accountId));
  } catch (err) {
    return serverError(err);
  }
}
