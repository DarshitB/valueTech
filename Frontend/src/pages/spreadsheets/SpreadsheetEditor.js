import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import {
  clearSelectedSpreadsheet,
  fetchSpreadsheetById,
  saveSpreadsheetById,
} from "../../redux/reducers/spreadsheetReducer";
import { usePageTitle } from "../../context/PageTitleContext";
import { useSpreadsheetActiveCellPublisher } from "../../hooks/useSpreadsheetActiveCellPublisher";
import { SpreadsheetRealtimeProvider } from "../../realtime/spreadsheet";
import { SpreadsheetSessionColorProvider } from "./SpreadsheetSessionColorContext";
import SpreadsheetPresencePanel from "./SpreadsheetPresencePanel";
import SpreadsheetRealtimeSurface from "./SpreadsheetRealtimeSurface";
import { useSpreadsheetKeyboardShortcuts } from "./spreadsheetKeyboardShortcuts";
import { useSpreadsheetUnsavedNavigationGuard } from "../../hooks/useSpreadsheetUnsavedNavigationGuard";
import { toast } from "react-toastify";
import NotFound from "../NotFound";

const AUTOSAVE_DELAY_MS = 3000;
const SAVED_STATUS_DISPLAY_MS = 2000;

const SAVE_STATUS_LABELS = {
  idle: "",
  saving: "Saving...",
  saved: "Saved",
  failed: "Save Failed",
};

function SpreadsheetRealtimeEditorContent({
  spreadsheetRef,
  workbookName,
  workbookData,
  onWorkbookChange,
  onError,
  saveStatus,
  editorSaving,
  isDirty,
  onManualSave,
}) {
  const { localCell, localWorksheetId, publishActiveCell } =
    useSpreadsheetActiveCellPublisher();
  useSpreadsheetKeyboardShortcuts({ spreadsheetRef, onManualSave });

  return (
    <div className="height-full-occupied spreadsheet-editor-container">
      <div
        className="add-action-buttons"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
          gap: "12px",
        }}
      >
        <SpreadsheetPresencePanel localActiveCell={localCell} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {SAVE_STATUS_LABELS[saveStatus] && (
            <span
              className={saveStatus === "failed" ? "text-danger" : "text-muted"}
              style={{ fontSize: "13px" }}
            >
              {SAVE_STATUS_LABELS[saveStatus]}
            </span>
          )}
          <button
            className="btn"
            type="button"
            onClick={onManualSave}
            disabled={editorSaving || !isDirty}
          >
            {editorSaving ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-1"
                  role="status"
                  aria-hidden="true"
                />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>

      <SpreadsheetRealtimeSurface
        spreadsheetRef={spreadsheetRef}
        workbookName={workbookName}
        workbookData={workbookData}
        onWorkbookChange={onWorkbookChange}
        onError={onError}
        localCell={localCell}
        localWorksheetId={localWorksheetId}
        publishActiveCell={publishActiveCell}
      />
    </div>
  );
}

