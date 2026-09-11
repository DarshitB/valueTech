const { randomUUID } = require("crypto");
const { validate: isUuid } = require("uuid");

const ROOM_PREFIX = "spreadsheet:";
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/;
const COMMAND_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{0,254}$/;
const CELL_PATTERN = /^[A-Z]{1,4}[1-9][0-9]{0,6}$/i;

const PAYLOAD_LIMITS = Object.freeze({
  join: 2 * 1024,
  leave: 2 * 1024,
  activeCell: 4 * 1024,
  command: 256 * 1024,
  replay: 4 * 1024,
  lease: 4 * 1024,
  draftPreview: 32 * 1024,
});

const RATE_LIMITS = Object.freeze({
  join: { limit: 10, windowMs: 60_000 },
  leave: { limit: 20, windowMs: 60_000 },
  activeCell: { limit: 180, windowMs: 60_000 },
  command: { limit: 600, windowMs: 60_000 },
  replay: { limit: 30, windowMs: 60_000 },
  leaseAcquire: { limit: 60, windowMs: 60_000 },
  leaseHeartbeat: { limit: 120, windowMs: 60_000 },
  leaseRelease: { limit: 60, windowMs: 60_000 },
  draftPreview: { limit: 300, windowMs: 60_000 },
});

const LOCAL_OR_UI_ONLY_COMMAND_IDS = new Set([
  "sheet.operation.set-zoom-ratio",
  "sheet.command.change-zoom-ratio",
  "sheet.command.set-zoom-ratio",
  "sheet.operation.set-scroll",
  "sheet.command.set-scroll-relative",
  "sheet.command.scroll-view",
  "sheet.command.scroll-to-cell",
  "sheet.command.scroll-view-reset",
  "sheet.operation.scroll-to-range",
  "sheet.operation.scroll-to-cell",
  "sheet.command.copy",
  "sheet.command.cut",
  "sheet.command.select-all",
  "sheet.operation.set-selections",
  "ui.operation.open-find-dialog",
  "ui.operation.open-replace-dialog",
  "ui.operation.go-to-next-match",
  "ui.operation.go-to-previous-match",
  "sheet.operation.open-hyper-link-edit-panel",
  "sheet.operation.close-hyper-link-popup",
  "sheet.operation.insert-hyper-link",
  "sheet.operation.insert-hyper-link-toolbar",
  "formula.mutation.set-formula-calculation-result",
  "formula.mutation.set-formula-calculation-notification",
  "formula.mutation.set-trigger-formula-calculation-start",
]);

const ALLOWED_EXACT_COMMAND_IDS = new Set([
  "univer.command.undo",
  "univer.command.redo",
  "doc.command.break-line",
  "formula.command.insert-function",
  "data-validation.mutation.addRule",
  "data-validation.mutation.removeRule",
  "data-validation.mutation.updateRule",
  "sheets.command.update-data-validation-setting",
  "sheets.command.update-data-validation-options",
  "sheets.command.clear-range-data-validation",
]);

function normalizeSocketPayload(payload) {
  return payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
    ? payload
    : {};
}

function roomName(spreadsheetId) {
  return `${ROOM_PREFIX}${spreadsheetId}`;
}

function validateSpreadsheetId(spreadsheetId) {
  return (
    typeof spreadsheetId === "string" &&
    spreadsheetId.length > 0 &&
    isUuid(spreadsheetId)
  );
}

function validateRequestId(requestId) {
  return (
    requestId == null ||
    (typeof requestId === "string" &&
      REQUEST_ID_PATTERN.test(requestId.trim()))
  );
}

function validateClientId(clientId) {
  return (
    typeof clientId === "string" &&
    REQUEST_ID_PATTERN.test(clientId.trim())
  );
}

function resolveRequestId(payload = {}) {
  return validateRequestId(payload.request_id) && payload.request_id
    ? payload.request_id.trim()
    : randomUUID();
}

function validateCommandId(commandId) {
  return (
    typeof commandId === "string" &&
    COMMAND_ID_PATTERN.test(commandId.trim())
  );
}

function isUndoRedoRealtimeCommand(commandId) {
  const normalized = String(commandId || "").trim();
  return (
    normalized === "univer.command.undo" ||
    normalized === "univer.command.redo"
  );
}

/**
 * Only canonical spreadsheet commands/mutations are relayed. Viewport,
 * clipboard, selection, formula-result, and general UI operations stay local.
 * When safe-undo is on, stack undo/redo must not be relayed (inverse
 * mutations are published instead).
 */
