import { IEditorBridgeService } from "@univerjs/sheets-ui";

function readWorksheetId(params) {
  const worksheetId =
    (typeof params?.subUnitId === "string" && params.subUnitId.trim()) ||
    (typeof params?.worksheetId === "string" && params.worksheetId.trim()) ||
    (typeof params?.sheetId === "string" && params.sheetId.trim()) ||
    "";

  return worksheetId || null;
}

function unwrapCellMatrix(cellValue) {
  if (!cellValue || typeof cellValue !== "object" || Array.isArray(cellValue)) {
    return null;
  }

  if (
    cellValue.data &&
    typeof cellValue.data === "object" &&
    !Array.isArray(cellValue.data)
  ) {
    return cellValue.data;
  }

  return cellValue;
}

function pushCell(cells, seen, worksheetId, row, column) {
  if (
    typeof worksheetId !== "string" ||
    !worksheetId ||
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0
  ) {
    return;
  }

  const key = `${worksheetId}:${row}:${column}`;
  if (seen.has(key)) return;
  seen.add(key);
  cells.push({ worksheetId, row, column });
}

function collectMatrixCells(cells, seen, worksheetId, matrix) {
  const data = unwrapCellMatrix(matrix);
  if (!data) return;

  Object.entries(data).forEach(([rowKey, columns]) => {
    const row = Number(rowKey);
    if (!Number.isInteger(row) || !columns || typeof columns !== "object") {
      return;
    }

    Object.keys(columns).forEach((columnKey) => {
      pushCell(cells, seen, worksheetId, row, Number(columnKey));
    });
  });
}

function collectRangeCells(cells, seen, worksheetId, range) {
  if (!range || typeof range !== "object") return;

  const startRow = range.startRow;
  const startColumn = range.startColumn;
  const endRow = Number.isInteger(range.endRow) ? range.endRow : startRow;
  const endColumn = Number.isInteger(range.endColumn)
    ? range.endColumn
    : startColumn;

  if (!Number.isInteger(startRow) || !Number.isInteger(startColumn)) {
    return;
  }

  const maxRow = Math.min(startRow + 20, endRow);
  const maxColumn = Math.min(startColumn + 20, endColumn);
  for (let row = startRow; row <= maxRow; row += 1) {
    for (let column = startColumn; column <= maxColumn; column += 1) {
      pushCell(cells, seen, worksheetId, row, column);
    }
  }
}

export function extractWrittenCells(commandParams) {
  if (!commandParams || typeof commandParams !== "object") {
    return [];
  }

  const cells = [];
  const seen = new Set();
  const worksheetId = readWorksheetId(commandParams);

  collectMatrixCells(cells, seen, worksheetId, commandParams.cellValue);
  if (cells.length === 0) {
    collectMatrixCells(cells, seen, worksheetId, commandParams.value);
  }

  if (cells.length > 0) {
    return cells;
  }

  if (
    Number.isInteger(commandParams.row) &&
    Number.isInteger(commandParams.column)
  ) {
    pushCell(
      cells,
      seen,
      worksheetId,
      commandParams.row,
      commandParams.column
    );
    return cells;
  }

  collectRangeCells(cells, seen, worksheetId, commandParams.range);
  if (Array.isArray(commandParams.ranges)) {
    commandParams.ranges.forEach((range) => {
      collectRangeCells(cells, seen, worksheetId, range);
    });
  }

  return cells;
}

export function remoteCommandTouchesLocalEdit(commandParams, localEdit) {
  if (
    !localEdit?.worksheetId ||
    !Number.isInteger(localEdit.row) ||
    !Number.isInteger(localEdit.column)
  ) {
    return false;
  }

  return extractWrittenCells(commandParams).some(
    (cell) =>
      cell.worksheetId === localEdit.worksheetId &&
      cell.row === localEdit.row &&
      cell.column === localEdit.column
  );
}

function getEditorBridge(univerAPI) {
  try {
    return univerAPI?._injector?.get?.(IEditorBridgeService) || null;
  } catch {
    return null;
  }
}

export function readLocalEditLocation(univerAPI, inProgressEdit) {
  if (
    inProgressEdit?.sheetId &&
    Number.isInteger(inProgressEdit.row) &&
    Number.isInteger(inProgressEdit.column)
  ) {
    return {
      worksheetId: inProgressEdit.sheetId,
      row: inProgressEdit.row,
      column: inProgressEdit.column,
    };
  }

  const location = getEditorBridge(univerAPI)?.getEditLocation?.();
  if (
    location?.sheetId &&
    Number.isInteger(location.row) &&
    Number.isInteger(location.column)
  ) {
    return {
      worksheetId: location.sheetId,
      row: location.row,
      column: location.column,
    };
  }

  return null;
}

/**
 * Univer refreshes the open editor whenever a set-range-values matrix
 * contains the same row/column, even if that write is on another worksheet.
 * Skip that refresh while applying a peer command that is not this cell.
 */
export async function withSuppressedEditorRefresh(
  univerAPI,
  shouldSuppress,
  run
) {
  if (!shouldSuppress) {
    return run();
  }

  const editorBridge = getEditorBridge(univerAPI);
  const originalRefresh = editorBridge?.refreshEditCellState;
  if (typeof originalRefresh !== "function") {
    return run();
  }

  editorBridge.refreshEditCellState = () => {};
  try {
    return await run();
  } finally {
    editorBridge.refreshEditCellState = originalRefresh;
  }
}
