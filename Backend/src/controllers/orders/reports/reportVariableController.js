const {
  BadRequestError,
  NotFoundError,
} = require("../../../utils/customErrors");
const ReportVariable = require("../../../models/orders/reports/reportVariable");

const VARIABLE_NAME_REGEX = /^[A-Za-z0-9]+$/;

function normalizeReportType(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeKeyName(raw) {
  return String(raw || "").trim();
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

    const created = await ReportVariable.createDefinition({
      reportType,
      keyName,
      userId: req.user.id,
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

exports.deleteVariableDefinition = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
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

    return res.json({
      success: true,
      message: "Variable deleted",
      data: deleted,
    });
  } catch (err) {
    next(err);
  }
};

