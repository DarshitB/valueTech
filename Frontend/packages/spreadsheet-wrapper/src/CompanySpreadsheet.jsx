import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { createCompanyUniver } from "./createUniver";
import { getActiveCellAddress, getActiveCellFromUniver, getActiveSheetIdFromUniver, restoreActiveCellSelection, toCellAddress } from "./cellAddress";
import { resolveWorkbookSnapshot } from "./workbookData";
import { sanitizeWorkbookSnapshotForPersistence } from "./workbookSnapshotSanitizer";
import {
  createDatabaseProviderRegistry,
  installDatabaseDropdown,
} from "./dropdown";
import { applyDatabaseDropdownShell } from "./dropdown/dataValidationShell";
import {
  getDatabaseProviderId,
  setDatabaseProviderId,
} from "./dropdown/metadata";
import {
  isLocalFormulaResultRelay,
  isLocalOnlyRealtimeCommand,
  shouldKeepRealtimeCommandLocal,
  shouldPreserveActiveWorksheetOnRemoteCommand,
} from "./realtime/localOnlyCommands";
import {
  clearLocalUndoRedoStacks,
  trySafeLocalRedo,
  trySafeLocalUndo,
} from "./realtime/safeUndo";
import {
  SET_RANGE_VALUES_MUTATION_ID,
  bindCommandParamsToLocalWorkbook,
  createFormulaCalculationController,
  disableUniverAutoRangeValueRecalc,
  shouldScheduleFormulaCalculation,
  waitForWorkbookFormulas,
} from "./realtime/forceFormulaCalculation";
import {
  readLocalEditLocation,
  remoteCommandTouchesLocalEdit,
  withSuppressedEditorRefresh,
} from "./realtime/remoteEditorRefreshGuard";
import { createIdleCellEditCommitController, commitOpenCellEditStaySelected } from "./realtime/idleCellEditCommit";
import {
  installLargerSelectionFillHandle,
  normalizeSelectionBorderColor,
  paintLocalSelectionBorder,
} from "./selectionFillHandle";
import {
  disablePresenceHighlightPointerEvents,
  installPresenceHighlightPointerPassthrough,
} from "./presenceHighlightPointerEvents";
import { installHyperlinkClickOpen } from "./hyperlinkClickOpen";
import { overlayInProgressEdit, buildCommittedSetRangeValuesParams } from "./inProgressEditSnapshot";
import { suppressClipboardPermissionWarning } from "./clipboardPermissionWarning";
import { installDeleteSheetConfirmName } from "./deleteSheetConfirmName";
import "./styles.css";

function getEditLocation(params) {
  const row = params?.row;
  const column = params?.column;
  const worksheetId =
    params?.worksheet?.getSheetId?.() ||
    params?.worksheetId ||
    null;

  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    typeof worksheetId !== "string" ||
    worksheetId.trim().length === 0
  ) {
    return null;
  }

  return {
    row,
    column,
    worksheetId: worksheetId.trim(),
  };
}

function PresenceMarkerLabel({ popup }) {
  const extraProps = popup?.extraProps ?? {};
  const userName =
    typeof extraProps.userName === "string" ? extraProps.userName : "";
  if (!userName) {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: extraProps.backgroundColor || "#2563eb",
        color: extraProps.color || "#ffffff",
        borderRadius: "4px 4px 0 0",
        padding: "2px 6px",
        fontSize: "11px",
        fontWeight: 600,
        lineHeight: "15px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {userName}
      {extraProps.isLease ? " is editing" : ""}
      {extraProps.preview ? `: ${extraProps.preview}` : ""}
    </div>
  );
}

function resolvePresenceRange(worksheet, cellA1) {
  const baseRange = worksheet.getRange(cellA1);
  if (!baseRange) {
    return null;
  }

  // Avoid FRange.getCell() — it requires an active render skeleton and logs
  // errors when presence resync runs during context-menu / metadata updates.
  if (typeof worksheet.getCellMergeData === "function") {
    const mergeRange = worksheet.getCellMergeData(
      baseRange.getRow(),
      baseRange.getColumn()
    );
    if (mergeRange) {
      return mergeRange;
    }
  }

  return baseRange;
}

