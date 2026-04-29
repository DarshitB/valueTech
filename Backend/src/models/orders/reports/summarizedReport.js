const db = require("../../../../db");

function normalizePayload(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }
  return null;
}

const summarizedReport = {
  findByOrderId: async (orderId) => {
    const report = await db("report_summarized")
      .leftJoin("users as created_user", "report_summarized.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_summarized.updated_by", "updated_user.id")
      .where({ order_id: orderId })
      .select(
        "report_summarized.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .orderBy("report_summarized.created_at", "desc")
      .first();
    return report;
  },

  findById: async (id) => {
    const report = await db("report_summarized")
      .leftJoin("users as created_user", "report_summarized.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_summarized.updated_by", "updated_user.id")
      .where({ "report_summarized.id": id })
      .select(
        "report_summarized.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      )
      .first();
    return report;
  },

  findByOrderIdWithFlexibleFields: async (orderId) => {
    const report = await summarizedReport.findByOrderId(orderId);
    if (!report) return null;

    const flexibleFields = await db("report_summarized_flexible_fields")
      .leftJoin(
        "users as created_user",
        "report_summarized_flexible_fields.created_by",
        "created_user.id"
      )
      .leftJoin(
        "users as updated_user",
        "report_summarized_flexible_fields.updated_by",
        "updated_user.id"
      )
      .where({ report_id: report.id })
      .orderBy("report_summarized_flexible_fields.field_order", "asc")
      .select(
        "report_summarized_flexible_fields.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name"
      );

    const tableData = await db("report_summarized_table_data")
      .where({ report_id: report.id })
      .first();

    report.flexible_fields = flexibleFields;
    report.summarized_table_data = tableData?.table_payload
      ? JSON.stringify(tableData.table_payload)
      : null;
    return report;
  },

  createReport: async (reportData) => {
    const { summarized_table_data, ...main } = reportData;
    const [report] = await db("report_summarized")
      .insert({ ...main, created_at: new Date(), updated_at: null })
      .returning("*");

    const payload = normalizePayload(summarized_table_data);
    if (payload) {
      await db("report_summarized_table_data").insert({
        report_id: report.id,
        table_payload: payload,
        created_at: new Date(),
        created_by: reportData.created_by || null,
        updated_at: null,
        updated_by: null,
      });
    }
    return report;
  },

  updateReport: async (reportId, reportData, updatedBy) => {
    const { summarized_table_data, ...main } = reportData;
    const [report] = await db("report_summarized")
      .where({ id: reportId })
      .update({ ...main, updated_at: new Date(), updated_by: updatedBy })
      .returning("*");

    if (summarized_table_data !== undefined) {
      const payload = normalizePayload(summarized_table_data);
      const existing = await db("report_summarized_table_data")
        .where({ report_id: reportId })
        .first();

      if (payload) {
        if (existing) {
          await db("report_summarized_table_data")
            .where({ report_id: reportId })
            .update({
              table_payload: payload,
              updated_at: new Date(),
              updated_by: updatedBy,
            });
        } else {
          await db("report_summarized_table_data").insert({
            report_id: reportId,
            table_payload: payload,
            created_at: new Date(),
            created_by: updatedBy || null,
            updated_at: null,
            updated_by: null,
          });
        }
      } else if (existing) {
        await db("report_summarized_table_data").where({ report_id: reportId }).del();
      }
    }

    return report;
  },

  createFlexibleField: async (fieldData) => {
    const [field] = await db("report_summarized_flexible_fields")
      .insert({ ...fieldData, created_at: new Date(), updated_at: null })
      .returning("*");
    return field;
  },

  deleteFlexibleFieldsByReportId: async (reportId) => {
    return db("report_summarized_flexible_fields").where({ report_id: reportId }).del();
  },

  findWithPagination: async (page = 1, limit = 10, orderId = null) => {
    const offset = (page - 1) * limit;
    let baseQuery = db("report_summarized")
      .leftJoin("users as created_user", "report_summarized.created_by", "created_user.id")
      .leftJoin("users as updated_user", "report_summarized.updated_by", "updated_user.id")
      .leftJoin("orders", "report_summarized.order_id", "orders.id")
      .select(
        "report_summarized.*",
        "created_user.name as created_by_name",
        "updated_user.name as updated_by_name",
        "orders.order_number"
      );

    if (orderId) baseQuery = baseQuery.where("report_summarized.order_id", orderId);

    const totalResult = await baseQuery.clone().count("report_summarized.id as total").first();
    const reports = await baseQuery
      .orderBy("report_summarized.created_at", "desc")
      .limit(limit)
      .offset(offset);

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
        hasPrev: page > 1,
      },
    };
  },

  deleteReport: async (reportId) => {
    await db("report_summarized_flexible_fields").where({ report_id: reportId }).del();
    await db("report_summarized_table_data").where({ report_id: reportId }).del();
    const deletedCount = await db("report_summarized").where({ id: reportId }).del();
    return deletedCount > 0;
  },
};

module.exports = summarizedReport;
