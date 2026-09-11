import { useCallback, useEffect, useRef } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import { getSpreadsheetCollaborationConfig } from "../realtime/spreadsheet/collaborationConfig";
import { createSpreadsheetRequestId } from "../realtime/spreadsheet/protocolRequest";
import {
  extractDraftText,
  isSameLeaseLocation,
  shouldAbortEditForLeaseError,
} from "../realtime/spreadsheet/cellLease";

const HEARTBEAT_MS = 8_000;
const DRAFT_THROTTLE_MS = 200;
const LEASE_DENIED_CODES = new Set(["CELL_LEASE_HELD", "WORKBOOK_LEASE_HELD"]);

function isLeaseDeniedResponse(response) {
  return (
    response?.ok === false && LEASE_DENIED_CODES.has(String(response.code || ""))
  );
}

export function useSpreadsheetCellLeasePublisher({ onLeaseDenied } = {}) {
  const { socket, spreadsheetId, isRoomReady } = useSpreadsheetRealtime();
  const enabled = getSpreadsheetCollaborationConfig().cellLeasesEnabled;
  const leaseRef = useRef(null);
  const acquiredRef = useRef(false);
  const acquireGenerationRef = useRef(0);
  const heartbeatTimerRef = useRef(0);
  const draftTimerRef = useRef(0);
  const pendingDraftRef = useRef("");
  const onLeaseDeniedRef = useRef(onLeaseDenied);
  onLeaseDeniedRef.current = onLeaseDenied;

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = 0;
    }
  }, []);

  const clearLocalLeaseState = useCallback(() => {
    stopHeartbeat();
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = 0;
    }
    leaseRef.current = null;
    acquiredRef.current = false;
    pendingDraftRef.current = "";
  }, [stopHeartbeat]);

  const denyLocalEdit = useCallback(() => {
    acquireGenerationRef.current += 1;
    clearLocalLeaseState();
    onLeaseDeniedRef.current?.();
  }, [clearLocalLeaseState]);

  const emitLease = useCallback(
    (eventName, location, extra = {}, onAck) => {
      if (
        !enabled ||
        !isRoomReady ||
        !socket?.connected ||
        !spreadsheetId ||
        !location?.worksheetId ||
        !Number.isInteger(location.row) ||
        !Number.isInteger(location.column)
      ) {
        return;
      }

      socket.emit(
        eventName,
        {
          spreadsheet_id: spreadsheetId,
          worksheet_id: location.worksheetId,
          row: location.row,
          column: location.column,
          request_id: createSpreadsheetRequestId("cell-lease"),
          ...extra,
        },
        (response) => {
          onAck?.(response);
        }
      );
    },
    [enabled, isRoomReady, socket, spreadsheetId]
  );

  const startHeartbeat = useCallback(
    (location) => {
      stopHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        emitLease("spreadsheet:lease-heartbeat", location);
      }, HEARTBEAT_MS);
    },
    [emitLease, stopHeartbeat]
  );

  const acquireCellLease = useCallback(
    (location) => {
      if (!enabled) return;
      const generation = acquireGenerationRef.current + 1;
      acquireGenerationRef.current = generation;
      stopHeartbeat();
      acquiredRef.current = false;
      leaseRef.current = location;
      emitLease("spreadsheet:lease-acquire", location, {}, (response) => {
        if (acquireGenerationRef.current !== generation) {
          if (response?.ok && !response?.disabled) {
            emitLease("spreadsheet:lease-release", location);
          }
          return;
        }

        if (isLeaseDeniedResponse(response)) {
          denyLocalEdit();
          return;
        }

        if (response?.ok === false || response?.disabled) {
          return;
        }

        acquiredRef.current = true;
        startHeartbeat(location);
      });
    },
    [denyLocalEdit, emitLease, enabled, startHeartbeat, stopHeartbeat]
  );

  const releaseCellLease = useCallback(
    (location) => {
      const target = location || leaseRef.current;
      const shouldRelease = acquiredRef.current;
      acquireGenerationRef.current += 1;
      clearLocalLeaseState();
      if (shouldRelease && target) {
        emitLease("spreadsheet:lease-release", target);
      }
    },
    [clearLocalLeaseState, emitLease]
  );

  const publishCellDraft = useCallback(
    (location, documentData) => {
      if (!enabled || !acquiredRef.current) return;
      pendingDraftRef.current = extractDraftText(documentData);
      if (draftTimerRef.current) return;
      draftTimerRef.current = window.setTimeout(() => {
        draftTimerRef.current = 0;
        emitLease("spreadsheet:draft-preview", location, {
          preview: pendingDraftRef.current,
        });
      }, DRAFT_THROTTLE_MS);
    },
    [enabled, emitLease]
  );

  useEffect(() => {
    if (!isRoomReady || !leaseRef.current || !acquiredRef.current) return;
    const location = leaseRef.current;
    emitLease("spreadsheet:lease-acquire", location, {}, (response) => {
      if (!isSameLeaseLocation(leaseRef.current, location)) {
        if (response?.ok && !response?.disabled) {
          emitLease("spreadsheet:lease-release", location);
        }
        return;
      }
      if (isLeaseDeniedResponse(response)) {
        denyLocalEdit();
        return;
      }
      if (response?.ok === false || response?.disabled) {
        return;
      }
      startHeartbeat(location);
    });
  }, [denyLocalEdit, emitLease, isRoomReady, startHeartbeat]);

  useEffect(() => {
    return () => {
      releaseCellLease();
    };
  }, [releaseCellLease]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handlePageHide = () => releaseCellLease();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [enabled, releaseCellLease]);

  useEffect(() => {
    if (!enabled || !socket) return undefined;

    const handleSpreadsheetError = (payload = {}) => {
      if (!shouldAbortEditForLeaseError(payload, leaseRef.current)) {
        return;
      }
      denyLocalEdit();
    };

    socket.on("spreadsheet:error", handleSpreadsheetError);
    return () => {
      socket.off("spreadsheet:error", handleSpreadsheetError);
    };
  }, [denyLocalEdit, enabled, socket]);

  return {
    cellLeasesEnabled: enabled,
    localLease: leaseRef,
    acquireCellLease,
    releaseCellLease,
    abandonLocalLease: denyLocalEdit,
    publishCellDraft,
  };
}
