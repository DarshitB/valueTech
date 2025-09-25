const db = require("../../../../db");

const ceReport = {
  // Find CE report by order ID (gets the last created report)
  findByOrderId: async (orderId) => {
    const report = await db("report_ce")
      .leftJoin("users as created_user", "report_ce.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_ce.updated_by", "updated_user.id")
      .where({ order_id: orderId })
      .select(
        "report_ce.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .orderBy("report_ce.created_at", "desc")
      .first();

    return report;
  },

  // Find CE report by order ID with flexible fields
  findByOrderIdWithFlexibleFields: async (orderId) => {
    const report = await ceReport.findByOrderId(orderId);
    if (!report) return null;

    const flexibleFields = await db("report_ce_flexible_fields")
      .where({ report_id: report.id })
      .orderBy("field_order", "asc");

    return { ...report, flexible_fields: flexibleFields };
  },

  // Create CE report
  createReport: async (data) => {
    const [report] = await db("report_ce").insert(data).returning("*");
    return report;
  },

  // Update CE report
  updateReport: async (id, data, userId) => {
    const [report] = await db("report_ce")
      .where({ id })
      .update({
        ...data,
        updated_at: new Date(),
        updated_by: userId,
      })
      .returning("*");
    return report;
  },

  // Flexible fields operations
  createFlexibleField: async (data) => {
    const [field] = await db("report_ce_flexible_fields").insert(data).returning("*");
    return field;
  },

  deleteFlexibleFieldsByReportId: async (reportId) => {
    await db("report_ce_flexible_fields").where({ report_id: reportId }).del();
  },
};

module.exports = ceReport;


