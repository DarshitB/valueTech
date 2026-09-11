const { validate: isUuid } = require("uuid");

const Spreadsheet = require("../../models/spreadsheets/spreadsheet");
const db = require("../../../db");
const {
  updateSpreadsheet,
  createSpreadsheetVersion,
  syncSpreadsheetAssignments,
} = require("../../services/spreadsheets/spreadsheetService");
const {
  getPersonalDraftForUser,
  saveRevisionedCheckpoint,
} = require("../../services/spreadsheets/spreadsheetCheckpointService");
const {
  getSpreadsheetCollaborationConfig,
} = require("../../config/spreadsheetCollaboration");
const {
  recordSpreadsheetCollaborationEvent,
} = require("../../socket/spreadsheetCollaborationTelemetry");
const {
  assertSpreadsheetAccess: assertSpreadsheetAccessPolicy,
  isDeveloperAdmin,
} = require("../../services/spreadsheets/spreadsheetAccessPolicy");
const {
  AppError,
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");
const { createEmptyWorkbookData } = require("../../utils/univerWorkbookHelper");
const logger = require("../../utils/logger");
const {
  revalidateSpreadsheetRoomAccess,
} = require("../../socket/spreadsheetAccessRevocation");

const MAX_NAME_LENGTH = 255;

function validateSpreadsheetId(id) {
  if (!id || typeof id !== "string" || !isUuid(id)) {
    throw new BadRequestError("Valid spreadsheet id is required");
  }
}

function validateCreatePayload(body) {
  const { name, description, assigned_user_ids } = body;

  if (name === undefined || name === null) {
    throw new BadRequestError("name is required");
  }

  if (typeof name !== "string") {
    throw new BadRequestError("name must be a string");
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new BadRequestError("name cannot be empty after trimming");
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw new BadRequestError(`name must be at most ${MAX_NAME_LENGTH} characters`);
  }

  let normalizedDescription = null;
  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      throw new BadRequestError("description must be a string");
    }

    const trimmedDescription = description.trim();
    normalizedDescription = trimmedDescription.length > 0 ? trimmedDescription : null;
  }

  return {
    name: trimmedName,
    description: normalizedDescription,
    assigned_user_ids: normalizeAssignedUserIds(assigned_user_ids),
  };
}

function normalizeAssignedUserIds(assignedUserIds) {
  if (assignedUserIds === undefined || assignedUserIds === null) {
    return [];
  }

  if (!Array.isArray(assignedUserIds)) {
    throw new BadRequestError("assigned_user_ids must be an array");
  }

  const normalized = Array.from(
    new Set(
      assignedUserIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )
  );

  if (normalized.length !== assignedUserIds.length) {
    throw new BadRequestError("assigned_user_ids must contain valid user IDs");
  }

  return normalized;
}

function validateSavePayload(body) {
  const { workbook_data, base_revision, personal_draft } = body;

  if (workbook_data === undefined || workbook_data === null) {
    throw new BadRequestError("workbook_data is required");
  }

  if (typeof workbook_data !== "object" || Array.isArray(workbook_data)) {
    throw new BadRequestError("workbook_data must be an object");
  }

  return {
    workbook_data,
    base_revision: base_revision === undefined ? null : base_revision,
    personal_draft: personal_draft === undefined ? null : personal_draft,
  };
}

