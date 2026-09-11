import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompanySpreadsheet from "@spreadsheet-wrapper";
import { useSelector } from "react-redux";
import { useSpreadsheetActiveCells } from "../../hooks/useSpreadsheetActiveCells";
import { useSpreadsheetWorkbookPublisher } from "../../hooks/useSpreadsheetWorkbookPublisher";
import { useSpreadsheetWorkbookSubscriber } from "../../hooks/useSpreadsheetWorkbookSubscriber";
import { useSpreadsheetCellLeases } from "../../hooks/useSpreadsheetCellLeases";
import { useSpreadsheetCellLeasePublisher } from "../../hooks/useSpreadsheetCellLeasePublisher";
import { createWorkbookSyncCoordinator } from "../../hooks/workbookSyncCoordinator";
import {
  isLeaseExpired,
  isSameLeaseLocation,
  leaseToCellAddress,
} from "../../realtime/spreadsheet/cellLease";
import {
  resolveUserInitials,
} from "./spreadsheetPresenceColors";
import { toast } from "react-toastify";
import { useSpreadsheetSessionColors } from "./SpreadsheetSessionColorContext";
import { databaseDropdownFetchers } from "./databaseDropdownFetchers";
import {
  getSpreadsheetCollaborationConfig,
} from "../../realtime/spreadsheet/collaborationConfig";

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
  localWorksheetId,
  publishActiveCell,
  restoreInProgressEdit = null,
}) {
  const activeCellsByUserId = useSpreadsheetActiveCells();
  const { getUserIdentity } = useSpreadsheetSessionColors();
  const currentUser = useSelector((state) => state.auth.user);
  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.name || "You";
  const [isSpreadsheetReady, setIsSpreadsheetReady] = useState(false);
  const [isApplyingRemoteCommand, setIsApplyingRemoteCommand] = useState(false);
  const isApplyingRemoteCommandRef = useRef(false);
  const syncCoordinatorRef = useRef(null);

  if (!syncCoordinatorRef.current) {
    syncCoordinatorRef.current = createWorkbookSyncCoordinator();
  }

  const handleApplyingRemoteCommandChange = useCallback((isApplying) => {
    isApplyingRemoteCommandRef.current = isApplying;
    setIsApplyingRemoteCommand(isApplying);
  }, []);

  const { publishWorkbookUpdate } = useSpreadsheetWorkbookPublisher({
    isSpreadsheetReady,
    isApplyingRemoteCommand,
    isApplyingRemoteCommandRef,
    syncCoordinator: syncCoordinatorRef.current,
  });

  useSpreadsheetWorkbookSubscriber({
    spreadsheetRef,
    isSpreadsheetReady,
    isApplyingRemoteCommand,
    syncCoordinator: syncCoordinatorRef.current,
  });

  const { leasesByKey, isCellEditBlocked } = useSpreadsheetCellLeases();
  const notifyCellLeaseHeld = useCallback(() => {
    toast.info("This cell is being edited by someone else.", {
      toastId: "spreadsheet-cell-lease-held",
    });
  }, []);

  const {
    acquireCellLease,
    releaseCellLease,
    publishCellDraft,
    localLease,
    abandonLocalLease,
  } = useSpreadsheetCellLeasePublisher({
    onLeaseDenied: () => {
      notifyCellLeaseHeld();
      spreadsheetRef.current?.abortCellEditing?.();
    },
  });

  const handleIsCellEditBlocked = useCallback(
    (location) => {
      const blocked = isCellEditBlocked({
        ...location,
        currentUserId,
      });
      if (blocked) {
        notifyCellLeaseHeld();
      }
      return blocked;
    },
    [isCellEditBlocked, currentUserId, notifyCellLeaseHeld]
  );

  useEffect(() => {
    const local = localLease?.current;
    if (!local) return;

    const takenByPeer = [...leasesByKey.values()].some(
      (lease) =>
        !isLeaseExpired(lease) &&
        isSameLeaseLocation(lease, local) &&
        String(lease.userId) !== String(currentUserId)
    );
    if (!takenByPeer) return;

    abandonLocalLease();
  }, [abandonLocalLease, currentUserId, leasesByKey, localLease]);

  const presenceMarkers = useMemo(() => {
    const normalizedActiveWorksheetId =
      typeof localWorksheetId === "string" ? localWorksheetId.trim() : "";

    const isOnActiveWorksheet = (worksheetId) => {
      if (!normalizedActiveWorksheetId) {
        return true;
      }

      if (typeof worksheetId !== "string" || worksheetId.trim().length === 0) {
        return false;
      }

      return worksheetId.trim() === normalizedActiveWorksheetId;
    };

    const remoteLeases = [...leasesByKey.values()].filter((lease) => {
      if (isLeaseExpired(lease)) return false;
      if (!isOnActiveWorksheet(lease.worksheetId)) return false;
      if (currentUserId == null) return true;
      return String(lease.userId) !== String(currentUserId);
    });
    const leasedUserIds = new Set(
      remoteLeases.map((lease) => String(lease.userId))
    );

    const remoteEntries = Object.values(activeCellsByUserId).filter(
      (entry) => {
        if (!entry?.cell) return false;
        if (!isOnActiveWorksheet(entry.worksheetId)) return false;
        if (currentUserId == null) return true;
        if (leasedUserIds.has(String(entry.userId))) return false;
        return String(entry.userId) !== String(currentUserId);
      }
    );

    const normalizedLocalCell =
      typeof localCell === "string" ? localCell.trim() : "";
    const markerUsers = [
      ...remoteEntries,
      ...remoteLeases,
    ].map((entry) => ({
      userId: entry.userId,
      userName: entry.userName,
    }));

    if (
      currentUserId != null &&
      normalizedLocalCell &&
      isOnActiveWorksheet(localWorksheetId)
    ) {
      markerUsers.push({
        userId: currentUserId,
        userName: currentUserName,
      });
    }

    const initialsByUserId = resolveUserInitials(markerUsers);

    const markers = [
      ...remoteLeases.map((lease) => ({
        userId: lease.userId,
        userName: lease.userName,
        cell: leaseToCellAddress(lease),
        worksheetId: lease.worksheetId,
        identity: getUserIdentity(
          lease.userId,
          lease.userName,
          initialsByUserId.get(String(lease.userId))
        ),
        isCurrentUser: false,
        isLease: true,
        preview: lease.preview || "",
      })),
      ...remoteEntries.map((entry) => ({
        userId: entry.userId,
        userName: entry.userName,
        cell: entry.cell,
        worksheetId: entry.worksheetId,
        identity: getUserIdentity(
          entry.userId,
          entry.userName,
          initialsByUserId.get(String(entry.userId))
        ),
        isCurrentUser: false,
        isLease: false,
      })),
    ];

    if (
      currentUserId != null &&
      normalizedLocalCell &&
      isOnActiveWorksheet(localWorksheetId)
    ) {
      markers.push({
        userId: currentUserId,
        userName: currentUserName,
        cell: normalizedLocalCell,
        worksheetId: localWorksheetId,
        identity: getUserIdentity(
          currentUserId,
          currentUserName,
          initialsByUserId.get(String(currentUserId))
        ),
        isCurrentUser: true,
        isLease: false,
      });
    }

    return markers;
  }, [
    activeCellsByUserId,
    leasesByKey,
    currentUserId,
    currentUserName,
    localCell,
    localWorksheetId,
    getUserIdentity,
  ]);

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

  const currentUserOverlayColor = useMemo(() => {
    const marker = presenceMarkers.find((entry) => entry?.isCurrentUser);
    const color = marker?.identity?.borderColor;
    return typeof color === "string" && color.trim() ? color.trim() : null;
  }, [presenceMarkers]);

  const safeUndoEnabled =
    getSpreadsheetCollaborationConfig().safeUndoEnabled;

  return (
    <>
      <CompanySpreadsheet
        ref={spreadsheetRef}
        workbookName={workbookName}
        workbookData={workbookData}
        databaseProviderFetchers={databaseDropdownFetchers}
        onWorkbookChange={onWorkbookChange}
        onWorkbookRealtimeChange={publishWorkbookUpdate}
        onActiveCellChange={publishActiveCell}
        isCellEditBlocked={handleIsCellEditBlocked}
        onCellEditStart={acquireCellLease}
        onCellEditChange={publishCellDraft}
        onCellEditEnd={releaseCellLease}
        initialInProgressEdit={restoreInProgressEdit}
        onReady={handleSpreadsheetReady}
        onError={handleSpreadsheetError}
        isApplyingRemoteCommandRef={isApplyingRemoteCommandRef}
        onApplyingRemoteCommandChange={handleApplyingRemoteCommandChange}
        selectionBorderColor={currentUserOverlayColor}
        safeUndoEnabled={safeUndoEnabled}
      />
    </>
  );
}

export default SpreadsheetRealtimeSurface;
