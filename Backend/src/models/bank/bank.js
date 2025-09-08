const db = require("../../../db");

const bank = {
  // Get all active banks with created/updated user info
  findAll: () =>
    db("bank")
      .leftJoin("users as created_user", "bank.created_by", "created_user.id")
      .leftJoin("users as updated_user", "bank.updated_by", "updated_user.id")
      .select(
        "bank.id",
        "bank.name",
        "bank.initial",
        "bank.is_active",
        "bank.created_at",
        "created_user.name as created_by",
        "bank.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("bank.deleted_at")
      .where("bank.is_active", true),

  // Get bank by ID
  findById: (id) =>
    db("bank")
      .leftJoin("users as created_user", "bank.created_by", "created_user.id")
      .leftJoin("users as updated_user", "bank.updated_by", "updated_user.id")
      .select(
        "bank.id",
        "bank.name",
        "bank.initial",
        "bank.is_active",
        "bank.created_at",
        "created_user.name as created_by",
        "bank.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("bank.deleted_at")
      .where("bank.is_active", true)
      .where("bank.id", id)
      .first(),

  // Insert new bank
  create: (data) => db("bank").insert(data).returning("*"),

  // Update bank by ID
  update: (id, data) => db("bank").where({ id }).update(data).returning("*"),

  // Soft delete bank
  softDelete: (id, userId) =>
    db("bank").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),
};

module.exports = bank;
