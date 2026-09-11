import { useCallback, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import {
  acknowledgeLocalCommand,
  beginPublishInFlight,
  clearLocalCommandInFlight,
  enqueueLocalCommand,
  endPublishInFlight,
  markLocalCommandInFlight,
  peekNextLocalCommand,
  recoverStuckPublish,
} from "./workbookSyncCoordinator";
import { recordSpreadsheetCollaborationEvent } from "../realtime/spreadsheet/collaborationTelemetry";
import { createSpreadsheetRequestId } from "../realtime/spreadsheet/protocolRequest";
import { getSpreadsheetCollaborationConfig } from "../realtime/spreadsheet/collaborationConfig";
import {
  getOrCreateSpreadsheetClientId,
  nextSpreadsheetClientSequence,
  persistSpreadsheetOutbox,
  removeSpreadsheetOutbox,
  loadSpreadsheetOutbox,
} from "../realtime/spreadsheet/collaborationOutbox";
import { shouldKeepRealtimeCommandLocal } from "@spreadsheet-wrapper/realtime/localOnlyCommands";

/**
 * client_sequence must stay unique while the server still remembers this
 * user's old 1, 2, 3… values (room not empty). Starting at 0 after refresh
 * made the server silently drop every new command.
 */
function createClientSequenceSeed() {
  return Date.now() + Math.floor(Math.random() * 1_000_000);
}

function emitSpreadsheetCommand(socket, payload) {
  return new Promise((resolve) => {
    if (!socket) {
      resolve({ ok: false, code: "SOCKET_UNAVAILABLE" });
      return;
    }

    if (typeof socket.timeout === "function") {
      socket.timeout(10_000).emit(
        "spreadsheet:command",
        payload,
        (error, response) => {
          if (error) {
            resolve({ ok: false, code: "ACK_TIMEOUT" });
            return;
          }
          resolve(response || { ok: false, code: "ACK_MISSING" });
        }
      );
      return;
    }

    socket.emit("spreadsheet:command", payload, (response) => {
      resolve(response || { ok: false, code: "ACK_MISSING" });
    });
  });
}

/**
 * Publish local workbook snapshots over the shared realtime connection.
 *
 * V1 removes a command as soon as it is emitted. Authoritative V2 keeps the
 * operation until the matching ACK, then retries the same identity.
 */
export function useSpreadsheetWorkbookPublisher({
  isSpreadsheetReady,
  isApplyingRemoteCommand,
  isApplyingRemoteCommandRef,
  syncCoordinator,
}) {
  const {
    socket,
    spreadsheetId,
    isRoomReady,
    collaborationProtocol,
    reportAuthoritativeRevision,
  } = useSpreadsheetRealtime();
  const currentUserId = useSelector((state) => state.auth.user?.id);
  const clientSequenceRef = useRef(createClientSequenceSeed());
  const clientIdRef = useRef(null);
  const pendingPublishRef = useRef(false);
  const processPendingPublishRef = useRef(async () => {});
  const restoredOutboxKeyRef = useRef(null);
  const delayedRetryTimerRef = useRef(0);
  const isAuthoritativeV2 = collaborationProtocol === "v2";
  const offlineQueueEnabled =
    getSpreadsheetCollaborationConfig().offlineQueueEnabled;
  // In-memory ACK queue is required for V2. Browser persistence is only for
  // the offline-queue flag — otherwise stale localStorage rebroadcasts old cells.
  const useReliableOutbox = isAuthoritativeV2 || offlineQueueEnabled;
  const persistOutboxToStorage = offlineQueueEnabled;
  const safeUndoEnabled = getSpreadsheetCollaborationConfig().safeUndoEnabled;

  if (!clientIdRef.current) {
    clientIdRef.current = currentUserId
      ? getOrCreateSpreadsheetClientId(currentUserId)
      : createSpreadsheetRequestId("client");
  }

  const persistOutbox = useCallback(() => {
    if (
      !persistOutboxToStorage ||
      !currentUserId ||
      !spreadsheetId ||
      !syncCoordinator
    ) {
      return;
    }

    const entries = syncCoordinator.localCommandQueue.map((entry) => ({
      operationId: entry.operationId,
      clientId: entry.clientId,
      clientSequence: entry.clientSequence,
      commandId: entry.commandId,
      commandParams: entry.commandParams &&
        typeof entry.commandParams === "object" &&
        !Array.isArray(entry.commandParams)
        ? entry.commandParams
        : {},
      requestId: entry.requestId || entry.operationId,
    }));

    if (entries.length === 0) {
      removeSpreadsheetOutbox(currentUserId, spreadsheetId);
      return;
    }

    const persisted = persistSpreadsheetOutbox(
      currentUserId,
      spreadsheetId,
      entries
    );
    if (!persisted.ok) {
      recordSpreadsheetCollaborationEvent("outbox_persist_failed", {
        spreadsheetId,
        reason: persisted.reason || "UNKNOWN",
        queueSize: entries.length,
      });
    }
  }, [
    currentUserId,
    spreadsheetId,
    syncCoordinator,
    persistOutboxToStorage,
  ]);

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
    if (currentUserId) {
      clientIdRef.current = getOrCreateSpreadsheetClientId(currentUserId);
    }
  }, [currentUserId]);

  useEffect(() => {
    clientSequenceRef.current = createClientSequenceSeed();
    restoredOutboxKeyRef.current = null;
    if (syncCoordinator) {
      syncCoordinator.lastPublishedClientSequence = 0;
      syncCoordinator.publishedGeneration = 0;
    }

    // Offline queue is off: drop any leftover V2 outbox so old cell writes
    // cannot rebroadcast after refresh.
    if (!persistOutboxToStorage && currentUserId && spreadsheetId) {
      removeSpreadsheetOutbox(currentUserId, spreadsheetId);
    }
  }, [
    spreadsheetId,
    syncCoordinator,
    persistOutboxToStorage,
    currentUserId,
  ]);

  useEffect(() => {
    if (
      !persistOutboxToStorage ||
      !currentUserId ||
      !spreadsheetId ||
      !syncCoordinator
    ) {
      return;
    }

    const restoreKey = `${currentUserId}:${spreadsheetId}`;
    if (restoredOutboxKeyRef.current === restoreKey) {
      return;
    }
    restoredOutboxKeyRef.current = restoreKey;

    if (syncCoordinator.localCommandQueue.length > 0) {
      return;
    }

    const loaded = loadSpreadsheetOutbox(currentUserId, spreadsheetId);
    if (!loaded.ok || loaded.entries.length === 0) {
      return;
    }

    loaded.entries.forEach((entry) => {
      enqueueLocalCommand(syncCoordinator, entry);
    });
    syncCoordinator.localChangesPending = true;
    pendingPublishRef.current = true;
    recordSpreadsheetCollaborationEvent("outbox_restored", {
      spreadsheetId,
      queueSize: loaded.entries.length,
    });
  }, [
    currentUserId,
    spreadsheetId,
    syncCoordinator,
    persistOutboxToStorage,
  ]);

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

      if (useReliableOutbox) {
        while (peekNextLocalCommand(coordinator)) {
          if (!canPublish()) {
            pendingPublishRef.current = true;
            break;
          }

          const nextCommand = peekNextLocalCommand(coordinator);
          if (!nextCommand?.commandId) {
            break;
          }

          markLocalCommandInFlight(coordinator, nextCommand.operationId);
          const clientSequence = nextCommand.clientSequence;
          const requestId =
            nextCommand.requestId || nextCommand.operationId;
          coordinator.lastPublishedClientSequence = clientSequence;

          const payload = {
            spreadsheet_id: spreadsheetId,
            command_id: nextCommand.commandId,
            command_params:
              nextCommand.commandParams &&
              typeof nextCommand.commandParams === "object" &&
              !Array.isArray(nextCommand.commandParams)
                ? nextCommand.commandParams
                : {},
            client_sequence: clientSequence,
            client_id: nextCommand.clientId || clientIdRef.current,
            request_id: requestId,
            operation_id: nextCommand.operationId,
          };

          const emitStartedAt = Date.now();
          const response = await emitSpreadsheetCommand(socket, payload);
          const ackLatencyMs = Math.max(0, Date.now() - emitStartedAt);
          recordSpreadsheetCollaborationEvent("command_emitted", {
            spreadsheetId,
            commandId: nextCommand.commandId,
            clientSequence,
            requestId,
            protocol: isAuthoritativeV2 ? "v2" : "v1-offline-queue",
            ack_latency_ms: ackLatencyMs,
          });

          if (response?.ok) {
            acknowledgeLocalCommand(coordinator, {
              operationId: nextCommand.operationId,
              requestId,
              clientId: nextCommand.clientId,
              clientSequence,
            });
            recordSpreadsheetCollaborationEvent("command_ack_local", {
              spreadsheetId,
              commandId: nextCommand.commandId,
              clientSequence,
              requestId,
              protocol: isAuthoritativeV2 ? "v2" : "v1-offline-queue",
              ack_latency_ms: ackLatencyMs,
            });
            persistOutbox();
            if (
              isAuthoritativeV2 &&
              Number.isSafeInteger(response.revision)
            ) {
              reportAuthoritativeRevision(response.revision);
            }
          } else {
            clearLocalCommandInFlight(coordinator);
            pendingPublishRef.current = true;
            recordSpreadsheetCollaborationEvent("command_rejected", {
              spreadsheetId,
              commandId: nextCommand.commandId,
              clientSequence,
              requestId,
              code: response?.code || "UNKNOWN",
              protocol: isAuthoritativeV2 ? "v2" : "v1-offline-queue",
              ack_latency_ms: ackLatencyMs,
            });
            if (delayedRetryTimerRef.current) {
              clearTimeout(delayedRetryTimerRef.current);
            }
            delayedRetryTimerRef.current = setTimeout(() => {
              delayedRetryTimerRef.current = 0;
              void processPendingPublishRef.current();
            }, 1000);
            break;
          }
        }
      } else {
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
          const clientSequence = clientSequenceRef.current;
          coordinator.lastPublishedClientSequence = clientSequence;
          const requestId = createSpreadsheetRequestId("command");

          socket.emit(
            "spreadsheet:command",
            {
              spreadsheet_id: spreadsheetId,
              command_id: nextCommand.commandId,
              command_params:
                nextCommand.commandParams &&
                typeof nextCommand.commandParams === "object" &&
                !Array.isArray(nextCommand.commandParams)
                  ? nextCommand.commandParams
                  : {},
              client_sequence: clientSequence,
              client_id: clientIdRef.current,
              request_id: requestId,
            },
            (response) => {
              if (response?.ok === false) {
                recordSpreadsheetCollaborationEvent("command_rejected", {
                  spreadsheetId,
                  commandId: nextCommand.commandId,
                  clientSequence,
                  requestId,
                  code: response.code || "UNKNOWN",
                });
              }
            }
          );
          recordSpreadsheetCollaborationEvent("command_emitted", {
            spreadsheetId,
            commandId: nextCommand.commandId,
            clientSequence,
            requestId,
          });
        }
      }

      coordinator.publishedGeneration = generationAtPublish;
      coordinator.localChangesPending =
        coordinator.changeGeneration > generationAtPublish ||
        coordinator.localCommandQueue.length > 0;

      await coordinator.flushRemoteQueue();

      if (
        coordinator.changeGeneration > coordinator.publishedGeneration ||
        coordinator.localCommandQueue.length > 0
      ) {
        pendingPublishRef.current = true;
      }
    } catch (error) {
      coordinator.localChangesPending = true;
      pendingPublishRef.current = true;
      clearLocalCommandInFlight(coordinator);
      recordSpreadsheetCollaborationEvent("publish_failed", {
        spreadsheetId,
        reason: error?.message || "unknown",
      });
    } finally {
      endPublishInFlight(coordinator);

      if (
        (pendingPublishRef.current || coordinator.localChangesPending) &&
        !delayedRetryTimerRef.current
      ) {
        pendingPublishRef.current = true;
        void processPendingPublishRef.current();
      }

      if (coordinator.remoteQueue.length > 0) {
        void coordinator.flushRemoteQueue();
      }
    }
  }, [
    canPublish,
    isAuthoritativeV2,
    persistOutbox,
    reportAuthoritativeRevision,
    socket,
    spreadsheetId,
    syncCoordinator,
    useReliableOutbox,
  ]);

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

    const commandId = String(commandPayload?.commandId ?? "").trim();
    if (
      shouldKeepRealtimeCommandLocal(commandId, {
        safeUndoEnabled,
      })
    ) {
      return;
    }

    const operationId = useReliableOutbox
      ? createSpreadsheetRequestId("command")
      : null;
    const queued = enqueueLocalCommand(
      syncCoordinator,
      useReliableOutbox
        ? {
            commandId: commandPayload?.commandId,
            commandParams: commandPayload?.commandParams ?? null,
            operationId,
            requestId: operationId,
            clientId: clientIdRef.current,
            clientSequence: nextSpreadsheetClientSequence(currentUserId),
          }
        : {
            commandId: commandPayload?.commandId,
            commandParams: commandPayload?.commandParams ?? null,
          }
    );
    if (!queued) {
      return;
    }

    if (useReliableOutbox) {
      persistOutbox();
    }

    recordSpreadsheetCollaborationEvent("command_queued", {
      spreadsheetId,
      commandId: commandPayload?.commandId || null,
      queueSize: syncCoordinator.localCommandQueue.length,
    });
    syncCoordinator.changeGeneration += 1;
    syncCoordinator.localChangesPending = true;
    pendingPublishRef.current = true;
    void processPendingPublish();
  }, [
    currentUserId,
    persistOutbox,
    processPendingPublish,
    safeUndoEnabled,
    spreadsheetId,
    syncCoordinator,
    isApplyingRemoteCommand,
    isApplyingRemoteCommandRef,
    useReliableOutbox,
  ]);

  useEffect(() => {
    resumePendingPublish();
  }, [
    isSpreadsheetReady,
    isRoomReady,
    socket?.connected,
    spreadsheetId,
    isApplyingRemoteCommand,
    collaborationProtocol,
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

  useEffect(() => {
    return () => {
      if (delayedRetryTimerRef.current) {
        clearTimeout(delayedRetryTimerRef.current);
        delayedRetryTimerRef.current = 0;
      }
    };
  }, []);

  return { publishWorkbookUpdate };
}
