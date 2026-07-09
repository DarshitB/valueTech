import { useEffect, useState } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";

/**
 * Subscribe to remote active-cell updates on the shared realtime connection.
 * Returns a map of userId → { userId, userName, cell, worksheetId }.
 *
 * Does not create its own Socket.IO connection.
 * Cleared when a user leaves (server sends cell: null) or the session ends.
 */
export function useSpreadsheetActiveCells() {
  const { socket, spreadsheetId } = useSpreadsheetRealtime();
  const [activeCellsByUserId, setActiveCellsByUserId] = useState({});

  useEffect(() => {
    if (!socket || !spreadsheetId) {
      setActiveCellsByUserId({});
      return undefined;
    }

    let isActive = true;

    const handleActiveCell = (payload = {}) => {
      if (!isActive) return;
      if (payload.spreadsheet_id !== spreadsheetId) return;

      const {
        userId,
        userName,
        cell,
        worksheet_id: worksheetId,
      } = payload;
      if (userId == null) return;

      setActiveCellsByUserId((current) => {
        if (cell == null || cell === "") {
          if (!(userId in current)) return current;
          const next = { ...current };
          delete next[userId];
          return next;
        }

        return {
          ...current,
          [userId]: {
            userId,
            userName,
            cell,
            worksheetId:
              typeof worksheetId === "string" && worksheetId.trim().length > 0
                ? worksheetId.trim()
                : null,
          },
        };
      });
    };

    socket.on("spreadsheet:active-cell", handleActiveCell);

    return () => {
      isActive = false;
      socket.off("spreadsheet:active-cell", handleActiveCell);
      setActiveCellsByUserId({});
    };
  }, [socket, spreadsheetId]);

  return activeCellsByUserId;
}
