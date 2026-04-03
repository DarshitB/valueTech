const db = require("../../../../db");

const machineryReport = {
  // Find Machinery report by order ID (gets the last created report)
  findByOrderId: async (orderId) => {
    const report = await db("report_machinery")
      .leftJoin("users as created_user", "report_machinery.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_machinery.updated_by", "updated_user.id")
      .where({ order_id: orderId })
      .select(
        "report_machinery.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .orderBy("report_machinery.created_at", "desc")
      .first();

    return report;
  },

  // Find Machinery report by ID
  findById: async (id) => {
    const report = await db("report_machinery")
      .leftJoin("users as created_user", "report_machinery.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_machinery.updated_by", "updated_user.id")
      .where({ "report_machinery.id": id })
      .select(
        "report_machinery.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();

    return report;
  },

  // Get Machinery report with flexible fields by order ID
  findByOrderIdWithFlexibleFields: async (orderId) => {
    // Get main report data
    const report = await machineryReport.findByOrderId(orderId);
    
    if (!report) {
      return null;
    }

    // Get flexible fields for this report
    const flexibleFields = await db("report_machinery_flexible_fields")
      .leftJoin("users as created_user", "report_machinery_flexible_fields.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_machinery_flexible_fields.updated_by", "updated_user.id")
      .where({ report_id: report.id })
      .orderBy("report_machinery_flexible_fields.field_order", "asc")
      .select(
        "report_machinery_flexible_fields.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      );

    // Add flexible fields to report object
    report.flexible_fields = flexibleFields;

    return report;
  },

  // Create new Machinery report
  createReport: async (reportData) => {
    const [report] = await db("report_machinery")
      .insert({
        ...reportData,
        created_at: new Date(),
        updated_at: null
      })
      .returning("*");

    return report;
  },

  // Update existing Machinery report
  updateReport: async (reportId, reportData, updatedBy) => {
    const [report] = await db("report_machinery")
      .where({ id: reportId })
      .update({
        ...reportData,
        updated_at: new Date(),
        updated_by: updatedBy
      })
      .returning("*");

    return report;
  },

  // Create flexible field for Machinery report
  createFlexibleField: async (fieldData) => {
    const [field] = await db("report_machinery_flexible_fields")
      .insert({
        ...fieldData,
        created_at: new Date(),
        updated_at: null
      })
      .returning("*");

    return field;
  },

  // Delete flexible fields by report ID
  deleteFlexibleFieldsByReportId: async (reportId) => {
    const deletedCount = await db("report_machinery_flexible_fields")
      .where({ report_id: reportId })
      .del();

    return deletedCount;
  },

  // Get all Machinery reports with pagination
  findWithPagination: async (page = 1, limit = 10, orderId = null) => {
    const offset = (page - 1) * limit;

    // Build base query
    let baseQuery = db("report_machinery")
      .leftJoin("users as created_user", "report_machinery.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_machinery.updated_by", "updated_user.id")
      .leftJoin("orders", "report_machinery.order_id", "orders.id")
      .select(
        "report_machinery.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name",
        "orders.order_number"
      );

    // Apply filters
    if (orderId) {
      baseQuery = baseQuery.where("report_machinery.order_id", orderId);
    }

    // Get total count
    const totalQuery = baseQuery.clone().count("report_machinery.id as total").first();

    // Get paginated results
    const reportsQuery = baseQuery
      .orderBy("report_machinery.created_at", "desc")
      .limit(limit)
      .offset(offset);

    const [totalResult, reports] = await Promise.all([totalQuery, reportsQuery]);

    const total = parseInt(totalResult.total);
    const totalPages = Math.ceil(total / limit);

    return {
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  },

  // Delete Machinery report
  deleteReport: async (reportId) => {
    // Delete flexible fields first (due to foreign key constraint)
    await db("report_machinery_flexible_fields")
      .where({ report_id: reportId })
      .del();

    // Delete main report
    const deletedCount = await db("report_machinery")
      .where({ id: reportId })
      .del();

    return deletedCount > 0;
  }
};

module.exports = machineryReport;
