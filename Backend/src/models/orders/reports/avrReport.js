const db = require("../../../../db");

const avrReport = {
  // Find AVR report by order ID
  findByOrderId: async (orderId) => {
    const report = await db("report_avr")
      .leftJoin("users as created_user", "report_avr.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_avr.updated_by", "updated_user.id")
      .where({ order_id: orderId })
      .select(
        "report_avr.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();

    return report;
  },

  // Find AVR report by ID
  findById: async (id) => {
    const report = await db("report_avr")
      .leftJoin("users as created_user", "report_avr.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_avr.updated_by", "updated_user.id")
      .where({ "report_avr.id": id })
      .select(
        "report_avr.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();

    return report;
  },

  // Get AVR report with flexible fields by order ID
  findByOrderIdWithFlexibleFields: async (orderId) => {
    // Get main report data
    const report = await avrReport.findByOrderId(orderId);
    
    if (!report) {
      return null;
    }

    // Get flexible fields for this report
    const flexibleFields = await db("report_avr_flexible_fields")
      .leftJoin("users as created_user", "report_avr_flexible_fields.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_avr_flexible_fields.updated_by", "updated_user.id")
      .where({ report_id: report.id })
      .orderBy("report_avr_flexible_fields.field_order", "asc")
      .select(
        "report_avr_flexible_fields.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      );

    return {
      ...report,
      flexible_fields: flexibleFields
    };
  },

  // Create AVR report
  createReport: async (reportData) => {
    const [result] = await db("report_avr")
      .insert(reportData)
      .returning("*");

    return result;
  },

  // Update AVR report
  updateReport: async (id, reportData, userId) => {
    const [result] = await db("report_avr")
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
    const [result] = await db("report_avr_flexible_fields")
      .insert(fieldData)
      .returning("*");

    return result;
  },

  // Update flexible field
  updateFlexibleField: async (id, fieldData, userId) => {
    const [result] = await db("report_avr_flexible_fields")
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
    const result = await db("report_avr_flexible_fields")
      .where({ id })
      .del();

    return result > 0;
  },

  // Delete all flexible fields by report ID
  deleteFlexibleFieldsByReportId: async (reportId) => {
    const result = await db("report_avr_flexible_fields")
      .where({ report_id: reportId })
      .del();

    return result;
  },

  // Get flexible fields by report ID
  getFlexibleFieldsByReportId: async (reportId) => {
    const fields = await db("report_avr_flexible_fields")
      .leftJoin("users as created_user", "report_avr_flexible_fields.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_avr_flexible_fields.updated_by", "updated_user.id")
      .where({ report_id: reportId })
      .orderBy("report_avr_flexible_fields.field_order", "asc")
      .select(
        "report_avr_flexible_fields.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      );

    return fields;
  },

  // Check if report exists for order
  existsForOrder: async (orderId) => {
    const result = await db("report_avr")
      .where({ order_id: orderId })
      .count("id as count")
      .first();

    return parseInt(result.count) > 0;
  }
};

module.exports = avrReport;
