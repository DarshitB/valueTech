const db = require("../../../db");

const city = {
  findAll: () =>
    db("cities")
      .leftJoin("states", "cities.state_id", "states.id")
      .leftJoin("users as created_user", "cities.created_by", "created_user.id")
      .leftJoin("users as updated_user", "cities.updated_by", "updated_user.id")
      .select(
        "cities.id",
        "cities.name",
        "cities.state_id",
        "states.name as state_name",
        "cities.is_active",
        "cities.created_at",
        "created_user.name as created_by",
        "cities.updated_at",
        "updated_user.name as updated_by"
      )
      .whereNull("cities.deleted_at")
      .where("cities.is_active", true),

  findById: (id) =>
    db("cities")
      .leftJoin("states", "cities.state_id", "states.id")
      .leftJoin("users as created_user", "cities.created_by", "created_user.id")
      .leftJoin("users as updated_user", "cities.updated_by", "updated_user.id")
      .select(
        "cities.id",
        "cities.name",
        "cities.state_id",
        "states.name as state_name",
        "cities.is_active",
        "cities.created_at",
        "created_user.name as created_by",
        "cities.updated_at",
        "updated_user.name as updated_by"
      )
      .where("cities.id", id)
      .whereNull("cities.deleted_at")
      .where("cities.is_active", true)
      .first(),

  create: (data) => db("cities").insert(data).returning("*"),

  update: (id, data) => db("cities").where({ id }).update(data).returning("*"),

  softDelete: (id, userId) =>
    db("cities").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),

  findByNameAndState: (name, state_id) =>
    db("cities")
      .select("id")
      .whereRaw("LOWER(name) = LOWER(?)", [name.trim()])
      .andWhere("state_id", state_id)
      .whereNull("deleted_at")
      .where("is_active", true)
      .first(),
};

module.exports = city;
