const ChildCategory = require("../../models/category/child_category");
const User = require("../../models/user/user");
const {
  NotFoundError,
  ConflictError,
  BadRequestError,
} = require("../../utils/customErrors");

// Get all child categories
exports.getAll = async (req, res, next) => {
  try {
    const records = await ChildCategory.findAll();
    res.json(records);
  } catch (err) {
    next(err);
  }
};

// Get child category by ID
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await ChildCategory.findById(id);
    if (!record) throw new NotFoundError("ChildCategory not found");
    res.json(record);
  } catch (err) {
    next(err);
  }
};

// Create child category
exports.create = async (req, res, next) => {
  try {
    const { name, sub_category_id } = req.body;
    if (!name || !sub_category_id)
      throw new BadRequestError("Name and sub_category_id are required");

    const existing = await ChildCategory.findByNameAndSubCategory(
      name,
      sub_category_id
    );
    if (existing)
      throw new ConflictError(
        "ChildCategory with the same name already exists in this sub-category"
      );

    const [created] = await ChildCategory.create({
      name,
      sub_category_id,
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

// Update child category
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, sub_category_id } = req.body;

    const existing = await ChildCategory.findById(id);
    if (!existing) throw new NotFoundError("ChildCategory not found");

    // Check if the new name already exists in a different category
    const duplicate = await ChildCategory.findByNameAndSubCategory(
      name,
      sub_category_id
    );
    if (duplicate && duplicate.id !== parseInt(id, 10)) {
      throw new ConflictError(
        "ChildCategory with the same name already exists in this sub-category"
      );
    }

    const [updated] = await ChildCategory.update(id, {
      name,
      sub_category_id,
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

// Soft delete child category
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await ChildCategory.findById(id);
    if (!existing) throw new NotFoundError("ChildCategory not found");

    await ChildCategory.softDelete(id, req.user.id);
    res.status(204).json({ message: "ChildCategory deleted successfully." });
  } catch (err) {
    next(err);
  }
};
