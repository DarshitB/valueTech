import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompanySpreadsheet from "@spreadsheet-wrapper";
import { useSelector } from "react-redux";
import { useSpreadsheetActiveCells } from "../../hooks/useSpreadsheetActiveCells";
import { useSpreadsheetWorkbookPublisher } from "../../hooks/useSpreadsheetWorkbookPublisher";
import { useSpreadsheetWorkbookSubscriber } from "../../hooks/useSpreadsheetWorkbookSubscriber";
import { createWorkbookSyncCoordinator } from "../../hooks/workbookSyncCoordinator";
import {
  resolveUserInitials,
} from "./spreadsheetPresenceColors";
import { useSpreadsheetSessionColors } from "./SpreadsheetSessionColorContext";

/**
 * Realtime-aware surface for the spreadsheet editor.
 * Must render inside SpreadsheetRealtimeProvider.
 *
 * Owns active-cell publish, workbook sync, and presence display.
 * Does not touch autosave.
 */
function SpreadsheetRealtimeSurface({
  spreadsheetRef,
  workbookName,
  workbookData,
  onWorkbookChange,
  onError,
  localCell,
  publishActiveCell,
}) {
  const activeCellsByUserId = useSpreadsheetActiveCells();
  const { getUserIdentity } = useSpreadsheetSessionColors();
  const currentUser = useSelector((state) => state.auth.user);
  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.name || "You";
  const [isSpreadsheetReady, setIsSpreadsheetReady] = useState(false);
  const [isApplyingRemoteWorkbook, setIsApplyingRemoteWorkbook] = useState(false);
  const isApplyingRemoteWorkbookRef = useRef(false);
  const syncCoordinatorRef = useRef(null);

  if (!syncCoordinatorRef.current) {
    syncCoordinatorRef.current = createWorkbookSyncCoordinator();
  }

  const handleApplyingRemoteWorkbookChange = useCallback((isApplying) => {
    isApplyingRemoteWorkbookRef.current = isApplying;
    setIsApplyingRemoteWorkbook(isApplying);
  }, []);

  const { publishWorkbookUpdate } = useSpreadsheetWorkbookPublisher({
    spreadsheetRef,
    isSpreadsheetReady,
    isApplyingRemoteWorkbook,
    isApplyingRemoteWorkbookRef,
    syncCoordinator: syncCoordinatorRef.current,
  });

  useSpreadsheetWorkbookSubscriber({
    spreadsheetRef,
    isSpreadsheetReady,
    isApplyingRemoteWorkbook,
    syncCoordinator: syncCoordinatorRef.current,
  });

  const presenceMarkers = useMemo(() => {
    const remoteEntries = Object.values(activeCellsByUserId).filter(
      (entry) => {
        if (!entry?.cell) return false;
        if (currentUserId == null) return true;
        return String(entry.userId) !== String(currentUserId);
      }
    );

    const normalizedLocalCell =
      typeof localCell === "string" ? localCell.trim() : "";
    const markerUsers = remoteEntries.map((entry) => ({
      userId: entry.userId,
      userName: entry.userName,
    }));

    if (currentUserId != null && normalizedLocalCell) {
      markerUsers.push({
        userId: currentUserId,
        userName: currentUserName,
      });
    }

    const initialsByUserId = resolveUserInitials(markerUsers);

    const markers = remoteEntries.map((entry) => ({
      userId: entry.userId,
      userName: entry.userName,
      cell: entry.cell,
      identity: getUserIdentity(
        entry.userId,
        entry.userName,
        initialsByUserId.get(String(entry.userId))
      ),
      isCurrentUser: false,
    }));

    if (currentUserId != null && normalizedLocalCell) {
      markers.push({
        userId: currentUserId,
        userName: currentUserName,
        cell: normalizedLocalCell,
        identity: getUserIdentity(
          currentUserId,
          currentUserName,
          initialsByUserId.get(String(currentUserId))
        ),
        isCurrentUser: true,
      });
    }

    return markers;
  }, [activeCellsByUserId, currentUserId, currentUserName, localCell, getUserIdentity]);

  const handleSpreadsheetReady = useCallback(() => {
    setIsSpreadsheetReady(true);
  }, []);

  const handleSpreadsheetError = useCallback(
    (error) => {
      setIsSpreadsheetReady(false);
      onError?.(error);
    },
    [onError]
  );

  useEffect(() => {
    setIsSpreadsheetReady(false);
  }, [workbookName, workbookData]);

  useEffect(() => {
    const spreadsheet = spreadsheetRef.current;
    if (!spreadsheet?.syncPresenceMarkers) {
      return undefined;
    }

    if (!isSpreadsheetReady) {
      spreadsheet.syncPresenceMarkers([]);
      return undefined;
    }

    spreadsheet.syncPresenceMarkers(presenceMarkers);
  }, [spreadsheetRef, isSpreadsheetReady, presenceMarkers]);

  return (
    <>
      <CompanySpreadsheet
        ref={spreadsheetRef}
        workbookName={workbookName}
        workbookData={workbookData}
        onWorkbookChange={onWorkbookChange}
        onWorkbookRealtimeChange={publishWorkbookUpdate}
        onActiveCellChange={publishActiveCell}
        onReady={handleSpreadsheetReady}
        onError={handleSpreadsheetError}
        isApplyingRemoteWorkbookRef={isApplyingRemoteWorkbookRef}
        onApplyingRemoteWorkbookChange={handleApplyingRemoteWorkbookChange}
      />
    </>
  );
}

export default SpreadsheetRealtimeSurface;
