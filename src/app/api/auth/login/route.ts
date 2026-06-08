import { NextRequest } from "next/server";
import { ok, badRequest, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// POST /api/auth/login  { email, password }
// POC auth: password is a configured initial password, falling back to first name.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email    = (body.email    ?? "").trim().toLowerCase();
    const password = (body.password ?? "").trim();

    if (!email || !password) {
      return badRequest("Email and password are required");
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true, initialPassword: true },
    });

    if (!user) {
      return badRequest("Invalid email or password");
    }

    const expectedPassword = user.initialPassword || user.name.split(" ")[0].toLowerCase();
    if (password !== expectedPassword) {
      return badRequest("Invalid email or password");
    }

    return ok({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    return serverError(err);
  }
}
