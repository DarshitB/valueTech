const User = require("../../../models/user/user");
const ReportEditLock = require("../../../models/orders/reports/reportEditLock");
const {
  BadRequestError,
  ConflictError,
} = require("../../../utils/customErrors");

const MARINE_REPORT_TYPE = "report_marine";

function resolveReportType(req) {
  return (
    req.body?.report_type ||
    req.query?.report_type ||
    MARINE_REPORT_TYPE
  );
}

function assertMarineOnly(reportType) {
  if (String(reportType).toLowerCase() !== MARINE_REPORT_TYPE) {
    throw new BadRequestError(
      "Edit lock is only supported for Marine reports (report_marine)."
    );
  }
}

function lockConflictMessage(lock) {
  const name = lock?.user_name || "Another user";
  return `${name} is already on this Marine report, so you cannot open it right now.`;
}

/**
 * GET /orders-reports/:order_id/lock?report_type=report_marine
 */
exports.getReportEditLock = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const reportType = resolveReportType(req);
    assertMarineOnly(reportType);

    const lock = await ReportEditLock.findActiveByOrderAndType(
      order_id,
      reportType
    );

    if (!lock) {
      return res.json({
        state: 1,
        locked: false,
        report_type: reportType,
      });
    }

    return res.json({
      state: 1,
      locked: true,
      report_type: reportType,
      user_id: lock.user_id,
      user_name: lock.user_name,
      locked_at: lock.locked_at,
      last_heartbeat_at: lock.last_heartbeat_at,
      expires_at: lock.expires_at,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /orders-reports/:order_id/lock
 * Body: { report_type: "report_marine" }
 */
exports.acquireReportEditLock = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const reportType = resolveReportType(req);
    assertMarineOnly(reportType);

    const user = await User.findById(req.user.id);
    const userName = user?.name || user?.email || `User #${req.user.id}`;

    const result = await ReportEditLock.acquire({
      orderId: order_id,
      reportType,
      userId: req.user.id,
      userName,
    });

    if (!result.acquired) {
      throw new ConflictError(lockConflictMessage(result.lock));
    }

    return res.json({
      state: 1,
      message: result.refreshed ? "Edit lock refreshed" : "Edit lock acquired",
      lock: {
        order_id: Number(order_id),
        report_type: reportType,
        user_id: result.lock.user_id,
        user_name: result.lock.user_name,
        locked_at: result.lock.locked_at,
        last_heartbeat_at: result.lock.last_heartbeat_at,
        expires_at: result.lock.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /orders-reports/:order_id/lock/heartbeat
 */
exports.heartbeatReportEditLock = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const reportType = resolveReportType(req);
    assertMarineOnly(reportType);

    const result = await ReportEditLock.heartbeat({
      orderId: order_id,
      reportType,
      userId: req.user.id,
    });

    if (!result.ok) {
      if (result.reason === "owned_by_other") {
        throw new ConflictError(lockConflictMessage(result.lock));
      }
      throw new ConflictError(
        "Edit lock is no longer active. Please re-open the Marine report."
      );
    }

    return res.json({
      state: 1,
      message: "Edit lock heartbeat ok",
      lock: {
        order_id: Number(order_id),
        report_type: reportType,
        user_id: result.lock.user_id,
        user_name: result.lock.user_name,
        expires_at: result.lock.expires_at,
        last_heartbeat_at: result.lock.last_heartbeat_at,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /orders-reports/:order_id/lock?report_type=report_marine
 */
exports.releaseReportEditLock = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const reportType = resolveReportType(req);
    assertMarineOnly(reportType);

    const result = await ReportEditLock.release({
      orderId: order_id,
      reportType,
      userId: req.user.id,
    });

    if (!result.released) {
      throw new ConflictError(lockConflictMessage(result.lock));
    }

    return res.json({
      state: 1,
      message: "Edit lock released",
      already_free: Boolean(result.alreadyFree),
    });
  } catch (err) {
    next(err);
  }
};
