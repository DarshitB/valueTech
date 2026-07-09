const { validate: isUuid } = require("uuid");

const Spreadsheet = require("../../models/spreadsheets/spreadsheet");
const db = require("../../../db");
const {
  updateSpreadsheet,
  createSpreadsheetVersion,
  syncSpreadsheetAssignments,
} = require("../../services/spreadsheets/spreadsheetService");
const {
  AppError,
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");
const { createEmptyWorkbookData } = require("../../utils/univerWorkbookHelper");

const MAX_NAME_LENGTH = 255;
const DEVELOPER_ADMIN_ROLE = "developer_admin";

function isDeveloperAdmin(roleNameRaw) {
  const normalized = String(roleNameRaw || "").toLowerCase().trim();
  if (normalized === DEVELOPER_ADMIN_ROLE) return true;

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.includes("developer") && tokens.includes("admin");
}

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
  const { workbook_data } = body;

  if (workbook_data === undefined || workbook_data === null) {
    throw new BadRequestError("workbook_data is required");
  }

  if (typeof workbook_data !== "object" || Array.isArray(workbook_data)) {
    throw new BadRequestError("workbook_data must be an object");
  }

  return { workbook_data };
}

/**
 * GET /api/spreadsheets
 */
exports.getAll = async (req, res, next) => {
  try {
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const spreadsheets = await Spreadsheet.findAll(req.user.id, isDevAdmin);
    const assignmentMap = await Spreadsheet.getAssignedUserIdsMap(
      spreadsheets.map((sheet) => sheet.id)
    );

    res.json({
      success: true,
      data: spreadsheets.map((sheet) => ({
        ...sheet,
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

    const spreadsheet = await Spreadsheet.findById(id);
    if (!spreadsheet) {
      throw new NotFoundError("Spreadsheet not found");
    }
    const assignedUserIds = await Spreadsheet.getAssignedUserIds(id);
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const canAccess =
      isDevAdmin ||
      Number(spreadsheet.created_by) === Number(req.user.id) ||
      assignedUserIds.includes(Number(req.user.id));

    if (!canAccess) {
      throw new NotFoundError("Spreadsheet not found");
    }

    res.json({
      success: true,
      data: {
        id: spreadsheet.id,
        name: spreadsheet.name,
        description: spreadsheet.description,
        workbook_data: spreadsheet.workbook_data,
        version: spreadsheet.current_version,
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

    const { workbook_data } = validateSavePayload(req.body);
    const { id: userId } = req.user;

    const spreadsheet = await Spreadsheet.findById(id, trx);
    if (!spreadsheet) {
      throw new NotFoundError("Spreadsheet not found");
    }
    const assignedUserIds = await Spreadsheet.getAssignedUserIds(id, trx);
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const canAccess =
      isDevAdmin ||
      Number(spreadsheet.created_by) === Number(userId) ||
      assignedUserIds.includes(Number(userId));
    if (!canAccess) {
      throw new NotFoundError("Spreadsheet not found");
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

    const spreadsheet = await Spreadsheet.findById(id);
    if (!spreadsheet) {
      throw new NotFoundError("Spreadsheet not found");
    }
    const existingAssignments = await Spreadsheet.getAssignedUserIds(id);
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const isCreator = Number(spreadsheet.created_by) === Number(userId);
    const canAccess =
      isDevAdmin || isCreator || existingAssignments.includes(Number(userId));
    if (!canAccess) {
      throw new NotFoundError("Spreadsheet not found");
    }
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

    const spreadsheet = await Spreadsheet.findById(id);
    if (!spreadsheet) {
      throw new NotFoundError("Spreadsheet not found");
    }
    const assignedUserIds = await Spreadsheet.getAssignedUserIds(id);
    const isDevAdmin = isDeveloperAdmin(req.user?.role_name);
    const canAccess =
      isDevAdmin ||
      Number(spreadsheet.created_by) === Number(req.user.id) ||
      assignedUserIds.includes(Number(req.user.id));
    if (!canAccess) {
      throw new NotFoundError("Spreadsheet not found");
    }

    await Spreadsheet.softDelete(id, req.user.id);

    res.status(204).json({
      success: true,
      message: "Spreadsheet deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};
