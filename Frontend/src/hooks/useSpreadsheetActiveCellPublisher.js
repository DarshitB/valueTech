import { useCallback, useEffect, useRef, useState } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";

/**
 * Publish the local user's active cell through the shared realtime connection.
 * Also tracks localCell for presence UI (server does not echo active-cell to self).
 */
export function useSpreadsheetActiveCellPublisher() {
  const { socket, spreadsheetId, isRoomReady } = useSpreadsheetRealtime();
  const [localCell, setLocalCell] = useState(null);
  const localCellRef = useRef(null);
  const socketRef = useRef(socket);
  const spreadsheetIdRef = useRef(spreadsheetId);
  const isRoomReadyRef = useRef(isRoomReady);

  socketRef.current = socket;
  spreadsheetIdRef.current = spreadsheetId;
  isRoomReadyRef.current = isRoomReady;

  const emitActiveCell = useCallback((cell) => {
    const activeSocket = socketRef.current;
    const activeSpreadsheetId = spreadsheetIdRef.current;

    if (
      !isRoomReadyRef.current ||
      !activeSocket?.connected ||
      !activeSpreadsheetId ||
      !cell
    ) {
      return;
    }

    activeSocket.emit("spreadsheet:active-cell", {
      spreadsheet_id: activeSpreadsheetId,
      cell,
    });
  }, []);

  const publishActiveCell = useCallback(
    (cell) => {
      if (typeof cell !== "string" || cell.trim().length === 0) {
        return;
      }

      const nextCell = cell.trim();
      localCellRef.current = nextCell;
      setLocalCell((current) => (current === nextCell ? current : nextCell));
      emitActiveCell(nextCell);
    },
    [emitActiveCell]
  );

  // Re-emit when the room becomes ready (handles join race and reconnect).
  useEffect(() => {
    if (!isRoomReady || !localCellRef.current) {
      return;
    }

    emitActiveCell(localCellRef.current);
  }, [isRoomReady, emitActiveCell]);

  useEffect(() => {
    if (!socket || !spreadsheetId) {
      localCellRef.current = null;
      setLocalCell(null);
    }
  }, [socket, spreadsheetId]);

  return { localCell, publishActiveCell };
}
