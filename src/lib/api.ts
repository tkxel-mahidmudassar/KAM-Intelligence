/**
 * Shared API utilities used by every route handler.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/types";

// ─── Role resolution (POC: read from x-role header, default KAM) ─────────────

const VALID_ROLES: Role[] = ["KAM", "MANAGER", "EXECUTIVE"];

export function getRoleFromRequest(req: NextRequest): Role {
  const header = req.headers.get("x-role") ?? "";
  return (VALID_ROLES.includes(header as Role) ? header : "KAM") as Role;
}

// ─── Standard response helpers ────────────────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(resource = "Resource"): NextResponse {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

export function serverError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[api]", message, err);
  return NextResponse.json({ error: message }, { status: 500 });
}

// ─── Permission guard (returns response on deny, null on allow) ───────────────

import { can, PermissionError } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

export function guard(role: Role, permission: Permission): NextResponse | null {
  if (!can(role, permission)) {
    return forbidden(`Role '${role}' cannot '${permission}'`);
  }
  return null;
}

// ─── KAM account scope filter ─────────────────────────────────────────────────

export function kamWhere(role: Role, kamId: string): { kamId?: string } {
  return role === "KAM" ? { kamId } : {};
}
