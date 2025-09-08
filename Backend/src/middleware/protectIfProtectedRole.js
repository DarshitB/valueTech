const { PROTECTED_ROLE } = require("../constants/protectedRoles");
const User = require("../models/user/user");
const Role = require("../models/permissions/role");

module.exports = async function protectIfProtectedRole(req, res, next) {
  const { id } = req.params || req.body;

  try {
    // BLOCK if request body is a bulk array
    if (Array.isArray(req.body)) {
      // Assuming req.body is like: [{ roleId: 1 }, { roleId: 2 }]
      const roleIds = req.body.map((item) => item.roleId).filter(Boolean);

      if (roleIds.length > 0) {
        // Manually fetch each role and check
        for (let i = 0; i < roleIds.length; i++) {
          const role = await Role.findById(roleIds[i]);
          if (role?.name === PROTECTED_ROLE) {
            return res.status(403).json({
              message: `Access denied: protected role`,
            });
          }
        }
      }
    }

    // BLOCK by role ID (edit, delete)
    if (id) {
      const role = await Role.findById(id);
      if (role?.name === PROTECTED_ROLE) {
        return res
          .status(403)
          .json({ message: "Access denied: protected role" });
      }

      // BLOCK by user ID (edit/delete user with protected role)
      const user = await User.findById(id, { include: [Role] });
      if (user?.Role?.name === PROTECTED_ROLE) {
        return res
          .status(403)
          .json({ message: "Access denied: protected user" });
      }
    }

    next();
  } catch (err) {
    console.error("Middleware error:", err);
    res
      .status(500)
      .json({ message: "Internal server error in role protection check" });
  }
};
