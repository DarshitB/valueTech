/**
 * Univer commands that must stay local to the current user.
 * Zoom and scroll are viewport preferences (Google Sheets behavior), not shared
 * workbook state. Relaying them moved a peer's screen when they had done nothing.
 * Find-dialog operations are local UI only — replace still syncs via workbook mutations.
 * Hyperlink popups/panels are local UI only — adding/removing a link still syncs.
 * Formula calculation results are local — each client computes them. Relaying
 * those writes sent value-only cells and stripped peer formulas.
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
