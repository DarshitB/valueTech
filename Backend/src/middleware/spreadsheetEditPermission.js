const { validate: isUuid } = require("uuid");

const db = require("../../db");
const Spreadsheet = require("../models/spreadsheets/spreadsheet");
const { PROTECTED_ROLE } = require("../constants/protectedRoles");

async function roleHasPermission(roleId, permissionName) {
  const permission = await db("permissions")
    .join(
      "role_permissions",
      "permissions.id",
      "role_permissions.permission_id"
    )
    .where({
      "permissions.name": permissionName,
      "role_permissions.role_id": roleId,
    })
    .whereNull("role_permissions.deleted_at")
    .first();

  return !!permission;
}

module.exports = function spreadsheetEditPermission() {
  return async function (req, res, next) {
    const { role_id, role_name, id: userId } = req.user;

    if (role_name === PROTECTED_ROLE) {
      return next();
    }

    const { id } = req.params;
    if (!id || typeof id !== "string" || !isUuid(id)) {
      return res.status(400).json({ message: "Valid spreadsheet id is required" });
    }

    const spreadsheet = await Spreadsheet.findById(id);
    if (!spreadsheet) {
      return res.status(404).json({ message: "Spreadsheet not found" });
    }

    if (Number(spreadsheet.created_by) === Number(userId)) {
      return next();
    }

    const allowed = await roleHasPermission(role_id, "edit_spreadsheet");
    if (!allowed) {
      return res
        .status(403)
        .json({ message: "Forbidden: You lack this permission" });
    }

    next();
  };
};
