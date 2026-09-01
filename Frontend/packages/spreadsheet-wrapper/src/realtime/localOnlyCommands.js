/**
 * Univer commands that must stay local to the current user.
 * Zoom is a viewport preference (Google Sheets behavior), not shared workbook state.
 * Find-dialog operations are local UI only — replace still syncs via workbook mutations.
 */
export const LOCAL_ONLY_REALTIME_COMMAND_IDS = new Set([
  "sheet.operation.set-zoom-ratio",
  "sheet.command.change-zoom-ratio",
  "sheet.command.set-zoom-ratio",
  "ui.operation.open-find-dialog",
  "ui.operation.open-replace-dialog",
  "ui.operation.go-to-next-match",
  "ui.operation.go-to-previous-match",
  "ui.operation.focus-selection",
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
