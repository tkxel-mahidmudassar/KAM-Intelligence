import { NextRequest } from "next/server";
import { ok, badRequest, forbidden, serverError, getRoleFromRequest, guard } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// GET /api/admin  — returns users list (MANAGER+ only)
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "user:view");
    if (denied) return denied;

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    return ok({ users });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/admin  { action: "reset-demo" }
// Demo reset — only allowed in development
export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "development") {
      return forbidden("Admin endpoints are only available in development");
    }

    const { action } = await req.json();

    if (action === "reset-demo") {
      // Trigger prisma migrate reset + seed via child process
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const cwd = process.cwd();
      await execAsync("npx prisma migrate reset --force", { cwd });
      await execAsync("npm run db:seed", { cwd });

      return ok({ message: "Demo data reset successfully" });
    }

    return badRequest(`Unknown action: ${action}`);
  } catch (err) {
    return serverError(err);
  }
}
