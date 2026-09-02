import { IActiveDirtyManagerService } from "@univerjs/engine-formula";
import { isLocalOnlyRealtimeCommand } from "./localOnlyCommands";

export const SET_RANGE_VALUES_MUTATION_ID = "sheet.mutation.set-range-values";
export const TRIGGER_FORMULA_CALCULATION_START_MUTATION_ID =
  "formula.mutation.set-trigger-formula-calculation-start";

const STYLE_ONLY_TRIGGERS = new Set([
  "sheet.command.set-style",
  "sheet.command.set-border",
  "sheet.command.clear-selection-format",
]);

const INCREMENTAL_CALC_DEBOUNCE_MS = 120;
const CALC_START_SETTLE_MS = 150;
const CALC_WAIT_TIMEOUT_MS = 30000;

function isStyleOnlyRangeValuesTrigger(params) {
  const trigger = params?.trigger;
  return typeof trigger === "string" && STYLE_ONLY_TRIGGERS.has(trigger);
}

function isFormulaEngineResultWrite(event) {
  const options = event?.options;
  if (
    options?.fromFormula === true ||
    options?.applyFormulaCalculationResult === true
  ) {
    return true;
  }

  const commandId = String(event?.id ?? "").trim();
  if (!commandId) {
    return false;
  }

  return (
    commandId === "formula.mutation.set-formula-calculation-result" ||
    commandId === "formula.mutation.set-formula-calculation-notification" ||
    commandId === TRIGGER_FORMULA_CALCULATION_START_MUTATION_ID ||
    commandId.startsWith("formula.mutation.set-formula-calculation")
  );
}

/**
 * True when this cell write should go through our formula scheduler.
 * Univer's own auto-recalc for set-range-values is disabled so only this
 * path runs (typed edits, Delete/clear, and peer applies).
 *
 * @param {string} commandId
 * @param {object|null|undefined} params
 * @param {object|null|undefined} eventOptions
 * @returns {boolean}
 */
export function shouldScheduleFormulaCalculation(
  commandId,
  params,
  eventOptions
) {
  const normalizedId = String(commandId ?? "").trim();
  const isValueWrite =
    normalizedId === SET_RANGE_VALUES_MUTATION_ID ||
    normalizedId === "sheet.command.clear-selection-content";

  if (!isValueWrite) {
    return false;
  }

  if (isLocalOnlyRealtimeCommand(normalizedId)) {
    return false;
  }

  if (
    isFormulaEngineResultWrite({
      id: normalizedId,
      params,
      options: eventOptions,
    })
  ) {
    return false;
  }

  if (isStyleOnlyRangeValuesTrigger(params)) {
    return false;
  }

  return true;
}

/**
 * Stop Univer from auto-queuing formula calc on every cell write.
 * Those writes race with our scheduler and apply the previous Serial value
 * into Message. Init/forced calc still runs via the trigger mutation.
 *
 * @param {object|null|undefined} univerAPI
 * @returns {function(): void} Restore previous dirty tracking.
 */
export function disableUniverAutoRangeValueRecalc(univerAPI) {
  const injector = univerAPI?._injector;
  if (!injector?.get) {
    return () => {};
  }

  try {
    const dirtyManager = injector.get(IActiveDirtyManagerService);
    if (!dirtyManager?.remove) {
      return () => {};
    }

    const previous = dirtyManager.get?.(SET_RANGE_VALUES_MUTATION_ID) || null;
    dirtyManager.remove(SET_RANGE_VALUES_MUTATION_ID);

    return () => {
      if (previous && typeof dirtyManager.register === "function") {
        dirtyManager.register(SET_RANGE_VALUES_MUTATION_ID, previous);
      }
    };
  } catch {
    return () => {};
  }
}

function getFormulaEngine(univerAPI) {
  if (!univerAPI || typeof univerAPI.getFormula !== "function") {
    return null;
  }

  try {
    return univerAPI.getFormula() || null;
  } catch {
    return null;
  }
}

function toIndex(value) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function looksLikeCellMatrix(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).some((key) => toIndex(key) != null);
}

function unwrapCellValue(cellValue) {
  if (cellValue == null || typeof cellValue !== "object") {
    return null;
  }

  if (typeof cellValue.getMatrix === "function") {
    try {
      return cellValue.getMatrix() || cellValue.getData?.() || cellValue;
    } catch {
      return cellValue;
    }
  }

  if (looksLikeCellMatrix(cellValue.data)) {
    return cellValue.data;
  }

  return cellValue;
}

