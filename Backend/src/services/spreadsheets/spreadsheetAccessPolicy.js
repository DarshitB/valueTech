const { validate: isUuid } = require("uuid");

const db = require("../../../db");
const Spreadsheet = require("../../models/spreadsheets/spreadsheet");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");
const {
  AppError,
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");

function isDeveloperAdmin(roleNameRaw) {
  const normalized = String(roleNameRaw || "").toLowerCase().trim();
  if (normalized === PROTECTED_ROLE) return true;

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.includes("developer") && tokens.includes("admin");
}

function isValidSpreadsheetId(spreadsheetId) {
  return (
    typeof spreadsheetId === "string" &&
    spreadsheetId.length > 0 &&
    isUuid(spreadsheetId)
  );
}

async function roleHasPermission(
  roleId,
  permissionName,
  trx = db
) {
  if (!permissionName) return true;
  if (roleId == null) return false;

  const permission = await trx("permissions")
    .join(
      "role_permissions",
      "permissions.id",
      "role_permissions.permission_id"
    )
    .where({
      "permissions.name": permissionName,
      "role_permissions.role_id": roleId,
    })
    .whereNull("role_permissions.deleted_at")
    .first();

  return Boolean(permission);
}

/**
 * One access decision shared by REST and Socket.IO.
 * A normal user needs both spreadsheet membership and the requested role
 * permission. Developer administrators retain their existing bypass.
 */
async function evaluateSpreadsheetAccess({
  spreadsheetId,
  user,
  requiredPermission = null,
  creatorBypassesPermission = false,
  trx = db,
}) {
  if (!isValidSpreadsheetId(spreadsheetId)) {
    return {
      allowed: false,
      reason: "invalid_spreadsheet_id",
      spreadsheet: null,
      assignedUserIds: [],
    };
  }

  const spreadsheet = await Spreadsheet.findById(spreadsheetId, trx);
  if (!spreadsheet) {
    return {
      allowed: false,
      reason: "not_found",
      spreadsheet: null,
      assignedUserIds: [],
    };
  }

  if (isDeveloperAdmin(user?.role_name)) {
    return {
      allowed: true,
      reason: "developer_admin",
      spreadsheet,
      assignedUserIds: [],
    };
  }

  const userId = Number(user?.id);
  const isCreator = Number(spreadsheet.created_by) === userId;
  const assignedUserIds = isCreator
    ? []
    : await Spreadsheet.getAssignedUserIds(spreadsheetId, trx);
  const isAssigned = assignedUserIds.includes(userId);

  if (!isCreator && !isAssigned) {
    return {
      allowed: false,
      reason: "not_assigned",
      spreadsheet,
      assignedUserIds,
    };
  }

  if (isCreator && creatorBypassesPermission) {
    return {
      allowed: true,
      reason: "creator",
      spreadsheet,
      assignedUserIds,
    };
  }

  const hasPermission = await roleHasPermission(
    user?.role_id,
    requiredPermission,
    trx
  );
  if (!hasPermission) {
    return {
      allowed: false,
      reason: "missing_permission",
      spreadsheet,
      assignedUserIds,
    };
  }

  return {
    allowed: true,
    reason: isCreator ? "creator" : "assigned",
    spreadsheet,
    assignedUserIds,
  };
}

async function assertSpreadsheetAccess(options) {
  const decision = await evaluateSpreadsheetAccess(options);

  if (decision.reason === "invalid_spreadsheet_id") {
    throw new BadRequestError("Valid spreadsheet id is required");
  }
  if (decision.reason === "missing_permission") {
    throw new AppError("Forbidden: You lack this permission", 403);
  }
  if (!decision.allowed) {
    throw new NotFoundError("Spreadsheet not found");
  }

  return decision;
}

module.exports = {
  assertSpreadsheetAccess,
  evaluateSpreadsheetAccess,
  isDeveloperAdmin,
  isValidSpreadsheetId,
  roleHasPermission,
};