function SpreadsheetEditor() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { setTitle } = usePageTitle();
  const spreadsheetRef = useRef(null);

  const { selected, detailLoading, detailError, editorSaving } = useSelector(
    (state) => state.spreadsheets
  );

  // Realtime session id — connect only after spreadsheet loads successfully
  const realtimeSpreadsheetId =
    selected?.id && !detailError ? id : null;

  const dirtyRef = useRef(false);
  const changeGenerationRef = useRef(0);
  const autosaveTimerRef = useRef(null);
  const savedStatusTimerRef = useRef(null);
  const savingInProgressRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const saveProcessorRunningRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingInProgress, setIsSavingInProgress] = useState(false);

  const setSavingInProgress = useCallback((inProgress) => {
    savingInProgressRef.current = inProgress;
    setIsSavingInProgress(inProgress);
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setIsDirty(true);
  }, []);

  const markClean = useCallback(() => {
    dirtyRef.current = false;
    setIsDirty(false);
  }, []);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const clearSavedStatusTimer = useCallback(() => {
    if (savedStatusTimerRef.current) {
      clearTimeout(savedStatusTimerRef.current);
      savedStatusTimerRef.current = null;
    }
  }, []);

  const showSavingStatus = useCallback(() => {
    clearSavedStatusTimer();
    setSaveStatus("saving");
  }, [clearSavedStatusTimer]);

  const showSavedStatus = useCallback(() => {
    clearSavedStatusTimer();
    setSaveStatus("saved");
    savedStatusTimerRef.current = setTimeout(() => {
      savedStatusTimerRef.current = null;
      setSaveStatus("idle");
    }, SAVED_STATUS_DISPLAY_MS);
  }, [clearSavedStatusTimer]);

  const showFailedStatus = useCallback(() => {
    clearSavedStatusTimer();
    setSaveStatus("failed");
  }, [clearSavedStatusTimer]);

  const runSaveQueue = useCallback(
    async (initialForce = false) => {
      if (saveProcessorRunningRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      saveProcessorRunningRef.current = true;
      setSavingInProgress(true);

      let force = initialForce;

      try {
        while (force || dirtyRef.current) {
          pendingSaveRef.current = false;
          const generationAtSave = changeGenerationRef.current;

          try {
            showSavingStatus();

            const workbookData =
              await spreadsheetRef.current?.getWorkbookData?.();

            if (!workbookData) {
              showFailedStatus();
              break;
            }

            const result = await dispatch(
              saveSpreadsheetById({
                id,
                workbook_data: workbookData,
              })
            );

            if (!saveSpreadsheetById.fulfilled.match(result)) {
              showFailedStatus();
              break;
            }

            if (changeGenerationRef.current !== generationAtSave) {
              force = false;
              continue;
            }

            if (pendingSaveRef.current && dirtyRef.current) {
              pendingSaveRef.current = false;
              force = false;
              continue;
            }

            markClean();
            showSavedStatus();
            break;
          } catch {
            showFailedStatus();
            break;
          } finally {
            force = false;
          }
        }
      } finally {
        setSavingInProgress(false);
        saveProcessorRunningRef.current = false;
      }
    },
    [dispatch, id, markClean, setSavingInProgress, showFailedStatus, showSavedStatus, showSavingStatus]
  );

  const saveWorkbook = useCallback(
    ({ force = false } = {}) => {
      if (!force && !dirtyRef.current) {
        return;
      }

      if (saveProcessorRunningRef.current) {
        pendingSaveRef.current = true;
        return;
      }

      void runSaveQueue(force);
    },
    [runSaveQueue]
  );

  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      saveWorkbook();
    }, AUTOSAVE_DELAY_MS);
  }, [clearAutosaveTimer, saveWorkbook]);

  const handleWorkbookChange = useCallback(() => {
    markDirty();
    changeGenerationRef.current += 1;
    setSaveStatus((currentStatus) =>
      currentStatus === "saved" ? "idle" : currentStatus
    );

    if (savingInProgressRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    scheduleAutosave();
  }, [markDirty, scheduleAutosave]);

  const handleManualSave = useCallback(() => {
    clearAutosaveTimer();
    saveWorkbook({ force: true });
  }, [clearAutosaveTimer, saveWorkbook]);

  const handleSpreadsheetError = useCallback(() => {
    toast.error("Failed to initialize spreadsheet.");
  }, []);

  useEffect(() => {
    if (String(id).toLowerCase() === "archived") {
      return undefined;
    }

    dispatch(fetchSpreadsheetById(id));

    return () => {
      dispatch(clearSelectedSpreadsheet());
    };
  }, [dispatch, id]);

  useEffect(() => {
    if (selected?.name) {
      setTitle(selected.name);
    }
  }, [selected, setTitle]);

  useEffect(() => {
    if (selected?.id) {
      markClean();
      changeGenerationRef.current = 0;
      pendingSaveRef.current = false;
      setSavingInProgress(false);
      saveProcessorRunningRef.current = false;
      clearSavedStatusTimer();
      setSaveStatus("idle");
    }
  }, [selected?.id, clearSavedStatusTimer, markClean, setSavingInProgress]);

  const shouldGuardNavigation =
    Boolean(selected?.id) && (isDirty || isSavingInProgress);
  useSpreadsheetUnsavedNavigationGuard({
    shouldBlockNavigation: shouldGuardNavigation,
    isSavingInProgress,
  });

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      clearSavedStatusTimer();
    };
  }, [clearAutosaveTimer, clearSavedStatusTimer]);

  if (String(id).toLowerCase() === "archived") {
    return <Navigate to="/spreadsheet/archived" replace />;
  }

  if (detailLoading) {
    return (
      <div
        className="height-full-occupied spreadsheet-editor-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="loading-indicator" role="status" aria-live="polite">
          <div className="spinner-border" aria-hidden="true" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (detailError?.status === 404) {
    return <NotFound />;
  }

  if (detailError || !selected) {
    return (
      <div
        className="height-full-occupied spreadsheet-editor-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p>Failed to load spreadsheet.</p>
      </div>
    );
  }

  return (
    <SpreadsheetRealtimeProvider spreadsheetId={realtimeSpreadsheetId}>
      <SpreadsheetSessionColorProvider>
        <SpreadsheetRealtimeEditorContent
          spreadsheetRef={spreadsheetRef}
          workbookName={selected.name}
          workbookData={selected.workbook_data}
          onWorkbookChange={handleWorkbookChange}
          onError={handleSpreadsheetError}
          saveStatus={saveStatus}
          editorSaving={editorSaving}
          isDirty={isDirty}
          onManualSave={handleManualSave}
        />
      </SpreadsheetSessionColorProvider>
    </SpreadsheetRealtimeProvider>
  );
}

export default SpreadsheetEditor;
