import { DATABASE_PROVIDER_METADATA_KEY } from "./constants.js";
import { getDatabaseProviderId } from "./metadata.js";

const SHOW_DATA_VALIDATION_DROPDOWN_COMMAND_ID =
  "sheet.operation.show-data-validation-dropdown";

// Minimal static list so Univer renders the dropdown chip/arrow. The list is synced to
// the cell's current value so validation passes without storing API option lists.
const DATABASE_DROPDOWN_DV_EMPTY_PLACEHOLDER = [" "];

export { SHOW_DATA_VALIDATION_DROPDOWN_COMMAND_ID };

function buildDatabaseDropdownValidationList(range) {
  const currentValue = range?.getValue?.();
  const normalizedValue =
    currentValue == null ? "" : String(currentValue).trim();

  if (!normalizedValue) {
    return DATABASE_DROPDOWN_DV_EMPTY_PLACEHOLDER;
  }

  return [String(currentValue)];
}

function buildDatabaseDropdownShellRule(univerAPI, range) {
  const renderMode =
    univerAPI.Enum?.DataValidationRenderMode?.CUSTOM ?? 2;

  return univerAPI
    .newDataValidation()
    .requireValueInList(buildDatabaseDropdownValidationList(range), false, true)
    .setAllowInvalid(true)
    .setAllowBlank(true)
    .setOptions({
      renderMode,
      showErrorMessage: false,
    })
    .build();
}

export function syncDatabaseDropdownShell(univerAPI, range) {
  if (!univerAPI?.newDataValidation || !range?.setDataValidation) {
    return false;
  }

  if (!getDatabaseProviderId(range)) {
    return false;
  }

  range.setDataValidation(buildDatabaseDropdownShellRule(univerAPI, range));
  return true;
}

export function applyDatabaseDropdownShell(univerAPI, range) {
  return syncDatabaseDropdownShell(univerAPI, range);
}

export function clearDatabaseDropdownShell(range) {
  if (!range?.setDataValidation) {
    return false;
  }

  range.setDataValidation(null);
  return true;
}

export function ensureDatabaseDropdownShell(univerAPI, range) {
  if (!getDatabaseProviderId(range)) {
    return false;
  }

  if (range.getDataValidation?.()) {
    return false;
  }

  return applyDatabaseDropdownShell(univerAPI, range);
}

export function repairExistingDatabaseDropdownShells(univerAPI, workbook) {
  if (!univerAPI || !workbook?.getSheets) {
    return;
  }

  for (const worksheet of workbook.getSheets()) {
    const matrix = worksheet.getSheet?.()?.getCellMatrix?.();
    if (!matrix?.forValue) {
      continue;
    }

    matrix.forValue((row, column, cell) => {
      const providerId = cell?.custom?.[DATABASE_PROVIDER_METADATA_KEY];
      if (typeof providerId !== "string" || !providerId.trim()) {
        return;
      }

      const range = worksheet.getRange(row, column);
      syncDatabaseDropdownShell(univerAPI, range);
    });
  }
}
