/**
 * Frontend mirror of server/utils/roleHierarchy.cjs ROLES constant.
 * Keep values in sync with the backend — they must match the exact
 * lowercase role names stored in the users.role column.
 */
export const ROLES = Object.freeze({
  API: 'api',
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
} as const);
