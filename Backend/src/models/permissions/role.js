const db = require("../../../db");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");

const role = {
  findAll: () =>
    db("roles")
      .leftJoin("users as created_user", "roles.created_by", "created_user.id")
      .leftJoin("users as updated_user", "roles.updated_by", "updated_user.id")
      .select(
        "roles.id",
        "roles.name",
        "roles.created_at",
        "created_user.name as created_by",
        "roles.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("roles.deleted_at")
      .whereNot("roles.name", PROTECTED_ROLE), // Get all roles that are not soft-deleted and not the protected role

  findById: (id) =>
    db("roles")
      .leftJoin("users as created_user", "roles.created_by", "created_user.id")
      .leftJoin("users as updated_user", "roles.updated_by", "updated_user.id")
      .select(
        "roles.id",
        "roles.name",
        "roles.created_at",
        "created_user.name as created_by",
        "roles.updated_at",
        "updated_user.name as updated_by"
      )
      .where("roles.id", id)
      .whereNull("roles.deleted_at")
      .first(), // Find role by ID that is not soft-deleted and not the protected role

  getPermissions: (roleId) =>
    db("permissions")
      .join(
        "role_permissions",
        "permissions.id",
        "role_permissions.permission_id"
      )
      .where({ role_id: roleId })
      .whereNull("role_permissions.deleted_at")
      .select("permissions.name"), // Get permissions for a role that are not soft-deleted

  create: (data) => db("roles").insert(data).returning("*"), // Create a new role

  update: (id, data) => db("roles").where({ id }).update(data).returning("*"), // Update a role by ID

  softDelete: (id, userId) =>
    db("roles").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }), // Soft delete a role by ID
};
module.exports = role;
