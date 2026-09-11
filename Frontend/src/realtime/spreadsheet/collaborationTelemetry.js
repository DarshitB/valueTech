import { getSpreadsheetCollaborationConfig } from "./collaborationConfig";

const counters = new Map();
const TELEMETRY_EVENT_NAME = "spreadsheet:collaboration-telemetry";

/**
 * Record protocol metadata only. Cell values, formulas, and command parameters
 * must never be passed to this function.
 */
export function recordSpreadsheetCollaborationEvent(
  eventName,
  metadata = {}
) {
  if (!getSpreadsheetCollaborationConfig().telemetryEnabled) {
    return;
  }

  counters.set(eventName, (counters.get(eventName) || 0) + 1);

  const protocol =
    typeof metadata.protocol === "string" && metadata.protocol.trim()
      ? metadata.protocol.trim()
      : getSpreadsheetCollaborationConfig().activeProtocol;
  const { protocol: _ignoredProtocol, ...rest } = metadata;

  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(
      new CustomEvent(TELEMETRY_EVENT_NAME, {
        detail: {
          event: eventName,
          protocol,
          ...rest,
        },
      })
    );
  }
}

export function getSpreadsheetCollaborationCounters() {
  return Object.fromEntries(counters);
}

export function resetSpreadsheetCollaborationCounters() {
  counters.clear();
}

export { TELEMETRY_EVENT_NAME };
