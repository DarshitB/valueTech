const db = require("../../db");
const { PROTECTED_ROLE } = require("../constants/protectedRoles");

module.exports = function (permissionName) {
  return async function (req, res, next) {
    const { role_id, role_name } = req.user; // Get the user's role ID from the request

    // 🛑 Skip permission check if user has protected role
    if (role_name === PROTECTED_ROLE) {
      return next();
    }

    const permission = await db("permissions")
      .join(
        "role_permissions",
        "permissions.id",
        "role_permissions.permission_id"
      )
      .where({
        "permissions.name": permissionName,
        "role_permissions.role_id": role_id,
      })
      .whereNull("role_permissions.deleted_at")
      .first(); // Check if the role has the specified permission

    if (!permission) {
      return res
        .status(403)
        .json({ message: "Forbidden: You lack this permission" });
    } // Check if the user has the required permission

    next(); // Proceed to the next middleware or route handler
  };
}; // Middleware to check if the user has a specific permission
