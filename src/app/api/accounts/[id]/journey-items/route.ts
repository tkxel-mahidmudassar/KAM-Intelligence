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
    if (!body.title) return badRequest("title is required");

    await prisma.accountJourneyItem.create({
      data: {
        accountId,
        title: body.title,
        type: body.type ?? "To-do",
        dateLabel: body.dateLabel ?? body.date ?? null,
        detail: body.detail ?? null,
        status: body.status ?? "UPCOMING",
        sortOrder: body.sortOrder === undefined ? 0 : Number(body.sortOrder),
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
    const journeyItemId = body.id ?? body.journeyItemId;
    if (!journeyItemId) return badRequest("journey item id is required");

    const existing = await prisma.accountJourneyItem.findFirst({ where: { id: journeyItemId, accountId } });
    if (!existing) return notFound("Journey item");

    const status = body.status ?? existing.status;
    await prisma.accountJourneyItem.update({
      where: { id: journeyItemId },
      data: {
        title: body.title ?? existing.title,
        type: body.type ?? existing.type,
        dateLabel: body.dateLabel ?? body.date ?? existing.dateLabel,
        detail: body.detail !== undefined ? body.detail : existing.detail,
        status,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder,
        completedAt: status === "COMPLETED" && !existing.completedAt ? new Date() : existing.completedAt,
        dismissReason: body.dismissReason !== undefined ? body.dismissReason : existing.dismissReason,
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
    const journeyItemId = searchParams.get("id") ?? searchParams.get("journeyItemId");
    if (!journeyItemId) return badRequest("journey item id is required");

    const existing = await prisma.accountJourneyItem.findFirst({ where: { id: journeyItemId, accountId } });
    if (!existing) return notFound("Journey item");

    await prisma.accountJourneyItem.delete({ where: { id: journeyItemId } });
    return ok(await findAccountForResponse(accountId));
  } catch (err) {
    return serverError(err);
  }
}