function collectBoundsFromCellValue(cellValue) {
  const matrix = unwrapCellValue(cellValue);
  if (matrix == null || typeof matrix !== "object") {
    return null;
  }

  let startRow = Infinity;
  let startColumn = Infinity;
  let endRow = -Infinity;
  let endColumn = -Infinity;

  Object.keys(matrix).forEach((rowKey) => {
    const row = toIndex(rowKey);
    if (row == null) {
      return;
    }

    const columns = matrix[rowKey];
    if (columns == null) {
      startRow = Math.min(startRow, row);
      endRow = Math.max(endRow, row);
      startColumn = Math.min(startColumn, 0);
      endColumn = Math.max(endColumn, 0);
      return;
    }

    if (typeof columns !== "object") {
      return;
    }

    const columnKeys = Object.keys(columns);
    if (columnKeys.length === 0) {
      startRow = Math.min(startRow, row);
      endRow = Math.max(endRow, row);
      startColumn = Math.min(startColumn, 0);
      endColumn = Math.max(endColumn, 0);
      return;
    }

    columnKeys.forEach((columnKey) => {
      const column = toIndex(columnKey);
      if (column == null) {
        return;
      }

      startRow = Math.min(startRow, row);
      endRow = Math.max(endRow, row);
      startColumn = Math.min(startColumn, column);
      endColumn = Math.max(endColumn, column);
    });
  });

  if (!Number.isFinite(startRow) || !Number.isFinite(startColumn)) {
    return null;
  }

  return { startRow, startColumn, endRow, endColumn };
}

function collectBoundsFromRange(range) {
  if (!range || typeof range !== "object") {
    return null;
  }

  const startRow = toIndex(range.startRow);
  const startColumn = toIndex(range.startColumn);
  const endRow = toIndex(range.endRow ?? range.startRow);
  const endColumn = toIndex(range.endColumn ?? range.startColumn);

  if (startRow == null || startColumn == null || endRow == null || endColumn == null) {
    return null;
  }

  return { startRow, startColumn, endRow, endColumn };
}

function resolveLocalWorkbookContext(univerAPI, params) {
  const workbook = univerAPI?.getActiveWorkbook?.() || null;
  const localUnitId =
    typeof workbook?.getId === "function" ? workbook.getId() : "";
  const paramUnitId = typeof params?.unitId === "string" ? params.unitId : "";

  // Remap only when a peer command points at a different workbook id.
  // Single-user mutations already use this client's id — keep them as-is.
  const unitId =
    localUnitId && paramUnitId && paramUnitId !== localUnitId
      ? localUnitId
      : paramUnitId || localUnitId || "";

  const requestedSheetId =
    (typeof params?.subUnitId === "string" && params.subUnitId) ||
    (typeof params?.sheetId === "string" && params.sheetId) ||
    "";

  let sheet = null;
  if (workbook && requestedSheetId && typeof workbook.getSheetBySheetId === "function") {
    sheet = workbook.getSheetBySheetId(requestedSheetId);
  }
  if (!sheet) {
    sheet = workbook?.getActiveSheet?.() || null;
  }

  const localSheetId =
    (typeof sheet?.getSheetId === "function" && sheet.getSheetId()) ||
    requestedSheetId ||
    "";

  return { unitId, sheetId: localSheetId };
}

/**
 * Peer commands carry the sender's workbook id. Recalc and apply must use
 * this client's workbook/sheet ids or Univer ignores the dirty ranges.
 *
 * @param {object} univerAPI
 * @param {object|null|undefined} commandParams
 * @returns {object|null|undefined}
 */
export function bindCommandParamsToLocalWorkbook(univerAPI, commandParams) {
  if (!commandParams || typeof commandParams !== "object") {
    return commandParams;
  }

  const { unitId, sheetId } = resolveLocalWorkbookContext(univerAPI, commandParams);
  const next = { ...commandParams };
  const paramUnitId =
    typeof commandParams.unitId === "string" ? commandParams.unitId : "";

  if (unitId && paramUnitId && paramUnitId !== unitId) {
    next.unitId = unitId;
  } else if (unitId && !paramUnitId) {
    next.unitId = unitId;
  }

  if (sheetId) {
    next.subUnitId = sheetId;
  }

  return next;
}

