const Spreadsheet = require("../../models/spreadsheets/spreadsheet");
const { ConflictError, BadRequestError } = require("../../utils/customErrors");

function toRevision(value) {
  if (value == null || value === "") {
    return 0;
  }
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    return null;
  }
  return revision;
}

function normalizePersonalDraft(draft) {
  if (draft == null) {
    return null;
  }

  if (typeof draft !== "object" || Array.isArray(draft)) {
    throw new BadRequestError("personal_draft must be an object or null");
  }

  const sheetId =
    (typeof draft.sheetId === "string" && draft.sheetId.trim()) ||
    (typeof draft.sheet_id === "string" && draft.sheet_id.trim()) ||
    "";
  const row = Number(draft.row);
  const column = Number(draft.column);
  const documentData = draft.documentData ?? draft.document_data;

  if (
    !sheetId ||
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0 ||
    !documentData ||
    typeof documentData !== "object" ||
    Array.isArray(documentData)
  ) {
    throw new BadRequestError("personal_draft is invalid");
  }

  return {
    sheetId,
    row,
    column,
    documentData,
  };
}

function createStaleCheckpointError(currentRevision, snapshotRevision) {
  const error = new ConflictError(
    "This save is behind newer committed spreadsheet changes"
  );
  error.code = "STALE_CHECKPOINT";
  error.details = {
    current_revision: currentRevision,
    snapshot_revision: snapshotRevision,
  };
  return error;
}

/**
 * Accept a canonical workbook snapshot only when it includes every command
 * already allocated on the spreadsheet. Never overwrite a newer revision.
 */
async function saveRevisionedCheckpoint(
  {
    spreadsheetId,
    workbookData,
    baseRevision,
    updatedBy,
    personalDraft,
  },
  trx
) {
  const spreadsheet = await Spreadsheet.lockRevisionState(spreadsheetId, trx);
  if (!spreadsheet) {
    const error = new Error("Spreadsheet not found");
    error.code = "SPREADSHEET_NOT_FOUND";
    throw error;
  }

  const currentRevision = toRevision(spreadsheet.current_revision);
  const snapshotRevision = toRevision(spreadsheet.snapshot_revision);
  const clientRevision = toRevision(baseRevision);

  if (currentRevision == null || clientRevision == null) {
    throw new BadRequestError("base_revision must be a whole number");
  }

  if (clientRevision !== currentRevision) {
    throw createStaleCheckpointError(currentRevision, snapshotRevision);
  }

  const [updated] = await Spreadsheet.updateWorkbookCheckpoint(
    spreadsheetId,
    {
      workbookData,
      updatedBy,
      snapshotRevision: currentRevision,
    },
    trx
  );

  const latestVersion = await Spreadsheet.findLatestVersion(spreadsheetId, trx);
  const nextVersion = latestVersion ? Number(latestVersion.version) + 1 : 1;

  await Spreadsheet.createVersion(
    {
      spreadsheet_id: spreadsheetId,
      version: nextVersion,
      revision: currentRevision,
      workbook_data: workbookData,
      created_by: updatedBy,
    },
    trx
  );

  const normalizedDraft = normalizePersonalDraft(personalDraft);
  if (normalizedDraft) {
    await Spreadsheet.upsertPersonalDraft(
      spreadsheetId,
      updatedBy,
      normalizedDraft,
      trx
    );
  } else {
    await Spreadsheet.deletePersonalDraft(spreadsheetId, updatedBy, trx);
  }

  return {
    updated,
    currentRevision,
    snapshotRevision: currentRevision,
    previousSnapshotRevision: snapshotRevision,
    checkpointLagRevisions: Math.max(
      0,
      currentRevision - (snapshotRevision ?? 0)
    ),
    version: nextVersion,
  };
}

function mapPersonalDraftRow(row) {
  if (!row) {
    return null;
  }

  return {
    sheetId: row.sheet_id,
    row: Number(row.row),
    column: Number(row.column),
    documentData: row.document_data,
  };
}

async function getPersonalDraftForUser(spreadsheetId, userId, trx) {
  const row = await Spreadsheet.getPersonalDraft(spreadsheetId, userId, trx);
  return mapPersonalDraftRow(row);
}

module.exports = {
  createStaleCheckpointError,
  getPersonalDraftForUser,
  mapPersonalDraftRow,
  normalizePersonalDraft,
  saveRevisionedCheckpoint,
  toRevision,
};
