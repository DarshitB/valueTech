const db = require("../../../db");

const bankBranch = {
  // Get all active bank branches with joins
  findAll: () =>
    db("bank_branch")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("cities", "bank_branch.city_id", "cities.id")
      .leftJoin("users as created_user", "bank_branch.created_by", "created_user.id")
      .leftJoin("users as updated_user", "bank_branch.updated_by", "updated_user.id")
      .select(
        "bank_branch.id",
        "bank_branch.name",
        "bank_branch.is_active",
        "bank_branch.created_at",
        "created_user.name as created_by",
        "bank_branch.updated_at",
        "updated_user.name as updated_by",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "cities.id as city_id",
        "cities.name as city_name"
      )
      .whereNull("bank_branch.deleted_at")
      .where("bank_branch.is_active", true),

  // Get branch by ID
  findById: (id) =>
    db("bank_branch")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("cities", "bank_branch.city_id", "cities.id")
      .leftJoin("users as created_user", "bank_branch.created_by", "created_user.id")
      .leftJoin("users as updated_user", "bank_branch.updated_by", "updated_user.id")
      .select(
        "bank_branch.id",
        "bank_branch.name",
        "bank_branch.is_active",
        "bank_branch.created_at",
        "created_user.name as created_by",
        "bank_branch.updated_at",
        "updated_user.name as updated_by",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "cities.id as city_id",
        "cities.name as city_name"
      )
      .whereNull("bank_branch.deleted_at")
      .where("bank_branch.is_active", true)
      .where("bank_branch.id", id)
      .first(),

  // Insert new branch
  create: (data) => db("bank_branch").insert(data).returning("*"),

  // Update branch
  update: (id, data) =>
    db("bank_branch").where({ id }).update(data).returning("*"),

  // Soft delete
  softDelete: (id, userId) =>
    db("bank_branch").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),
};

module.exports = bankBranch;
