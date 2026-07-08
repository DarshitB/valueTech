function toAnchor(range) {
  if (!range || typeof range.getRow !== "function") {
    return null;
  }

  return {
    unitId: range.getUnitId?.() ?? null,
    sheetId: range.getSheetId?.() ?? null,
    row: range.getRow(),
    column: range.getColumn(),
  };
}

export function resolveTargetRange(univerAPI) {
  const workbook = univerAPI?.getActiveWorkbook?.();
  if (!workbook) {
    return null;
  }

  const activeCell = workbook.getActiveCell?.();
  if (activeCell) {
    return activeCell;
  }

  const activeRange = workbook.getActiveRange?.();
  if (activeRange) {
    return activeRange;
  }

  const worksheet = workbook.getActiveSheet?.();
  const selection = worksheet?.getSelection?.();
  const selectionRange = selection?.getActiveRange?.();
  if (selectionRange) {
    return selectionRange;
  }

  const selectionRanges = selection?.getActiveRangeList?.();
  if (Array.isArray(selectionRanges) && selectionRanges.length > 0) {
    return selectionRanges[0];
  }

  return null;
}

export function rangeFromAnchor(univerAPI, anchor) {
  if (!anchor || !univerAPI) {
    return null;
  }

  const workbook = univerAPI.getActiveWorkbook?.();
  if (!workbook) {
    return null;
  }

  if (anchor.unitId && workbook.getId() !== anchor.unitId) {
    return null;
  }

  const worksheet =
    (anchor.sheetId && workbook.getSheetBySheetId?.(anchor.sheetId)) ||
    workbook.getActiveSheet?.();

  if (!worksheet) {
    return null;
  }

  return worksheet.getRange(anchor.row, anchor.column);
}

export function createSelectionAnchor(univerAPI) {
  const contextMenuAnchorRef = { current: null };

  const captureAnchor = () => {
    const range = resolveTargetRange(univerAPI);
    contextMenuAnchorRef.current = toAnchor(range);
  };

  const resolveRangeForMenuAction = () => {
    const fromContextMenuAnchor = rangeFromAnchor(
      univerAPI,
      contextMenuAnchorRef.current
    );
    if (fromContextMenuAnchor) {
      return fromContextMenuAnchor;
    }

    return resolveTargetRange(univerAPI);
  };

  const handleContextMenu = () => {
    captureAnchor();
  };

  if (typeof document !== "undefined") {
    document.addEventListener("contextmenu", handleContextMenu, true);
  }

  const selectionDisposables = [];

  if (univerAPI?.addEvent && univerAPI?.Event) {
    const selectionEvents = [
      univerAPI.Event.SelectionChanged,
      univerAPI.Event.SelectionMoveEnd,
      univerAPI.Event.CellPointerUp,
    ].filter(Boolean);

    selectionEvents.forEach((eventName) => {
      selectionDisposables.push(
        univerAPI.addEvent(eventName, () => {
          captureAnchor();
        })
      );
    });
  }

  return {
    resolveRangeForMenuAction,
    dispose() {
      if (typeof document !== "undefined") {
        document.removeEventListener("contextmenu", handleContextMenu, true);
      }

      selectionDisposables.forEach((disposable) => disposable?.dispose?.());
    },
  };
}
