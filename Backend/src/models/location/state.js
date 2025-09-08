const db = require("../../../db");

const state = {
  findAll: () =>
    db("states")
      .leftJoin("users as created_user", "states.created_by", "created_user.id")
      .leftJoin("users as updated_user", "states.updated_by", "updated_user.id")
      .select(
        "states.id",
        "states.name",
        "states.created_at",
        "created_user.name as created_by",
        "states.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("states.deleted_at")
      .where("states.is_active", true),

  findById: (id) =>
    db("states")
      .leftJoin("users as created_user", "states.created_by", "created_user.id")
      .leftJoin("users as updated_user", "states.updated_by", "updated_user.id")
      .select(
        "states.id",
        "states.name",
        "states.created_at",
        "created_user.name as created_by",
        "states.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("states.deleted_at")
      .where("states.is_active", true)
      .where("states.id", id)
      .first(),

  findByName: (name) =>
    db("states")
      .select("id", "name")
      .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
      .whereNull("deleted_at")
      .where("is_active", true)
      .first(),

  create: (data) => db("states").insert(data).returning("*"),

  update: (id, data) => db("states").where({ id }).update(data).returning("*"),

  softDelete: (id, userId) =>
    db("states").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),
};

module.exports = state;
