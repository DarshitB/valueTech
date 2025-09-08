const Permission = require('../../models/permissions/permission');
const User = require("../../models/user/user");
const RolePermission = require('../../models/permissions/rolePermission');
const { BadRequestError } = require('../../utils/customErrors');

// GET /api/permissions/all
exports.getAllPermissions = async (req, res, next) => {
  try {
    const perms = await Permission.findAll();
    res.json(perms);
  } catch (err) {
    next(err);
  }
};

// GET /api/permissions/role-wise
exports.getAllRolePermissions = async (req, res, next) => {
  try {
    const result = await RolePermission.findAllWithRoles();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// PUT /api/permissions/role-bulk
exports.updateAllRolePermissions = async (req, res, next) => {
  try {
    const rolePermissions = req.body;

    if (!Array.isArray(rolePermissions)) {
      throw new BadRequestError('Invalid input format. Expecting array.');
    }

    for (const item of rolePermissions) {
      const { roleId, permissions } = item;
      if (!Array.isArray(permissions)) continue;

      await RolePermission.updatePermissions(roleId, permissions, req.user.id);
    }

    res.json({ message: 'Permissions updated for all roles' });
  } catch (err) {
    next(err);
  }
};

//create permission
exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new BadRequestError("Permission name is required");

    // Create the new permission (returns inserted record or ID)
    const [permission] = await Permission.create({
      name,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = permission.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(permission.created_by);

    // Add user's name to the state object for response
    const enrichedState = {
      ...permission,
      created_by: creator.name,
    };

    res.status(201).json(enrichedState);
  } catch (err) {
    if (err.code === "23505")
      return next(new ConflictError("permission name already exists"));
    next(err);
  }
};