function isAllowedRealtimeCommand(commandId, { safeUndoEnabled = false } = {}) {
  const normalized = String(commandId || "").trim();
  if (!validateCommandId(normalized)) return false;
  if (LOCAL_OR_UI_ONLY_COMMAND_IDS.has(normalized)) return false;
  if (safeUndoEnabled && isUndoRedoRealtimeCommand(normalized)) return false;
  if (ALLOWED_EXACT_COMMAND_IDS.has(normalized)) return true;

  return (
    normalized.startsWith("sheet.command.") ||
    normalized.startsWith("sheet.mutation.")
  );
}

function validateCommandParams(commandParams) {
  if (
    commandParams === null ||
    commandParams === undefined ||
    typeof commandParams !== "object" ||
    Array.isArray(commandParams)
  ) {
    return false;
  }

  const stack = [{ value: commandParams, depth: 0 }];
  let visitedNodes = 0;

  while (stack.length > 0) {
    const { value, depth } = stack.pop();
    visitedNodes += 1;
    if (visitedNodes > 20_000 || depth > 40) return false;
    if (value === null || typeof value !== "object") continue;

    for (const key of Object.keys(value)) {
      if (
        key === "__proto__" ||
        key === "prototype" ||
        key === "constructor"
      ) {
        return false;
      }
      stack.push({ value: value[key], depth: depth + 1 });
    }
  }

  return true;
}

function validateClientSequence(clientSequence) {
  return Number.isSafeInteger(clientSequence) && clientSequence > 0;
}

function validateRevision(revision, { allowNull = false } = {}) {
  if (revision == null) {
    return allowNull;
  }
  return Number.isSafeInteger(revision) && revision >= 0;
}

function validateCollaborationProtocol(protocol) {
  return protocol == null || protocol === "v1" || protocol === "v2";
}

function validateWorksheetId(worksheetId) {
  return (
    typeof worksheetId === "string" &&
    worksheetId.trim().length > 0 &&
    worksheetId.trim().length <= 128
  );
}

function validateCell(cell) {
  return typeof cell === "string" && CELL_PATTERN.test(cell.trim());
}

function validateRow(row) {
  return Number.isSafeInteger(row) && row >= 0 && row <= 1_048_575;
}

function validateColumn(column) {
  return Number.isSafeInteger(column) && column >= 0 && column <= 16_383;
}

function validateDraftPreview(preview) {
  return typeof preview === "string" && preview.length <= 8_000;
}

function getPayloadByteLength(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return Infinity;
  }
}

function isPayloadWithinLimit(payload, maxBytes) {
  return getPayloadByteLength(payload) <= maxBytes;
}

function consumeSocketRateLimit(socket, key, rule, now = Date.now()) {
  socket.data ||= {};
  socket.data.spreadsheetRateLimits ||= new Map();

  const current = socket.data.spreadsheetRateLimits.get(key);
  if (!current || now - current.startedAt >= rule.windowMs) {
    socket.data.spreadsheetRateLimits.set(key, {
      startedAt: now,
      count: 1,
    });
    return true;
  }

  current.count += 1;
  return current.count <= rule.limit;
}

function emitSpreadsheetError(
  socket,
  {
    code,
    message,
    eventName,
    requestId,
    spreadsheetId = null,
    details = null,
  },
  acknowledgement
) {
  const payload = {
    ok: false,
    code,
    message,
    event: eventName,
    request_id: requestId,
    spreadsheet_id: spreadsheetId,
    ...(details && typeof details === "object" ? details : {}),
  };

  socket.emit("spreadsheet:error", payload);
  if (typeof acknowledgement === "function") {
    acknowledgement(payload);
  }

  return payload;
}

module.exports = {
  PAYLOAD_LIMITS,
  RATE_LIMITS,
  consumeSocketRateLimit,
  emitSpreadsheetError,
  getPayloadByteLength,
  isAllowedRealtimeCommand,
  isUndoRedoRealtimeCommand,
  isPayloadWithinLimit,
  normalizeSocketPayload,
  resolveRequestId,
  roomName,
  validateCell,
  validateColumn,
  validateClientId,
  validateDraftPreview,
  validateClientSequence,
  validateCollaborationProtocol,
  validateCommandId,
  validateCommandParams,
  validateRequestId,
  validateRevision,
  validateRow,
  validateSpreadsheetId,
  validateWorksheetId,
};
