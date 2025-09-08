const db = require("../../../db");

const category = {
  // Fetch all active categories that are not soft-deleted
  findAll: () =>
    db("category")
      .leftJoin("users as created_user", "category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "category.updated_by", "updated_user.id")
      .select(
        "category.id",
        "category.name",
        "category.is_active",
        "category.created_at",
        "created_user.name as created_by",
        "category.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("category.deleted_at")
      .where("category.is_active", true),

  // Fetch a single category by ID
  findById: (id) =>
    db("category")
      .leftJoin("users as created_user", "category.created_by", "created_user.id")
      .leftJoin("users as updated_user", "category.updated_by", "updated_user.id")
      .select(
        "category.id",
        "category.name",
        "category.is_active",
        "category.created_at",
        "created_user.name as created_by",
        "category.updated_at",
        "updated_user.name as updated_by"
      )
      .where("category.id", id)
      .whereNull("category.deleted_at")
      .where("category.is_active", true)
      .first(),

    // Fetch multiple categories by array of IDs
    findManyByIds: (ids) =>
      db("category")
        .leftJoin("users as created_user", "category.created_by", "created_user.id")
        .leftJoin("users as updated_user", "category.updated_by", "updated_user.id")
        .select(
          "category.id",
          "category.name",
          "category.is_active",
          "category.created_at",
          "created_user.name as created_by",
          "category.updated_at",
          "updated_user.name as updated_by"
        )
        .whereIn("category.id", ids)
        .whereNull("category.deleted_at")
        .where("category.is_active", true),
    
  // Insert new category
  create: (data) => db("category").insert(data).returning("*"),

  // Update existing category
  update: (id, data) => db("category").where({ id }).update(data).returning("*"),

  // Soft delete a category (set deleted_at and deleted_by)
  softDelete: (id, userId) =>
    db("category").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),

  // Check if a category exists with the same name
  findByName: (name) =>
    db("category")
      .select("id")
      .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
      .whereNull("deleted_at")
      .where("is_active", true)
      .first(),
};

module.exports = category;