function parseArchivedQuery(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function toBooleanFlag(value) {
  return value === true || value === "t" || value === "true" || value === 1;
}

async function assertSpreadsheetAccess(req, spreadsheetId, trx = db) {
  const decision = await assertSpreadsheetAccessPolicy({
    spreadsheetId,
    user: req.user,
    trx,
  });
  return decision.spreadsheet;
}

/**
 * GET /api/spreadsheets
 */
exports.getAll = async (req, res, next) => {
  try {
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const archived = parseArchivedQuery(req.query.archived);
    const spreadsheets = await Spreadsheet.findAll(req.user.id, isDevAdmin, {
      archived,
    });
    const assignmentMap = await Spreadsheet.getAssignedUserIdsMap(
      spreadsheets.map((sheet) => sheet.id)
    );

    res.json({
      success: true,
      data: spreadsheets.map((sheet) => ({
        ...sheet,
        is_pinned: toBooleanFlag(sheet.is_pinned),
        assigned_user_ids: assignmentMap[sheet.id] || [],
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/spreadsheets/:id
 */
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);

    const spreadsheet = await assertSpreadsheetAccess(req, id);
    const assignedUserIds = await Spreadsheet.getAssignedUserIds(id);
    const personalDraft = getSpreadsheetCollaborationConfig().checkpointsEnabled
      ? await getPersonalDraftForUser(id, req.user.id)
      : null;

    res.json({
      success: true,
      data: {
        id: spreadsheet.id,
        name: spreadsheet.name,
        description: spreadsheet.description,
        workbook_data: spreadsheet.workbook_data,
        version: spreadsheet.current_version,
        workbook_revision: spreadsheet.snapshot_revision,
        current_revision: spreadsheet.current_revision,
        personal_draft: personalDraft,
        created_at: spreadsheet.created_at,
        updated_at: spreadsheet.updated_at,
        assigned_user_ids: assignedUserIds,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/spreadsheets/:id/save
 */
exports.save = async (req, res, next) => {
  const trx = await db.transaction();

  try {
    const { id } = req.params;
    validateSpreadsheetId(id);

    const { workbook_data, base_revision, personal_draft } =
      validateSavePayload(req.body);
    const { id: userId } = req.user;

    await assertSpreadsheetAccess(req, id, trx);

    if (getSpreadsheetCollaborationConfig().checkpointsEnabled) {
      const checkpoint = await saveRevisionedCheckpoint(
        {
          spreadsheetId: id,
          workbookData: workbook_data,
          baseRevision: base_revision,
          updatedBy: userId,
          personalDraft: personal_draft,
        },
        trx
      );

      await trx.commit();

      recordSpreadsheetCollaborationEvent("checkpoint_saved", {
        spreadsheetId: id,
        userId,
        currentRevision: checkpoint.currentRevision,
        snapshotRevision: checkpoint.snapshotRevision,
        previousSnapshotRevision: checkpoint.previousSnapshotRevision,
        version: checkpoint.version,
        checkpoint_lag_revisions: checkpoint.checkpointLagRevisions,
      });

      res.json({
        success: true,
        message: "Spreadsheet saved successfully.",
        data: {
          current_revision: checkpoint.currentRevision,
          snapshot_revision: checkpoint.snapshotRevision,
          version: checkpoint.version,
        },
      });
      return;
    }

    await updateSpreadsheet(
      id,
      {
        workbook_data,
        updated_by: userId,
      },
      trx
    );

    await trx.commit();

    res.json({
      success: true,
      message: "Spreadsheet saved successfully.",
    });
  } catch (error) {
    await trx.rollback();
    next(error);
  }
};

/**
 * POST /api/spreadsheets
 */
exports.create = async (req, res, next) => {
  const trx = await db.transaction();

  try {
    const { name, description, assigned_user_ids } = validateCreatePayload(req.body);
    const { id: userId } = req.user;
    const initialWorkbookData = createEmptyWorkbookData(name);

    const [spreadsheet] = await Spreadsheet.create(
      {
        name,
        description,
        workbook_data: initialWorkbookData,
        current_version: 1,
        created_by: userId,
        updated_by: null,
        deleted_by: null,
      },
      trx
    );

    await createSpreadsheetVersion(
      spreadsheet.id,
      {
        workbook_data: initialWorkbookData,
        created_by: userId,
        version: 1,
      },
      trx
    );
    if (assigned_user_ids.length > 0) {
      const validUsers = await Spreadsheet.getActiveUsersByIds(assigned_user_ids, trx);
      if (validUsers.length !== assigned_user_ids.length) {
        throw new BadRequestError("One or more assigned users are invalid");
      }

      await syncSpreadsheetAssignments(
        spreadsheet.id,
        assigned_user_ids,
        userId,
        trx
      );
    }

    await trx.commit();

    res.status(201).json({
      success: true,
      message: "Spreadsheet created successfully.",
      data: {
        id: spreadsheet.id,
        name: spreadsheet.name,
        description: spreadsheet.description,
        assigned_user_ids,
      },
    });
  } catch (error) {
    await trx.rollback();
    next(error);
  }
};

/**
 * PUT /api/spreadsheets/:id
 */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);

    const { name, description, assigned_user_ids } = validateCreatePayload(req.body);
    const { id: userId } = req.user;

    const spreadsheet = await assertSpreadsheetAccess(req, id);
    const existingAssignments = await Spreadsheet.getAssignedUserIds(id);
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const isCreator = Number(spreadsheet.created_by) === Number(userId);
    const canManageAssignments = isDevAdmin || isCreator;
    if (!canManageAssignments && assigned_user_ids.length > 0) {
      throw new AppError("You are not allowed to assign users", 403);
    }

    const trx = await db.transaction();
    try {
      const [updated] = await Spreadsheet.updateMetadata(
        id,
        {
          name,
          description,
          updated_by: userId,
        },
        trx
      );

      let finalAssignedUserIds = existingAssignments;
      if (canManageAssignments) {
        if (assigned_user_ids.length > 0) {
          const validUsers = await Spreadsheet.getActiveUsersByIds(assigned_user_ids, trx);
          if (validUsers.length !== assigned_user_ids.length) {
            throw new BadRequestError("One or more assigned users are invalid");
          }
        }
        await syncSpreadsheetAssignments(id, assigned_user_ids, userId, trx);
        finalAssignedUserIds = assigned_user_ids;
      }

      await trx.commit();
      await revalidateSpreadsheetRoomAccess(id).catch((error) => {
        logger.error(
          `[SpreadsheetCollaboration] access revalidation failed for ${id}: ${error.message}`
        );
      });

      res.json({
        success: true,
        message: "Spreadsheet updated successfully.",
        data: {
          ...updated,
          created_by: spreadsheet.created_by,
          assigned_user_ids: finalAssignedUserIds,
        },
      });
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/spreadsheets/:id
 */
exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);

    await assertSpreadsheetAccess(req, id);

    await Spreadsheet.softDelete(id, req.user.id);
    await revalidateSpreadsheetRoomAccess(id).catch((error) => {
      logger.error(
        `[SpreadsheetCollaboration] access revalidation failed for ${id}: ${error.message}`
      );
    });

    res.status(204).json({
      success: true,
      message: "Spreadsheet deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/spreadsheets/:id/pin
 */
exports.pin = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);
    await assertSpreadsheetAccess(req, id);
    await Spreadsheet.insertPin(id, req.user.id);

    res.json({
      success: true,
      data: { id, is_pinned: true },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/spreadsheets/:id/pin
 */
exports.unpin = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);
    await assertSpreadsheetAccess(req, id);
    await Spreadsheet.deletePin(id, req.user.id);

    res.json({
      success: true,
      data: { id, is_pinned: false },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/spreadsheets/:id/archive
 */
exports.archive = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);
    await assertSpreadsheetAccess(req, id);
    await Spreadsheet.archive(id, req.user.id);

    res.json({
      success: true,
      message: "Spreadsheet archived successfully.",
      data: { id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/spreadsheets/:id/archive
 */
exports.unarchive = async (req, res, next) => {
  try {
    const { id } = req.params;
    validateSpreadsheetId(id);
    await assertSpreadsheetAccess(req, id);
    await Spreadsheet.unarchive(id);

    res.json({
      success: true,
      message: "Spreadsheet restored successfully.",
      data: { id },
    });
  } catch (error) {
    next(error);
  }
};
