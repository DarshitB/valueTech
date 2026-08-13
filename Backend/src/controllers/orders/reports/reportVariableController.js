const {
  BadRequestError,
  NotFoundError,
} = require("../../../utils/customErrors");
const ReportVariable = require("../../../models/orders/reports/reportVariable");
const OrderStatusHistory = require("../../../models/orders/orderStatusHistory");

const VARIABLE_NAME_REGEX = /^[A-Za-z0-9]+$/;

function normalizeReportType(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeKeyName(raw) {
  return String(raw || "").trim();
}

function parseOrderId(raw) {
  const orderId = Number(raw);
  if (!orderId || Number.isNaN(orderId)) return null;
  return orderId;
}

async function logVariableActivity({ orderId, userId, activityExtra }) {
  if (!orderId || !userId || !activityExtra) return;
  try {
    await OrderStatusHistory.createStatusHistory({
      order_id: orderId,
      changed_by: userId,
      changed_at: new Date(),
      activity_extra: activityExtra,
    });
  } catch (statusHistoryError) {
    console.error("Error logging report variable activity:", statusHistoryError);
  }
}

exports.getVariableDefinitions = async (req, res, next) => {
  try {
    const reportType = normalizeReportType(req.params.report_type || req.query.report_type);
    if (!reportType) {
      throw new BadRequestError("report_type is required");
    }

    const data = await ReportVariable.getActiveDefinitionsByReportType(reportType);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.createVariableDefinition = async (req, res, next) => {
  try {
    const reportType = normalizeReportType(req.body?.report_type);
    const keyName = normalizeKeyName(req.body?.key_name);
    const orderId = parseOrderId(req.body?.order_id);

    if (!reportType) {
      throw new BadRequestError("report_type is required");
    }
    if (!keyName) {
      throw new BadRequestError("Variable name is required");
    }
    if (!VARIABLE_NAME_REGEX.test(keyName)) {
      throw new BadRequestError(
        "Variable name can contain only letters and numbers (no spaces/special characters)"
      );
    }

    const existing = await ReportVariable.findByReportTypeAndKeyName(
      reportType,
      keyName
    );
    if (existing) {
      if (existing.deleted_at || existing.is_active === false) {
        return res.status(409).json({
          success: false,
          code: "VARIABLE_SOFT_DELETED",
          message: "Variable already exists for this report type",
          data: {
            variable_id: existing.id,
            key_name: existing.key_name,
            report_type: existing.report_type,
          },
        });
      }
      return next(
        new BadRequestError("Variable already exists for this report type")
      );
    }

    const created = await ReportVariable.createDefinition({
      reportType,
      keyName,
      userId: req.user.id,
    });

    await logVariableActivity({
      orderId,
      userId: req.user.id,
      activityExtra: `Report variable created: @${keyName}`,
    });

    return res.status(201).json({
      success: true,
      message: "Variable created",
      data: created,
    });
  } catch (err) {
    if (String(err?.code) === "23505") {
      return next(new BadRequestError("Variable already exists for this report type"));
    }
    next(err);
  }
};

exports.reactivateVariableDefinition = async (req, res, next) => {
  try {
    const reportType = normalizeReportType(req.body?.report_type);
    const keyName = normalizeKeyName(req.body?.key_name);
    const orderId = parseOrderId(req.body?.order_id);
    const variableId = Number(req.body?.variable_id);

    if (!reportType) {
      throw new BadRequestError("report_type is required");
    }
    if (!keyName && (!variableId || Number.isNaN(variableId))) {
      throw new BadRequestError("Variable name or variable_id is required");
    }

    let existing = null;
    if (variableId && !Number.isNaN(variableId)) {
      existing = await ReportVariable.findById(variableId);
    }
    if (!existing && keyName) {
      existing = await ReportVariable.findByReportTypeAndKeyName(
        reportType,
        keyName
      );
    }

    if (!existing) {
      throw new NotFoundError("Removed variable not found");
    }
    if (
      normalizeReportType(existing.report_type) !== reportType
    ) {
      throw new BadRequestError("Variable does not belong to this report type");
    }
    if (!existing.deleted_at && existing.is_active !== false) {
      throw new BadRequestError("Variable is already active");
    }
    if (keyName && normalizeKeyName(existing.key_name) !== keyName) {
      throw new BadRequestError(
        "Variable name does not match the removed variable"
      );
    }

    const reactivated = await ReportVariable.reactivateDefinition({
      id: existing.id,
      userId: req.user.id,
    });
    if (!reactivated) {
      throw new NotFoundError("Removed variable not found");
    }

    const activeKey = normalizeKeyName(reactivated.key_name) || keyName;
    await logVariableActivity({
      orderId,
      userId: req.user.id,
      activityExtra: `Report variable activated: @${activeKey}`,
    });

    return res.json({
      success: true,
      message: "Variable activated",
      data: reactivated,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteVariableDefinition = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const orderId = parseOrderId(req.body?.order_id ?? req.query?.order_id);
    if (!id || Number.isNaN(id)) {
      throw new BadRequestError("Valid variable id is required");
    }

    const deleted = await ReportVariable.softDeleteDefinition({
      id,
      userId: req.user.id,
    });
    if (!deleted) {
      throw new NotFoundError("Variable not found");
    }

    const keyName = normalizeKeyName(deleted.key_name) || `id:${id}`;
    await logVariableActivity({
      orderId,
      userId: req.user.id,
      activityExtra: `Report variable removed: @${keyName}`,
    });

    return res.json({
      success: true,
      message: "Variable deleted",
      data: deleted,
    });
  } catch (err) {
    next(err);
  }
};

