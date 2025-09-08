const db = require("../../../db");

const orderStatusMaster = {
  // Get all order statuses
  getAllStatuses: async () => {
    const statuses = await db("order_status_master")
      .select(
        "id",
        "name",
        "description"
      )
      .orderBy("id", "asc");

    return statuses;
  },

  // Get status by ID
  findById: async (id) => {
    const status = await db("order_status_master")
      .select(
        "id",
        "name",
        "description"
      )
      .where("id", id)
      .first();

    return status;
  },

  // Get status by name
  findByName: async (name) => {
    const status = await db("order_status_master")
      .select(
        "id",
        "name",
        "description"
      )
      .where("name", name)
      .first();

    return status;
  }
};

module.exports = orderStatusMaster;
