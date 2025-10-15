const AssetMakesOfReports = require("../../models/orders/assetMakesOfReports");
const {
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");

/**
 * Get asset makes records by order type (from path parameter)
 * GET /api/asset-makes-of-reports/:order_type/order-types
 */
exports.getByOrderType = async (req, res, next) => {
  try {
    const { order_type } = req.params;

    // Validation - order_type is required
    if (!order_type) {
      throw new BadRequestError("order_type path parameter is required");
    }

    if (typeof order_type !== 'string' || order_type.trim().length === 0) {
      throw new BadRequestError("order_type must be a non-empty string");
    }

    // Get records by order type
    const records = await AssetMakesOfReports.getByOrderType(order_type.trim());

    res.json({
      success: true,
      message: `Asset makes records for ${order_type} retrieved successfully`,
      data: records,
      total: records.length,
      order_type: order_type.trim()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get asset makes record by ID
 * GET /api/asset-makes-of-reports/:id
 */
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      throw new BadRequestError("Valid ID is required");
    }

    const record = await AssetMakesOfReports.findById(id);
    if (!record) {
      throw new NotFoundError("Asset makes record not found");
    }

    res.json({
      success: true,
      message: "Asset makes record retrieved successfully",
      data: record
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new asset makes record
 * POST /api/asset-makes-of-reports
 */
exports.create = async (req, res, next) => {
  try {
    const { order_type, name } = req.body;
    const { id: userId } = req.user;

    // Validation
    if (!order_type || !name) {
      throw new BadRequestError("order_type and name are required");
    }

    if (typeof order_type !== 'string' || order_type.trim().length === 0) {
      throw new BadRequestError("order_type must be a non-empty string");
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestError("name must be a non-empty string");
    }

    // Create the record
    const recordData = {
      order_type: order_type.trim(),
      name: name.trim(),
      created_by: userId
    };

    const newRecord = await AssetMakesOfReports.create(recordData);

    // Set record ID for activity logger
    res.locals.newRecordId = newRecord.id;

    res.status(201).json({
      success: true,
      message: "Asset makes record created successfully",
      data: newRecord
    });
  } catch (error) {
    next(error);
  }
};

