const db = require("../../../../db");

const cvReport = {
  // Find CV report by order ID (gets the last created report)
  findByOrderId: async (orderId) => {
    const report = await db("report_cv")
      .leftJoin("users as created_user", "report_cv.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_cv.updated_by", "updated_user.id")
      .where({ order_id: orderId })
      .select(
        "report_cv.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .orderBy("report_cv.created_at", "desc")
      .first();

    return report;
  },

  // Find CV report by ID
  findById: async (id) => {
    const report = await db("report_cv")
      .leftJoin("users as created_user", "report_cv.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_cv.updated_by", "updated_user.id")
      .where({ "report_cv.id": id })
      .select(
        "report_cv.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();

    return report;
  },

  // Get CV report with flexible fields by order ID
  findByOrderIdWithFlexibleFields: async (orderId) => {
    // Get main report data
    const report = await cvReport.findByOrderId(orderId);
    
    if (!report) {
      return null;
    }

    // Get flexible fields for this report
    const flexibleFields = await db("report_cv_flexible_fields")
      .leftJoin("users as created_user", "report_cv_flexible_fields.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_cv_flexible_fields.updated_by", "updated_user.id")
      .where({ report_id: report.id })
      .orderBy("report_cv_flexible_fields.field_order", "asc")
      .select(
        "report_cv_flexible_fields.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      );

    return {
      ...report,
      flexible_fields: flexibleFields
    };
  },

  // Create CV report
  createReport: async (reportData) => {
    const [result] = await db("report_cv")
      .insert(reportData)
      .returning("*");

    return result;
  },

  // Update CV report
  updateReport: async (id, reportData, userId) => {
    const [result] = await db("report_cv")
      .where({ id })
      .update({
        ...reportData,
        updated_at: new Date(),
        updated_by: userId,
      })
      .returning("*");

    return result;
  },

  // Create flexible field
  createFlexibleField: async (fieldData) => {
    const [result] = await db("report_cv_flexible_fields")
      .insert(fieldData)
      .returning("*");

    return result;
  },

  // Update flexible field
  updateFlexibleField: async (id, fieldData, userId) => {
    const [result] = await db("report_cv_flexible_fields")
      .where({ id })
      .update({
        ...fieldData,
        updated_at: new Date(),
        updated_by: userId,
      })
      .returning("*");

    return result;
  },

  // Delete flexible field
  deleteFlexibleField: async (id) => {
    const result = await db("report_cv_flexible_fields")
      .where({ id })
      .del();

    return result > 0;
  },

  // Delete all flexible fields by report ID
  deleteFlexibleFieldsByReportId: async (reportId) => {
    const result = await db("report_cv_flexible_fields")
      .where({ report_id: reportId })
      .del();

    return result;
  },

  // Get flexible fields by report ID
  getFlexibleFieldsByReportId: async (reportId) => {
    const fields = await db("report_cv_flexible_fields")
      .leftJoin("users as created_user", "report_cv_flexible_fields.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_cv_flexible_fields.updated_by", "updated_user.id")
      .where({ report_id: reportId })
      .orderBy("report_cv_flexible_fields.field_order", "asc")
      .select(
        "report_cv_flexible_fields.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      );

    return fields;
  },

  // Check if report exists for order
  existsForOrder: async (orderId) => {
    const result = await db("report_cv")
      .where({ order_id: orderId })
      .count("id as count")
      .first();

    return parseInt(result.count) > 0;
  }
};

module.exports = cvReport;
