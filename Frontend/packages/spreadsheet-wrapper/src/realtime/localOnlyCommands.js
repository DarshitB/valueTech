/**
 * Univer commands that must stay local to the current user.
 * Zoom is a viewport preference (Google Sheets behavior), not shared workbook state.
 */
export const LOCAL_ONLY_REALTIME_COMMAND_IDS = new Set([
  "sheet.operation.set-zoom-ratio",
  "sheet.command.change-zoom-ratio",
  "sheet.command.set-zoom-ratio",
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
