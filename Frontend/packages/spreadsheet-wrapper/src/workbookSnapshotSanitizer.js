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

  reuseInlineStyles(sanitized);
  compactWorkbookForScale(sanitized);

  return sanitized;
}

const AUTO_HEIGHT_FALSE = 0;

/**
 * Keep a measured row height as a fixed number so scrolling does not measure
 * the row again. Borders stay on the cells that already have them. A column
 * style is never added, because that paints the border down the whole column.
 */
function compactWorkbookForScale(workbook) {
  const sheets = workbook?.sheets;
  if (!sheets || typeof sheets !== "object") {
    return;
  }

  Object.values(sheets).forEach((sheet) => {
    freezeMeasuredRowHeights(sheet);
  });
  dropUnreferencedStyles(workbook);
}

function freezeMeasuredRowHeights(sheet) {
  const rowData = sheet?.rowData;
  if (!rowData || typeof rowData !== "object") {
    return;
  }

  Object.values(rowData).forEach((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return;
    }

    const usesMeasuredHeight =
      (row.ia == null || row.ia === 1) &&
      typeof row.ah === "number" &&
      Number.isFinite(row.ah) &&
      row.ah > 0;

    if (!usesMeasuredHeight) {
      return;
    }

    row.h = row.ah;
    row.ia = AUTO_HEIGHT_FALSE;
    delete row.ah;
  });
}

function dropUnreferencedStyles(workbook) {
  const styles = workbook?.styles;
  if (!styles || typeof styles !== "object" || Array.isArray(styles)) {
    return;
  }

  const used = new Set();
  const sheets = workbook.sheets;
  if (!sheets || typeof sheets !== "object") {
    return;
  }

  Object.values(sheets).forEach((sheet) => {
    collectStyleId(used, sheet?.columnData);
    collectStyleId(used, sheet?.rowData);
    const cellData = sheet?.cellData;
    if (!cellData || typeof cellData !== "object") {
      return;
    }

    Object.values(cellData).forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      Object.values(row).forEach((cell) => {
        if (cell && typeof cell.s === "string") {
          used.add(cell.s);
        }
      });
    });
  });

  Object.keys(styles).forEach((styleId) => {
    if (!used.has(styleId)) {
      delete styles[styleId];
    }
  });
}

function collectStyleId(used, axisData) {
  if (!axisData || typeof axisData !== "object") {
    return;
  }

  Object.values(axisData).forEach((entry) => {
    if (entry && typeof entry.s === "string") {
      used.add(entry.s);
    }
  });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function nextReusedStyleId(styles) {
  let index = 1;
  let id = `rs${index}`;

  while (Object.prototype.hasOwnProperty.call(styles, id)) {
    index += 1;
    id = `rs${index}`;
  }

  return id;
}

/**
 * Cells sometimes store a full style object in `s` even when that same style
 * already exists in workbook.styles. Point those cells at the existing id.
 * Existing style ids are never renamed or removed, and cell values are not read.
 */
function reuseInlineStyles(workbook) {
  const sheets = workbook?.sheets;
  if (!sheets || typeof sheets !== "object") {
    return;
  }

  const stylesAreObject =
    workbook.styles &&
    typeof workbook.styles === "object" &&
    !Array.isArray(workbook.styles);
  let styles = stylesAreObject ? workbook.styles : null;
  const styleIdBySignature = new Map();

  if (styles) {
    Object.entries(styles).forEach(([id, style]) => {
      if (!style || typeof style !== "object" || Array.isArray(style)) {
        return;
      }

      const signature = stableStringify(style);
      if (!styleIdBySignature.has(signature)) {
        styleIdBySignature.set(signature, id);
      }
    });
  }

  const ensureStyles = () => {
    if (!styles) {
      styles = {};
      workbook.styles = styles;
    }

    return styles;
  };

  Object.values(sheets).forEach((sheet) => {
    const cellData = sheet?.cellData;
    if (!cellData || typeof cellData !== "object") {
      return;
    }

    Object.values(cellData).forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      Object.values(row).forEach((cell) => {
        if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
          return;
        }

        const style = cell.s;
        if (!style || typeof style !== "object" || Array.isArray(style)) {
          return;
        }

        const signature = stableStringify(style);
        let styleId = styleIdBySignature.get(signature);

        if (!styleId) {
          const table = ensureStyles();
          styleId = nextReusedStyleId(table);
          table[styleId] = style;
          styleIdBySignature.set(signature, styleId);
        }

        cell.s = styleId;
      });
    });
  });
}
