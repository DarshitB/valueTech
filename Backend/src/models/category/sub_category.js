const db = require("../../../db");

const subCategory = {
  // Get all active subcategories with their parent category name
  findAll: () =>
    db("sub_category")
      .leftJoin("category", "sub_category.category_id", "category.id")
      .leftJoin("users as created_user", "sub_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "sub_category.updated_by", "updated_user.id")
      .select(
        "sub_category.id",
        "sub_category.name",
        "sub_category.category_id",
        "category.name as category_name",
        "sub_category.is_active",
        "sub_category.created_at",
        "created_user.name as created_by",
        "sub_category.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("sub_category.deleted_at")
      .where("sub_category.is_active", true),

  // Find subcategory by ID
  findById: (id) =>
    db("sub_category")
      .leftJoin("category", "sub_category.category_id", "category.id")
      .leftJoin("users as created_user", "sub_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "sub_category.updated_by", "updated_user.id")
      .select(
        "sub_category.id",
        "sub_category.name",
        "sub_category.category_id",
        "category.name as category_name",
        "sub_category.is_active",
        "sub_category.created_at",
        "created_user.name as created_by",
        "sub_category.updated_at",
        "updated_user.name as updated_by"
      )
      .where("sub_category.id", id)
      .whereNull("sub_category.deleted_at")
      .where("sub_category.is_active", true)
      .first(),

  // Create new subcategory
  create: (data) => db("sub_category").insert(data).returning("*"),

  // Update subcategory
  update: (id, data) => db("sub_category").where({ id }).update(data).returning("*"),

  // Soft delete subcategory
  softDelete: (id, userId) =>
    db("sub_category").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),

  // Check if subcategory with name & category_id already exists
  findByNameAndCategory: (name, category_id) =>
    db("sub_category")
      .select("id")
      .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
      .andWhere("category_id", category_id)
      .whereNull("deleted_at")
      .where("is_active", true)
      .first(),
};

module.exports = subCategory;
