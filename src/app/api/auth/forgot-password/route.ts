import { NextRequest } from "next/server";
import { ok, badRequest, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// POST /api/auth/forgot-password  { email }
// POC flow: record intent when possible and always return a non-enumerating success.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return badRequest("A valid email address is required");
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (user) {
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            action: "auth.password_reset.requested",
            entity: "User",
            entityId: user.id,
            metadata: { channel: "demo-email" },
          },
        });
      }
    } catch {
      // Vercel/demo deployments may run without a DB; the UI should still show the safe success state.
    }

    return ok({
      message: "If an account exists for that email, reset instructions have been queued.",
    });
  } catch (err) {
    return serverError(err);
  }
}