const CompanySpreadsheet = forwardRef(function CompanySpreadsheet(
  {
    workbookName,
    workbookData = null,
    onReady,
    onError,
    onWorkbookChange,
    onWorkbookRealtimeChange,
    onActiveCellChange,
    isCellEditBlocked,
    onCellEditStart,
    onCellEditChange,
    onCellEditEnd,
    isApplyingRemoteCommandRef,
    onApplyingRemoteCommandChange,
    databaseProviderFetchers = null,
    selectionBorderColor = null,
    initialInProgressEdit = null,
    safeUndoEnabled = false,
  },
  ref
) {
  const containerRef = useRef(null);
  const rootRef = useRef(null);
  const univerApiRef = useRef(null);
  const workbookRef = useRef(null);
  const onWorkbookChangeRef = useRef(onWorkbookChange);
  const onWorkbookRealtimeChangeRef = useRef(onWorkbookRealtimeChange);
  const onActiveCellChangeRef = useRef(onActiveCellChange);
  const isCellEditBlockedRef = useRef(isCellEditBlocked);
  const onCellEditStartRef = useRef(onCellEditStart);
  const onCellEditChangeRef = useRef(onCellEditChange);
  const onCellEditEndRef = useRef(onCellEditEnd);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const lastPublishedActiveCellRef = useRef(null);
  const lastPublishedWorksheetIdRef = useRef(null);
  const selectionReadyRef = useRef(false);
  const remoteApplyDepthRef = useRef(0);
  const isApplyingRemoteCommandLocalRef = useRef(false);
  const lastRealtimeWorkbookSignatureRef = useRef(null);
  const lastRealtimeActiveCellRef = useRef(null);
  const presenceMarkerStateRef = useRef(new Map());
  const latestPresenceMarkersRef = useRef([]);
  const presenceResyncRafRef = useRef(0);
  const presenceForceResyncRafRef = useRef(0);
  const selectionBorderColorRef = useRef(null);
  const formulaCalculationControllerRef = useRef(null);
  const restoreUniverRangeRecalcRef = useRef(() => {});
  const formulaResultWorkbookSyncSkipCountRef = useRef(0);
  const formulaPersistFlushGateRef = useRef(false);
  const inProgressEditRef = useRef(null);
  const restoringDraftRef = useRef(false);
  const pendingDraftCommitRef = useRef(false);
  // Only leave-cell commits are queued here (never remote CommandExecuted echoes).
  const deferredLeaveCellPublishesRef = useRef([]);
  const initialInProgressEditRef = useRef(initialInProgressEdit);
  const safeUndoEnabledRef = useRef(Boolean(safeUndoEnabled));
  const idleCellEditCommitRef = useRef(null);
  const [isInitializing, setIsInitializing] = useState(true);

  selectionBorderColorRef.current =
    normalizeSelectionBorderColor(selectionBorderColor);
  safeUndoEnabledRef.current = Boolean(safeUndoEnabled);

  useEffect(() => {
    onWorkbookChangeRef.current = onWorkbookChange;
  }, [onWorkbookChange]);

  useEffect(() => {
    onWorkbookRealtimeChangeRef.current = onWorkbookRealtimeChange;
  }, [onWorkbookRealtimeChange]);

  useEffect(() => {
    onActiveCellChangeRef.current = onActiveCellChange;
  }, [onActiveCellChange]);

  useEffect(() => {
    isCellEditBlockedRef.current = isCellEditBlocked;
  }, [isCellEditBlocked]);

  useEffect(() => {
    onCellEditStartRef.current = onCellEditStart;
  }, [onCellEditStart]);

  useEffect(() => {
    onCellEditChangeRef.current = onCellEditChange;
  }, [onCellEditChange]);

  useEffect(() => {
    onCellEditEndRef.current = onCellEditEnd;
  }, [onCellEditEnd]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    paintLocalSelectionBorder(
      univerApiRef.current,
      selectionBorderColorRef.current
    );
  }, [selectionBorderColor]);

  const shouldSkipLocalWorkbookSync = () => {
    return (
      restoringDraftRef.current ||
      remoteApplyDepthRef.current > 0 ||
      isApplyingRemoteCommandLocalRef.current ||
      Boolean(isApplyingRemoteCommandRef?.current) ||
      formulaPersistFlushGateRef.current
    );
  };

  const shouldIgnoreSyntheticSelectionEvent = () => {
    return (
      !selectionReadyRef.current ||
      remoteApplyDepthRef.current > 0 ||
      isApplyingRemoteCommandLocalRef.current ||
      Boolean(isApplyingRemoteCommandRef?.current)
    );
  };

  const shouldSkipLocalRealtimeCommandPublish = () => {
    return (
      isApplyingRemoteCommandLocalRef.current ||
      Boolean(isApplyingRemoteCommandRef?.current)
    );
  };

  const flushDeferredLeaveCellPublishes = () => {
    if (shouldSkipLocalRealtimeCommandPublish()) {
      return;
    }
    const pending = deferredLeaveCellPublishesRef.current;
    if (!pending.length) {
      return;
    }
    deferredLeaveCellPublishesRef.current = [];
    pending.forEach((payload) => {
      onWorkbookRealtimeChangeRef.current?.(payload);
    });
  };

  // Peer insert/delete remaps the open editor; keep draft row/col in sync.
  const syncInProgressEditToRemappedEditor = (univerAPI) => {
    const current = inProgressEditRef.current;
    if (!current?.documentData) {
      return;
    }

    const remapped = readLocalEditLocation(univerAPI, null);
    if (
      !remapped?.worksheetId ||
      !Number.isInteger(remapped.row) ||
      !Number.isInteger(remapped.column)
    ) {
      return;
    }

    if (
      current.sheetId === remapped.worksheetId &&
      current.row === remapped.row &&
      current.column === remapped.column
    ) {
      return;
    }

    inProgressEditRef.current = {
      ...current,
      sheetId: remapped.worksheetId,
      row: remapped.row,
      column: remapped.column,
    };
  };

  const captureRealtimeState = (univerAPI) => {
    const workbook =
      workbookRef.current || univerAPI?.getActiveWorkbook?.() || null;

    let workbookSignature = null;
    if (workbook?.save) {
      try {
        workbookSignature = JSON.stringify(workbook.save());
      } catch {
        workbookSignature = null;
      }
    }

    const activeCell = getActiveCellFromUniver(univerAPI);
    return { workbookSignature, activeCell };
  };

  const runPresenceSyncSafely = (callback) => {
    try {
      callback();
    } catch {
      // Presence rendering must never block workbook realtime sync.
    }
  };

  const clearPresenceMarkers = () => {
    if (presenceResyncRafRef.current) {
      cancelAnimationFrame(presenceResyncRafRef.current);
      presenceResyncRafRef.current = 0;
    }
    presenceMarkerStateRef.current.forEach((state) => {
      state.highlightDisposable?.dispose?.();
      state.popupDisposable?.dispose?.();
    });
    presenceMarkerStateRef.current.clear();
  };

  const buildPresenceMarkerSignature = (marker) => {
    const identity = marker?.identity ?? marker?.color ?? {};
    const cell = typeof marker?.cell === "string" ? marker.cell.trim() : "";

    return [
      String(marker?.userId ?? ""),
      String(marker?.worksheetId ?? ""),
      cell,
      String(marker?.userName ?? ""),
      marker?.isCurrentUser ? "1" : "0",
      marker?.isLease ? "1" : "0",
      String(marker?.preview ?? ""),
      identity.borderColor || "",
      identity.labelBackground || "",
      identity.labelColor || "",
    ].join("|");
  };

  const disposePresenceMarker = (userId) => {
    const markerKey = String(userId);
    const state = presenceMarkerStateRef.current.get(markerKey);
    if (!state) {
      return;
    }

    state.highlightDisposable?.dispose?.();
    state.popupDisposable?.dispose?.();
    presenceMarkerStateRef.current.delete(markerKey);
  };

  const createPresenceHighlight = (range, borderColor, strokeWidth = 2) => {
    const disposable = range.highlight({
      strokeWidth,
      stroke: borderColor,
      fill: "rgba(0, 0, 0, 0)",
      rowHeaderFill: "rgba(0, 0, 0, 0)",
      columnHeaderFill: "rgba(0, 0, 0, 0)",
      rowHeaderStroke: borderColor,
      columnHeaderStroke: borderColor,
    });
    disablePresenceHighlightPointerEvents(univerApiRef.current);
    return disposable;
  };

  const createPresenceMarkerParts = (worksheet, marker) => {
    const cell = typeof marker?.cell === "string" ? marker.cell.trim() : "";
    if (!cell) {
      return { highlightDisposable: null, popupDisposable: null };
    }

    const range = resolvePresenceRange(worksheet, cell);
    if (!range) {
      return { highlightDisposable: null, popupDisposable: null };
    }

    const identity = marker?.identity ?? marker?.color ?? {};
    const borderColor = identity.borderColor || "#2563eb";
    const highlightDisposable = createPresenceHighlight(
      range,
      borderColor,
      marker?.isLease ? 3 : 2
    );
    let popupDisposable = null;

    if (!marker?.isCurrentUser && marker?.userName) {
      popupDisposable = range.attachPopup({
        componentKey: PresenceMarkerLabel,
        direction: "top-left",
        offset: [0, -4],
        hideOnInvisible: true,
        customActive: true,
        extraProps: {
          userName: marker.userName,
          backgroundColor: identity.labelBackground || borderColor,
          color: identity.labelColor || "#ffffff",
          isLease: Boolean(marker.isLease),
          preview:
            typeof marker.preview === "string" && marker.preview.trim()
              ? marker.preview.trim().slice(0, 24)
              : "",
        },
      });
    }

    return { highlightDisposable, popupDisposable };
  };

  const refreshPresenceHighlights = () => {
    runPresenceSyncSafely(() => {
      const markers = latestPresenceMarkersRef.current;
      if (!Array.isArray(markers) || markers.length === 0) {
        return;
      }

      const worksheet = univerApiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.();
      if (!worksheet || typeof worksheet.getRange !== "function") {
        return;
      }

      markers.forEach((marker) => {
        const userId = String(marker?.userId ?? "");
        const cell = typeof marker?.cell === "string" ? marker.cell.trim() : "";
        if (!userId || !cell) {
          return;
        }

        const range = resolvePresenceRange(worksheet, cell);
        if (!range) {
          return;
        }

        const identity = marker?.identity ?? marker?.color ?? {};
        const borderColor = identity.borderColor || "#2563eb";
        const existingState = presenceMarkerStateRef.current.get(userId);

        if (!existingState) {
          const parts = createPresenceMarkerParts(worksheet, marker);
          if (!parts.highlightDisposable && !parts.popupDisposable) {
            return;
          }

          presenceMarkerStateRef.current.set(userId, {
            signature: buildPresenceMarkerSignature(marker),
            highlightDisposable: parts.highlightDisposable,
            popupDisposable: parts.popupDisposable,
          });
          return;
        }

        existingState.highlightDisposable?.dispose?.();
        existingState.highlightDisposable =
          createPresenceHighlight(range, borderColor) || null;
      });
    });
  };

  const reattachPresenceMarkersSynchronously = () => {
    runPresenceSyncSafely(() => {
      const markers = latestPresenceMarkersRef.current;
      if (!Array.isArray(markers) || markers.length === 0) {
        return;
      }

      // disposeUnit() already destroyed the old overlays; clear stale handles only.
      presenceMarkerStateRef.current.forEach((state) => {
        state.highlightDisposable?.dispose?.();
        state.popupDisposable?.dispose?.();
      });
      presenceMarkerStateRef.current.clear();

      const worksheet =
        univerApiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.();
      if (!worksheet || typeof worksheet.getRange !== "function") {
        return;
      }

      markers.forEach((marker) => {
        const userId = String(marker?.userId ?? "");
        const cell = typeof marker?.cell === "string" ? marker.cell.trim() : "";
        if (!userId || !cell) {
          return;
        }

        const parts = createPresenceMarkerParts(worksheet, marker);
        if (!parts.highlightDisposable && !parts.popupDisposable) {
          return;
        }

        presenceMarkerStateRef.current.set(userId, {
          signature: buildPresenceMarkerSignature(marker),
          highlightDisposable: parts.highlightDisposable,
          popupDisposable: parts.popupDisposable,
        });
      });
    });
  };

  const syncPresenceMarkers = (markers = [], { force = false } = {}) => {
    latestPresenceMarkersRef.current = Array.isArray(markers) ? markers : [];

    runPresenceSyncSafely(() => {
      if (!Array.isArray(markers) || markers.length === 0) {
        clearPresenceMarkers();
        return;
      }

      const worksheet = univerApiRef.current?.getActiveWorkbook?.()?.getActiveSheet?.();
      if (!worksheet || typeof worksheet.getRange !== "function") {
        return;
      }

      const incomingByUserId = new Map();

      markers.forEach((marker) => {
        const userId = String(marker?.userId ?? "");
        const cell = typeof marker?.cell === "string" ? marker.cell.trim() : "";
        if (!userId || !cell) {
          return;
        }

        incomingByUserId.set(userId, marker);
      });

      for (const userId of [...presenceMarkerStateRef.current.keys()]) {
        if (!incomingByUserId.has(userId)) {
          disposePresenceMarker(userId);
        }
      }

      incomingByUserId.forEach((marker, userId) => {
        const signature = buildPresenceMarkerSignature(marker);
        const existingState = presenceMarkerStateRef.current.get(userId);

        if (!force && existingState?.signature === signature) {
          return;
        }

        disposePresenceMarker(userId);

        const parts = createPresenceMarkerParts(worksheet, marker);
        if (!parts.highlightDisposable && !parts.popupDisposable) {
          return;
        }

        presenceMarkerStateRef.current.set(userId, {
          signature,
          highlightDisposable: parts.highlightDisposable,
          popupDisposable: parts.popupDisposable,
        });
      });
    });
  };

  const schedulePresenceResync = ({ force = false } = {}) => {
    if (!latestPresenceMarkersRef.current.length) {
      return;
    }

    if (!force && shouldSkipLocalWorkbookSync()) {
      return;
    }

    if (force) {
      if (presenceResyncRafRef.current) {
        cancelAnimationFrame(presenceResyncRafRef.current);
        presenceResyncRafRef.current = 0;
      }

      if (presenceForceResyncRafRef.current) {
        cancelAnimationFrame(presenceForceResyncRafRef.current);
      }

      presenceForceResyncRafRef.current = requestAnimationFrame(() => {
        presenceForceResyncRafRef.current = 0;
        runPresenceSyncSafely(() => {
          clearPresenceMarkers();
          syncPresenceMarkers(latestPresenceMarkersRef.current, { force: true });
        });
      });
      return;
    }

    if (presenceResyncRafRef.current) {
      return;
    }

    presenceResyncRafRef.current = requestAnimationFrame(() => {
      presenceResyncRafRef.current = 0;
      refreshPresenceHighlights();
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      getWorkbookData: async () => {
        const workbook =
          workbookRef.current ||
          univerApiRef.current?.getActiveWorkbook?.() ||
          null;

        if (!workbook || typeof workbook.save !== "function") {
          throw new Error("Spreadsheet workbook is not ready to export.");
        }

        await formulaCalculationControllerRef.current?.flushBeforePersist(
          univerApiRef.current
        );

        const workbookData = sanitizeWorkbookSnapshotForPersistence(
          workbook.save()
        );
        return overlayInProgressEdit(
          workbookData,
          inProgressEditRef.current
        );
      },
      getWorkbookDataForSync: () => {
        const workbook =
          workbookRef.current ||
          univerApiRef.current?.getActiveWorkbook?.() ||
          null;

        if (!workbook || typeof workbook.save !== "function") {
          return null;
        }

        return sanitizeWorkbookSnapshotForPersistence(workbook.save());
      },
      applyWorkbookData: async (incomingWorkbookData) => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI || incomingWorkbookData == null) {
          return false;
        }

        const currentWorkbook =
          workbookRef.current || univerAPI.getActiveWorkbook?.() || null;

        if (!currentWorkbook) {
          return false;
        }

        let activeSheetId = null;
        let preservedActiveCell = null;

        try {
          activeSheetId = currentWorkbook.getActiveSheet?.()?.getSheetId?.() ?? null;
          preservedActiveCell =
            lastPublishedActiveCellRef.current ||
            getActiveCellFromUniver(univerAPI);
        } catch {
          activeSheetId = null;
          preservedActiveCell = lastPublishedActiveCellRef.current;
        }

        const unitId = currentWorkbook.getId?.();
        if (!unitId || typeof univerAPI.disposeUnit !== "function") {
          return false;
        }

        const snapshot = resolveWorkbookSnapshot(
          workbookName,
          incomingWorkbookData
        );
        const mutableSnapshot =
          typeof structuredClone === "function"
            ? structuredClone(snapshot)
            : JSON.parse(JSON.stringify(snapshot));

        mutableSnapshot.id = unitId;

        const setApplyingRemoteWorkbook = (isApplying) => {
          isApplyingRemoteCommandLocalRef.current = Boolean(isApplying);
          if (isApplyingRemoteCommandRef) {
            isApplyingRemoteCommandRef.current = Boolean(isApplying);
          }
          onApplyingRemoteCommandChange?.(Boolean(isApplying));
        };

        const finishRemoteWorkbookApply = () => {
          setApplyingRemoteWorkbook(false);
        };

        setApplyingRemoteWorkbook(true);
        remoteApplyDepthRef.current += 1;

        try {
          univerAPI.disposeUnit(unitId);
          workbookRef.current = univerAPI.createWorkbook(mutableSnapshot);
          restoreUniverRangeRecalcRef.current =
            disableUniverAutoRangeValueRecalc(univerAPI);

          const nextWorkbook = workbookRef.current;
          if (!nextWorkbook) {
            return false;
          }

          if (activeSheetId) {
            const previousSheet = nextWorkbook.getSheetBySheetId?.(activeSheetId);
            if (previousSheet) {
              nextWorkbook.setActiveSheet(previousSheet);
            }
          }

          const activeSheet = nextWorkbook.getActiveSheet?.();
          if (preservedActiveCell && activeSheet) {
            restoreActiveCellSelection(activeSheet, preservedActiveCell);
            lastPublishedActiveCellRef.current = preservedActiveCell;
            lastPublishedWorksheetIdRef.current =
              activeSheet.getSheetId?.() ?? activeSheetId;
          }

          // Reattach in the same synchronous turn as createWorkbook so the
          // browser never paints a frame without presence overlays.
          reattachPresenceMarkersSynchronously();

          return true;
        } catch {
          return false;
        } finally {
          remoteApplyDepthRef.current = Math.max(0, remoteApplyDepthRef.current - 1);
          finishRemoteWorkbookApply();
        }
      },
      executeRealtimeCommand: async (commandId, commandParams = null) => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand || typeof commandId !== "string") {
          return false;
        }

        const normalizedCommandId = commandId.trim();
        if (!normalizedCommandId) {
          return false;
        }

        if (isLocalOnlyRealtimeCommand(normalizedCommandId)) {
          return true;
        }
        if (
          safeUndoEnabledRef.current &&
          shouldKeepRealtimeCommandLocal(normalizedCommandId, {
            safeUndoEnabled: true,
          })
        ) {
          return true;
        }

        isApplyingRemoteCommandLocalRef.current = true;
        if (isApplyingRemoteCommandRef) {
          isApplyingRemoteCommandRef.current = true;
        }
        onApplyingRemoteCommandChange?.(true);

        try {
          const localCommandParams = bindCommandParamsToLocalWorkbook(
            univerAPI,
            commandParams ?? undefined
          );
          const previousSheetId = shouldPreserveActiveWorksheetOnRemoteCommand(
            normalizedCommandId
          )
            ? getActiveSheetIdFromUniver(univerAPI)
            : null;

          const localEdit = readLocalEditLocation(
            univerAPI,
            inProgressEditRef.current
          );
          const suppressEditorRefresh =
            Boolean(localEdit) &&
            !remoteCommandTouchesLocalEdit(localCommandParams, localEdit);

          const result = await withSuppressedEditorRefresh(
            univerAPI,
            suppressEditorRefresh,
            async () => {
              const applied = await Promise.resolve(
                univerAPI.executeCommand(
                  normalizedCommandId,
                  localCommandParams ?? undefined,
                  { fromCollab: true }
                )
              );

              const workbook = univerAPI.getActiveWorkbook?.();
              const currentSheetId = getActiveSheetIdFromUniver(univerAPI);
              if (
                previousSheetId &&
                currentSheetId &&
                currentSheetId !== previousSheetId &&
                workbook?.getSheetBySheetId?.(previousSheetId)
              ) {
                await Promise.resolve(
                  univerAPI.executeCommand(
                    "sheet.operation.set-worksheet-active",
                    {
                      unitId: workbook.getUnitId?.(),
                      subUnitId: previousSheetId,
                    },
                    { fromCollab: true, onlyLocal: true }
                  )
                );
              }

              if (
                shouldScheduleFormulaCalculation(
                  normalizedCommandId,
                  localCommandParams,
                  null
                )
              ) {
                formulaCalculationControllerRef.current?.schedule(
                  univerAPI,
                  localCommandParams,
                  { immediate: true }
                );
                await formulaCalculationControllerRef.current?.flushBeforePersist(
                  univerAPI
                );
              }

              return applied;
            }
          );

          const stateAfterReplay = captureRealtimeState(univerAPI);
          lastRealtimeWorkbookSignatureRef.current =
            stateAfterReplay.workbookSignature;
          lastRealtimeActiveCellRef.current = stateAfterReplay.activeCell;

          if (safeUndoEnabledRef.current && result) {
            clearLocalUndoRedoStacks(univerAPI);
          }

          syncInProgressEditToRemappedEditor(univerAPI);

          return Boolean(result);
        } catch {
          return false;
        } finally {
          isApplyingRemoteCommandLocalRef.current = false;
          if (isApplyingRemoteCommandRef) {
            isApplyingRemoteCommandRef.current = false;
          }
          onApplyingRemoteCommandChange?.(false);
          flushDeferredLeaveCellPublishes();
        }
      },
      undo: () => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand) {
          return "unavailable";
        }
        if (!safeUndoEnabledRef.current) {
          return univerAPI.executeCommand("univer.command.undo")
            ? "undone"
            : "blocked";
        }
        return trySafeLocalUndo(univerAPI);
      },
      redo: () => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand) {
          return "unavailable";
        }
        if (!safeUndoEnabledRef.current) {
          return univerAPI.executeCommand("univer.command.redo")
            ? "redone"
            : "blocked";
        }
        return trySafeLocalRedo(univerAPI);
      },
      insertCellLineBreak: () => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand) {
          return false;
        }

        return Boolean(univerAPI.executeCommand("doc.command.break-line"));
      },
      openFind: () => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand) {
          return false;
        }

        return Boolean(univerAPI.executeCommand("ui.operation.open-find-dialog"));
      },
      openReplace: () => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand) {
          return false;
        }

        return Boolean(
          univerAPI.executeCommand("ui.operation.open-replace-dialog")
        );
      },
      isFocused: () => {
        const root = rootRef.current;
        const activeElement = document.activeElement;
        return Boolean(
          root &&
            activeElement &&
            activeElement instanceof Node &&
            root.contains(activeElement)
        );
      },
      getInProgressEdit: () => {
        const edit = inProgressEditRef.current;
        if (
          !edit?.sheetId ||
          !Number.isInteger(edit.row) ||
          !Number.isInteger(edit.column) ||
          !edit.documentData
        ) {
          return null;
        }

        return {
          sheetId: edit.sheetId,
          row: edit.row,
          column: edit.column,
          documentData: edit.documentData,
        };
      },
      abortCellEditing: () => {
        const workbook =
          workbookRef.current ||
          univerApiRef.current?.getActiveWorkbook?.() ||
          null;
        if (!workbook?.isCellEditing?.()) {
          return false;
        }
        if (typeof workbook.abortEditingAsync === "function") {
          void workbook.abortEditingAsync();
          return true;
        }
        if (typeof workbook.endEditingAsync === "function") {
          void workbook.endEditingAsync(false);
          return true;
        }
        return false;
      },
      endCellEditing: (save = true) => {
        const workbook =
          workbookRef.current ||
          univerApiRef.current?.getActiveWorkbook?.() ||
          null;
        if (!workbook?.isCellEditing?.()) {
          return false;
        }
        if (typeof workbook.endEditingAsync === "function") {
          void workbook.endEditingAsync(Boolean(save));
          return true;
        }
        if (save === false && typeof workbook.abortEditingAsync === "function") {
          void workbook.abortEditingAsync();
          return true;
        }
        return false;
      },
      syncPresenceMarkers,
    }),
    [workbookName, isApplyingRemoteCommandRef, onApplyingRemoteCommandChange]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let isDisposed = false;
    let univerAPI;
    const changeEventDisposables = [];
    let databaseDropdownDisposable = () => {};
    let selectionFillHandleDisposable = () => {};
    let presencePointerPassthroughDisposable = () => {};
    let hyperlinkClickOpenDisposable = () => {};
    let clipboardPermissionWarningDisposable = () => {};
    let deleteSheetConfirmNameDisposable = () => {};

    setIsInitializing(true);
    inProgressEditRef.current = null;
    idleCellEditCommitRef.current?.dispose();
    idleCellEditCommitRef.current = createIdleCellEditCommitController({
      onIdleCommit: () => {
        // Keep typed text, leave edit mode, stay on the same cell.
        // Do not use endEditingAsync(true): that sends Enter and moves down.
        commitOpenCellEditStaySelected(univerApiRef.current);
      },
    });
    formulaCalculationControllerRef.current?.dispose();
    formulaCalculationControllerRef.current = createFormulaCalculationController({
      onPersistFlushChange: (isFlushing) => {
        formulaPersistFlushGateRef.current = Boolean(isFlushing);
      },
    });

    // Must register before createCompanyUniver so this runs before Univer's
    // window-capture shortcut handler.
    const handleCellEnterShortcut = (event) => {
      if (isDisposed) {
        return;
      }

      if (String(event.key || "").toLowerCase() !== "enter" || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest("[data-u-comp='find-replace-dialog']") ||
          target.closest(".univer-find-input"))
      ) {
        return;
      }

      const workbook =
        workbookRef.current || univerApiRef.current?.getActiveWorkbook?.();
      if (!workbook) {
        return;
      }

      const isEditing = Boolean(workbook.isCellEditing?.());
      const isCmdOrCtrlEnter =
        (event.metaKey || event.ctrlKey) && !event.altKey;
      const isAltOrOptionEnter =
        event.altKey && !event.metaKey && !event.ctrlKey;
      const isPlainEnter =
        !event.metaKey && !event.ctrlKey && !event.altKey;

      if (isEditing) {
        if (isCmdOrCtrlEnter) {
          event.preventDefault();
          event.stopImmediatePropagation();
          univerApiRef.current?.executeCommand?.("doc.command.break-line");
          return;
        }

        if (isAltOrOptionEnter) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }

        return;
      }

      if (!isPlainEnter) {
        return;
      }

      const root = rootRef.current;
      const activeElement = document.activeElement;
      const isInSheet =
        (root && target instanceof Node && root.contains(target)) ||
        (root &&
          activeElement instanceof Node &&
          root.contains(activeElement));
      const isOnPageBody =
        Boolean(root) &&
        (target === document.body ||
          target === document.documentElement ||
          activeElement === document.body);

      if (!isInSheet && !isOnPageBody) {
        return;
      }

      if (
        activeElement instanceof HTMLElement &&
        !activeElement.closest("[data-u-comp='editor']")
      ) {
        const tagName = activeElement.tagName.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          activeElement.isContentEditable
        ) {
          return;
        }
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      workbook.startEditing?.();
    };

    window.addEventListener("keydown", handleCellEnterShortcut, true);

    void (async () => {
    try {
      ({ univerAPI } = createCompanyUniver(container));
      univerApiRef.current = univerAPI;
      clipboardPermissionWarningDisposable =
        suppressClipboardPermissionWarning(univerAPI);
      deleteSheetConfirmNameDisposable =
        installDeleteSheetConfirmName(univerAPI);
      selectionFillHandleDisposable = installLargerSelectionFillHandle(
        univerAPI,
        () => selectionBorderColorRef.current
      );
      presencePointerPassthroughDisposable =
        installPresenceHighlightPointerPassthrough(univerAPI);
      hyperlinkClickOpenDisposable = installHyperlinkClickOpen(univerAPI);

      const notifyWorkbookChange = (event = {}) => {
        if (shouldSkipLocalWorkbookSync()) {
          return;
        }

        // Formula-engine result writes are not user edits. Treating them as
        // dirty retriggered autosave in a Saving... loop after persist recalc.
        if (formulaResultWorkbookSyncSkipCountRef.current > 0) {
          formulaResultWorkbookSyncSkipCountRef.current -= 1;
          return;
        }

        const payload = event?.payload;
        if (
          isLocalFormulaResultRelay({
            id: payload?.id ?? event?.id,
            params: payload?.params ?? event?.params,
            options: event?.options,
          })
        ) {
          return;
        }

        onWorkbookChangeRef.current?.();
        schedulePresenceResync();
      };

      const notifyRealtimeCommand = (event = {}) => {
        const isFormulaEngineEvent = isLocalFormulaResultRelay(event);

        // Formula entry first performs a local-only normalization write, then
        // finishes the original set-range-values command. Advancing the
        // signature for that nested write made the original formula look
        // unchanged, so it was never published to collaborators.
        if (
          isFormulaEngineEvent &&
          event?.options?.applyFormulaCalculationResult !== true
        ) {
          return;
        }

        const stateAfterCommand = captureRealtimeState(univerAPI);
        const previousWorkbookSignature = lastRealtimeWorkbookSignatureRef.current;
        const previousActiveCell = lastRealtimeActiveCellRef.current;
        const workbookChanged =
          previousWorkbookSignature != null &&
          stateAfterCommand.workbookSignature != null
            ? previousWorkbookSignature !== stateAfterCommand.workbookSignature
            : false;
        const selectionChanged =
          previousActiveCell != null || stateAfterCommand.activeCell != null
            ? previousActiveCell !== stateAfterCommand.activeCell
            : false;

        lastRealtimeWorkbookSignatureRef.current =
          stateAfterCommand.workbookSignature;
        lastRealtimeActiveCellRef.current = stateAfterCommand.activeCell;

        // Recalc dependents after a typed cell write. Peer applies recalc in
        // executeRealtimeCommand so this path stays single-user debounce only.
        if (
          !shouldSkipLocalRealtimeCommandPublish() &&
          shouldScheduleFormulaCalculation(
            event?.id,
            event?.params,
            event?.options
          )
        ) {
          formulaCalculationControllerRef.current?.schedule(
            univerAPI,
            event?.params
          );
        }

        if (shouldSkipLocalRealtimeCommandPublish()) {
          return;
        }

        const commandId = String(event?.id ?? "").trim();
        if (!commandId) {
          return;
        }

        if (
          shouldKeepRealtimeCommandLocal(commandId, {
            safeUndoEnabled: safeUndoEnabledRef.current,
          })
        ) {
          return;
        }

        if (isFormulaEngineEvent) {
          return;
        }

        const commandParams =
          event?.params &&
          typeof event.params === "object" &&
          !Array.isArray(event.params)
            ? event.params
            : {};

        // Publish only commands that actually changed workbook contents.
        // This keeps cursor/selection/focus/viewport commands local.
        if (!workbookChanged) {
          return;
        }

        // Sheet add/delete/rename does not fire SheetValueChanged, so cell-only
        // autosave would leave those tab changes unsaved across refresh.
        notifyWorkbookChange(event);

        onWorkbookRealtimeChangeRef.current?.({
          commandId,
          commandParams,
        });
      };

      // Reset so a re-initialized workbook does not inherit a stale active cell.
      lastPublishedActiveCellRef.current = null;
      lastPublishedWorksheetIdRef.current = null;
      selectionReadyRef.current = false;
      clearPresenceMarkers();

      const publishActiveCell = (cell, worksheetId) => {
        const normalizedCell =
          typeof cell === "string" && cell.trim().length > 0
            ? cell.trim()
            : null;
        const normalizedWorksheetId =
          typeof worksheetId === "string" && worksheetId.trim().length > 0
            ? worksheetId.trim()
            : null;

        if (!normalizedCell || !normalizedWorksheetId) {
          return;
        }

        if (
          normalizedCell === lastPublishedActiveCellRef.current &&
          normalizedWorksheetId === lastPublishedWorksheetIdRef.current
        ) {
          return;
        }

        lastPublishedActiveCellRef.current = normalizedCell;
        lastPublishedWorksheetIdRef.current = normalizedWorksheetId;
        onActiveCellChangeRef.current?.({
          cell: normalizedCell,
          worksheetId: normalizedWorksheetId,
        });
      };

      const resolveActiveWorksheetId = (params) => {
        const fromParams =
          params?.activeSheet?.getSheetId?.() ??
          params?.worksheet?.getSheetId?.() ??
          null;

        if (typeof fromParams === "string" && fromParams.trim().length > 0) {
          return fromParams.trim();
        }

        return getActiveSheetIdFromUniver(univerAPI);
      };

      // Read from the event payload first — getActiveCell() can lag behind SelectionChanged.
      const notifyActiveCellChange = (params) => {
        if (shouldIgnoreSyntheticSelectionEvent()) return;

        const cell =
          getActiveCellAddress(params) || getActiveCellFromUniver(univerAPI);
        const worksheetId = resolveActiveWorksheetId(params);
        publishActiveCell(cell, worksheetId);
        schedulePresenceResync();
      };

      const notifyActiveSheetChange = (params) => {
        if (shouldIgnoreSyntheticSelectionEvent()) return;

        const worksheetId = resolveActiveWorksheetId(params);
        const cell = getActiveCellFromUniver(univerAPI);
        publishActiveCell(cell, worksheetId);
        schedulePresenceResync({ force: true });
      };

      const subscribeSelectionEvent = (eventName) => {
        if (!eventName) return;
        changeEventDisposables.push(
          univerAPI.addEvent(eventName, notifyActiveCellChange)
        );
      };

      if (univerAPI?.addEvent && univerAPI?.Event) {
        // Mark formula-result writes before SheetValueChanged so autosave
        // does not treat Message `v` updates as a new user edit.
        if (univerAPI.Event.BeforeCommandExecute) {
          changeEventDisposables.push(
            univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
              if (
                String(event?.id ?? "").trim() !== SET_RANGE_VALUES_MUTATION_ID
              ) {
                return;
              }

              if (!isLocalFormulaResultRelay(event)) {
                return;
              }

              formulaResultWorkbookSyncSkipCountRef.current += 1;
              queueMicrotask(() => {
                formulaResultWorkbookSyncSkipCountRef.current = 0;
              });
            })
          );
        }

        if (univerAPI.Event.SheetValueChanged) {
          changeEventDisposables.push(
            univerAPI.addEvent(
              univerAPI.Event.SheetValueChanged,
              notifyWorkbookChange
            )
          );
        }

        if (univerAPI.Event.BeforeSheetEditStart) {
          changeEventDisposables.push(
            univerAPI.addEvent(
              univerAPI.Event.BeforeSheetEditStart,
              (params) => {
                const location = getEditLocation(params);
                if (
                  location &&
                  isCellEditBlockedRef.current?.(location)
                ) {
                  params.cancel = true;
                }
              }
            )
          );
        }

        if (univerAPI.Event.SheetEditStarted) {
          changeEventDisposables.push(
            univerAPI.addEvent(
              univerAPI.Event.SheetEditStarted,
              (params) => {
                if (!restoringDraftRef.current) {
                  inProgressEditRef.current = null;
                  notifyWorkbookChange(params);
                }
                // Idle countdown starts/resets only after typing activity below.
                // Opening the editor alone does not start the 20s timer.
                idleCellEditCommitRef.current?.clear();
                const location = getEditLocation(params);
                if (location) {
                  onCellEditStartRef.current?.(location);
                }
              }
            )
          );
        }

        if (univerAPI.Event.SheetEditChanging) {
          changeEventDisposables.push(
            univerAPI.addEvent(
              univerAPI.Event.SheetEditChanging,
              (params) => {
                const documentData = params?.value?.getData?.();
                const sheetId = params?.worksheet?.getSheetId?.();

                if (
                  documentData &&
                  sheetId &&
                  Number.isInteger(params?.row) &&
                  Number.isInteger(params?.column)
                ) {
                  inProgressEditRef.current = {
                    sheetId,
                    row: params.row,
                    column: params.column,
                    documentData:
                      typeof structuredClone === "function"
                        ? structuredClone(documentData)
                        : JSON.parse(JSON.stringify(documentData)),
                  };
                  const location = getEditLocation(params);
                  if (location) {
                    onCellEditChangeRef.current?.(location, documentData);
                  }
                }

                idleCellEditCommitRef.current?.bump();
                notifyWorkbookChange(params);
              }
            )
          );
        }

        if (univerAPI.Event.SheetEditEnded) {
          changeEventDisposables.push(
            univerAPI.addEvent(univerAPI.Event.SheetEditEnded, (params) => {
              idleCellEditCommitRef.current?.clear();
              const edit = inProgressEditRef.current;
              const endedLocation = getEditLocation(params);
              const shouldForceRealtimeCommit =
                pendingDraftCommitRef.current && params?.isConfirm !== false;
              const leaveDuringRemoteApply =
                params?.isConfirm !== false &&
                Boolean(edit) &&
                shouldSkipLocalRealtimeCommandPublish();
              pendingDraftCommitRef.current = false;
              inProgressEditRef.current = null;
              onCellEditEndRef.current?.(endedLocation);
              // Leaving the editor must persist the committed cell. Autosave
              // during typing saved a snapshot without this draft.
              notifyWorkbookChange(params);
              if ((shouldForceRealtimeCommit || leaveDuringRemoteApply) && edit) {
                const remappedEdit =
                  endedLocation != null
                    ? {
                        ...edit,
                        sheetId: endedLocation.worksheetId,
                        row: endedLocation.row,
                        column: endedLocation.column,
                      }
                    : edit;
                const workbook = univerAPI.getActiveWorkbook?.();
                const commandParams = buildCommittedSetRangeValuesParams(
                  remappedEdit,
                  workbook?.getId?.() || workbook?.getUnitId?.() || ""
                );
                if (commandParams) {
                  const payload = {
                    commandId: SET_RANGE_VALUES_MUTATION_ID,
                    commandParams,
                  };
                  // B5: CommandExecuted publish is skipped while a peer apply is
                  // in flight — queue only this leave-cell commit (do not queue
                  // remote echoes from notifyRealtimeCommand).
                  if (shouldSkipLocalRealtimeCommandPublish()) {
                    deferredLeaveCellPublishesRef.current.push(payload);
                  } else {
                    onWorkbookRealtimeChangeRef.current?.(payload);
                  }
                }
              }
            })
          );
        }

        if (univerAPI.Event.CommandExecuted) {
          changeEventDisposables.push(
            univerAPI.addEvent(
              univerAPI.Event.CommandExecuted,
              notifyRealtimeCommand
            )
          );
        }
      }

      if (databaseProviderFetchers) {
        const registry = createDatabaseProviderRegistry(databaseProviderFetchers);
        databaseDropdownDisposable = installDatabaseDropdown(univerAPI, {
          registry,
          onWorkbookDataChange: notifyWorkbookChange,
        });
      }

      const snapshot = resolveWorkbookSnapshot(workbookName, workbookData);
      const mutableSnapshot =
        typeof structuredClone === "function"
          ? structuredClone(snapshot)
          : JSON.parse(JSON.stringify(snapshot));
      workbookRef.current = univerAPI.createWorkbook(mutableSnapshot);
      restoreUniverRangeRecalcRef.current =
        disableUniverAutoRangeValueRecalc(univerAPI);

      const initialRealtimeState = captureRealtimeState(univerAPI);
      lastRealtimeWorkbookSignatureRef.current =
        initialRealtimeState.workbookSignature;
      lastRealtimeActiveCellRef.current = initialRealtimeState.activeCell;

      try {
        await waitForWorkbookFormulas(univerAPI);
      } catch {
        // Open the sheet even if the first formula pass times out.
      }

      if (isDisposed) {
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isDisposed) return;

          // Subscribe after createWorkbook — finalized selection / pointer events only.
          if (univerAPI?.addEvent && univerAPI?.Event) {
            subscribeSelectionEvent(univerAPI.Event.SelectionChanged);
            subscribeSelectionEvent(univerAPI.Event.SelectionMoveEnd);
            subscribeSelectionEvent(univerAPI.Event.CellPointerUp);

            if (univerAPI.Event.ActiveSheetChanged) {
              changeEventDisposables.push(
                univerAPI.addEvent(
                  univerAPI.Event.ActiveSheetChanged,
                  notifyActiveSheetChange
                )
              );
            }
          }

          selectionReadyRef.current = true;

          // Publish the default selection (e.g. A1) once the sheet is interactive.
          const initialCell = getActiveCellFromUniver(univerAPI);
          const initialWorksheetId = getActiveSheetIdFromUniver(univerAPI);
          if (initialCell && initialWorksheetId) {
            publishActiveCell(initialCell, initialWorksheetId);
          }

          setIsInitializing(false);
          onReadyRef.current?.();

          const restoredEdit = initialInProgressEditRef.current;
          if (
            restoredEdit?.sheetId &&
            Number.isInteger(restoredEdit.row) &&
            Number.isInteger(restoredEdit.column)
          ) {
            const workbook = univerAPI.getActiveWorkbook?.();
            const sheet = workbook?.getSheetBySheetId?.(restoredEdit.sheetId);
            if (sheet) {
              restoreActiveCellSelection(
                sheet,
                toCellAddress(restoredEdit.row, restoredEdit.column)
              );
              restoringDraftRef.current = true;
              pendingDraftCommitRef.current = true;
              inProgressEditRef.current = restoredEdit;
              workbook.startEditing?.();
              queueMicrotask(() => {
                restoringDraftRef.current = false;
              });
            }
          }
        });
      });
    } catch (error) {
      if (!isDisposed) {
        setIsInitializing(false);
        onErrorRef.current?.(error);
      }
    }
    })();

    return () => {
      isDisposed = true;
      window.removeEventListener("keydown", handleCellEnterShortcut, true);
      selectionReadyRef.current = false;
      remoteApplyDepthRef.current = 0;
      isApplyingRemoteCommandLocalRef.current = false;
      lastRealtimeWorkbookSignatureRef.current = null;
      lastRealtimeActiveCellRef.current = null;
      deferredLeaveCellPublishesRef.current = [];
      if (isApplyingRemoteCommandRef) {
        isApplyingRemoteCommandRef.current = false;
      }
      if (presenceResyncRafRef.current) {
        cancelAnimationFrame(presenceResyncRafRef.current);
        presenceResyncRafRef.current = 0;
      }
      if (presenceForceResyncRafRef.current) {
        cancelAnimationFrame(presenceForceResyncRafRef.current);
        presenceForceResyncRafRef.current = 0;
      }
      clearPresenceMarkers();
      changeEventDisposables.forEach((disposable) => disposable?.dispose?.());
      databaseDropdownDisposable?.();
      selectionFillHandleDisposable?.();
      presencePointerPassthroughDisposable?.();
      hyperlinkClickOpenDisposable?.();
      clipboardPermissionWarningDisposable?.();
      deleteSheetConfirmNameDisposable?.();
      restoreUniverRangeRecalcRef.current?.();
      restoreUniverRangeRecalcRef.current = () => {};
      formulaCalculationControllerRef.current?.dispose();
      formulaCalculationControllerRef.current = null;
      idleCellEditCommitRef.current?.dispose();
      idleCellEditCommitRef.current = null;
      formulaResultWorkbookSyncSkipCountRef.current = 0;
      formulaPersistFlushGateRef.current = false;
      inProgressEditRef.current = null;
      workbookRef.current = null;
      univerApiRef.current = null;
      univerAPI?.dispose();
    };
  }, [workbookName, workbookData, databaseProviderFetchers]);

  return (
    <div ref={rootRef} className="company-spreadsheet">
      {isInitializing && (
        <div className="company-spreadsheet__loading">
        <div className="loading-indicator" role="status" aria-live="polite">
          <div className="spinner-border" aria-hidden="true" />
          <span>Loading...</span>
        </div>
        </div>
      )}
      <div ref={containerRef} className="company-spreadsheet__container" />
    </div>
  );
});

export default CompanySpreadsheet;
