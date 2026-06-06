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
  | "portfolio"
  | "playbook"
  | "recommendation";

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
  | "archive"
  | "export"
  | "manage";

export type Permission = `${Resource}:${Action}`;

// ─── Role → granted permissions ────────────────────────────────────────────────

// ASSOCIATE — supports a KAM; view-heavy with limited write access
const ASSOCIATE_PERMISSIONS: Permission[] = [
  // Accounts — view only (scoped to supervising KAM's accounts)
  "account:view",

  // Contacts — view + update
  "contact:view",
  "contact:update",

  // KPIs — view only
  "kpi:view",

  // Scores — view only
  "score:view",

  // Actions — view, create, update (cannot delete)
  "action:view",
  "action:create",
  "action:update",

  // Signals — view only
  "signal:view",

  // Documents — associates can upload account support material
  "document:view",
  "document:create",

  // KYC — associate drafts and submits for KAM review
  "kyc:view",
  "kyc:create",
  "kyc:update",
  "kyc:submit",

  // QBR — view only
  "qbr:view",

  // AI Insights — view and dismiss
  "insight:view",
  "insight:dismiss",

  // Activity log — view
  "activityLog:view",

  // Touchpoints — log meetings and calls
  "touchpoint:view",
  "touchpoint:create",

  // Escalations — view and update (cannot create or resolve)
  "escalation:view",
  "escalation:update",

  // Opportunities — view only
  "opportunity:view",

  // Questionnaire — view only
  "questionnaire:view",

  // Playbooks — view only (cannot upload)
  "playbook:view",

  // Recommendations — view and dismiss
  "recommendation:view",
  "recommendation:dismiss",
];

const KAM_PERMISSIONS: Permission[] = [
  // Accounts — full portfolio view + create (KAM = Account Manager)
  "account:view",
  "account:create",
  "account:update",
  "account:export",

  // Contacts
  "contact:view",
  "contact:create",
  "contact:update",
  "contact:delete",

  // KPIs
  "kpi:view",
  "kpi:create",
  "kpi:export",

  // Scores — view + approve requested score overrides
  "score:view",
  "score:approve",
  "score:export",

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

  // KYC — KAM reviews associate-submitted drafts
  "kyc:view",

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

  // Playbooks — KAM can upload, replace, archive global playbooks
  "playbook:view",
  "playbook:create",
  "playbook:update",
  "playbook:delete",

  // KYC — approve/reject submitted drafts
  "kyc:approve",
  "kyc:reject",

  // Users — view and update team members
  "user:view",
  "user:update",

  // Portfolio — full view
  "portfolio:view",

  // Recommendations — view, dismiss, and action
  "recommendation:view",
  "recommendation:dismiss",
  "recommendation:update",

  // Activity log export
  "activityLog:export",
  "qbr:export",
];

// MANAGER is now an alias for KAM — kept for backward compat with any seeded MANAGER users
const MANAGER_PERMISSIONS: Permission[] = [
  ...KAM_PERMISSIONS,

  // Portfolio — manager-level views (already in KAM, but explicit here too)
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

  // Recommendations — managers can also action them
  "recommendation:update",
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
  "playbook:view",

  // Playbooks — exec can view only
  "playbook:view",

  // Recommendations — exec can view only
  "recommendation:view",

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
  "playbook:view", "playbook:create", "playbook:update", "playbook:delete",
  "recommendation:view", "recommendation:create", "recommendation:update", "recommendation:dismiss",
];

// ─── Permission sets (O(1) lookup) ────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<Role | "ADMIN", Set<Permission>> = {
  ASSOCIATE: new Set(ASSOCIATE_PERMISSIONS),
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
 * Whether the role is restricted to only their own accounts.
 * KAM is the primary account manager and sees all accounts.
 * Only ASSOCIATE is scoped to their supervising KAM's accounts.
 */
export function isAccountScoped(role: Role | "ADMIN"): boolean {
  return role === "ASSOCIATE";
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
