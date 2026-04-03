const db = require("../../../../db");

const customReport = {
  // Find custom report by order ID
  findByOrderId: async (orderId) => {
    const report = await db("report_custom")
      .leftJoin("users as created_user", "report_custom.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_custom.updated_by", "updated_user.id")
      .where({ order_id: orderId })
      .select(
        "report_custom.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();

    return report;
  },

  // Find custom report by ID
  findById: async (id) => {
    const report = await db("report_custom")
      .leftJoin("users as created_user", "report_custom.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_custom.updated_by", "updated_user.id")
      .where({ "report_custom.id": id })
      .select(
        "report_custom.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();

    return report;
  },

  // Get all custom reports
  findAll: async () => {
    const reports = await db("report_custom")
      .leftJoin("users as created_user", "report_custom.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_custom.updated_by", "updated_user.id")
      .leftJoin("orders", "report_custom.order_id", "orders.id")
      .select(
        "report_custom.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name",
        "orders.order_number",
        "orders.customer_name"
      )
      .orderBy("report_custom.created_at", "desc");

    return reports;
  },

  // Create new custom report
  create: async (reportData) => {
    const [report] = await db("report_custom")
      .insert({
        ...reportData,
        created_at: new Date(),
        updated_at: null
      })
      .returning("*");

    return report;
  },

  // Update custom report
  update: async (id, reportData) => {
    const [report] = await db("report_custom")
      .where({ id })
      .update({
        ...reportData,
        updated_at: new Date()
      })
      .returning("*");

    return report;
  },

  // Delete custom report
  delete: async (id) => {
    const deletedRows = await db("report_custom")
      .where({ id })
      .del();

    return deletedRows > 0;
  },

  // Check if custom report exists for order
  existsForOrder: async (orderId) => {
    const report = await db("report_custom")
      .where({ order_id: orderId })
      .select("id")
      .first();

    return !!report;
  },

  // Get custom report count for order
  getCountByOrderId: async (orderId) => {
    const result = await db("report_custom")
      .where({ order_id: orderId })
      .count("id as count")
      .first();

    return parseInt(result.count);
  },

  // Get custom reports with pagination
  findWithPagination: async (page = 1, limit = 10, orderId = null) => {
    const offset = (page - 1) * limit;
    
    let query = db("report_custom")
      .leftJoin("users as created_user", "report_custom.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_custom.updated_by", "updated_user.id")
      .leftJoin("orders", "report_custom.order_id", "orders.id");

    if (orderId) {
      query = query.where("report_custom.order_id", orderId);
    }

    const reports = await query
      .select(
        "report_custom.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name",
        "orders.order_number",
        "orders.customer_name"
      )
      .orderBy("report_custom.created_at", "desc")
      .limit(limit)
      .offset(offset);

    // Get total count
    let countQuery = db("report_custom");
    if (orderId) {
      countQuery = countQuery.where("order_id", orderId);
    }
    const totalResult = await countQuery.count("id as total").first();
    const total = parseInt(totalResult.total);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  }
};

module.exports = customReport;
