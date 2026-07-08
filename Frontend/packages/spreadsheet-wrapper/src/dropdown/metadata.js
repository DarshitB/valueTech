import { DATABASE_PROVIDER_METADATA_KEY } from "./constants.js";

export const DEBUG_DATABASE_DROPDOWN = false;

function readCustomFromCell(cell) {
  return cell?.custom ?? null;
}

/**
 * Read provider metadata directly from the worksheet cell model (not from a
 * cached Range instance). Survives save, reload, and realtime snapshots.
 */
export function getDatabaseProviderAt(worksheet, row, column) {
  if (!worksheet || typeof worksheet.getSheet !== "function") {
    return null;
  }

  const cell = worksheet.getSheet().getCell(row, column);
  const custom = readCustomFromCell(cell);
  const providerId = custom?.[DATABASE_PROVIDER_METADATA_KEY];

  return typeof providerId === "string" && providerId.trim()
    ? providerId.trim()
    : null;
}

export function getDatabaseProviderId(range) {
  if (!range || typeof range.getCustomMetaData !== "function") {
    return null;
  }

  const custom = range.getCustomMetaData();
  const providerId = custom?.[DATABASE_PROVIDER_METADATA_KEY];

  return typeof providerId === "string" && providerId.trim()
    ? providerId.trim()
    : null;
}

export function setDatabaseProviderId(range, providerId) {
  if (!range || typeof range.setCustomMetaData !== "function") {
    if (DEBUG_DATABASE_DROPDOWN) {
      console.log("[DatabaseDropdown] setDatabaseProviderId: invalid range");
    }
    return false;
  }

  const existing = range.getCustomMetaData() || {};
  range.setCustomMetaData({
    ...existing,
    [DATABASE_PROVIDER_METADATA_KEY]: providerId,
  });

  const assigned = range.getCustomMetaData();
  if (DEBUG_DATABASE_DROPDOWN) {
    console.log("Assigned Provider");
    console.log(assigned);
  }

  return true;
}

export function clearDatabaseProviderId(range) {
  if (!range || typeof range.getCustomMetaData !== "function") {
    return false;
  }

  const existing = range.getCustomMetaData();
  if (!existing?.[DATABASE_PROVIDER_METADATA_KEY]) {
    return false;
  }

  const nextCustom = { ...existing };
  delete nextCustom[DATABASE_PROVIDER_METADATA_KEY];

  if (typeof range.setCustomMetaData === "function") {
    range.setCustomMetaData(
      Object.keys(nextCustom).length > 0 ? nextCustom : {}
    );
  }

  return true;
}
