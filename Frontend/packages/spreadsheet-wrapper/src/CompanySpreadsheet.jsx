import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { createCompanyUniver } from "./createUniver";
import { getActiveCellAddress, getActiveCellFromUniver, restoreActiveCellSelection } from "./cellAddress";
import { resolveWorkbookSnapshot } from "./workbookData";
import {
  createDatabaseProviderRegistry,
  installDatabaseDropdown,
} from "./dropdown";
import "./styles.css";

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
    isApplyingRemoteCommandRef,
    onApplyingRemoteCommandChange,
    databaseProviderFetchers = null,
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
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const lastPublishedActiveCellRef = useRef(null);
  const selectionReadyRef = useRef(false);
  const remoteApplyDepthRef = useRef(0);
  const isApplyingRemoteCommandLocalRef = useRef(false);
  const lastRealtimeWorkbookSignatureRef = useRef(null);
  const lastRealtimeActiveCellRef = useRef(null);
  const presenceMarkerStateRef = useRef(new Map());
  const latestPresenceMarkersRef = useRef([]);
  const presenceResyncRafRef = useRef(0);
  const presenceForceResyncRafRef = useRef(0);
  const [isInitializing, setIsInitializing] = useState(true);

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
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const shouldSkipLocalWorkbookSync = () => {
    return (
      remoteApplyDepthRef.current > 0 ||
      isApplyingRemoteCommandLocalRef.current ||
      Boolean(isApplyingRemoteCommandRef?.current)
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
      cell,
      String(marker?.userName ?? ""),
      marker?.isCurrentUser ? "1" : "0",
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

  const createPresenceHighlight = (range, borderColor) => {
    return range.highlight({
      strokeWidth: 2,
      stroke: borderColor,
      fill: "rgba(0, 0, 0, 0)",
      rowHeaderFill: "rgba(0, 0, 0, 0)",
      columnHeaderFill: "rgba(0, 0, 0, 0)",
      rowHeaderStroke: borderColor,
      columnHeaderStroke: borderColor,
      autofillStroke: borderColor,
    });
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
    const highlightDisposable = createPresenceHighlight(range, borderColor);
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

        if (
          typeof workbook.isCellEditing === "function" &&
          typeof workbook.endEditingAsync === "function" &&
          workbook.isCellEditing()
        ) {
          await workbook.endEditingAsync(true);
        }

        const workbookData = workbook.save();
        return workbookData;
      },
      getWorkbookDataForSync: () => {
        const workbook =
          workbookRef.current ||
          univerApiRef.current?.getActiveWorkbook?.() ||
          null;

        if (!workbook || typeof workbook.save !== "function") {
          return null;
        }

        return workbook.save();
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

        isApplyingRemoteCommandLocalRef.current = true;
        if (isApplyingRemoteCommandRef) {
          isApplyingRemoteCommandRef.current = true;
        }
        onApplyingRemoteCommandChange?.(true);

        try {
          const result = await Promise.resolve(
            univerAPI.executeCommand(normalizedCommandId, commandParams ?? undefined)
          );

          const stateAfterReplay = captureRealtimeState(univerAPI);
          lastRealtimeWorkbookSignatureRef.current =
            stateAfterReplay.workbookSignature;
          lastRealtimeActiveCellRef.current = stateAfterReplay.activeCell;

          return Boolean(result);
        } catch {
          return false;
        } finally {
          isApplyingRemoteCommandLocalRef.current = false;
          if (isApplyingRemoteCommandRef) {
            isApplyingRemoteCommandRef.current = false;
          }
          onApplyingRemoteCommandChange?.(false);
        }
      },
      redo: () => {
        const univerAPI = univerApiRef.current;
        if (!univerAPI?.executeCommand) {
          return false;
        }

        return Boolean(univerAPI.executeCommand("univer.command.redo"));
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

    setIsInitializing(true);

    try {
      ({ univerAPI } = createCompanyUniver(container));
      univerApiRef.current = univerAPI;

      const notifyWorkbookChange = () => {
        if (shouldSkipLocalWorkbookSync()) {
          return;
        }

        onWorkbookChangeRef.current?.();
        schedulePresenceResync();
      };

      const notifyRealtimeCommand = (event = {}) => {
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

        if (shouldSkipLocalRealtimeCommandPublish()) {
          return;
        }

        const commandId = String(event?.id ?? "").trim();
        if (!commandId) {
          return;
        }

        const commandType = event?.type;
        const enumCommandType = univerAPI?.Enum?.CommandType;
        const OPERATION_TYPE =
          enumCommandType?.OPERATION != null ? enumCommandType.OPERATION : 1;
        const COMMAND_TYPE =
          enumCommandType?.COMMAND != null ? enumCommandType.COMMAND : 0;
        const MUTATION_TYPE =
          enumCommandType?.MUTATION != null ? enumCommandType.MUTATION : 2;

        const category =
          commandType === OPERATION_TYPE
            ? "selection/navigation"
            : commandType === MUTATION_TYPE || commandType === COMMAND_TYPE
              ? "workbook-mutation"
              : "unknown";

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

        onWorkbookRealtimeChangeRef.current?.({
          commandId,
          commandParams,
        });
      };

      // Reset so a re-initialized workbook does not inherit a stale active cell.
      lastPublishedActiveCellRef.current = null;
      selectionReadyRef.current = false;
      clearPresenceMarkers();

      const publishActiveCell = (cell) => {
        if (!cell || cell === lastPublishedActiveCellRef.current) return;

        lastPublishedActiveCellRef.current = cell;
        onActiveCellChangeRef.current?.(cell);
      };

      // Read from the event payload first — getActiveCell() can lag behind SelectionChanged.
      const notifyActiveCellChange = (params) => {
        if (shouldIgnoreSyntheticSelectionEvent()) return;

        const cell =
          getActiveCellAddress(params) || getActiveCellFromUniver(univerAPI);
        publishActiveCell(cell);
        schedulePresenceResync();
      };

      const subscribeSelectionEvent = (eventName) => {
        if (!eventName) return;
        changeEventDisposables.push(
          univerAPI.addEvent(eventName, notifyActiveCellChange)
        );
      };

      if (univerAPI?.addEvent && univerAPI?.Event) {
        const changeEvents = [
          univerAPI.Event.SheetValueChanged,
          univerAPI.Event.SheetEditStarted,
          univerAPI.Event.SheetEditChanging,
        ].filter(Boolean);

        changeEvents.forEach((eventName) => {
          changeEventDisposables.push(
            univerAPI.addEvent(eventName, notifyWorkbookChange)
          );
        });

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

      const initialRealtimeState = captureRealtimeState(univerAPI);
      lastRealtimeWorkbookSignatureRef.current =
        initialRealtimeState.workbookSignature;
      lastRealtimeActiveCellRef.current = initialRealtimeState.activeCell;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isDisposed) return;

          // Subscribe after createWorkbook — finalized selection / pointer events only.
          if (univerAPI?.addEvent && univerAPI?.Event) {
            subscribeSelectionEvent(univerAPI.Event.SelectionChanged);
            subscribeSelectionEvent(univerAPI.Event.SelectionMoveEnd);
            subscribeSelectionEvent(univerAPI.Event.CellPointerUp);
          }

          selectionReadyRef.current = true;

          // Publish the default selection (e.g. A1) once the sheet is interactive.
          const initialCell = getActiveCellFromUniver(univerAPI);
          if (initialCell) {
            publishActiveCell(initialCell);
          }

          setIsInitializing(false);
          onReadyRef.current?.();
        });
      });
    } catch (error) {
      if (!isDisposed) {
        setIsInitializing(false);
        onErrorRef.current?.(error);
      }
    }

    return () => {
      isDisposed = true;
      selectionReadyRef.current = false;
      remoteApplyDepthRef.current = 0;
      isApplyingRemoteCommandLocalRef.current = false;
      lastRealtimeWorkbookSignatureRef.current = null;
      lastRealtimeActiveCellRef.current = null;
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
