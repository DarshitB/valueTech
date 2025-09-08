const Category = require("../../models/category/category");
const User = require("../../models/user/user");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

// Fetch all active categories
exports.getAll = async (req, res, next) => {
  try {
    const categories = await Category.findAll();
    res.json(categories);
  } catch (err) {
    next(err);
  }
};

// Fetch category by ID
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) throw new NotFoundError("Category not found");
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// Create new category
exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) throw new BadRequestError("Category name is required");

    const existing = await Category.findByName(name);
    if (existing)
      throw new ConflictError("Category with the same name already exists");

    const [category] = await Category.create({
      name,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = category.id;

    // Now fetch the user name using the created_by id
    const creator = await User.findById(category.created_by);

    const enriched = { ...category, created_by: creator.name };

    res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
};

// Update category
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    /* console.log("id", id); */
    const existing = await Category.findById(id);
    if (!existing) throw new NotFoundError("Category not found");

    // Check if the new name already exists in a different category
    const duplicate = await Category.findByName(name);
    if (duplicate && duplicate.id !== parseInt(id, 10)) {
      throw new ConflictError("Category with the same name already exists");
    }

    const [updated] = await Category.update(id, {
      name,
      updated_by: req.user.id,
      updated_at: new Date(),
    });

    const creator = await User.findById(updated.created_by);
    const editor = await User.findById(updated.updated_by);
    const enriched = {
      ...updated,
      created_by: creator.name,
      updated_by: editor.name,
    };

    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

// Soft delete category
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Category.findById(id);
    if (!existing) throw new NotFoundError("Category not found");

    await Category.softDelete(id, req.user.id);
    res.status(204).json({ message: "Category deleted successfully." });
  } catch (err) {
    next(err);
  }
};
