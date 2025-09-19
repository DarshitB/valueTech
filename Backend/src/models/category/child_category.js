const db = require("../../../db");

const childCategory = {
  // Get all active child categories with parent subcategory
  findAll: () =>
    db("child_category")
      .leftJoin("sub_category", "child_category.sub_category_id", "sub_category.id")
      .leftJoin("users as created_user", "child_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "child_category.updated_by", "updated_user.id")
      .select(
        "child_category.id",
        "child_category.name",
        "child_category.sub_category_id",
        "sub_category.name as sub_category_name",
        "child_category.is_active",
        "child_category.created_at",
        "created_user.name as created_by",
        "child_category.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("child_category.deleted_at")
      .where("child_category.is_active", true),

  // Find by ID
  findById: (id) =>
    db("child_category")
      .leftJoin("sub_category", "child_category.sub_category_id", "sub_category.id")
      .leftJoin("users as created_user", "child_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "child_category.updated_by", "updated_user.id")
      .select(
        "child_category.id",
        "child_category.name",
        "child_category.sub_category_id",
        "sub_category.name as sub_category_name",
        "child_category.is_active",
        "child_category.created_at",
        "created_user.name as created_by",
        "child_category.updated_at",
        "updated_user.name as updated_by"
      )
      .where("child_category.id", id)
      .whereNull("child_category.deleted_at")
      .where("child_category.is_active", true)
      .first(),

  // Insert new child category
  create: (data) => db("child_category").insert(data).returning("*"),

  // Update existing
  update: (id, data) => db("child_category").where({ id }).update(data).returning("*"),

  // Soft delete
  softDelete: (id, userId) =>
    db("child_category").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),

  // Check if child category with name & sub_category_id exists
  findByNameAndSubCategory: (name, sub_category_id) =>
    db("child_category")
      .select("id")
      .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
      .andWhere("sub_category_id", sub_category_id)
      .whereNull("deleted_at")
      .where("is_active", true)
      .first(),

  // Find child categories by category name(s)
  // Accepts either a single category name string or an array of category names
  findByCategoryName: (categoryNames) => {
    // Ensure categoryNames is always an array
    const names = Array.isArray(categoryNames) ? categoryNames : [categoryNames];
    
    return db("child_category")
      .leftJoin("sub_category", "child_category.sub_category_id", "sub_category.id")
      .leftJoin("category", "sub_category.category_id", "category.id")
      .leftJoin("users as created_user", "child_category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "child_category.updated_by", "updated_user.id")
      .select(
        "child_category.id",
        "child_category.name",
        "child_category.sub_category_id",
        "sub_category.name as sub_category_name",
        "sub_category.category_id",
        "category.name as category_name",
      )
      .whereIn("category.name", names)
      .whereNull("child_category.deleted_at")
      .whereNull("sub_category.deleted_at")
      .whereNull("category.deleted_at")
      .where("child_category.is_active", true)
      .where("sub_category.is_active", true)
      .where("category.is_active", true);
  },
};

module.exports = childCategory;
