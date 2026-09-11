/**
 * Univer commands that must stay local to the current user.
 * Zoom and scroll are viewport preferences (Google Sheets behavior), not shared
 * workbook state. Relaying them moved a peer's screen when they had done nothing.
 * Find-dialog operations are local UI only — replace still syncs via workbook mutations.
 * Hyperlink popups/panels are local UI only — adding/removing a link still syncs.
 * Formula calculation results are local — each client computes them. Relaying
 * those writes sent value-only cells and stripped peer formulas.
 * Active worksheet is a local viewport (Google Sheets behavior). Relaying
 * set-worksheet-active jumped every collaborator to a sheet they did not open,
 * including when someone clicked + to add a sheet.
 */
export const LOCAL_ONLY_REALTIME_COMMAND_IDS = new Set([
  "sheet.operation.set-zoom-ratio",
  "sheet.command.change-zoom-ratio",
  "sheet.command.set-zoom-ratio",
  "sheet.operation.set-scroll",
  "sheet.command.set-scroll-relative",
  "sheet.command.scroll-view",
  "sheet.command.scroll-to-cell",
  "sheet.command.scroll-view-reset",
  "sheet.operation.scroll-to-range",
  "sheet.operation.scroll-to-cell",
  "sheet.operation.set-worksheet-active",
  "ui.operation.open-find-dialog",
  "ui.operation.open-replace-dialog",
  "ui.operation.go-to-next-match",
  "ui.operation.go-to-previous-match",
  "sheet.operation.open-hyper-link-edit-panel",
  "sheet.operation.close-hyper-link-popup",
  "sheet.operation.insert-hyper-link",
  "sheet.operation.insert-hyper-link-toolbar",
  "formula.mutation.set-formula-calculation-result",
  "formula.mutation.set-formula-calculation-notification",
  "formula.mutation.set-trigger-formula-calculation-start",
]);

const UNDO_REDO_COMMAND_IDS = new Set([
  "univer.command.undo",
  "univer.command.redo",
]);

/**
 * @param {unknown} commandId
 * @returns {boolean}
 */
export function isUndoRedoRealtimeCommand(commandId) {
  return UNDO_REDO_COMMAND_IDS.has(String(commandId ?? "").trim());
}

/**
 * @param {unknown} commandId
 * @returns {boolean}
 */
export function isLocalOnlyRealtimeCommand(commandId) {
  const normalized = String(commandId ?? "").trim();
  if (!normalized) {
    return false;
  }

  return LOCAL_ONLY_REALTIME_COMMAND_IDS.has(normalized);
}

/**
 * When safe-undo is on, stack undo/redo must never be relayed. Local undo still
 * runs and publishes the inverse mutations (set-range-values, etc.).
 *
 * @param {unknown} commandId
 * @param {{ safeUndoEnabled?: boolean }} [options]
 * @returns {boolean}
 */
export function shouldKeepRealtimeCommandLocal(commandId, options = {}) {
  if (isLocalOnlyRealtimeCommand(commandId)) {
    return true;
  }
  if (options.safeUndoEnabled && isUndoRedoRealtimeCommand(commandId)) {
    return true;
  }
  return false;
}

const PRESERVE_ACTIVE_WORKSHEET_COMMAND_IDS = new Set([
  "sheet.command.insert-sheet",
  "sheet.mutation.insert-sheet",
  "sheet.command.copy-sheet",
]);

export function shouldPreserveActiveWorksheetOnRemoteCommand(commandId) {
  return PRESERVE_ACTIVE_WORKSHEET_COMMAND_IDS.has(
    String(commandId ?? "").trim()
  );
}

/**
 * Univer marks formula-engine writes as local. Relaying them overwrites the
 * peer cell with the displayed result and deletes `f` (the = formula).
 *
 * @param {{ id?: unknown, options?: { onlyLocal?: boolean, fromFormula?: boolean, applyFormulaCalculationResult?: boolean } }} event
 * @returns {boolean}
 */
export function isLocalFormulaResultRelay(event) {
  const options = event?.options;
  if (
    options?.onlyLocal === true ||
    options?.fromFormula === true ||
    options?.applyFormulaCalculationResult === true
  ) {
    return true;
  }

  const commandId = String(event?.id ?? "").trim();
  if (!commandId) {
    return false;
  }

  return (
    commandId === "formula.mutation.set-formula-calculation-result" ||
    commandId === "formula.mutation.set-formula-calculation-notification" ||
    commandId.startsWith("formula.mutation.set-formula-calculation")
  );
}
