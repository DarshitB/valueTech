const db = require("../../../db");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");

const rolePermission = {
  // Get all roles with their permissions in format React expects
  findAllWithRoles: async () => {
    const roles = await db("roles")
      .whereNull("deleted_at")
      .whereNot("name", PROTECTED_ROLE);

    const permissions = await db("permissions")
      .join(
        "role_permissions",
        "permissions.id",
        "role_permissions.permission_id"
      )
      .join("roles", "role_permissions.role_id", "roles.id")
      .select("role_permissions.role_id", "permissions.name")
      .whereNull("role_permissions.deleted_at")
      .whereNot("roles.name", PROTECTED_ROLE);

    const roleMap = {};
    roles.forEach((role) => {
      roleMap[role.id] = {
        id: role.id,
        name: role.name,
        permissions: [],
      };
    });

    permissions.forEach((p) => {
      if (roleMap[p.role_id]) {
        roleMap[p.role_id].permissions.push(p.name);
      }
    });

    return Object.values(roleMap);
  },

  // Replace permissions for a role
  updatePermissions: async (roleId, permissionNames, userId) => {
    const now = new Date();

    // Step 1: Get all current active permissions for the role
    const existingPermissions = await db("role_permissions")
      .where({ role_id: roleId })
      .whereNull("deleted_at");

    const existingIds = existingPermissions.map((p) => p.permission_id);

    // Step 2: Get permission records by name
    const permissions = await db("permissions")
      .whereIn("name", permissionNames)
      .whereNull("deleted_at");

    const newPermissionMap = {};
    for (const p of permissions) {
      newPermissionMap[p.name] = p.id;
    }

    const newIds = Object.values(newPermissionMap);

    // Step 3: Determine what to add and what to remove
    const toAdd = newIds.filter((id) => !existingIds.includes(id));
    const toRemove = existingIds.filter((id) => !newIds.includes(id));

    // Step 4: Soft-delete removed permissions
    if (toRemove.length > 0) {
      await db("role_permissions")
        .where({ role_id: roleId })
        .whereIn("permission_id", toRemove)
        .whereNull("deleted_at")
        .update({
          deleted_at: now,
          deleted_by: userId,
          updated_at: now,
          updated_by: userId,
        });
    }

    // Step 5: Add new permissions or restore soft-deleted ones
    for (const permId of toAdd) {
      // Check if a soft-deleted record exists
      const existing = await db("role_permissions")
        .where({ role_id: roleId, permission_id: permId })
        .whereNotNull("deleted_at")
        .first();

      if (existing) {
        // Restore the soft-deleted record
        await db("role_permissions").where({ id: existing.id }).update({
          deleted_at: null,
          deleted_by: null,
          updated_at: now,
          updated_by: userId,
        });
      } else {
        // Insert new record
        await db("role_permissions").insert({
          role_id: roleId,
          permission_id: permId,
          created_by: userId,
          created_at: now,
        });
      }
    }
  },
};

module.exports = rolePermission;
