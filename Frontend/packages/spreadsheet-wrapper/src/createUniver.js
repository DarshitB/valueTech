import {
  createUniver,
  LocaleType,
  mergeLocales,
} from "@univerjs/presets";

import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import UniverPresetSheetsDataValidationEnUS from "@univerjs/preset-sheets-data-validation/locales/en-US";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import UniverPresetSheetsFindReplaceEnUS from "@univerjs/preset-sheets-find-replace/locales/en-US";
import { UniverSheetsHyperLinkPreset } from "@univerjs/preset-sheets-hyper-link";
import UniverPresetSheetsHyperLinkEnUS from "@univerjs/preset-sheets-hyper-link/locales/en-US";

import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-hyper-link/lib/index.css";

/**
 * Create a Univer instance bound to the given container element.
 */
export function createCompanyUniver(container) {
  if (!container) {
    throw new Error("Spreadsheet container element is required.");
  }

  return createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        UniverPresetSheetsDataValidationEnUS,
        UniverPresetSheetsFindReplaceEnUS,
        UniverPresetSheetsHyperLinkEnUS
      ),
    },
    presets: [
      UniverSheetsCorePreset({
        container,
        formula: {
          // Message cells already have saved display text. WHEN_EMPTY (default)
          // skips those, so refresh never recalcs Serial into Message.
          initialFormulaComputing: 0,
        },
      }),
      UniverSheetsDataValidationPreset(),
      UniverSheetsFindReplacePreset(),
      UniverSheetsHyperLinkPreset(),
    ],
  });
}
