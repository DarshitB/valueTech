function readClientBoolean(name, defaultValue = false) {
  const value = import.meta.env?.[name];

  if (value == null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase()
  );
}

/**
 * Rollout is a single client switch: REACT_APP_SPREADSHEET_COLLAB_V2.
 * Missing / empty / false => V1.
 * true => durable V2 + leases + checkpoints + safe undo + offline queue.
 */
export function getSpreadsheetCollaborationConfig() {
  const v2Enabled = readClientBoolean(
    "REACT_APP_SPREADSHEET_COLLAB_V2",
    false
  );

  return Object.freeze({
    activeProtocol: v2Enabled ? "v2" : "v1",
    v2Enabled,
    durableActiveEnabled: v2Enabled,
    cellLeasesEnabled: v2Enabled,
    checkpointsEnabled: v2Enabled,
    safeUndoEnabled: v2Enabled,
    offlineQueueEnabled: v2Enabled,
    telemetryEnabled: false,
  });
}

export { readClientBoolean };
