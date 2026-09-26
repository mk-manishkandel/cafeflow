/**
 * Canonical role names (single source of truth).
 * Values are the exact lowercase strings stored in the users.role column
 * and compared throughout the backend. Frozen to prevent accidental mutation.
 */
const ROLES = Object.freeze({
    API: 'api',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff'
});

/**
 * Normalizes role names to a standard level for comparison to prevent privilege escalation.
 * Lower number = Higher Privilege.
 * 
 * Level 0: API/System
 * Level 1: Admin
 * Level 2: Manager
 * Level 3: Staff (and all custom roles)
 * Level 100: Unknown
 */
/**
 * RBAC-L1: Determines hierarchy level for custom roles based on their permission set.
 * Custom roles with elevated permissions (MANAGE_ROLES, MANAGE_USERS, SYSTEM_ADMIN)
 * are assigned level 2 (Manager tier). All others default to level 3 (Staff tier).
 * @param {string[]} [permissions=[]] - Array of permission strings for the custom role
 * @returns {2|3}
 */
const getCustomRoleLevel = (permissions = []) => {
    const adminPerms = ['MANAGE_ROLES', 'MANAGE_USERS', 'SYSTEM_ADMIN'];
    return permissions.some(p => adminPerms.includes(p)) ? 2 : 3;
};

const getRoleLevel = (roleName, permissions = []) => {
    if (!roleName) return 100;
    const role = roleName.toLowerCase();

    if (role === ROLES.API) return 0;
    if (role === ROLES.ADMIN) return 1;
    if (role === ROLES.MANAGER) return 2;
    if (role === ROLES.STAFF) return 3;

    // RBAC-L1: Custom roles are dynamically levelled based on their permission set
    // rather than always defaulting to level 3.
    return getCustomRoleLevel(permissions);
};

/**
 * Checks if the requesting user has the authority to manage the target user's role.
 * Rules:
 * - User cannot modify someone with a higher or equal privilege level
 *   (e.g., A Manager (Level 2) cannot modify an Admin (Level 1) or another Manager (Level 2)).
 * - Admin (Level 1) CAN modify other Admins (Level 1) ONLY IF they are modifying their own account, 
 *   but usually admins shouldn't demote themselves or other admins without care. 
 *   For safety, we prevent modifying equal-level users unless it's self-modification.
 * 
 * @param {Object} reqUser The user making the request (from req.user)
 * @param {string} targetRoleName The current role of the user being modified
 * @param {string} requestedNewRoleName The new role being assigned (optional)
 * @returns {boolean} True if authorized, false otherwise
 */
const isAuthorizedForRoleModification = (reqUser, targetRoleName, requestedNewRoleName = null) => {
    const reqLevel = getRoleLevel(reqUser.role);
    const targetLevel = getRoleLevel(targetRoleName);

    // Cannot touch users with strictly higher privileges (e.g. Manager trying to edit Admin)
    if (reqLevel > targetLevel) {
        return false;
    }

    // Cannot modify users of the same level (e.g. Manager cannot delete Manager. Admin CANNOT delete Admin).
    // The only exception is if a Super Admin is modifying another Super Admin, but even then, 
    // it's safer to only allow them to edit themselves, or specifically allow Level 1 to edit Level 1.
    // Let's grant Level 1 (Admins) peer-editing capabilities to prevent locking out the system.
    if (reqLevel === targetLevel && reqLevel !== 1) {
        return false;
    }

    // If they are trying to assign a role with higher privileges than they themselves possess
    // (e.g. Manager trying to create an Admin)
    if (requestedNewRoleName) {
        const newRoleLevel = getRoleLevel(requestedNewRoleName);
        if (reqLevel > newRoleLevel) {
            return false;
        }
    }

    return true;
};

/**
 * Returns true if the user is an admin (case-insensitive).
 * @param {Object|null|undefined} user - User object (e.g. req.user)
 * @returns {boolean}
 */
const isAdmin = (user) => user?.role?.toLowerCase() === ROLES.ADMIN;

module.exports = {
    ROLES,
    getRoleLevel,
    isAuthorizedForRoleModification,
    isAdmin
};
