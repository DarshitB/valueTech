const db = require("../../../db");

const LIST_COLUMNS = ["id", "name", "description", "created_at", "updated_at"];
const DETAIL_COLUMNS = [
  ...LIST_COLUMNS,
  "workbook_data",
  "current_version",
];

const spreadsheet = {
  findAll: (
    userId,
    isDeveloperAdmin = false,
    { archived = false } = {},
    trx = db
  ) => {
    const query = trx("spreadsheets")
      .leftJoin("users as created_user", "spreadsheets.created_by", "created_user.id")
      .leftJoin("users as archived_user", "spreadsheets.archived_by", "archived_user.id")
      .leftJoin("spreadsheet_pins", function () {
        this.on("spreadsheet_pins.spreadsheet_id", "=", "spreadsheets.id").andOnVal(
          "spreadsheet_pins.user_id",
          userId
        );
      })
      .select(
        "spreadsheets.id",
        "spreadsheets.name",
        "spreadsheets.description",
        "spreadsheets.created_by",
        "spreadsheets.created_at",
        "spreadsheets.updated_at",
        "spreadsheets.archived_at",
        "spreadsheets.archived_by",
        "created_user.name as created_by_name",
        "archived_user.name as archived_by_name",
        trx.raw("(spreadsheet_pins.id IS NOT NULL) as is_pinned")
      )
      .whereNull("spreadsheets.deleted_at");

    if (archived) {
      query.whereNotNull("spreadsheets.archived_at");
    } else {
      query.whereNull("spreadsheets.archived_at");
    }

    query
      .orderByRaw("CASE WHEN spreadsheet_pins.id IS NULL THEN 1 ELSE 0 END")
      .orderBy("spreadsheets.created_at", "desc");

    if (!isDeveloperAdmin) {
      query.andWhere(function () {
        this.where("spreadsheets.created_by", userId).orWhereExists(function () {
          this.select(trx.raw("1"))
            .from("spreadsheet_users")
            .whereRaw("spreadsheet_users.spreadsheet_id = spreadsheets.id")
            .andWhere("spreadsheet_users.user_id", userId)
            .whereNull("spreadsheet_users.deleted_at");
        });
      });
    }

    return query;
  },

  findById: (id, trx = db) =>
    trx("spreadsheets")
      .select([...DETAIL_COLUMNS, "created_by"])
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

  getAssignedUserIds: async (spreadsheetId, trx = db) => {
    const rows = await trx("spreadsheet_users")
      .pluck("user_id")
      .where({ spreadsheet_id: spreadsheetId })
      .whereNull("deleted_at");
    return rows.map((id) => Number(id));
  },

  getAssignedUserIdsMap: async (spreadsheetIds, trx = db) => {
    if (!Array.isArray(spreadsheetIds) || spreadsheetIds.length === 0) {
      return {};
    }

    const rows = await trx("spreadsheet_users")
      .select("spreadsheet_id", "user_id")
      .whereIn("spreadsheet_id", spreadsheetIds)
      .whereNull("deleted_at");

    return rows.reduce((acc, row) => {
      if (!acc[row.spreadsheet_id]) {
        acc[row.spreadsheet_id] = [];
      }
      acc[row.spreadsheet_id].push(Number(row.user_id));
      return acc;
    }, {});
  },

  getAllAssignments: (spreadsheetId, trx = db) =>
    trx("spreadsheet_users")
      .select("id", "user_id", "deleted_at")
      .where({ spreadsheet_id: spreadsheetId }),

  insertAssignments: (rows, trx = db) =>
    trx("spreadsheet_users").insert(rows),

  restoreAssignments: (spreadsheetId, userIds, actorId, trx = db) =>
    trx("spreadsheet_users")
      .where({ spreadsheet_id: spreadsheetId })
      .whereIn("user_id", userIds)
      .whereNotNull("deleted_at")
      .update({
        deleted_at: null,
        deleted_by: null,
        created_at: trx.fn.now(),
        created_by: actorId,
      }),

  softDeleteAssignmentsExcept: (spreadsheetId, userIds, actorId, trx = db) => {
    const query = trx("spreadsheet_users")
      .where({ spreadsheet_id: spreadsheetId })
      .whereNull("deleted_at");

    if (Array.isArray(userIds) && userIds.length > 0) {
      query.whereNotIn("user_id", userIds);
    }

    return query.update({
      deleted_at: trx.fn.now(),
      deleted_by: actorId,
    });
  },

  getActiveUsersByIds: (userIds, trx = db) =>
    trx("users").select("id").whereIn("id", userIds).whereNull("deleted_at"),

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
      .returning([
        "id",
        "name",
        "description",
        "created_by",
        "created_at",
        "updated_at",
      ]),

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

  findPin: (spreadsheetId, userId, trx = db) =>
    trx("spreadsheet_pins")
      .select("id")
      .where({ spreadsheet_id: spreadsheetId, user_id: userId })
      .first(),

  insertPin: (spreadsheetId, userId, trx = db) =>
    trx("spreadsheet_pins")
      .insert({
        spreadsheet_id: spreadsheetId,
        user_id: userId,
      })
      .onConflict(["spreadsheet_id", "user_id"])
      .ignore(),

  deletePin: (spreadsheetId, userId, trx = db) =>
    trx("spreadsheet_pins")
      .where({ spreadsheet_id: spreadsheetId, user_id: userId })
      .del(),

  archive: (id, archivedBy, trx = db) =>
    trx("spreadsheets")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        archived_at: trx.fn.now(),
        archived_by: archivedBy,
      }),

  unarchive: (id, trx = db) =>
    trx("spreadsheets")
      .where({ id })
      .whereNull("deleted_at")
      .update({
        archived_at: null,
        archived_by: null,
      }),
};
module.exports = spreadsheet;
