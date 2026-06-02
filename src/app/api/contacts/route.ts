import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";

// GET /api/contacts?accountId=xxx
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    if (!accountId) return badRequest("accountId is required");

    const contacts = await prisma.accountContact.findMany({
      where: { accountId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return ok(contacts);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/contacts
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "contact:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, name, title, email, phone, isPrimary } = body;
    if (!accountId) return badRequest("accountId is required");
    if (!name)      return badRequest("name is required");

    // If setting as primary, clear existing primary
    if (isPrimary) {
      await prisma.accountContact.updateMany({
        where: { accountId, isPrimary: true },
        data:  { isPrimary: false },
      });
    }

    const contact = await prisma.accountContact.create({
      data: { accountId, name, title: title ?? null, email: email ?? null, phone: phone ?? null, isPrimary: isPrimary ?? false },
    });
    return created(contact);
  } catch (err) {
    return serverError(err);
  }
}
