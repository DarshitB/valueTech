import { useCallback, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { isLocalOnlyRealtimeCommand } from "@spreadsheet-wrapper";
import { useSpreadsheetRealtime } from "../realtime/spreadsheet";
import {
  enqueueRemoteWorkbookUpdate,
  recordAppliedSequence,
  resetWorkbookSyncCoordinator,
  shouldHoldRemoteApplies,
  SYNC_IN_FLIGHT_STUCK_MS,
} from "./workbookSyncCoordinator";

/**
 * Apply remote workbook snapshots from the shared realtime connection.
 *
 * Phase 2.5: queues remote snapshots while local changes are pending, applies
 * in strict server sequence order, and ignores duplicates/stale packets.
 */
export function useSpreadsheetWorkbookSubscriber({
  spreadsheetRef,
  isSpreadsheetReady,
  isApplyingRemoteCommand,
  syncCoordinator,
}) {
  const { socket, spreadsheetId } = useSpreadsheetRealtime();
  const currentUserId = useSelector((state) => state.auth.user?.id);
  const applyInFlightRef = useRef(false);
  const applyInFlightSinceRef = useRef(0);
  const flushRemoteQueueRef = useRef(async () => false);
  const flushRetryRafRef = useRef(0);
  const isApplyingRemoteCommandRef = useRef(isApplyingRemoteCommand);

  isApplyingRemoteCommandRef.current = isApplyingRemoteCommand;

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

      if (isHeld()) {
        return false;
      }

      let appliedAny = false;

      while (coordinator.remoteQueue.length > 0) {
        if (isHeld()) {
          break;
        }

        recoverStuckApply();
        if (applyInFlightRef.current) {
          break;
        }

        const nextSequence = coordinator.lastAppliedSequence + 1;
        const nextIndex = coordinator.remoteQueue.findIndex(
          (entry) => entry.sequence === nextSequence
        );

        if (nextIndex < 0) {
          const lowest = coordinator.remoteQueue[0];
          if (!lowest || lowest.sequence <= coordinator.lastAppliedSequence) {
            coordinator.remoteQueue.splice(0, 1);
            continue;
          }

          // Catch up when an intermediate sequence was dropped — snapshot LWW still converges.
          if (lowest.sequence > nextSequence) {
            const [catchUpUpdate] = coordinator.remoteQueue.splice(0, 1);

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
              }
            } catch {
              // Best-effort apply; a newer update may arrive next.
            } finally {
              endApplyInFlight();
            }

            continue;
          }

          break;
        }

        const [nextUpdate] = coordinator.remoteQueue.splice(nextIndex, 1);

        if (
          !nextUpdate ||
          nextUpdate.sequence <= coordinator.lastAppliedSequence ||
          coordinator.appliedSequences.has(nextUpdate.sequence)
        ) {
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
            appliedAny = true;
          } else {
            console.error("[RealtimeCommand] remote replay returned false", {
              sequence: nextUpdate.sequence,
              commandId: nextUpdate.commandId,
              commandParams: nextUpdate.commandParams,
            });
          }
        } catch (error) {
          console.error("[RealtimeCommand] remote replay threw error", {
            sequence: nextUpdate.sequence,
            commandId: nextUpdate.commandId,
            commandParams: nextUpdate.commandParams,
            error,
          });
        } finally {
          endApplyInFlight();
        }
      }

      return appliedAny;
    },
    [
      spreadsheetRef,
      syncCoordinator,
      recoverStuckApply,
      beginApplyInFlight,
      endApplyInFlight,
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
        )
      ) {
        flushRetryRafRef.current = requestAnimationFrame(retry);
        return;
      }

      void flushRemoteQueueRef.current();
    };

    flushRetryRafRef.current = requestAnimationFrame(retry);
  }, [syncCoordinator]);

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
    if (!socket || !spreadsheetId || !isSpreadsheetReady || !syncCoordinator) {
      if (syncCoordinator) {
        resetWorkbookSyncCoordinator(syncCoordinator);
      }
      return undefined;
    }

    let isActive = true;

    const handleWorkbookUpdate = (payload = {}) => {
      if (!isActive) return;
      if (payload.spreadsheet_id !== spreadsheetId) return;

      const {
        userId,
        command_id: commandId,
        command_params: commandParams,
        sequence,
      } = payload;

      if (
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
        if (typeof sequence === "number" && Number.isFinite(sequence)) {
          if (sequence > syncCoordinator.lastAppliedSequence) {
            syncCoordinator.lastAppliedSequence = sequence;
            recordAppliedSequence(syncCoordinator, sequence);
          }
        }
        return;
      }

      const queued = enqueueRemoteWorkbookUpdate(syncCoordinator, {
        sequence,
        commandId: normalizedCommandId,
        commandParams:
          commandParams &&
          typeof commandParams === "object" &&
          !Array.isArray(commandParams)
            ? commandParams
            : {},
      });

      if (!queued && sequence <= syncCoordinator.lastAppliedSequence) {
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

    socket.on("spreadsheet:command", handleWorkbookUpdate);

    return () => {
      isActive = false;
      if (flushRetryRafRef.current) {
        cancelAnimationFrame(flushRetryRafRef.current);
        flushRetryRafRef.current = 0;
      }
      socket.off("spreadsheet:command", handleWorkbookUpdate);
      resetWorkbookSyncCoordinator(syncCoordinator);
    };
  }, [
    socket,
    spreadsheetId,
    isSpreadsheetReady,
    currentUserId,
    syncCoordinator,
    scheduleFlushRetry,
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
