const db = require("../../../db");

const LIST_COLUMNS = ["id", "name", "description", "created_at", "updated_at"];

const spreadsheet = {
  findAll: () =>
    db("spreadsheets")
      .select(LIST_COLUMNS)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc"),

  findById: (id, trx = db) =>
    trx("spreadsheets")
      .select(LIST_COLUMNS)
      .where({ id })
      .whereNull("deleted_at")
      .first(),

  findLatestVersion: (spreadsheetId, trx = db) =>
    trx("spreadsheet_versions")
      .select("workbook_data", "version")
      .where({ spreadsheet_id: spreadsheetId })
      .orderBy("version", "desc")
      .first(),

  updateAuditFields: (id, updatedBy, trx = db) =>
    trx("spreadsheets")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        updated_at: trx.fn.now(),
        updated_by: updatedBy,
      }),

  create: (data, trx = db) =>
    trx("spreadsheets")
      .insert(data)
      .returning(["id", "name", "description"]),

  createVersion: (data, trx = db) =>
    trx("spreadsheet_versions").insert(data).returning("id"),
};

module.exports = spreadsheet;
