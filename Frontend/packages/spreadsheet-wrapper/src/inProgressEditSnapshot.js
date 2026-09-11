function cloneValue(value) {
  if (value == null) {
    return value;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function isRichTextBody(body) {
  const {
    textRuns = [],
    paragraphs = [],
    customRanges = [],
    customBlocks = [],
  } = body;
  const textWithoutFinalLineBreak = String(body.dataStream || "").replace(
    /(\r\n)+$/,
    ""
  );

  return (
    textRuns
      .filter((textRun) => textRun.st < textWithoutFinalLineBreak.length)
      .some((textRun) => {
        const style = textRun.ts || {};
        return (
          Object.keys(style).includes("va") ||
          (Object.keys(style).length > 0 &&
            textRun.ed - textRun.st < textWithoutFinalLineBreak.length)
        );
      }) ||
    paragraphs.some((paragraph) => paragraph.bullet) ||
    paragraphs.length >= 2 ||
    customRanges.length > 0 ||
    customBlocks.length > 0
  );
}

function buildDraftCellData(existingCell, documentData) {
  const cell = { ...(existingCell || {}) };
  const document = cloneValue(documentData);
  const body = document?.body;

  if (!body || typeof body.dataStream !== "string") {
    return null;
  }

  const dataStream = body.dataStream.endsWith("\r\n")
    ? body.dataStream.slice(0, -2)
    : body.dataStream;

  delete cell.t;

  if (document.drawingsOrder?.length) {
    cell.v = "";
    cell.f = null;
    cell.si = null;
    cell.p = document;
    cell.t = 1;
  } else if (dataStream.startsWith("=")) {
    cell.f = dataStream;
    cell.si = null;
    cell.v = null;
    cell.p = null;
  } else if (dataStream.startsWith("'")) {
    cell.v = dataStream.slice(1);
    cell.f = null;
    cell.si = null;
    cell.p = null;
    cell.t = 4;
  } else if (isRichTextBody(body) && body.dataStream !== "\r\n") {
    cell.p = document;
    cell.v = null;
    cell.f = null;
    cell.si = null;
  } else {
    cell.v = dataStream;
    cell.f = null;
    cell.si = null;
    cell.p = null;
  }

  return cell;
}

export { buildDraftCellData };

export function buildCommittedSetRangeValuesParams(edit, unitId) {
  if (
    !edit?.sheetId ||
    !Number.isInteger(edit.row) ||
    !Number.isInteger(edit.column) ||
    !edit.documentData
  ) {
    return null;
  }

  const cell = buildDraftCellData({}, edit.documentData);
  if (!cell) {
    return null;
  }

  return {
    unitId: unitId || undefined,
    subUnitId: edit.sheetId,
    range: {
      startRow: edit.row,
      startColumn: edit.column,
      endRow: edit.row,
      endColumn: edit.column,
    },
    cellValue: {
      [edit.row]: {
        [edit.column]: cell,
      },
    },
  };
}

/**
 * Overlay the uncommitted editor value onto a persistence-only workbook copy.
 * The live Univer workbook and its selection/editing state are never mutated.
 */
export function overlayInProgressEdit(snapshot, edit) {
  if (
    !snapshot ||
    !edit?.sheetId ||
    !Number.isInteger(edit.row) ||
    !Number.isInteger(edit.column) ||
    !edit.documentData
  ) {
    return snapshot;
  }

  const sheet = snapshot.sheets?.[edit.sheetId];
  if (!sheet) {
    return snapshot;
  }

  sheet.cellData ||= {};
  sheet.cellData[edit.row] ||= {};

  const draftCell = buildDraftCellData(
    sheet.cellData[edit.row][edit.column],
    edit.documentData
  );

  if (draftCell) {
    sheet.cellData[edit.row][edit.column] = draftCell;
  }

  return snapshot;
}
