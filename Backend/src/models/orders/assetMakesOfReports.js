const db = require("../../../db");

const assetMakesForReports = {
  // Get asset makes records by order type
  getByOrderType: async (orderType) => {
    const records = await db("asset_makes_for_reports")
      .leftJoin("users as created_user", "asset_makes_for_reports.created_by", "created_user.id")
      .where("asset_makes_for_reports.order_type", orderType)
      .select(
        "asset_makes_for_reports.*",
        "created_user.name as created_by_name"
      )
      .orderBy("asset_makes_for_reports.created_at", "desc");

    return records;
  },

  // Get asset makes record by ID
  findById: async (id) => {
    const normalizedId = Number(id);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return null;
    }

    const record = await db("asset_makes_for_reports")
      .leftJoin("users as created_user", "asset_makes_for_reports.created_by", "created_user.id")
      .where("asset_makes_for_reports.id", normalizedId)
      .select(
        "asset_makes_for_reports.*",
        "created_user.name as created_by_name"
      )
      .first();

    return record;
  },

  // Get asset makes record by name and order type
  findByName: async (name, orderType) => {
    const record = await db("asset_makes_for_reports")
      .leftJoin("users as created_user", "asset_makes_for_reports.created_by", "created_user.id")
      .where("asset_makes_for_reports.name", name)
      .where("asset_makes_for_reports.order_type", orderType)
      .select(
        "asset_makes_for_reports.*",
        "created_user.name as created_by_name"
      )
      .first();

    return record;
  },

  // Create new asset makes record
  create: async (data) => {
    const [result] = await db("asset_makes_for_reports")
      .insert({
        order_type: data.order_type,
        name: data.name,
        created_by: data.created_by,
        created_at: new Date()
      })
      .returning("*");

    return result;
  },

  // Get distinct order types
  getDistinctOrderTypes: async () => {
    const types = await db("asset_makes_for_reports")
      .distinct("order_type")
      .orderBy("order_type");

    return types.map(type => type.order_type);
  }
};

module.exports = assetMakesForReports;
