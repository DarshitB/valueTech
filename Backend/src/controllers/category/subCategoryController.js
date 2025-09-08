const SubCategory = require("../../models/category/sub_category");
const User = require("../../models/user/user");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

// Get all subcategories
exports.getAll = async (req, res, next) => {
  try {
    const records = await SubCategory.findAll();
    res.json(records);
  } catch (err) {
    next(err);
  }
};

// Get subcategory by ID
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await SubCategory.findById(id);
    if (!record) throw new NotFoundError("SubCategory not found");
    res.json(record);
  } catch (err) {
    next(err);
  }
};

// Create subcategory
exports.create = async (req, res, next) => {
  try {
    const { name, category_id } = req.body;
    if (!name || !category_id)
      throw new BadRequestError("Name and category_id are required");

    const existing = await SubCategory.findByNameAndCategory(name, category_id);
    if (existing)
      throw new ConflictError(
        "SubCategory with the same name already exists in this category"
      );

    const [created] = await SubCategory.create({
      name,
      category_id,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = created.id;

    const creator = await User.findById(created.created_by);
    const enriched = { ...created, created_by: creator.name };

    res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
};

// Update subcategory
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category_id } = req.body;

    const existing = await SubCategory.findById(id);
    if (!existing) throw new NotFoundError("SubCategory not found");

    // Check if the new name already exists in a different category
    const duplicate = await SubCategory.findByNameAndCategory(
      name,
      category_id
    );
    if (duplicate && duplicate.id !== parseInt(id, 10)) {
      throw new ConflictError(
        "SubCategory with the same name already exists in this category"
      );
    }

    const [updated] = await SubCategory.update(id, {
      name,
      category_id,
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

// Soft delete subcategory
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await SubCategory.findById(id);
    if (!existing) throw new NotFoundError("SubCategory not found");

    await SubCategory.softDelete(id, req.user.id);
    res.status(204).json({ message: "SubCategory deleted successfully." });
  } catch (err) {
    next(err);
  }
};
