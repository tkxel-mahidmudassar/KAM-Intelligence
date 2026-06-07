import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

const VALID_ROLES: Role[] = ["ASSOCIATE", "KAM", "MANAGER", "EXECUTIVE", "ADMIN"];

function normalizeRole(value: string | null): Role {
  return value && VALID_ROLES.includes(value as Role) ? (value as Role) : "KAM";
}

export async function GET(req: NextRequest) {
  const requestedRole = normalizeRole(req.nextUrl.searchParams.get("role"));
  const redirectUrl = new URL("/home", req.url);
  const loginUrl = new URL("/login", req.url);

  const user = await prisma.user.findFirst({
    where: { role: requestedRole as import("@prisma/client").Role },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) return NextResponse.redirect(loginUrl);

  const response = NextResponse.redirect(redirectUrl);
  const cookieOptions = {
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  };

  response.cookies.set("kam_role", user.role, cookieOptions);
  response.cookies.set("kam_user_id", user.id, cookieOptions);
  response.cookies.set("kam_user_name", user.name, cookieOptions);
  response.cookies.set("kam_user_email", user.email, cookieOptions);

  return response;
}
