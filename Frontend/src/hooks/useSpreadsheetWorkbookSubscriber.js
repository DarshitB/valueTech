import { useCallback, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { isLocalOnlyRealtimeCommand } from "@spreadsheet-wrapper";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import {
  acknowledgeLocalCommand,
  enqueueRemoteWorkbookUpdate,
  findOwnQueuedOperation,
  inspectRemoteQueueHead,
  recordAppliedSequence,
  resetWorkbookSyncCoordinator,
  shouldHoldRemoteApplies,
  shouldSkipRemoteSequenceGap,
  SYNC_IN_FLIGHT_STUCK_MS,
} from "./workbookSyncCoordinator";
import { recordSpreadsheetCollaborationEvent } from "../realtime/spreadsheet/collaborationTelemetry";
import { createSpreadsheetRequestId } from "../realtime/spreadsheet/protocolRequest";
import { getOrCreateSpreadsheetClientId } from "../realtime/spreadsheet/collaborationOutbox";

/**
 * Apply remote workbook snapshots from the shared realtime connection.
 *
 * V1 may skip dropped sequences. Authoritative V2 buffers by revision and
 * requests replay instead of applying across a gap.
 */
export function useSpreadsheetWorkbookSubscriber({
  spreadsheetRef,
  isSpreadsheetReady,
  isApplyingRemoteCommand,
  syncCoordinator,
}) {
  const {
    socket,
    spreadsheetId,
    collaborationProtocol,
    syncStart,
    reportAuthoritativeRevision,
    getAuthoritativeRevision,
  } = useSpreadsheetRealtime();
  const currentUserId = useSelector((state) => state.auth.user?.id);
  const applyInFlightRef = useRef(false);
  const applyInFlightSinceRef = useRef(0);
  const flushRemoteQueueRef = useRef(async () => false);
  const flushRetryRafRef = useRef(0);
  const replayInFlightRef = useRef(false);
  const isApplyingRemoteCommandRef = useRef(isApplyingRemoteCommand);
  const clientIdRef = useRef(null);
  const protocolRef = useRef(collaborationProtocol);
  const readyRef = useRef(isSpreadsheetReady);
  const isAuthoritativeV2 = collaborationProtocol === "v2";

  isApplyingRemoteCommandRef.current = isApplyingRemoteCommand;
  protocolRef.current = collaborationProtocol;
  readyRef.current = isSpreadsheetReady;

  if (!clientIdRef.current && currentUserId) {
    clientIdRef.current = getOrCreateSpreadsheetClientId(currentUserId);
  }

  useEffect(() => {
    if (currentUserId) {
      clientIdRef.current = getOrCreateSpreadsheetClientId(currentUserId);
    }
  }, [currentUserId]);

  const recoverStuckApply = useCallback(() => {
    if (!applyInFlightRef.current) {
      return false;
    }

    if (Date.now() - applyInFlightSinceRef.current < SYNC_IN_FLIGHT_STUCK_MS) {
      return false;
    }

    applyInFlightRef.current = false;
    applyInFlightSinceRef.current = 0;
    return true;
  }, []);

  const beginApplyInFlight = useCallback(() => {
    applyInFlightRef.current = true;
    applyInFlightSinceRef.current = Date.now();
  }, []);

  const endApplyInFlight = useCallback(() => {
    applyInFlightRef.current = false;
    applyInFlightSinceRef.current = 0;
  }, []);

  const requestRevisionReplay = useCallback(
    (afterRevision) => {
      const cursor = getAuthoritativeRevision?.();
      let safeAfterRevision = afterRevision;
      // Never gap-replay from 0 when sync-start already established a cursor.
      if (
        (!Number.isSafeInteger(safeAfterRevision) || safeAfterRevision <= 0) &&
        Number.isSafeInteger(cursor) &&
        cursor > 0
      ) {
        safeAfterRevision = cursor;
      }

      if (
        protocolRef.current !== "v2" ||
        !socket ||
        !spreadsheetId ||
        replayInFlightRef.current ||
        !Number.isSafeInteger(safeAfterRevision) ||
        safeAfterRevision < 0
      ) {
        return;
      }

      replayInFlightRef.current = true;
      const requestId = createSpreadsheetRequestId("replay");
      const finish = (response) => {
        replayInFlightRef.current = false;
        if (response?.ok === false) {
          recordSpreadsheetCollaborationEvent("replay_failed", {
            spreadsheetId,
            afterRevision: safeAfterRevision,
            code: response.code || "UNKNOWN",
            protocol: "v2",
            source: "gap",
          });
        } else {
          recordSpreadsheetCollaborationEvent("replay_requested", {
            spreadsheetId,
            afterRevision: safeAfterRevision,
            protocol: "v2",
            source: "gap",
            commandCount: Number.isSafeInteger(response?.command_count)
              ? response.command_count
              : null,
            ok: true,
          });
        }
        void flushRemoteQueueRef.current();
      };

      if (typeof socket.timeout === "function") {
        socket.timeout(10_000).emit(
          "spreadsheet:replay",
          {
            spreadsheet_id: spreadsheetId,
            request_id: requestId,
            after_revision: safeAfterRevision,
          },
          (error, response) => {
            finish(
              error
                ? { ok: false, code: "ACK_TIMEOUT" }
                : response || { ok: false, code: "ACK_MISSING" }
            );
          }
        );
        return;
      }

      socket.emit(
        "spreadsheet:replay",
        {
          spreadsheet_id: spreadsheetId,
          request_id: requestId,
          after_revision: safeAfterRevision,
        },
        (response) => finish(response || { ok: true })
      );
    },
    [getAuthoritativeRevision, socket, spreadsheetId]
  );

  const flushRemoteQueue = useCallback(
    async ({ integrateBeforePublish = false } = {}) => {
      const coordinator = syncCoordinator;
      if (!coordinator) {
        return false;
      }

      recoverStuckApply();

      if (applyInFlightRef.current) {
        return false;
      }

      const isHeld = () =>
        isApplyingRemoteCommandRef.current ||
        (!integrateBeforePublish &&
          shouldHoldRemoteApplies(
            coordinator,
            isApplyingRemoteCommandRef.current
          ));

      if (isHeld() || !isSpreadsheetReady) {
        return false;
      }

      let appliedAny = false;

      while (coordinator.remoteQueue.length > 0) {
        if (isHeld() || !isSpreadsheetReady) {
          break;
        }

        recoverStuckApply();
        if (applyInFlightRef.current) {
          break;
        }

        const inspection = inspectRemoteQueueHead(coordinator);
        if (inspection.action === "empty") {
          break;
        }

        if (inspection.action === "drop_stale") {
          coordinator.remoteQueue.splice(0, 1);
          continue;
        }

        if (inspection.action === "gap") {
          // protocolRef updates on sync-start before React re-renders protocol state.
          const activeProtocol = protocolRef.current || collaborationProtocol;
          if (!shouldSkipRemoteSequenceGap(activeProtocol)) {
            recordSpreadsheetCollaborationEvent("sequence_gap_replay", {
              spreadsheetId,
              expectedSequence: inspection.expectedSequence,
              receivedSequence: inspection.receivedSequence,
              protocol: activeProtocol || "v2",
              lastAppliedSequence: coordinator.lastAppliedSequence,
            });
            requestRevisionReplay(coordinator.lastAppliedSequence);
            break;
          }

          const [catchUpUpdate] = coordinator.remoteQueue.splice(0, 1);
          recordSpreadsheetCollaborationEvent("sequence_gap_skipped", {
            spreadsheetId,
            expectedSequence: inspection.expectedSequence,
            receivedSequence: catchUpUpdate.sequence,
            protocol: activeProtocol || "v1",
          });

          beginApplyInFlight();

          try {
            const applied =
              await spreadsheetRef.current?.executeRealtimeCommand?.(
                catchUpUpdate.commandId,
                catchUpUpdate.commandParams
              );

            if (applied) {
              coordinator.lastAppliedSequence = catchUpUpdate.sequence;
              recordAppliedSequence(coordinator, catchUpUpdate.sequence);
              appliedAny = true;
              recordSpreadsheetCollaborationEvent("command_applied", {
                spreadsheetId,
                sequence: catchUpUpdate.sequence,
                commandId: catchUpUpdate.commandId,
              });
            }
          } catch (error) {
            recordSpreadsheetCollaborationEvent("command_apply_failed", {
              spreadsheetId,
              sequence: catchUpUpdate.sequence,
              commandId: catchUpUpdate.commandId,
              reason: error?.message || "unknown",
            });
          } finally {
            endApplyInFlight();
          }

          continue;
        }

        const [nextUpdate] = coordinator.remoteQueue.splice(inspection.index, 1);

        if (
          !nextUpdate ||
          nextUpdate.sequence <= coordinator.lastAppliedSequence ||
          coordinator.appliedSequences.has(nextUpdate.sequence)
        ) {
          continue;
        }

        const ownQueued = findOwnQueuedOperation(coordinator, {
          operationId: nextUpdate.operationId,
          clientId: nextUpdate.clientId,
          clientSequence: nextUpdate.clientSequence,
        });
        const isOwnClient =
          Boolean(nextUpdate.clientId) &&
          nextUpdate.clientId === clientIdRef.current;

        if (isAuthoritativeV2 && (ownQueued || isOwnClient)) {
          acknowledgeLocalCommand(coordinator, {
            operationId: nextUpdate.operationId,
            clientId: nextUpdate.clientId,
            clientSequence: nextUpdate.clientSequence,
          });
          coordinator.lastAppliedSequence = nextUpdate.sequence;
          recordAppliedSequence(coordinator, nextUpdate.sequence);
          reportAuthoritativeRevision(nextUpdate.sequence);
          appliedAny = true;
          recordSpreadsheetCollaborationEvent("command_ack_local", {
            spreadsheetId,
            sequence: nextUpdate.sequence,
            commandId: nextUpdate.commandId,
          });
          continue;
        }

        beginApplyInFlight();

        try {
          const applied = await spreadsheetRef.current?.executeRealtimeCommand?.(
            nextUpdate.commandId,
            nextUpdate.commandParams
          );

          if (applied) {
            coordinator.lastAppliedSequence = nextUpdate.sequence;
            recordAppliedSequence(coordinator, nextUpdate.sequence);
            if (isAuthoritativeV2) {
              reportAuthoritativeRevision(nextUpdate.sequence);
            }
            appliedAny = true;
            recordSpreadsheetCollaborationEvent("command_applied", {
              spreadsheetId,
              sequence: nextUpdate.sequence,
              commandId: nextUpdate.commandId,
            });
          } else {
            console.error("[RealtimeCommand] remote replay returned false", {
              sequence: nextUpdate.sequence,
              commandId: nextUpdate.commandId,
              commandParams: nextUpdate.commandParams,
            });
            recordSpreadsheetCollaborationEvent("command_apply_failed", {
              spreadsheetId,
              sequence: nextUpdate.sequence,
              commandId: nextUpdate.commandId,
              reason: "execute_returned_false",
            });
          }
        } catch (error) {
          console.error("[RealtimeCommand] remote replay threw error", {
            sequence: nextUpdate.sequence,
            commandId: nextUpdate.commandId,
            commandParams: nextUpdate.commandParams,
            error,
          });
          recordSpreadsheetCollaborationEvent("command_apply_failed", {
            spreadsheetId,
            sequence: nextUpdate.sequence,
            commandId: nextUpdate.commandId,
            reason: error?.message || "unknown",
          });
        } finally {
          endApplyInFlight();
        }
      }

      return appliedAny;
    },
    [
      spreadsheetRef,
      spreadsheetId,
      syncCoordinator,
      isSpreadsheetReady,
      collaborationProtocol,
      isAuthoritativeV2,
      recoverStuckApply,
      beginApplyInFlight,
      endApplyInFlight,
      requestRevisionReplay,
      reportAuthoritativeRevision,
    ]
  );

  flushRemoteQueueRef.current = flushRemoteQueue;

  const scheduleFlushRetry = useCallback(() => {
    if (flushRetryRafRef.current) {
      return;
    }

    const retry = () => {
      flushRetryRafRef.current = 0;

      const coordinator = syncCoordinator;
      if (!coordinator || coordinator.remoteQueue.length === 0) {
        return;
      }

      if (
        shouldHoldRemoteApplies(
          coordinator,
          isApplyingRemoteCommandRef.current
        ) ||
        !isSpreadsheetReady
      ) {
        flushRetryRafRef.current = requestAnimationFrame(retry);
        return;
      }

      void flushRemoteQueueRef.current();
    };

    flushRetryRafRef.current = requestAnimationFrame(retry);
  }, [syncCoordinator, isSpreadsheetReady]);

  useEffect(() => {
    if (!syncCoordinator) {
      return undefined;
    }

    syncCoordinator.flushRemoteQueue = (options) =>
      flushRemoteQueueRef.current(options);

    return () => {
      syncCoordinator.flushRemoteQueue = async () => false;
    };
  }, [syncCoordinator]);

  useEffect(() => {
    if (!syncStart || !syncCoordinator) {
      return;
    }

    if (Number.isSafeInteger(syncStart.last_revision)) {
      if (syncStart.last_revision > syncCoordinator.lastAppliedSequence) {
        syncCoordinator.lastAppliedSequence = syncStart.last_revision;
        recordAppliedSequence(syncCoordinator, syncStart.last_revision);
      }
    }

    const headRevision = Number(syncStart.current_revision);
    if (
      Number.isSafeInteger(headRevision) &&
      headRevision > syncCoordinator.lastAppliedSequence
    ) {
      // Join replay packets may have arrived before this subscriber attached.
      requestRevisionReplay(syncCoordinator.lastAppliedSequence);
    }
  }, [syncStart, syncCoordinator, requestRevisionReplay]);

  useEffect(() => {
    if (!socket || !spreadsheetId || !syncCoordinator) {
      return undefined;
    }

    let isActive = true;

    const seedRevision = getAuthoritativeRevision?.();
    if (
      Number.isSafeInteger(seedRevision) &&
      seedRevision > syncCoordinator.lastAppliedSequence
    ) {
      syncCoordinator.lastAppliedSequence = seedRevision;
      recordAppliedSequence(syncCoordinator, seedRevision);
    }

    // Apply the join cursor BEFORE any replay/live commands. A React-state-only
    // sync-start path races: commands can enqueue while lastAppliedSequence is
    // still 0, then V2 gap-replay re-applies old history on top of the snapshot.
    const handleSyncStart = (payload = {}) => {
      if (!isActive) return;
      if (payload.spreadsheet_id !== spreadsheetId) return;
      if (payload.protocol !== "v2") return;
      if (!Number.isSafeInteger(payload.last_revision) || payload.last_revision < 0) {
        return;
      }

      protocolRef.current = "v2";
      if (payload.last_revision > syncCoordinator.lastAppliedSequence) {
        syncCoordinator.lastAppliedSequence = payload.last_revision;
        recordAppliedSequence(syncCoordinator, payload.last_revision);
      }
      reportAuthoritativeRevision(payload.last_revision);
      recordSpreadsheetCollaborationEvent("sync_start_cursor_applied", {
        spreadsheetId,
        lastRevision: payload.last_revision,
        currentRevision: Number.isSafeInteger(payload.current_revision)
          ? payload.current_revision
          : null,
      });
    };

    const handleWorkbookUpdate = (payload = {}) => {
      if (!isActive) return;
      if (payload.spreadsheet_id !== spreadsheetId) return;

      const isAuthoritativeV2Now = protocolRef.current === "v2";
      const {
        userId,
        command_id: commandId,
        command_params: commandParams,
        sequence,
        revision,
        client_id: clientId,
        client_sequence: clientSequence,
        operation_id: operationId,
      } = payload;
      const normalizedSequence = Number.isSafeInteger(revision)
        ? revision
        : sequence;

      if (
        !isAuthoritativeV2Now &&
        userId != null &&
        currentUserId != null &&
        String(userId) === String(currentUserId)
      ) {
        return;
      }

      if (typeof commandId !== "string" || !commandId.trim()) {
        return;
      }

      const normalizedCommandId = commandId.trim();

      if (isLocalOnlyRealtimeCommand(normalizedCommandId)) {
        if (
          Number.isSafeInteger(normalizedSequence) &&
          normalizedSequence > 0
        ) {
          if (normalizedSequence > syncCoordinator.lastAppliedSequence) {
            syncCoordinator.lastAppliedSequence = normalizedSequence;
            recordAppliedSequence(syncCoordinator, normalizedSequence);
            if (isAuthoritativeV2Now) {
              reportAuthoritativeRevision(normalizedSequence);
            }
          }
        }
        return;
      }

      const queued = enqueueRemoteWorkbookUpdate(syncCoordinator, {
        sequence: normalizedSequence,
        commandId: normalizedCommandId,
        commandParams:
          commandParams &&
          typeof commandParams === "object" &&
          !Array.isArray(commandParams)
            ? commandParams
            : {},
        clientId: clientId || null,
        clientSequence: Number.isSafeInteger(clientSequence)
          ? clientSequence
          : null,
        operationId: operationId || null,
      });
      recordSpreadsheetCollaborationEvent("command_received", {
        spreadsheetId,
        sequence: normalizedSequence,
        commandId: normalizedCommandId,
        queued,
      });

      if (
        !queued &&
        normalizedSequence <= syncCoordinator.lastAppliedSequence
      ) {
        return;
      }

      if (!readyRef.current) {
        return;
      }

      if (
        shouldHoldRemoteApplies(
          syncCoordinator,
          isApplyingRemoteCommandRef.current
        )
      ) {
        scheduleFlushRetry();
        return;
      }

      void flushRemoteQueueRef.current();
    };

    socket.on("spreadsheet:sync-start", handleSyncStart);
    socket.on("spreadsheet:command", handleWorkbookUpdate);

    return () => {
      isActive = false;
      if (flushRetryRafRef.current) {
        cancelAnimationFrame(flushRetryRafRef.current);
        flushRetryRafRef.current = 0;
      }
      socket.off("spreadsheet:sync-start", handleSyncStart);
      socket.off("spreadsheet:command", handleWorkbookUpdate);
      resetWorkbookSyncCoordinator(syncCoordinator);
    };
  }, [
    socket,
    spreadsheetId,
    currentUserId,
    syncCoordinator,
    scheduleFlushRetry,
    reportAuthoritativeRevision,
    getAuthoritativeRevision,
  ]);

  useEffect(() => {
    if (!syncCoordinator || !isSpreadsheetReady) {
      return;
    }

    if (syncCoordinator.remoteQueue.length === 0) {
      return;
    }

    if (
      shouldHoldRemoteApplies(syncCoordinator, isApplyingRemoteCommand)
    ) {
      scheduleFlushRetry();
      return;
    }

    void flushRemoteQueueRef.current();
  }, [
    isApplyingRemoteCommand,
    isSpreadsheetReady,
    syncCoordinator,
    scheduleFlushRetry,
  ]);
}
