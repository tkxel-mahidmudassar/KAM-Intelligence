import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

// GET /api/audit?accountId=xxx&limit=50
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const limit     = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    const logs = await prisma.activityLog.findMany({
      where: {
        ...(accountId ? { accountId } : {}),
      },
      include: {
        user:    { select: { id: true, name: true, role: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return ok(logs);
  } catch (err) {
    return serverError(err);
  }
}
