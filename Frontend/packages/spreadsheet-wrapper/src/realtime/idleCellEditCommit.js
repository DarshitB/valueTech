import { DeviceInputEventType } from "@univerjs/engine-render";

export const IDLE_CELL_EDIT_COMMIT_MS = 120_000;
export const SET_CELL_EDIT_VISIBLE_OPERATION_ID =
  "sheet.operation.set-cell-edit-visible";

/**
 * Commit the open cell editor and leave edit mode without moving selection.
 * Univer moves the cell when keycode is Enter/Tab; omitting keycode keeps
 * the same cell selected after submit.
 */
export function commitOpenCellEditStaySelected(univerAPI) {
  const workbook = univerAPI?.getActiveWorkbook?.();
  if (
    !workbook?.isCellEditing?.() ||
    typeof univerAPI?.executeCommand !== "function"
  ) {
    return false;
  }

  const unitId =
    (typeof workbook.getUnitId === "function" && workbook.getUnitId()) ||
    (typeof workbook.getId === "function" && workbook.getId()) ||
    "";
  if (!unitId) {
    return false;
  }

  return Boolean(
    univerAPI.executeCommand(SET_CELL_EDIT_VISIBLE_OPERATION_ID, {
      visible: false,
      eventType: DeviceInputEventType.PointerUp,
      unitId,
    })
  );
}

/**
 * After idleMs with no typing, commit the open cell editor
 * (keep typed text, leave edit mode, stay on the same selection).
 */
export function createIdleCellEditCommitController({
  onIdleCommit,
  idleMs = IDLE_CELL_EDIT_COMMIT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let timerId = 0;
  let disposed = false;

  const clear = () => {
    if (timerId) {
      clearTimeoutFn(timerId);
      timerId = 0;
    }
  };

  const bump = () => {
    if (disposed || typeof onIdleCommit !== "function") {
      return;
    }

    clear();
    timerId = setTimeoutFn(() => {
      timerId = 0;
      if (disposed) {
        return;
      }
      onIdleCommit();
    }, idleMs);
  };

  return {
    bump,
    clear,
    dispose() {
      disposed = true;
      clear();
    },
  };
}
