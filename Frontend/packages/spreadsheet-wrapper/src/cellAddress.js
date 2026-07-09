/**
 * Convert a 0-based column index to Excel-style letters (0 → A, 25 → Z, 26 → AA).
 */
export function columnIndexToLetters(columnIndex) {
  let index = columnIndex;
  let letters = "";

  while (index >= 0) {
    letters = String.fromCharCode((index % 26) + 65) + letters;
    index = Math.floor(index / 26) - 1;
  }

  return letters;
}

/**
 * Convert 0-based row/column to an A1-style cell address (e.g. B4).
 */
export function toCellAddress(rowIndex, columnIndex) {
  if (
    typeof rowIndex !== "number" ||
    typeof columnIndex !== "number" ||
    rowIndex < 0 ||
    columnIndex < 0
  ) {
    return null;
  }

  return `${columnIndexToLetters(columnIndex)}${rowIndex + 1}`;
}

/**
 * Read the active worksheet id from a Univer API instance.
 */
export function getActiveSheetIdFromUniver(univerAPI) {
  const sheetId = univerAPI
    ?.getActiveWorkbook?.()
    ?.getActiveSheet?.()
    ?.getSheetId?.();

  return typeof sheetId === "string" && sheetId.trim().length > 0
    ? sheetId.trim()
    : null;
}

/**
 * Read the current active cell A1 notation from a Univer API instance.
 */
export function getActiveCellFromUniver(univerAPI) {
  const notation = univerAPI
    ?.getActiveWorkbook?.()
    ?.getActiveCell?.()
    ?.getA1Notation?.();
  return typeof notation === "string" && notation.trim().length > 0
    ? notation.trim()
    : null;
}

/**
 * Resolve the active cell address from a Univer selection event payload.
 */
export function getActiveCellAddress(params) {
  if (!params) return null;

  // CellPointerUp — row and column are authoritative on click.
  if (typeof params.row === "number" && typeof params.column === "number") {
    const fromClick = toCellAddress(params.row, params.column);
    if (fromClick) return fromClick;
  }

  const selections = params.selections;
  if (Array.isArray(selections) && selections.length > 0) {
    const range = selections[selections.length - 1];
    if (range) {
      const fromSelection = toCellAddress(range.startRow, range.startColumn);
      if (fromSelection) return fromSelection;
    }
  }

  const fromWorksheet = params.worksheet?.getActiveCell?.()?.getA1Notation?.();
  if (typeof fromWorksheet === "string" && fromWorksheet.trim().length > 0) {
    return fromWorksheet.trim();
  }

  return null;
}

/**
 * Restore the local user's active cell after a remote workbook snapshot is applied.
 */
export function restoreActiveCellSelection(worksheet, cellA1) {
  const normalized =
    typeof cellA1 === "string" && cellA1.trim().length > 0
      ? cellA1.trim()
      : null;

  if (!worksheet || !normalized || typeof worksheet.getRange !== "function") {
    return false;
  }

  try {
    const range = worksheet.getRange(normalized);
    if (!range) {
      return false;
    }

    if (typeof range.activateAsCurrentCell === "function") {
      range.activateAsCurrentCell();
      return true;
    }

    if (typeof range.activate === "function") {
      range.activate();
      return true;
    }

    if (typeof worksheet.setActiveSelection === "function") {
      worksheet.setActiveSelection(range);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
