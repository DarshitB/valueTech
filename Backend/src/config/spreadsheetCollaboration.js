function readBooleanEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase()
  );
}

function readIntegerEnv(name, defaultValue, { min, max }) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isInteger(parsed)) {
    return defaultValue;
  }
  return Math.min(max, Math.max(min, parsed));
}

/**
 * When V2 is on, authoritative durable collaboration is allowed for every
 * target. Legacy allowlist fields stay empty for API compatibility.
 *
 * @param {{ durableActiveEnabled?: boolean }} config
 * @returns {boolean}
 */
function isDurableV2AllowedForTarget(config) {
  return Boolean(config?.durableActiveEnabled);
}

/**
 * Rollout is a single switch: SPREADSHEET_COLLAB_V2.
 * Missing / empty / false => V1.
 * true => durable V2 + leases + checkpoints + safe undo + offline queue.
 */
function getSpreadsheetCollaborationConfig() {
  const v2Enabled = readBooleanEnv("SPREADSHEET_COLLAB_V2", false);

  return Object.freeze({
    activeProtocol: v2Enabled ? "v2" : "v1",
    v2Enabled,
    durableShadowEnabled: v2Enabled,
    durableActiveEnabled: v2Enabled,
    cellLeasesEnabled: v2Enabled,
    checkpointsEnabled: v2Enabled,
    safeUndoEnabled: v2Enabled,
    offlineQueueEnabled: v2Enabled,
    v2SheetAllowlist: Object.freeze([]),
    v2UserAllowlist: Object.freeze([]),
    telemetryEnabled: false,
    commandRetentionDays: 7,
    replayCommandLimit: 500,
    cellLeaseTtlMs: 20_000,
    workbookLeaseTtlMs: 3_000,
  });
}

module.exports = {
  getSpreadsheetCollaborationConfig,
  isDurableV2AllowedForTarget,
  readBooleanEnv,
  readIntegerEnv,
};
