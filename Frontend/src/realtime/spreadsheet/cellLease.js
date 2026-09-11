import { toCellAddress } from "../../../packages/spreadsheet-wrapper/src/cellAddress";

export const DEFAULT_CELL_LEASE_TTL_MS = 20_000;

export function cellLeaseKey(worksheetId, row, column) {
  return `${String(worksheetId)}:${row}:${column}`;
}

export function isSameLeaseLocation(left, right) {
  return Boolean(
    left &&
      right &&
      left.worksheetId === right.worksheetId &&
      left.row === right.row &&
      left.column === right.column
  );
}

export function isLeaseExpired(lease, now = Date.now()) {
  const expiresAt = Number(lease?.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= now;
}

export function isRemoteLeaseBlocking(
  leasesByKey,
  location,
  currentUserId,
  now = Date.now()
) {
  if (
    !location?.worksheetId ||
    !Number.isInteger(location.row) ||
    !Number.isInteger(location.column)
  ) {
    return false;
  }

  const lease = leasesByKey.get(
    cellLeaseKey(location.worksheetId, location.row, location.column)
  );
  if (!lease || isLeaseExpired(lease, now)) return false;
  if (currentUserId == null) return true;
  return String(lease.userId) !== String(currentUserId);
}

function readErrorLocation(payload = {}) {
  const worksheetId =
    typeof payload.worksheet_id === "string"
      ? payload.worksheet_id
      : typeof payload.worksheetId === "string"
        ? payload.worksheetId
        : null;
  const row = payload.row;
  const column = payload.column;
  if (
    typeof worksheetId !== "string" ||
    worksheetId.trim().length === 0 ||
    !Number.isInteger(row) ||
    !Number.isInteger(column)
  ) {
    return null;
  }
  return {
    worksheetId: worksheetId.trim(),
    row,
    column,
  };
}

export function shouldAbortEditForLeaseError(payload = {}, localLease) {
  const code = String(payload.code || "");
  if (code === "WORKBOOK_LEASE_HELD") {
    return true;
  }
  if (code !== "CELL_LEASE_HELD") {
    return false;
  }
  if (payload.event === "spreadsheet:lease-release") {
    return false;
  }
  if (!localLease) {
    return false;
  }
  const errorLocation = readErrorLocation(payload);
  if (!errorLocation) {
    return false;
  }
  return isSameLeaseLocation(localLease, errorLocation);
}

export function extractDraftText(documentData) {
  const stream = documentData?.body?.dataStream;
  if (typeof stream !== "string") return "";
  return stream.replace(/\r/g, "").replace(/\n+$/, "").slice(0, 2_000);
}

export function leaseToCellAddress(lease) {
  if (!lease) return null;
  return toCellAddress(lease.row, lease.column);
}
