/**
 * In-memory exclusive cell leases for spreadsheet collaboration (Phase 4).
 *
 * One lease per cell. One cell lease per socket. Workbook leases briefly
 * invalidate every cell lease during structural commands.
 */

const DEFAULT_CELL_TTL_MS = 20_000;
const DEFAULT_WORKBOOK_TTL_MS = 3_000;

const cells = new Map();
const socketIndex = new Map();
const workbookLeases = new Map();
const generations = new Map();

function cellKey(spreadsheetId, worksheetId, row, column) {
  return `${spreadsheetId}:${worksheetId}:${row}:${column}`;
}

function getGeneration(spreadsheetId) {
  return generations.get(spreadsheetId) || 0;
}

function bumpGeneration(spreadsheetId) {
  const next = getGeneration(spreadsheetId) + 1;
  generations.set(spreadsheetId, next);
  return next;
}

function isExpired(lease, now) {
  return !lease || lease.expiresAt <= now;
}

function forgetSocketKey(socketId, key) {
  const owned = socketIndex.get(socketId);
  if (!owned) return;
  owned.delete(key);
  if (owned.size === 0) {
    socketIndex.delete(socketId);
  }
}

function rememberSocketKey(socketId, key) {
  if (!socketIndex.has(socketId)) {
    socketIndex.set(socketId, new Set());
  }
  socketIndex.get(socketId).add(key);
}

function clearExpiredCell(key, now) {
  const lease = cells.get(key);
  if (!lease) return null;
  if (!isExpired(lease, now)) return null;
  cells.delete(key);
  forgetSocketKey(lease.socketId, key);
  return lease;
}

function getCellLease(spreadsheetId, worksheetId, row, column, now = Date.now()) {
  const key = cellKey(spreadsheetId, worksheetId, row, column);
  const expired = clearExpiredCell(key, now);
  if (expired) return null;
  return cells.get(key) || null;
}

function getWorkbookLease(spreadsheetId, now = Date.now()) {
  const lease = workbookLeases.get(spreadsheetId);
  if (!lease) return null;
  if (isExpired(lease, now)) {
    workbookLeases.delete(spreadsheetId);
    return null;
  }
  return lease;
}

function listCellLeases(spreadsheetId, now = Date.now()) {
  const leases = [];
  for (const [key, lease] of cells.entries()) {
    if (lease.spreadsheetId !== spreadsheetId) continue;
    if (clearExpiredCell(key, now)) continue;
    leases.push(lease);
  }
  return leases;
}

function releaseKey(key, expectedSocketId = null) {
  const lease = cells.get(key);
  if (!lease) return null;
  if (expectedSocketId && lease.socketId !== expectedSocketId) {
    forgetSocketKey(expectedSocketId, key);
    return null;
  }
  cells.delete(key);
  forgetSocketKey(lease.socketId, key);
  return lease;
}

function releaseCellLeasesBySocket(socketId) {
  const owned = socketIndex.get(socketId);
  const released = [];
  if (owned) {
    for (const key of [...owned]) {
      const lease = releaseKey(key, socketId);
      if (lease) released.push(lease);
    }
  }
  return released;
}

function releaseBySocket(socketId) {
  const released = releaseCellLeasesBySocket(socketId);

  for (const [spreadsheetId, lease] of workbookLeases.entries()) {
    if (lease.socketId === socketId) {
      workbookLeases.delete(spreadsheetId);
      released.push({ ...lease, scope: "workbook", spreadsheetId });
    }
  }

  return released;
}