function resolveLastRow(univerAPI, sheetId) {
  try {
    const workbook = univerAPI?.getActiveWorkbook?.();
    if (!workbook) {
      return 0;
    }

    const sheet =
      (typeof sheetId === "string" &&
        sheetId &&
        workbook.getSheetBySheetId?.(sheetId)) ||
      workbook.getActiveSheet?.();

    const lastRow = sheet?.getLastRow?.();
    if (Number.isInteger(lastRow) && lastRow >= 0) {
      return lastRow;
    }

    const maxRows = sheet?.getMaxRows?.();
    if (Number.isInteger(maxRows) && maxRows > 0) {
      return maxRows - 1;
    }
  } catch {
    // fall through
  }

  return 0;
}

/**
 * INDEX(E:E,ROW()) depends on column E, not only E2. Dirty the edited cell's
 * whole used column so that style recalcs too. Do not expand across columns —
 * that treated empty cells as changed and wiped Date/Place in Message.
 */
function expandBoundsToEditedColumns(bounds, lastRow) {
  const columnEndRow = Math.max(bounds.endRow, lastRow);

  return {
    startRow: 0,
    startColumn: bounds.startColumn,
    endRow: columnEndRow,
    endColumn: bounds.endColumn,
  };
}

/**
 * Build Univer dirty ranges from a set-range-values payload so only formulas
 * that depend on the edited cells are recalculated.
 *
 * @param {object|null|undefined} params
 * @param {object|null|undefined} univerAPI
 * @returns {Array} Dirty unit ranges for the formula engine.
 */
export function getDirtyRangesFromSetRangeValues(params, univerAPI) {
  const { unitId, sheetId } = resolveLocalWorkbookContext(univerAPI, params);
  if (!unitId || !sheetId) {
    return [];
  }

  const bounds =
    collectBoundsFromCellValue(params?.cellValue) ||
    collectBoundsFromRange(params?.range) ||
    collectBoundsFromRange(
      Array.isArray(params?.ranges) ? params.ranges[0] : null
    );

  if (!bounds) {
    return [];
  }

  const lastRow = resolveLastRow(univerAPI, sheetId);
  const range = expandBoundsToEditedColumns(bounds, lastRow);

  return [
    {
      unitId,
      sheetId,
      range,
    },
  ];
}

function mergeDirtyRanges(existingRanges, incomingRanges) {
  const merged = [...existingRanges];

  incomingRanges.forEach((incoming) => {
    const range = incoming?.range;
    if (!incoming?.unitId || !incoming?.sheetId || !range) {
      return;
    }

    const duplicate = merged.some(
      (existing) =>
        existing.unitId === incoming.unitId &&
        existing.sheetId === incoming.sheetId &&
        existing.range.startRow === range.startRow &&
        existing.range.startColumn === range.startColumn &&
        existing.range.endRow === range.endRow &&
        existing.range.endColumn === range.endColumn
    );

    if (!duplicate) {
      merged.push({
        unitId: incoming.unitId,
        sheetId: incoming.sheetId,
        range: { ...range },
      });
    }
  });

  return merged;
}

function createEmptyDirtyMaps(dirtyRanges = []) {
  const clearDependencyTreeCache = {};

  dirtyRanges.forEach((entry) => {
    if (!entry?.unitId || !entry?.sheetId) {
      return;
    }

    if (clearDependencyTreeCache[entry.unitId] == null) {
      clearDependencyTreeCache[entry.unitId] = {};
    }

    clearDependencyTreeCache[entry.unitId][entry.sheetId] = "1";
  });

  return {
    dirtyNameMap: {},
    dirtyDefinedNameMap: {},
    dirtySuperTableMap: {},
    dirtyUnitFeatureMap: {},
    dirtyUnitOtherFormulaMap: {},
    clearDependencyTreeCache,
  };
}

function executeIncrementalCalculation(univerAPI, dirtyRanges) {
  if (!univerAPI || typeof univerAPI.executeCommand !== "function") {
    return false;
  }

  if (!Array.isArray(dirtyRanges) || dirtyRanges.length === 0) {
    return false;
  }

  try {
    univerAPI.executeCommand(
      TRIGGER_FORMULA_CALCULATION_START_MUTATION_ID,
      {
        commands: [],
        forceCalculation: false,
        dirtyRanges,
        ...createEmptyDirtyMaps(dirtyRanges),
      },
      { onlyLocal: true }
    );
    return true;
  } catch {
    return false;
  }
}

