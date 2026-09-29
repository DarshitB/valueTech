const AUTO_FILL_COMMAND_ID = "sheet.command.auto-fill";
const SET_ROW_AUTO_HEIGHT_MUTATION_ID = "sheet.mutation.set-worksheet-row-auto-height";

function currentRowHeight(worksheet, row) {
  const height = worksheet?.getRowHeight?.(row);
  return typeof height === "number" && Number.isFinite(height) ? height : null;
}

function keepFilledRowsFromShrinking(univerAPI, params) {
  const rowsAutoHeightInfo = params?.rowsAutoHeightInfo;
  if (!Array.isArray(rowsAutoHeightInfo) || rowsAutoHeightInfo.length === 0) {
    return;
  }

  const workbook = univerAPI.getActiveWorkbook?.();
  const worksheet =
    workbook?.getSheetBySheetId?.(params.subUnitId) ||
    workbook?.getActiveSheet?.();
  if (!worksheet) {
    return;
  }

  const floorByRow = new Map();
  rowsAutoHeightInfo.forEach((info) => {
    if (!info || !Number.isInteger(info.row)) {
      return;
    }

    const measuredHeight = Number(info.autoHeight);
    const existingHeight = currentRowHeight(worksheet, info.row);
    const previousFloor = floorByRow.get(info.row);
    const floor = Math.max(
      existingHeight ?? 0,
      previousFloor ?? 0
    );
    if (!Number.isFinite(measuredHeight)) {
      return;
    }

    const nextHeight = Math.max(floor, measuredHeight);
    info.autoHeight = nextHeight;
    floorByRow.set(info.row, nextHeight);
  });
}

/**
 * Drag-fill may measure a cell shorter than the current row and write that
 * as the row auto height. Keep the row at least as tall as it already is.
 * Typing, paste, and manual resize do not go through the auto-fill command.
 * @param {object} univerAPI
 * @returns {() => void}
 */
export function installFillRowHeightGuard(univerAPI) {
  if (!univerAPI?.addEvent || !univerAPI?.Event?.BeforeCommandExecute) {
    return () => {};
  }

  let autoFillDepth = 0;

  const beforeDisposable = univerAPI.addEvent(
    univerAPI.Event.BeforeCommandExecute,
    (event) => {
      if (event?.id === AUTO_FILL_COMMAND_ID) {
        autoFillDepth += 1;
        return;
      }

      if (autoFillDepth === 0 || event?.id !== SET_ROW_AUTO_HEIGHT_MUTATION_ID) {
        return;
      }

      try {
        keepFilledRowsFromShrinking(univerAPI, event.params);
      } catch {
        // Never block the fill itself.
      }
    }
  );

  const afterDisposable = univerAPI.Event.CommandExecuted
    ? univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
        if (event?.id === AUTO_FILL_COMMAND_ID) {
          autoFillDepth = Math.max(0, autoFillDepth - 1);
        }
      })
    : null;

  return () => {
    beforeDisposable?.dispose?.();
    afterDisposable?.dispose?.();
  };
}
