import { DATABASE_PROVIDER_METADATA_KEY } from "./constants.js";
import { getDatabaseProviderId } from "./metadata.js";

const SHOW_DATA_VALIDATION_DROPDOWN_COMMAND_ID =
  "sheet.operation.show-data-validation-dropdown";

// Survives with the DV rule on drag/fill/copy. Do NOT store provider ids in
// formula2 — Univer uses formula2 as the list-option color map, which made
// selected chips render black.
const DATABASE_PROVIDER_BIZ_INFO_KEY = "databaseProviderId";

// Legacy fallback only (older shells encoded provider id into formula2).
const DATABASE_PROVIDER_FORMULA2_PREFIX = "__db_provider__:";

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

function readProviderFromBizInfo(dataValidation) {
  const providerId = dataValidation?.rule?.bizInfo?.[DATABASE_PROVIDER_BIZ_INFO_KEY];
  return typeof providerId === "string" && providerId.trim()
    ? providerId.trim()
    : null;
}

function readProviderFromLegacyFormula2(dataValidation) {
  if (!dataValidation?.getCriteriaValues) {
    return null;
  }

  const [, , formula2] = dataValidation.getCriteriaValues();
  if (
    typeof formula2 !== "string" ||
    !formula2.startsWith(DATABASE_PROVIDER_FORMULA2_PREFIX)
  ) {
    return null;
  }

  const providerId = formula2
    .slice(DATABASE_PROVIDER_FORMULA2_PREFIX.length)
    .trim();

  return providerId || null;
}

export function getDatabaseProviderFromShell(range) {
  if (!range?.getDataValidation) {
    return null;
  }

  const dataValidation = range.getDataValidation();
  if (!dataValidation) {
    return null;
  }

  return (
    readProviderFromBizInfo(dataValidation) ||
    readProviderFromLegacyFormula2(dataValidation)
  );
}

function buildDatabaseDropdownShellRule(univerAPI, range, providerId) {
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
      // Keep formula2 empty so Univer uses its default dropdown chip background.
      formula2: "",
      bizInfo: {
        [DATABASE_PROVIDER_BIZ_INFO_KEY]: providerId,
      },
    })
    .build();
}

export function syncDatabaseDropdownShell(univerAPI, range, providerIdOverride) {
  if (!univerAPI?.newDataValidation || !range?.setDataValidation) {
    return false;
  }

  const providerId =
    providerIdOverride ??
    getDatabaseProviderId(range) ??
    getDatabaseProviderFromShell(range);
  if (!providerId) {
    return false;
  }

  range.setDataValidation(
    buildDatabaseDropdownShellRule(univerAPI, range, providerId)
  );
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
      const providerId =
        cell?.custom?.[DATABASE_PROVIDER_METADATA_KEY] ||
        getDatabaseProviderFromShell(worksheet.getRange(row, column));
      if (typeof providerId !== "string" || !providerId.trim()) {
        return;
      }

      const range = worksheet.getRange(row, column);
      syncDatabaseDropdownShell(univerAPI, range, providerId.trim());
    });
  }
}
