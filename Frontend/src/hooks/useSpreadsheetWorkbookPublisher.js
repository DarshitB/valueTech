import { useCallback, useEffect, useRef } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import {
  beginPublishInFlight,
  endPublishInFlight,
  recoverStuckPublish,
  shouldHoldRemoteApplies,
} from "./workbookSyncCoordinator";

/**
 * Publish local workbook snapshots over the shared realtime connection.
 *
 * Phase 2.5: integrates queued remote snapshots before serializing so local
 * publishes include already-delivered peer state. Tracks publish generations
 * so unpublished local edits are never overwritten by remote applies.
 */
export function useSpreadsheetWorkbookPublisher({
  spreadsheetRef,
  isSpreadsheetReady,
  isApplyingRemoteWorkbook,
  isApplyingRemoteWorkbookRef,
  syncCoordinator,
}) {
  const { socket, spreadsheetId, isRoomReady } = useSpreadsheetRealtime();
  const clientSequenceRef = useRef(0);
  const pendingPublishRef = useRef(false);
  const processPendingPublishRef = useRef(async () => {});

  const resumePendingPublish = useCallback(() => {
    if (
      !syncCoordinator ||
      (!pendingPublishRef.current && !syncCoordinator.localChangesPending)
    ) {
      return;
    }

    pendingPublishRef.current = true;
    void processPendingPublishRef.current();
  }, [syncCoordinator]);

  useEffect(() => {
    clientSequenceRef.current = 0;
    if (syncCoordinator) {
      syncCoordinator.lastPublishedClientSequence = 0;
      syncCoordinator.publishedGeneration = 0;
    }
  }, [spreadsheetId, syncCoordinator]);

  const canPublish = useCallback(() => {
    const isApplyingRemote =
      Boolean(isApplyingRemoteWorkbookRef?.current) ||
      Boolean(isApplyingRemoteWorkbook);

    return (
      isSpreadsheetReady &&
      isRoomReady &&
      Boolean(socket?.connected) &&
      Boolean(spreadsheetId) &&
      !isApplyingRemote
    );
  }, [
    isSpreadsheetReady,
    isRoomReady,
    socket,
    spreadsheetId,
    isApplyingRemoteWorkbook,
    isApplyingRemoteWorkbookRef,
  ]);

  const processPendingPublish = useCallback(async () => {
    const coordinator = syncCoordinator;
    if (!coordinator) {
      return;
    }

    recoverStuckPublish(coordinator);

    if (coordinator.publishInFlight) {
      return;
    }

    if (!pendingPublishRef.current && !coordinator.localChangesPending) {
      return;
    }

    if (!canPublish()) {
      pendingPublishRef.current =
        pendingPublishRef.current || coordinator.localChangesPending;
      return;
    }

    pendingPublishRef.current = false;
    beginPublishInFlight(coordinator);

    const generationAtPublish = coordinator.changeGeneration;

    try {
      await coordinator.flushRemoteQueue({ integrateBeforePublish: true });

      if (!canPublish()) {
        pendingPublishRef.current = true;
        return;
      }

      const workbookData =
        spreadsheetRef.current?.getWorkbookDataForSync?.() ?? null;

      if (workbookData) {
        clientSequenceRef.current += 1;
        coordinator.lastPublishedClientSequence = clientSequenceRef.current;

        socket.emit("spreadsheet:workbook-update", {
          spreadsheet_id: spreadsheetId,
          workbook_data: workbookData,
          client_sequence: clientSequenceRef.current,
        });
      }

      coordinator.publishedGeneration = generationAtPublish;
      coordinator.localChangesPending =
        coordinator.changeGeneration > generationAtPublish;

      await coordinator.flushRemoteQueue();

      if (coordinator.changeGeneration > coordinator.publishedGeneration) {
        pendingPublishRef.current = true;
      }
    } catch {
      coordinator.localChangesPending = true;
      pendingPublishRef.current = true;
    } finally {
      endPublishInFlight(coordinator);

      if (pendingPublishRef.current || coordinator.localChangesPending) {
        pendingPublishRef.current = true;
        void processPendingPublishRef.current();
      }

      if (coordinator.remoteQueue.length > 0) {
        void coordinator.flushRemoteQueue();
      }
    }
  }, [canPublish, spreadsheetRef, socket, spreadsheetId, syncCoordinator]);

  processPendingPublishRef.current = processPendingPublish;

  const publishWorkbookUpdate = useCallback(() => {
    if (!syncCoordinator) {
      return;
    }

    syncCoordinator.changeGeneration += 1;
    syncCoordinator.localChangesPending = true;
    pendingPublishRef.current = true;
    void processPendingPublish();
  }, [processPendingPublish, syncCoordinator]);

  useEffect(() => {
    resumePendingPublish();
  }, [
    isSpreadsheetReady,
    isRoomReady,
    socket?.connected,
    spreadsheetId,
    isApplyingRemoteWorkbook,
    processPendingPublish,
    resumePendingPublish,
  ]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }

    const handleSocketConnect = () => {
      resumePendingPublish();
    };

    socket.on("connect", handleSocketConnect);

    return () => {
      socket.off("connect", handleSocketConnect);
    };
  }, [socket, resumePendingPublish]);

  return { publishWorkbookUpdate };
};
