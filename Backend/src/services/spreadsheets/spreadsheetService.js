const Spreadsheet = require("../../models/spreadsheets/spreadsheet");
const { NotFoundError } = require("../../utils/customErrors");

/**
 * Update the current spreadsheet workbook in place.
 * Used for manual saves and autosaves — does not create a version history row.
 *
 * @param {string} spreadsheetId
 * @param {{ workbook_data: object, updated_by: number }} data
 * @param {import("knex").Knex.Transaction} trx
 */
async function updateSpreadsheet(spreadsheetId, { workbook_data, updated_by }, trx) {
  const [updated] = await Spreadsheet.updateWorkbookData(
    spreadsheetId,
    workbook_data,
    updated_by,
    trx
  );

  if (!updated) {
    throw new NotFoundError("Spreadsheet not found");
  }

  return updated;
}

/**
 * Insert a new spreadsheet_versions row.
 * Reserved for initial workbook creation and future checkpoint/history flows.
 *
 * @param {string} spreadsheetId
 * @param {{ workbook_data: object, created_by: number, version?: number }} data
 * @param {import("knex").Knex.Transaction} trx
 */
async function createSpreadsheetVersion(
  spreadsheetId,
  { workbook_data, created_by, version },
  trx
) {
  let resolvedVersion = version;

  if (resolvedVersion === undefined || resolvedVersion === null) {
    const latestVersion = await Spreadsheet.findLatestVersion(spreadsheetId, trx);
    resolvedVersion = latestVersion ? latestVersion.version + 1 : 1;
  }

  return Spreadsheet.createVersion(
    {
      spreadsheet_id: spreadsheetId,
      version: resolvedVersion,
      workbook_data,
      created_by,
    },
    trx
  );
}

/**
 * Replace active spreadsheet assignments with the provided user IDs.
 * Soft-deletes removed users and restores previously deleted rows.
 *
 * @param {string} spreadsheetId
 * @param {number[]} assignedUserIds
 * @param {number} actorId
 * @param {import("knex").Knex.Transaction} trx
 */
async function syncSpreadsheetAssignments(
  spreadsheetId,
  assignedUserIds,
  actorId,
  trx
) {
  const targetIds = Array.from(new Set((assignedUserIds || []).map(Number))).filter(
    (id) => Number.isInteger(id) && id > 0
  );

  const existingRows = await Spreadsheet.getAllAssignments(spreadsheetId, trx);
  const existingByUserId = new Map(existingRows.map((row) => [Number(row.user_id), row]));

  const toRestore = targetIds.filter((id) => {
    const row = existingByUserId.get(id);
    return row && row.deleted_at != null;
  });

  if (toRestore.length > 0) {
    await Spreadsheet.restoreAssignments(spreadsheetId, toRestore, actorId, trx);
  }

  const toInsert = targetIds
    .filter((id) => !existingByUserId.has(id))
    .map((userId) => ({
      spreadsheet_id: spreadsheetId,
      user_id: userId,
      created_by: actorId,
      created_at: trx.fn.now(),
      deleted_at: null,
      deleted_by: null,
    }));

  if (toInsert.length > 0) {
    await Spreadsheet.insertAssignments(toInsert, trx);
  }

  await Spreadsheet.softDeleteAssignmentsExcept(spreadsheetId, targetIds, actorId, trx);
}

module.exports = {
  updateSpreadsheet,
  createSpreadsheetVersion,
  syncSpreadsheetAssignments,
};
