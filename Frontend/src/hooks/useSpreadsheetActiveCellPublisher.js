import { useCallback, useEffect, useRef, useState } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import { createSpreadsheetRequestId } from "../realtime/spreadsheet/protocolRequest";
import { recordSpreadsheetCollaborationEvent } from "../realtime/spreadsheet/collaborationTelemetry";

/**
 * Publish the local user's active cell through the shared realtime connection.
 * Also tracks localCell/localWorksheetId for presence UI (server does not echo active-cell to self).
 */
export function useSpreadsheetActiveCellPublisher() {
  const { socket, spreadsheetId, isRoomReady } = useSpreadsheetRealtime();
  const [localCell, setLocalCell] = useState(null);
  const [localWorksheetId, setLocalWorksheetId] = useState(null);
  const localCellRef = useRef(null);
  const localWorksheetIdRef = useRef(null);
  const socketRef = useRef(socket);
  const spreadsheetIdRef = useRef(spreadsheetId);
  const isRoomReadyRef = useRef(isRoomReady);
  const clientSequenceRef = useRef(0);

  socketRef.current = socket;
  spreadsheetIdRef.current = spreadsheetId;
  isRoomReadyRef.current = isRoomReady;

  const emitActiveCell = useCallback(({ cell, worksheetId }) => {
    const activeSocket = socketRef.current;
    const activeSpreadsheetId = spreadsheetIdRef.current;

    if (
      !isRoomReadyRef.current ||
      !activeSocket?.connected ||
      !activeSpreadsheetId ||
      !cell ||
      !worksheetId
    ) {
      return;
    }

    clientSequenceRef.current += 1;
    const requestId = createSpreadsheetRequestId("active-cell");
    activeSocket.emit(
      "spreadsheet:active-cell",
      {
        spreadsheet_id: activeSpreadsheetId,
        worksheet_id: worksheetId,
        cell,
        client_sequence: clientSequenceRef.current,
        request_id: requestId,
      },
      (response) => {
        if (response?.ok === false) {
          recordSpreadsheetCollaborationEvent("active_cell_rejected", {
            spreadsheetId: activeSpreadsheetId,
            code: response.code || "UNKNOWN",
            requestId,
          });
        }
      }
    );
  }, []);

  const publishActiveCell = useCallback(
    (payload) => {
      const cell =
        typeof payload === "string" ? payload : payload?.cell ?? null;
      const worksheetId =
        typeof payload === "object" && payload != null
          ? payload.worksheetId ?? null
          : null;

      if (typeof cell !== "string" || cell.trim().length === 0) {
        return;
      }

      if (typeof worksheetId !== "string" || worksheetId.trim().length === 0) {
        return;
      }

      const nextCell = cell.trim();
      const nextWorksheetId = worksheetId.trim();

      localCellRef.current = nextCell;
      localWorksheetIdRef.current = nextWorksheetId;
      setLocalCell((current) => (current === nextCell ? current : nextCell));
      setLocalWorksheetId((current) =>
        current === nextWorksheetId ? current : nextWorksheetId
      );
      emitActiveCell({ cell: nextCell, worksheetId: nextWorksheetId });
    },
    [emitActiveCell]
  );

  // Re-emit when the room becomes ready (handles join race and reconnect).
  useEffect(() => {
    if (!isRoomReady || !localCellRef.current || !localWorksheetIdRef.current) {
      return;
    }

    emitActiveCell({
      cell: localCellRef.current,
      worksheetId: localWorksheetIdRef.current,
    });
  }, [isRoomReady, emitActiveCell]);

  useEffect(() => {
    if (!socket || !spreadsheetId) {
      clientSequenceRef.current = 0;
      localCellRef.current = null;
      localWorksheetIdRef.current = null;
      setLocalCell(null);
      setLocalWorksheetId(null);
    }
  }, [socket, spreadsheetId]);

  return { localCell, localWorksheetId, publishActiveCell };
}
