const logger = require("../utils/logger");
const {
  getSpreadsheetCollaborationConfig,
} = require("../config/spreadsheetCollaboration");

const counters = new Map();

function incrementCounter(eventName) {
  counters.set(eventName, (counters.get(eventName) || 0) + 1);
}

/**
 * Record protocol metadata only. Workbook values and command parameters are
 * intentionally excluded to avoid placing spreadsheet content in logs.
 */
function recordSpreadsheetCollaborationEvent(eventName, metadata = {}) {
  if (!getSpreadsheetCollaborationConfig().telemetryEnabled) {
    return;
  }

  incrementCounter(eventName);
  const protocol =
    typeof metadata.protocol === "string" && metadata.protocol.trim()
      ? metadata.protocol.trim()
      : getSpreadsheetCollaborationConfig().activeProtocol;
  const { protocol: _ignoredProtocol, ...rest } = metadata;
  logger.info(
    `[SpreadsheetCollaboration] ${JSON.stringify({
      event: eventName,
      protocol,
      ...rest,
    })}`
  );
}

function getSpreadsheetCollaborationCounters() {
  return Object.fromEntries(counters);
}

function resetSpreadsheetCollaborationCounters() {
  counters.clear();
}

module.exports = {
  getSpreadsheetCollaborationCounters,
  recordSpreadsheetCollaborationEvent,
  resetSpreadsheetCollaborationCounters,
};
