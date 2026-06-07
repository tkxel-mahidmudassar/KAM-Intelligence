import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guard, notFound, ok, serverError, getRoleFromRequest } from "@/lib/api";
import { findAccountForResponse } from "@/lib/accounts/accountApi";

type Params = { params: Promise<{ id: string }> };

async function accountOrNotFound(accountId: string) {
  return prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
}

async function updatedAccount(accountId: string) {
  return findAccountForResponse(accountId);
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:create");
    if (denied) return denied;

    const { id: accountId } = await params;
    if (!(await accountOrNotFound(accountId))) return notFound("Account");

    const body = await req.json();
    if (!body.name) return badRequest("name is required");

    if (body.isPrimary) {
      await prisma.accountContact.updateMany({
        where: { accountId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    await prisma.accountContact.create({
      data: {
        accountId,
        name: body.name,
        title: body.title ?? body.designation ?? null,
        email: body.email ?? null,
        phone: body.phone ?? body.mobile ?? null,
        location: body.location ?? null,
        timeZone: body.timeZone ?? null,
        hierarchyRank: body.hierarchyRank === undefined ? null : Number(body.hierarchyRank),
        isPrimary: Boolean(body.isPrimary),
      },
    });

    return ok(await updatedAccount(accountId));
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:update");
    if (denied) return denied;

    const { id: accountId } = await params;
    const body = await req.json();
    const contactId = body.id ?? body.contactId;
    if (!contactId) return badRequest("contact id is required");

    const existing = await prisma.accountContact.findFirst({ where: { id: contactId, accountId } });
    if (!existing) return notFound("Contact");

    if (body.isPrimary && !existing.isPrimary) {
      await prisma.accountContact.updateMany({
        where: { accountId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    await prisma.accountContact.update({
      where: { id: contactId },
      data: {
        name: body.name ?? existing.name,
        title: body.title ?? body.designation ?? existing.title,
        email: body.email !== undefined ? body.email : existing.email,
        phone: body.phone ?? body.mobile ?? existing.phone,
        location: body.location !== undefined ? body.location : existing.location,
        timeZone: body.timeZone !== undefined ? body.timeZone : existing.timeZone,
        hierarchyRank: body.hierarchyRank !== undefined ? Number(body.hierarchyRank) : existing.hierarchyRank,
        isPrimary: body.isPrimary !== undefined ? Boolean(body.isPrimary) : existing.isPrimary,
      },
    });

    return ok(await updatedAccount(accountId));
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:delete");
    if (denied) return denied;

    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("id") ?? searchParams.get("contactId");
    if (!contactId) return badRequest("contact id is required");

    const existing = await prisma.accountContact.findFirst({ where: { id: contactId, accountId } });
    if (!existing) return notFound("Contact");

    await prisma.accountContact.delete({ where: { id: contactId } });
    return ok(await updatedAccount(accountId));
  } catch (err) {
    return serverError(err);
  }
}