function waitForCalcStartSettle() {
  return new Promise((resolve) => {
    setTimeout(resolve, CALC_START_SETTLE_MS);
  });
}

async function waitForCalculationApplied(formula, timeoutMs = CALC_WAIT_TIMEOUT_MS) {
  if (!formula || typeof formula.onCalculationResultApplied !== "function") {
    return true;
  }

  try {
    await formula.onCalculationResultApplied(timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait until the current formula pass has written cell values.
 * Used after workbook load so Message matches Serial before the user edits.
 *
 * @param {object|null|undefined} univerAPI
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export async function waitForWorkbookFormulas(
  univerAPI,
  timeoutMs = CALC_WAIT_TIMEOUT_MS
) {
  const formula = getFormulaEngine(univerAPI);
  if (!formula) {
    return;
  }

  await waitForCalcStartSettle();
  await waitForCalculationApplied(formula, timeoutMs);
}

/**
 * Recalc Message after a cell write. Univer auto-recalc for those writes is
 * turned off so this is the only incremental path.
 * Save waits for in-flight calc; it never force-recalcs the whole sheet.
 *
 * @returns {object} Controller with schedule, flushBeforePersist, and dispose.
 */
export function createFormulaCalculationController({
  onPersistFlushChange,
} = {}) {
  let debounceTimer = 0;
  let disposed = false;
  let pendingDirtyRanges = [];
  let inFlightWait = null;
  let runChain = Promise.resolve();

  const takePendingDirtyRanges = () => {
    const ranges = pendingDirtyRanges;
    pendingDirtyRanges = [];
    return ranges;
  };

  const startIncremental = (univerAPI) => {
    const sourceRanges = takePendingDirtyRanges();
    if (sourceRanges.length === 0) {
      return false;
    }

    return executeIncrementalCalculation(univerAPI, sourceRanges);
  };

  const trackInFlightWait = (univerAPI, { forceNew = false } = {}) => {
    if (inFlightWait && !forceNew) {
      return inFlightWait;
    }

    const formula = getFormulaEngine(univerAPI);
    if (!formula) {
      return inFlightWait;
    }

    const thisWait = (async () => {
      try {
        await waitForCalcStartSettle();
        if (disposed) {
          return;
        }

        await waitForCalculationApplied(formula);
      } finally {
        if (inFlightWait === thisWait) {
          inFlightWait = null;
        }
      }
    })();

    inFlightWait = thisWait;
    return thisWait;
  };

  const runSerialized = (univerAPI) => {
    runChain = runChain
      .catch(() => {})
      .then(async () => {
        while (!disposed) {
          if (inFlightWait) {
            await inFlightWait;
          }

          if (disposed || pendingDirtyRanges.length === 0) {
            return;
          }

          if (startIncremental(univerAPI)) {
            await trackInFlightWait(univerAPI, { forceNew: true });
          } else {
            return;
          }
        }
      });

    return runChain;
  };

  const queueDirtyRanges = (univerAPI, params) => {
    const dirtyRanges = getDirtyRangesFromSetRangeValues(params, univerAPI);
    if (dirtyRanges.length === 0) {
      return false;
    }

    pendingDirtyRanges = mergeDirtyRanges(pendingDirtyRanges, dirtyRanges);
    return true;
  };

  return {
    schedule(univerAPI, params, { immediate = false } = {}) {
      if (disposed || !univerAPI) {
        return;
      }

      if (!queueDirtyRanges(univerAPI, params)) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = 0;
      }

      if (immediate) {
        void runSerialized(univerAPI);
        return;
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = 0;
        if (disposed) {
          return;
        }

        void runSerialized(univerAPI);
      }, INCREMENTAL_CALC_DEBOUNCE_MS);
    },

    async flushBeforePersist(univerAPI) {
      if (disposed || !univerAPI) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = 0;
      }

      onPersistFlushChange?.(true);

      try {
        await runSerialized(univerAPI);
      } finally {
        onPersistFlushChange?.(false);
      }
    },

    dispose() {
      disposed = true;
      pendingDirtyRanges = [];
      inFlightWait = null;
      runChain = Promise.resolve();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = 0;
      }
    },
  };
}
