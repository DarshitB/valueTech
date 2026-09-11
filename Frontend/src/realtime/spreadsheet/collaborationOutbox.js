import { createSpreadsheetRequestId } from "./protocolRequest";

export const MAX_OUTBOX_OPERATIONS = 500;
export const MAX_OUTBOX_BYTES = 2 * 1024 * 1024;

function storageKey(kind, userId, spreadsheetId = "") {
  return `spreadsheet-collaboration:${kind}:${String(userId)}:${String(
    spreadsheetId
  )}`;
}

function getStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function getOrCreateSpreadsheetClientId(userId, storage) {
  const target = getStorage(storage);
  const key = storageKey("client", userId);
  const existing = target?.getItem?.(key);
  if (
    typeof existing === "string" &&
    /^client:[a-zA-Z0-9._:-]{1,100}$/.test(existing)
  ) {
    return existing;
  }

  const clientId = createSpreadsheetRequestId("client");
  target?.setItem?.(key, clientId);
  return clientId;
}

export function nextSpreadsheetClientSequence(userId, storage) {
  const target = getStorage(storage);
  const key = storageKey("sequence", userId);
  const previous = Number(target?.getItem?.(key));
  const seed = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const next =
    Number.isSafeInteger(previous) && previous > 0
      ? Math.max(previous + 1, seed)
      : seed;
  target?.setItem?.(key, String(next));
  return next;
}

export function createSpreadsheetOperation(clientId) {
  return `${clientId}:op:${createSpreadsheetRequestId("operation")}`;
}

function isValidOutboxEntry(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    typeof entry.operationId === "string" &&
    entry.operationId.length <= 220 &&
    typeof entry.clientId === "string" &&
    entry.clientId.length <= 100 &&
    Number.isSafeInteger(entry.clientSequence) &&
    entry.clientSequence > 0 &&
    typeof entry.commandId === "string" &&
    entry.commandId.length > 0 &&
    entry.commandParams &&
    typeof entry.commandParams === "object" &&
    !Array.isArray(entry.commandParams)
  );
}

export function loadSpreadsheetOutbox(userId, spreadsheetId, storage) {
  const target = getStorage(storage);
  try {
    const parsed = JSON.parse(
      target?.getItem?.(storageKey("outbox", userId, spreadsheetId)) || "[]"
    );
    if (!Array.isArray(parsed) || !parsed.every(isValidOutboxEntry)) {
      return { ok: false, reason: "CORRUPT", entries: [] };
    }
    if (parsed.length > MAX_OUTBOX_OPERATIONS) {
      return { ok: false, reason: "TOO_MANY_OPERATIONS", entries: parsed };
    }
    return { ok: true, reason: null, entries: parsed };
  } catch {
    return { ok: false, reason: "CORRUPT", entries: [] };
  }
}

export function persistSpreadsheetOutbox(
  userId,
  spreadsheetId,
  entries,
  storage
) {
  if (
    !Array.isArray(entries) ||
    entries.length > MAX_OUTBOX_OPERATIONS ||
    !entries.every(isValidOutboxEntry)
  ) {
    return { ok: false, reason: "INVALID_OR_FULL" };
  }

  const serialized = JSON.stringify(entries);
  if (new TextEncoder().encode(serialized).byteLength > MAX_OUTBOX_BYTES) {
    return { ok: false, reason: "SIZE_LIMIT" };
  }

  try {
    getStorage(storage)?.setItem?.(
      storageKey("outbox", userId, spreadsheetId),
      serialized
    );
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: "STORAGE_UNAVAILABLE" };
  }
}

export function removeSpreadsheetOutbox(userId, spreadsheetId, storage) {
  try {
    getStorage(storage)?.removeItem?.(
      storageKey("outbox", userId, spreadsheetId)
    );
  } catch {
    // Best effort only; the server deduplicates restored operations.
  }
}
