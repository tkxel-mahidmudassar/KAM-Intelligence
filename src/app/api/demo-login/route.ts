import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/types";

const demoUsers: Record<Role, { id: string; name: string; email: string }> = {
  ASSOCIATE: { id: "demo-associate", name: "Aisha Khan", email: "associate.aisha@tkxel.com" },
  KAM: { id: "demo-kam", name: "Sarah Chen", email: "sarah.chen@tkxel.com" },
  EXECUTIVE: { id: "demo-executive", name: "Executive Lead", email: "exec.lead@tkxel.com" },
  MANAGER: { id: "demo-manager", name: "Sarah Chen", email: "sarah.chen@tkxel.com" },
  ADMIN: { id: "demo-admin", name: "Sarah Chen", email: "sarah.chen@tkxel.com" },
};

function normalizeRole(value: string | null): Role {
  return value && value in demoUsers ? (value as Role) : "KAM";
}

export function GET(req: NextRequest) {
  const role = normalizeRole(req.nextUrl.searchParams.get("role"));
  const demoUser = demoUsers[role];
  const redirectUrl = new URL("/home", req.url);
  const response = NextResponse.redirect(redirectUrl);
  const cookieOptions = {
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  };

  response.cookies.set("kam_role", role, cookieOptions);
  response.cookies.set("kam_user_id", demoUser.id, cookieOptions);
  response.cookies.set("kam_user_name", demoUser.name, cookieOptions);
  response.cookies.set("kam_user_email", demoUser.email, cookieOptions);

  return response;
}
