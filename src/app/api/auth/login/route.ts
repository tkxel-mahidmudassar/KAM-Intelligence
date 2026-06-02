import { NextRequest } from "next/server";
import { ok, badRequest, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Hardcoded demo users — used as fallback when no DATABASE_URL is configured
// (e.g. Vercel preview deployments without a connected DB)
const DEMO_USERS = [
  { id: "demo-sarah",  name: "Sarah Chen",    email: "sarah.chen@tkxel.com",    role: "KAM"       },
  { id: "demo-marcus", name: "Marcus Okafor", email: "marcus.okafor@tkxel.com", role: "KAM"       },
  { id: "demo-priya",  name: "Priya Nair",    email: "priya.nair@tkxel.com",    role: "MANAGER"   },
  { id: "demo-daniel", name: "Daniel West",   email: "daniel.west@tkxel.com",   role: "EXECUTIVE" },
];

// POST /api/auth/login  { email, password }
// POC auth: password is the user's first name in lowercase (e.g. "sarah" for Sarah Chen)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email    = (body.email    ?? "").trim().toLowerCase();
    const password = (body.password ?? "").trim();

    if (!email || !password) {
      return badRequest("Email and password are required");
    }

    // Try live DB first; fall back to demo list if DB is unavailable
    let user: { id: string; name: string; email: string; role: string } | null = null;
    try {
      user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, role: true },
      });
    } catch {
      // DB unavailable (e.g. no DATABASE_URL in env) — use demo fallback
      user = DEMO_USERS.find((u) => u.email === email) ?? null;
    }

    if (!user) {
      return badRequest("Invalid email or password");
    }

    // POC password = first word of the user's name, lowercased
    const expectedPassword = user.name.split(" ")[0].toLowerCase();
    if (password !== expectedPassword) {
      return badRequest("Invalid email or password");
    }

    return ok({ user });
  } catch (err) {
    return serverError(err);
  }
}
