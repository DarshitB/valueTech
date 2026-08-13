const db = require("../../../../db");

const reportVariable = {
  getActiveDefinitionsByReportType: async (reportType) => {
    return db("report_variable_master")
      .select("id", "report_type", "key_name", "is_active", "created_at", "updated_at")
      .where({ report_type: reportType, is_active: true })
      .whereNull("deleted_at")
      .orderBy("key_name", "asc");
  },

  createDefinition: async ({ reportType, keyName, userId }) => {
    const [row] = await db("report_variable_master")
      .insert({
        report_type: reportType,
        key_name: keyName,
        is_active: true,
        created_by: userId || null,
        updated_by: userId || null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    return row;
  },

  findById: async (id) => {
    return db("report_variable_master")
      .select(
        "id",
        "report_type",
        "key_name",
        "is_active",
        "deleted_at",
        "created_at",
        "updated_at"
      )
      .where({ id })
      .first();
  },

  findByReportTypeAndKeyName: async (reportType, keyName) => {
    return db("report_variable_master")
      .select(
        "id",
        "report_type",
        "key_name",
        "is_active",
        "deleted_at",
        "created_at",
        "updated_at"
      )
      .where({ report_type: reportType, key_name: keyName })
      .first();
  },

  softDeleteDefinition: async ({ id, userId }) => {
    const [row] = await db("report_variable_master")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        is_active: false,
        deleted_by: userId || null,
        deleted_at: new Date(),
        updated_by: userId || null,
        updated_at: new Date(),
      })
      .returning("*");
    return row || null;
  },

  reactivateDefinition: async ({ id, userId }) => {
    const [row] = await db("report_variable_master")
      .where({ id })
      .where((builder) => {
        builder.whereNotNull("deleted_at").orWhere({ is_active: false });
      })
      .update({
        is_active: true,
        deleted_by: null,
        deleted_at: null,
        updated_by: userId || null,
        updated_at: new Date(),
      })
      .returning("*");
    return row || null;
  },

  getValuesByReportRecordId: async (reportRecordId) => {
    return db("report_variable_values as rvv")
      .join("report_variable_master as rvm", "rvv.variable_id", "rvm.id")
      .select("rvv.id", "rvv.variable_id", "rvv.report_record_id", "rvv.value", "rvm.key_name", "rvm.report_type")
      .where({ "rvv.report_record_id": reportRecordId, "rvm.is_active": true })
      .whereNull("rvm.deleted_at");
  },

  upsertValuesForReportRecord: async ({
    reportType,
    reportRecordId,
    values,
    userId,
  }) => {
    const activeDefs = await reportVariable.getActiveDefinitionsByReportType(reportType);
    const byId = new Map(activeDefs.map((d) => [Number(d.id), d]));
    const byKey = new Map(activeDefs.map((d) => [String(d.key_name), d]));

    for (const item of values || []) {
      const variableIdNum =
        item.variable_id != null && !Number.isNaN(Number(item.variable_id))
          ? Number(item.variable_id)
          : null;
      const variableKey = item.key_name ? String(item.key_name) : null;
      const def =
        (variableIdNum != null && byId.get(variableIdNum)) ||
        (variableKey ? byKey.get(variableKey) : null);

      if (!def) continue;

      const value = item.value == null ? "" : String(item.value);
      const existing = await db("report_variable_values")
        .where({
          variable_id: def.id,
          report_record_id: reportRecordId,
        })
        .first();

      if (existing) {
        await db("report_variable_values")
          .where({ id: existing.id })
          .update({
            value,
            updated_by: userId || null,
            updated_at: new Date(),
          });
      } else {
        await db("report_variable_values").insert({
          variable_id: def.id,
          report_record_id: reportRecordId,
          value,
          created_by: userId || null,
          updated_by: userId || null,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    }
  },
};

module.exports = reportVariable;

