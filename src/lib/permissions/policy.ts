/**
 * Central permission policy.
 * Single source of truth for role-based access — used by API routes AND UI components.
 *
 * Usage:
 *   can("KAM", "action:create")          → true
 *   can("EXECUTIVE", "kyc:approve")      → false
 *   assertCan("KAM", "account:delete")   → throws PermissionError
 */

import type { Role } from "@/types";

// ─── Permission string format: "resource:action" ──────────────────────────────

export type Resource =
  | "account"
  | "contact"
  | "kpi"
  | "score"
  | "action"
  | "signal"
  | "document"
  | "kyc"
  | "qbr"
  | "insight"
  | "user"
  | "activityLog"
  | "touchpoint"
  | "escalation"
  | "opportunity"
  | "questionnaire"
  | "portfolio";

export type Action =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "submit"
  | "approve"
  | "reject"
  | "dismiss"
  | "resolve"
  | "export"
  | "manage";

export type Permission = `${Resource}:${Action}`;

// ─── Role → granted permissions ────────────────────────────────────────────────

const KAM_PERMISSIONS: Permission[] = [
  // Accounts — view & update own only (ownership enforced separately via scope)
  "account:view",
  "account:update",

  // Contacts
  "contact:view",
  "contact:create",
  "contact:update",
  "contact:delete",

  // KPIs
  "kpi:view",
  "kpi:create",

  // Scores — view only, cannot approve
  "score:view",

  // Actions — full CRUD on own accounts
  "action:view",
  "action:create",
  "action:update",
  "action:delete",
  "action:dismiss",

  // Signals — view, create manual, and resolve
  "signal:view",
  "signal:create",
  "signal:resolve",

  // Documents — view, upload, delete
  "document:view",
  "document:create",
  "document:delete",

  // KYC — can draft and submit, cannot approve
  "kyc:view",
  "kyc:create",
  "kyc:update",
  "kyc:submit",

  // QBR — full ownership
  "qbr:view",
  "qbr:create",
  "qbr:update",
  "qbr:delete",

  // AI Insights — view and dismiss
  "insight:view",
  "insight:dismiss",

  // Activity log — own accounts only (scope enforced separately)
  "activityLog:view",

  // Touchpoints — log meetings, calls, emails
  "touchpoint:view",
  "touchpoint:create",
  "touchpoint:delete",

  // Escalations — full lifecycle for KAM
  "escalation:view",
  "escalation:create",
  "escalation:update",
  "escalation:resolve",

  // Opportunities — full CRUD for KAM
  "opportunity:view",
  "opportunity:create",
  "opportunity:update",
  "opportunity:delete",

  // Questionnaire — fill and submit responses
  "questionnaire:view",
  "questionnaire:create",
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...KAM_PERMISSIONS,

  // Accounts — all accounts, including create
  "account:create",

  // Scores — can approve AI-proposed scores
  "score:approve",

  // KYC — full lifecycle including approve/reject
  "kyc:approve",
  "kyc:reject",

  // Users — view team members
  "user:view",

  // Portfolio — manager-level views
  "portfolio:view",

  // Touchpoints (inherited)
  "touchpoint:view",
  "touchpoint:create",
  "touchpoint:delete",

  // Escalations (inherited)
  "escalation:view",
  "escalation:create",
  "escalation:update",
  "escalation:resolve",

  // Opportunities (inherited)
  "opportunity:view",
  "opportunity:create",
  "opportunity:update",
  "opportunity:delete",

  // Questionnaire (inherited)
  "questionnaire:view",
  "questionnaire:create",

  // Export — data exports
  "account:export",
  "activityLog:export",
  "kpi:export",
  "score:export",
  "qbr:export",
];

const EXECUTIVE_PERMISSIONS: Permission[] = [
  // Read-only across everything
  "account:view",
  "contact:view",
  "kpi:view",
  "score:view",
  "action:view",
  "signal:view",
  "document:view",
  "kyc:view",
  "qbr:view",
  "insight:view",
  "user:view",
  "activityLog:view",
  "touchpoint:view",
  "escalation:view",
  "opportunity:view",
  "questionnaire:view",
  "portfolio:view",

  // Executives can export for board reporting
  "account:export",
  "kpi:export",
  "score:export",
  "qbr:export",
];

const ADMIN_PERMISSIONS: Permission[] = [
  // Admin gets everything
  "account:view", "account:create", "account:update", "account:delete", "account:export",
  "contact:view", "contact:create", "contact:update", "contact:delete",
  "kpi:view", "kpi:create", "kpi:export",
  "score:view", "score:approve", "score:export",
  "action:view", "action:create", "action:update", "action:delete", "action:dismiss",
  "signal:view", "signal:create", "signal:resolve",
  "document:view", "document:create", "document:delete",
  "kyc:view", "kyc:create", "kyc:update", "kyc:submit", "kyc:approve", "kyc:reject",
  "qbr:view", "qbr:create", "qbr:update", "qbr:delete", "qbr:export",
  "insight:view", "insight:dismiss",
  "user:view", "user:create", "user:update", "user:delete", "user:manage",
  "activityLog:view", "activityLog:export",
  "portfolio:view",
];

// ─── Permission sets (O(1) lookup) ────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<Role | "ADMIN", Set<Permission>> = {
  KAM:       new Set(KAM_PERMISSIONS),
  MANAGER:   new Set(MANAGER_PERMISSIONS),
  EXECUTIVE: new Set(EXECUTIVE_PERMISSIONS),
  ADMIN:     new Set(ADMIN_PERMISSIONS),
};

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Check if a role has a permission.
 *
 * @example
 * can("KAM", "action:create")     // true
 * can("EXECUTIVE", "kyc:approve") // false
 */
export function can(role: Role | "ADMIN", permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Check multiple permissions at once (AND logic — all must pass).
 *
 * @example
 * canAll("MANAGER", ["kyc:approve", "score:approve"]) // true
 */
export function canAll(role: Role | "ADMIN", permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

/**
 * Check multiple permissions at once (OR logic — any must pass).
 *
 * @example
 * canAny("KAM", ["kyc:approve", "kyc:submit"]) // true (submit is allowed)
 */
export function canAny(role: Role | "ADMIN", permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/**
 * Get all permissions granted to a role.
 */
export function getPermissions(role: Role | "ADMIN"): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}

// ─── Scope helpers ────────────────────────────────────────────────────────────

/**
 * Whether the role is restricted to only their own accounts (KAM only).
 * Managers and Executives can see all accounts.
 */
export function isAccountScoped(role: Role | "ADMIN"): boolean {
  return role === "KAM";
}

/**
 * Whether the role has write access (not read-only like EXECUTIVE).
 */
export function hasWriteAccess(role: Role | "ADMIN"): boolean {
  return role !== "EXECUTIVE";
}

/**
 * Whether the role can access management/governance features.
 */
export function isManagement(role: Role | "ADMIN"): boolean {
  return role === "MANAGER" || role === "EXECUTIVE" || role === "ADMIN";
}

// ─── Server-side guard ───────────────────────────────────────────────────────

export class PermissionError extends Error {
  readonly status = 403;
  constructor(role: string, permission: string) {
    super(`Role '${role}' does not have permission '${permission}'`);
    this.name = "PermissionError";
  }
}

/**
 * Throws PermissionError if the role lacks the permission.
 * Use in API route handlers.
 *
 * @example
 * assertCan(userRole, "kyc:approve"); // throws 403 if not allowed
 */
export function assertCan(role: Role | "ADMIN", permission: Permission): void {
  if (!can(role, permission)) {
    throw new PermissionError(role, permission);
  }
}
