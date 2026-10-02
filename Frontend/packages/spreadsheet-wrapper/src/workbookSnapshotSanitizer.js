/**
 * Zoom and other viewport-only keys that must never be persisted in workbook_data.
 * Univer stores sheet zoom on each worksheet snapshot (see IWorksheetData.zoomRatio).
 */
export const ZOOM_RELATED_SNAPSHOT_KEYS = new Set([
  "zoomRatio",
  "zoom",
  "zoomLevel",
]);

function cloneWorkbookSnapshot(workbookData) {
  if (workbookData == null) {
    return workbookData;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(workbookData);
  }

  return JSON.parse(JSON.stringify(workbookData));
}

function removeZoomKeysDeep(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => removeZoomKeysDeep(entry));
  }

  const result = {};

  Object.entries(value).forEach(([key, entryValue]) => {
    if (ZOOM_RELATED_SNAPSHOT_KEYS.has(key)) {
      return;
    }

    result[key] = removeZoomKeysDeep(entryValue);
  });

  return result;
}

const DEFAULT_COLUMN_COUNT = 20;
const DEFAULT_ROW_COUNT = 1000;

function highestNonNegativeIndex(keys) {
  let highest = -1;

  keys.forEach((key) => {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index > highest) {
      highest = index;
    }
  });

  return highest;
}

function usedColumnCount(sheet) {
  const columnData = sheet.columnData;
  let highest = highestNonNegativeIndex(
    columnData && typeof columnData === "object" ? Object.keys(columnData) : []
  );
  const cellData = sheet.cellData;

  if (cellData && typeof cellData === "object") {
    Object.values(cellData).forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      highest = Math.max(highest, highestNonNegativeIndex(Object.keys(row)));
    });
  }

  return highest + 1;
}

function usedRowCount(sheet) {
  const rowData = sheet.rowData;
  const cellData = sheet.cellData;

  return (
    Math.max(
      highestNonNegativeIndex(
        rowData && typeof rowData === "object" ? Object.keys(rowData) : []
      ),
      highestNonNegativeIndex(
        cellData && typeof cellData === "object" ? Object.keys(cellData) : []
      )
    ) + 1
  );
}

function validAxisCount(count) {
  if (typeof count === "number" && Number.isInteger(count) && count >= 1) {
    return count;
  }

  if (typeof count === "string" && /^[1-9]\d*$/.test(count)) {
    return Number(count);
  }

  return null;
}

function repairAxisCount(current, used, fallback) {
  const validCount = validAxisCount(current);
  if (validCount != null) {
    return validCount;
  }

  if (used >= 1) {
    return used;
  }

  return fallback;
}

/**
 * A column or row count below 1 makes Univer skip that axis, so the grid
 * draws blank and later clicks stop working. Repair only an invalid count.
 * A normal count is left unchanged, including when it is smaller than the
 * stored cells.
 */
function repairSheetGridBounds(sheet) {
  if (!sheet || typeof sheet !== "object") {
    return;
  }

  sheet.columnCount = repairAxisCount(
    sheet.columnCount,
    usedColumnCount(sheet),
    DEFAULT_COLUMN_COUNT
  );
  sheet.rowCount = repairAxisCount(
    sheet.rowCount,
    usedRowCount(sheet),
    DEFAULT_ROW_COUNT
  );
}

function sanitizeResourceEntry(resource) {
  if (!resource || typeof resource !== "object") {
    return resource;
  }

  if (typeof resource.data !== "string") {
    return removeZoomKeysDeep(resource);
  }

  try {
    const parsed = JSON.parse(resource.data);
    return {
      ...resource,
      data: JSON.stringify(removeZoomKeysDeep(parsed)),
    };
  } catch {
    return resource;
  }
}

/**
 * Deep-clone a workbook snapshot and remove zoom/viewport preference fields
 * before persistence, sync, or hydration from stored workbook_data.
 *
 * Does not mutate the input snapshot or the live Univer workbook instance.
 *
 * @param {object|null|undefined} workbookData
 * @returns {object|null|undefined}
 */
export function sanitizeWorkbookSnapshotForPersistence(workbookData) {
  if (workbookData == null) {
    return workbookData;
  }

  const cloned = cloneWorkbookSnapshot(workbookData);
  const sanitized = removeZoomKeysDeep(cloned);

  if (Array.isArray(sanitized.resources)) {
    sanitized.resources = sanitized.resources.map(sanitizeResourceEntry);
  }

  if (sanitized.sheets && typeof sanitized.sheets === "object") {
    Object.values(sanitized.sheets).forEach(repairSheetGridBounds);
  }

  return sanitized;
}
