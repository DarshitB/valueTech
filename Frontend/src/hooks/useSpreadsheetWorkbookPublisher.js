import { useCallback, useEffect, useRef } from "react";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import {
  beginPublishInFlight,
  enqueueLocalCommand,
  endPublishInFlight,
  recoverStuckPublish,
} from "./workbookSyncCoordinator";

/**
 * client_sequence must stay unique while the server still remembers this
 * user's old 1, 2, 3… values (room not empty). Starting at 0 after refresh
 * made the server silently drop every new command.
 */
function createClientSequenceSeed() {
  return Date.now() + Math.floor(Math.random() * 1_000_000);
}

/**
 * Publish local workbook snapshots over the shared realtime connection.
 *
 * Phase 2.5: integrates queued remote snapshots before serializing so local
 * publishes include already-delivered peer state. Tracks publish generations
 * so unpublished local edits are never overwritten by remote applies.
 */
export function useSpreadsheetWorkbookPublisher({
  isSpreadsheetReady,
  isApplyingRemoteCommand,
  isApplyingRemoteCommandRef,
  syncCoordinator,
}) {
  const { socket, spreadsheetId, isRoomReady } = useSpreadsheetRealtime();
  const clientSequenceRef = useRef(createClientSequenceSeed());
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
    clientSequenceRef.current = createClientSequenceSeed();
    if (syncCoordinator) {
      syncCoordinator.lastPublishedClientSequence = 0;
      syncCoordinator.publishedGeneration = 0;
    }
  }, [spreadsheetId, syncCoordinator]);

  const canPublish = useCallback(() => {
    const isApplyingRemote =
      Boolean(isApplyingRemoteCommandRef?.current) ||
      Boolean(isApplyingRemoteCommand);

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
    isApplyingRemoteCommand,
    isApplyingRemoteCommandRef,
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

      while (coordinator.localCommandQueue.length > 0) {
        if (!canPublish()) {
          pendingPublishRef.current = true;
          break;
        }

        const nextCommand = coordinator.localCommandQueue.shift();
        if (!nextCommand?.commandId) {
          continue;
        }

        clientSequenceRef.current += 1;
        coordinator.lastPublishedClientSequence = clientSequenceRef.current;

        socket.emit("spreadsheet:command", {
          spreadsheet_id: spreadsheetId,
          command_id: nextCommand.commandId,
          command_params:
            nextCommand.commandParams &&
            typeof nextCommand.commandParams === "object" &&
            !Array.isArray(nextCommand.commandParams)
              ? nextCommand.commandParams
              : {},
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
  }, [canPublish, socket, spreadsheetId, syncCoordinator]);

  processPendingPublishRef.current = processPendingPublish;

  const publishWorkbookUpdate = useCallback((commandPayload) => {
    if (!syncCoordinator) {
      return;
    }

    if (
      Boolean(isApplyingRemoteCommandRef?.current) ||
      Boolean(isApplyingRemoteCommand)
    ) {
      return;
    }

    const queued = enqueueLocalCommand(syncCoordinator, {
      commandId: commandPayload?.commandId,
      commandParams: commandPayload?.commandParams ?? null,
    });
    if (!queued) {
      return;
    }

    syncCoordinator.changeGeneration += 1;
    syncCoordinator.localChangesPending = true;
    pendingPublishRef.current = true;
    void processPendingPublish();
  }, [
    processPendingPublish,
    syncCoordinator,
    isApplyingRemoteCommand,
    isApplyingRemoteCommandRef,
  ]);

  useEffect(() => {
    resumePendingPublish();
  }, [
    isSpreadsheetReady,
    isRoomReady,
    socket?.connected,
    spreadsheetId,
    isApplyingRemoteCommand,
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
