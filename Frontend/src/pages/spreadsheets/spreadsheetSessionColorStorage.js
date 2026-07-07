import { getSessionColorSnapshotSignature } from "./spreadsheetSessionColorRegistry";

const STORAGE_KEY_PREFIX = "spreadsheet-session-colors:";

function getStorageKey(spreadsheetId) {
  return `${STORAGE_KEY_PREFIX}${String(spreadsheetId ?? "").trim()}`;
}

/**
 * Load a persisted color snapshot for one spreadsheet tab session.
 * Corrupted storage entries return null without throwing.
 */
export function loadSessionColorSnapshot(spreadsheetId) {
  const key = getStorageKey(spreadsheetId);
  if (!key || key === STORAGE_KEY_PREFIX) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const assignments = parsed.assignments;
    if (!assignments || typeof assignments !== "object") {
      return null;
    }

    return {
      assignments,
      nextIndex:
        typeof parsed.nextIndex === "number" &&
        Number.isInteger(parsed.nextIndex) &&
        parsed.nextIndex >= 0
          ? parsed.nextIndex
          : 0,
      freeIndices: Array.isArray(parsed.freeIndices)
        ? parsed.freeIndices.filter(
            (index) => Number.isInteger(index) && index >= 0
          )
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Persist registry assignments for the current browser tab session.
 *
 * Persistence lifecycle:
 *   Writes sessionStorage only when the canonical snapshot signature changed.
 *   Returns true when a new value was stored.
 */
export function saveSessionColorSnapshot(spreadsheetId, snapshot) {
  const key = getStorageKey(spreadsheetId);
  if (!key || key === STORAGE_KEY_PREFIX || !snapshot) {
    return false;
  }

  try {
    const signature = getSessionColorSnapshotSignature(snapshot);
    const existing = sessionStorage.getItem(key);
    if (existing === signature) {
      return false;
    }

    sessionStorage.setItem(key, signature);
    return true;
  } catch {
    // sessionStorage may be unavailable; color assignment still works in memory.
    return false;
  }
}

export function clearSessionColorSnapshot(spreadsheetId) {
  const key = getStorageKey(spreadsheetId);
  if (!key || key === STORAGE_KEY_PREFIX) {
    return;
  }

  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}
