import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, created, badRequest, serverError, guard } from "@/lib/api";

// GET /api/documents?accountId=xxx
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;

    const documents = await prisma.document.findMany({
      where: accountId ? { accountId } : {},
      orderBy: { createdAt: "desc" },
    });

    return ok(documents);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/documents  (metadata only — file upload handled separately)
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "document:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, name, type, fileUrl, fileSize, mimeType, uploadedById } = body;

    if (!accountId) return badRequest("accountId is required");
    if (!name)      return badRequest("name is required");

    const doc = await prisma.document.create({
      data: { accountId, name, type: type ?? "OTHER", fileUrl, fileSize, mimeType, uploadedById },
    });

    return created(doc);
  } catch (err) {
    return serverError(err);
  }
}
