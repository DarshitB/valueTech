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
  await Spreadsheet.updateAuditFields(spreadsheetId, updated_by, trx);

  const updated = await Spreadsheet.updateLatestVersionWorkbookData(
    spreadsheetId,
    workbook_data,
    trx
  );

  if (!updated) {
    throw new NotFoundError("Spreadsheet workbook version not found");
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

module.exports = {
  updateSpreadsheet,
  createSpreadsheetVersion,
};
