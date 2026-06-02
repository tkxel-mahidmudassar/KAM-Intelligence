export {
  can,
  canAll,
  canAny,
  assertCan,
  getPermissions,
  isAccountScoped,
  hasWriteAccess,
  isManagement,
  PermissionError,
} from "./policy";

export type { Permission, Resource, Action } from "./policy";

export { routeGuard, scopeToKam, kamScope } from "./guard";
