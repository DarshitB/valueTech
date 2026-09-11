const { PROTECTED_ROLE } = require("../constants/protectedRoles");
const {
  roleHasPermission,
} = require("../services/spreadsheets/spreadsheetAccessPolicy");

module.exports = function (permissionName) {
  return async function (req, res, next) {
    const { role_id, role_name } = req.user; // Get the user's role ID from the request

    // 🛑 Skip permission check if user has protected role
    if (role_name === PROTECTED_ROLE) {
      return next();
    }

    const allowed = await roleHasPermission(role_id, permissionName);
    if (!allowed) {
      return res
        .status(403)
        .json({ message: "Forbidden: You lack this permission" });
    } // Check if the user has the required permission

    next(); // Proceed to the next middleware or route handler
  };
}; // Middleware to check if the user has a specific permission
