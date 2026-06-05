"use client";

import { useRole } from "@/context/RoleContext";
import {
  can,
  canAll,
  canAny,
  getPermissions,
  isAccountScoped,
  hasWriteAccess,
  isManagement,
} from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

/**
 * React hook — exposes permission helpers bound to the current UI role.
 *
 * @example
 * const { can, isReadOnly, isManager } = usePermissions();
 * if (!can("kyc:approve")) return null;
 */
export function usePermissions() {
  const { role } = useRole();

  return {
    role,

    /** Check a single permission for the current role */
    can: (permission: Permission) => can(role, permission),

    /** Check that ALL listed permissions are granted */
    canAll: (permissions: Permission[]) => canAll(role, permissions),

    /** Check that ANY of the listed permissions are granted */
    canAny: (permissions: Permission[]) => canAny(role, permissions),

    /** All permissions granted to the current role */
    permissions: getPermissions(role),

    /** KAM role only sees their own accounts; Managers/Executives see all */
    isAccountScoped: isAccountScoped(role),

    /** Executive role is read-only */
    isReadOnly: !hasWriteAccess(role),

    /** True for MANAGER and EXECUTIVE */
    isManagement: isManagement(role),

    /** Convenience booleans */
    isKam:       role === "KAM",
    isManager:   role === "MANAGER",
    isExecutive: role === "EXECUTIVE",
  };
}
