import { IUndoRedoService } from "@univerjs/core";

export const UNDO_COMMAND_ID = "univer.command.undo";
export const REDO_COMMAND_ID = "univer.command.redo";

function getUndoRedoService(univerAPI) {
  try {
    return univerAPI?._injector?.get?.(IUndoRedoService) || null;
  } catch {
    return null;
  }
}

export function clearLocalUndoRedoStacks(univerAPI) {
  const workbook = univerAPI?.getActiveWorkbook?.();
  const unitId =
    (typeof workbook?.getUnitId === "function" && workbook.getUnitId()) ||
    (typeof workbook?.getId === "function" && workbook.getId()) ||
    "";
  if (!unitId) {
    return false;
  }

  const service = getUndoRedoService(univerAPI);
  if (typeof service?.clearUndoRedo !== "function") {
    return false;
  }

  service.clearUndoRedo(unitId);
  return true;
}

export function canLocalUndo(univerAPI) {
  const service = getUndoRedoService(univerAPI);
  return Boolean(service?.pitchTopUndoElement?.());
}

export function canLocalRedo(univerAPI) {
  const service = getUndoRedoService(univerAPI);
  return Boolean(service?.pitchTopRedoElement?.());
}

/**
 * Run Univer undo only when a local undo item exists.
 * @returns {"undone"|"blocked"|"unavailable"}
 */
export function trySafeLocalUndo(univerAPI) {
  if (!univerAPI?.executeCommand) {
    return "unavailable";
  }
  if (!canLocalUndo(univerAPI)) {
    return "blocked";
  }
  univerAPI.executeCommand(UNDO_COMMAND_ID);
  return "undone";
}

/**
 * @returns {"redone"|"blocked"|"unavailable"}
 */
export function trySafeLocalRedo(univerAPI) {
  if (!univerAPI?.executeCommand) {
    return "unavailable";
  }
  if (!canLocalRedo(univerAPI)) {
    return "blocked";
  }
  univerAPI.executeCommand(REDO_COMMAND_ID);
  return "redone";
}
