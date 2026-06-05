/**
 * Server-side API route guard utilities.
 * Wraps assertCan() with Next.js Response helpers so route handlers
 * stay clean and consistent.
 *
 * @example
 * // In an API route handler:
 * const guard = routeGuard(userRole);
 * guard("kyc:approve");          // returns 403 Response if denied
 * guard("action:create");        // returns 403 Response if denied
 */

import { NextResponse } from "next/server";
import { assertCan, PermissionError } from "./policy";
import type { Permission } from "./policy";
import type { Role } from "@/types";

/**
 * Returns a bound guard function for the given role.
 * Call it with a permission — it returns a 403 Response if denied, or null if allowed.
 *
 * @example
 * const guard = routeGuard("KAM");
 * const denied = guard("kyc:approve");
 * if (denied) return denied; // early return with 403
 */
export function routeGuard(role: Role | "ADMIN") {
  return function guard(permission: Permission): NextResponse | null {
    try {
      assertCan(role, permission);
      return null;
    } catch (err) {
      if (err instanceof PermissionError) {
        return NextResponse.json(
          { error: err.message },
          { status: 403 }
        );
      }
      throw err;
    }
  };
}

/**
 * Filter a list of records to only those belonging to the user's accounts.
 * Pass-through for Managers and Executives (they see all).
 *
 * @example
 * const filtered = scopeToKam(role, accounts, kamId, (a) => a.kamId);
 */
export function scopeToKam<T>(
  role: Role | "ADMIN",
  items: T[],
  kamId: string,
  getKamId: (item: T) => string | null | undefined
): T[] {
  if (role !== "KAM") return items;
  return items.filter((item) => getKamId(item) === kamId);
}

/**
 * Build a Prisma `where` clause fragment that scopes accounts to the KAM.
 * Returns {} for non-KAM roles (no restriction).
 *
 * @example
 * const where = kamScope(role, userId);
 * const accounts = await prisma.account.findMany({ where });
 */
export function kamScope(
  role: Role | "ADMIN",
  kamId: string
): { kamId?: string } {
  return role === "KAM" ? { kamId } : {};
}
