const STRUCTURAL_COMMAND_PATTERNS = [
  "insert-row",
  "insert-col",
  "insert-column",
  "remove-row",
  "remove-col",
  "remove-column",
  "delete-row",
  "delete-col",
  "move-range",
  "insert-sheet",
  "remove-sheet",
  "delete-sheet",
  "move-sheet",
  "copy-sheet",
];

function isStructuralRealtimeCommand(commandId) {
  const normalized = String(commandId || "").trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized === "univer.command.undo" ||
    normalized === "univer.command.redo"
  ) {
    return true;
  }
  return STRUCTURAL_COMMAND_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}

function pushCell(cells, seen, worksheetId, row, column) {
  if (
    typeof worksheetId !== "string" ||
    worksheetId.trim().length === 0 ||
    !Number.isSafeInteger(row) ||
    !Number.isSafeInteger(column) ||
    row < 0 ||
    column < 0
  ) {
    return;
  }
  const key = `${worksheetId.trim()}:${row}:${column}`;
  if (seen.has(key)) return;
  seen.add(key);
  cells.push({
    worksheetId: worksheetId.trim(),
    row,
    column,
  });
}

function collectWrittenCells(cells, seen, worksheetId, cellValue) {
  const matrix =
    cellValue &&
    typeof cellValue === "object" &&
    !Array.isArray(cellValue) &&
    cellValue.data &&
    typeof cellValue.data === "object" &&
    !Array.isArray(cellValue.data)
      ? cellValue.data
      : cellValue;

  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) {
    return;
  }

  Object.entries(matrix).forEach(([rowKey, columns]) => {
    const row = Number(rowKey);
    if (!Number.isSafeInteger(row) || !columns || typeof columns !== "object") {
      return;
    }
    Object.keys(columns).forEach((columnKey) => {
      const column = Number(columnKey);
      if (!Number.isSafeInteger(column)) return;
      pushCell(cells, seen, worksheetId, row, column);
    });
  });
}

function collectRangeCells(cells, seen, worksheetId, range) {
  if (!range || typeof range !== "object") return;
  const startRow = range.startRow;
  const startColumn = range.startColumn;
  const endRow = Number.isSafeInteger(range.endRow) ? range.endRow : startRow;
  const endColumn = Number.isSafeInteger(range.endColumn)
    ? range.endColumn
    : startColumn;
  if (!Number.isSafeInteger(startRow) || !Number.isSafeInteger(startColumn)) {
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

function extractCommandCells(commandParams) {
  if (!commandParams || typeof commandParams !== "object") {
    return [];
  }

  const cells = [];
  const seen = new Set();
  const worksheetId =
    commandParams.subUnitId ||
    commandParams.worksheetId ||
    commandParams.sheetId ||
    null;

  collectWrittenCells(
    cells,
    seen,
    worksheetId,
    commandParams.cellValue?.data || commandParams.cellValue
  );

  // Actual written cells win. A fat selection/dirty range must not treat
  // neighboring cells (E5 vs G5) as part of this edit.
  if (cells.length > 0) {
    return cells;
  }

  if (
    Number.isSafeInteger(commandParams.row) &&
    Number.isSafeInteger(commandParams.column)
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

  if (commandParams.range && typeof commandParams.range === "object") {
    collectRangeCells(cells, seen, worksheetId, commandParams.range);
  }
  if (Array.isArray(commandParams.ranges)) {
    commandParams.ranges.forEach((range) => {
      collectRangeCells(cells, seen, worksheetId, range);
    });
  }

  return cells;
}

module.exports = {
  extractCommandCells,
  isStructuralRealtimeCommand,
};