function acquireCellLease({
  spreadsheetId,
  worksheetId,
  row,
  column,
  userId,
  userName,
  socketId,
  ttlMs = DEFAULT_CELL_TTL_MS,
  now = Date.now(),
}) {
  const workbook = getWorkbookLease(spreadsheetId, now);
  if (workbook && workbook.socketId !== socketId) {
    return { ok: false, reason: "WORKBOOK_LEASE_HELD", lease: workbook };
  }

  const key = cellKey(spreadsheetId, worksheetId, row, column);
  clearExpiredCell(key, now);
  const existing = cells.get(key);
  if (existing && existing.socketId !== socketId) {
    if (String(existing.userId) !== String(userId)) {
      return { ok: false, reason: "CELL_LEASE_HELD", lease: existing };
    }
    forgetSocketKey(existing.socketId, key);
  }

  const previouslyHeld = releaseCellLeasesBySocket(socketId).filter(
    (lease) =>
      cellKey(lease.spreadsheetId, lease.worksheetId, lease.row, lease.column) !==
      key
  );

  const lease = {
    spreadsheetId,
    worksheetId,
    row,
    column,
    userId,
    userName,
    socketId,
    acquiredAt: existing?.acquiredAt || now,
    expiresAt: now + ttlMs,
    generation: getGeneration(spreadsheetId),
    scope: "cell",
  };
  cells.set(key, lease);
  rememberSocketKey(socketId, key);

  return { ok: true, lease, released: previouslyHeld };
}

function heartbeatCellLease({
  spreadsheetId,
  worksheetId,
  row,
  column,
  socketId,
  ttlMs = DEFAULT_CELL_TTL_MS,
  now = Date.now(),
}) {
  const lease = getCellLease(spreadsheetId, worksheetId, row, column, now);
  if (!lease) {
    return { ok: false, reason: "CELL_LEASE_EXPIRED" };
  }
  if (lease.socketId !== socketId) {
    return { ok: false, reason: "CELL_LEASE_HELD", lease };
  }
  if (lease.generation !== getGeneration(spreadsheetId)) {
    releaseKey(cellKey(spreadsheetId, worksheetId, row, column));
    return { ok: false, reason: "CELL_LEASE_EXPIRED" };
  }

  lease.expiresAt = now + ttlMs;
  return { ok: true, lease };
}

function releaseCellLease({ spreadsheetId, worksheetId, row, column, socketId }) {
  const key = cellKey(spreadsheetId, worksheetId, row, column);
  const lease = cells.get(key);
  if (!lease) return { ok: true, lease: null };
  if (lease.socketId !== socketId) {
    return { ok: false, reason: "CELL_LEASE_HELD", lease };
  }
  return { ok: true, lease: releaseKey(key) };
}

function acquireWorkbookLease({
  spreadsheetId,
  userId,
  userName,
  socketId,
  ttlMs = DEFAULT_WORKBOOK_TTL_MS,
  now = Date.now(),
}) {
  const existing = getWorkbookLease(spreadsheetId, now);
  if (existing && existing.socketId !== socketId) {
    return { ok: false, reason: "WORKBOOK_LEASE_HELD", lease: existing };
  }

  const generation = bumpGeneration(spreadsheetId);
  const invalidated = [];
  for (const [key, lease] of cells.entries()) {
    if (lease.spreadsheetId !== spreadsheetId) continue;
    cells.delete(key);
    forgetSocketKey(lease.socketId, key);
    invalidated.push(lease);
  }

  const lease = {
    spreadsheetId,
    userId,
    userName,
    socketId,
    acquiredAt: now,
    expiresAt: now + ttlMs,
    generation,
    scope: "workbook",
  };
  workbookLeases.set(spreadsheetId, lease);
  return { ok: true, lease, invalidated };
}

function releaseWorkbookLease({ spreadsheetId, socketId }) {
  const lease = workbookLeases.get(spreadsheetId);
  if (!lease) return { ok: true, lease: null };
  if (lease.socketId !== socketId) {
    return { ok: false, reason: "WORKBOOK_LEASE_HELD", lease };
  }
  workbookLeases.delete(spreadsheetId);
  return { ok: true, lease };
}

function resetForTests() {
  cells.clear();
  socketIndex.clear();
  workbookLeases.clear();
  generations.clear();
}

module.exports = {
  DEFAULT_CELL_TTL_MS,
  DEFAULT_WORKBOOK_TTL_MS,
  acquireCellLease,
  acquireWorkbookLease,
  getCellLease,
  getWorkbookLease,
  heartbeatCellLease,
  listCellLeases,
  releaseBySocket,
  releaseCellLease,
  releaseCellLeasesBySocket,
  releaseWorkbookLease,
  resetForTests,
};
