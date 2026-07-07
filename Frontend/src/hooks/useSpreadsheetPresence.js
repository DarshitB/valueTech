import { useEffect, useState } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";

/**
 * Subscribe to spreadsheet presence on the shared realtime connection.
 * Returns the current online user list from the server.
 *
 * Presence only — no collaboration or workbook sync.
 * Does not create its own Socket.IO connection.
 */
export function useSpreadsheetPresence() {
  const { socket, spreadsheetId } = useSpreadsheetRealtime();
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!socket || !spreadsheetId) {
      setOnlineUsers([]);
      return undefined;
    }

    let isActive = true;

    const handlePresence = (payload = {}) => {
      if (!isActive) return;
      if (payload.spreadsheet_id !== spreadsheetId) return;

      setOnlineUsers(Array.isArray(payload.users) ? payload.users : []);
    };

    socket.on("spreadsheet:presence", handlePresence);

    return () => {
      isActive = false;
      socket.off("spreadsheet:presence", handlePresence);
      setOnlineUsers([]);
    };
  }, [socket, spreadsheetId]);

  return onlineUsers;
}
