import { useSpreadsheetRealtime } from "../realtime/spreadsheet";

/**
 * Online users for the open spreadsheet.
 * The realtime provider owns the list so a late panel mount cannot miss
 * someone who joined earlier.
 */
export function useSpreadsheetPresence() {
  const { onlineUsers } = useSpreadsheetRealtime();
  return onlineUsers;
}
