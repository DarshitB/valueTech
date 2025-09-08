const Role = require("../../models/permissions/role");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

exports.getAll = async (req, res, next) => {
  try {
    const roles = await Role.findAll();
    res.json(roles);
  } catch (err) {
    next(err);
  }
}; // Get all roles that are not soft-deleted

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = await Role.findById(id);
    if (!role) throw new NotFoundError("Role not found");
    res.json(role);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new BadRequestError("Role name is required");

    const [role] = await Role.create({
      name,
      created_by: req.user.id,
      created_at: new Date(),
    });

    // Pass the new record ID to the logger middleware
    res.locals.newRecordId = role.id;

    res.status(201).json(role);
    /* res.status(201).json(role); */
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Role name already exists"));
    }
    next(err);
  }
}; // Create a new role

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const existing = await Role.findById(id);
    if (!existing) throw new NotFoundError("Role not found");

    const [updated] = await Role.update(id, {
      name,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    res.json({ message: "Role Updated successfully." });
    /* res.json(updated); */
  } catch (err) {
    if (err.code === "23505") {
      return next(new ConflictError("Role name already exists"));
    }
    next(err);
  }
}; // Update a role by ID

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Role.findById(id);
    if (!existing) throw new NotFoundError("Role not found");

    await Role.softDelete(id, req.user.id);
    res.status(204).json({ message: "Role Deleted successfully." });
  } catch (err) {
    next(err);
  }
}; // Soft delete a role by ID
