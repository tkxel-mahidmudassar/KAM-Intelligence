import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, notFound, serverError, guard } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/scores/[id]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const { id } = await params;
    const score = await prisma.kamScore.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!score) return notFound("Score");
    return ok(score);
  } catch (err) {
    return serverError(err);
  }
}
