const db = require("../../../db");

const permission = {
  findAll: () => db("permissions").whereNull("deleted_at"),
  create: (data) => db("permissions").insert(data).returning("*"),
};

module.exports = permission;
