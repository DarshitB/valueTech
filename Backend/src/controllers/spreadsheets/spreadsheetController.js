const { validate: isUuid } = require("uuid");

const Spreadsheet = require("../../models/spreadsheets/spreadsheet");
const db = require("../../../db");
const {
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");
const { createEmptyWorkbookData } = require("../../utils/univerWorkbookHelper");

const MAX_NAME_LENGTH = 255;

function validateSpreadsheetId(id) {
  if (!id || typeof id !== "string" || !isUuid(id)) {
    throw new BadRequestError("Valid spreadsheet id is required");
  }
}

function validateCreatePayload(body) {
  const { name, description } = body;

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
  };
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
    const spreadsheets = await Spreadsheet.findAll();

    res.json({
      success: true,
      data: spreadsheets,
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

    const latestVersion = await Spreadsheet.findLatestVersion(id);

    res.json({
      success: true,
      data: {
        id: spreadsheet.id,
        name: spreadsheet.name,
        description: spreadsheet.description,
        workbook_data: latestVersion?.workbook_data ?? null,
        version: latestVersion?.version ?? 0,
        created_at: spreadsheet.created_at,
        updated_at: spreadsheet.updated_at,
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

    const latestVersion = await Spreadsheet.findLatestVersion(id, trx);
    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;

    await Spreadsheet.createVersion(
      {
        spreadsheet_id: id,
        version: nextVersion,
        workbook_data,
        created_by: userId,
      },
      trx
    );

    await Spreadsheet.updateAuditFields(id, userId, trx);

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
    const { name, description } = validateCreatePayload(req.body);
    const { id: userId } = req.user;

    const [spreadsheet] = await Spreadsheet.create(
      {
        name,
        description,
        created_by: userId,
        updated_by: null,
        deleted_by: null,
      },
      trx
    );

    await Spreadsheet.createVersion(
      {
        spreadsheet_id: spreadsheet.id,
        workbook_data: createEmptyWorkbookData(name),
        version: 1,
        created_by: userId,
      },
      trx
    );

    await trx.commit();

    res.status(201).json({
      success: true,
      message: "Spreadsheet created successfully.",
      data: {
        id: spreadsheet.id,
        name: spreadsheet.name,
        description: spreadsheet.description,
      },
    });
  } catch (error) {
    await trx.rollback();
    next(error);
  }
};
