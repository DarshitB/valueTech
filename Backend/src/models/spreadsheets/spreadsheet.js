const db = require("../../../db");

const LIST_COLUMNS = ["id", "name", "description", "created_at", "updated_at"];
const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  "workbook_data",
  "current_version",
];

const spreadsheet = {
  findAll: () =>
    db("spreadsheets")
      .select(LIST_COLUMNS)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc"),

  findById: (id, trx = db) =>
    trx("spreadsheets")
      .select(DETAIL_COLUMNS)
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

  updateWorkbookData: (spreadsheetId, workbookData, updatedBy, trx = db) =>
    trx("spreadsheets")
      .where({ id: spreadsheetId })
      .whereNull("deleted_at")
      .update({
        workbook_data: workbookData,
        updated_at: trx.fn.now(),
        updated_by: updatedBy,
      })
      .returning(["id", "workbook_data", "updated_at", "updated_by"]),

  create: (data, trx = db) =>
    trx("spreadsheets")
      .insert(data)
      .returning([
        "id",
        "name",
        "description",
        "workbook_data",
        "current_version",
      ]),

  createVersion: (data, trx = db) =>
    trx("spreadsheet_versions").insert(data).returning("id"),

  updateMetadata: (id, { name, description, updated_by }, trx = db) =>
    trx("spreadsheets")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        name,
        description,
        updated_at: trx.fn.now(),
        updated_by,
      })
      .returning(LIST_COLUMNS),

  softDelete: (id, deletedBy, trx = db) =>
    trx("spreadsheets")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        deleted_at: trx.fn.now(),
        deleted_by: deletedBy,
        updated_at: trx.fn.now(),
        updated_by: deletedBy,
      }),
};
module.exports = spreadsheet;
