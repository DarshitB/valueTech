import { syncDatabaseDropdownShell } from "./dataValidationShell.js";
import { DEBUG_DATABASE_DROPDOWN } from "./metadata.js";

function buildSheetLocation({ workbook, worksheet, row, column }) {
  return {
    workbook: workbook.getWorkbook(),
    worksheet: worksheet.getSheet(),
    row,
    col: column,
    unitId: workbook.getId(),
    subUnitId: worksheet.getSheetId(),
  };
}

/**
 * Open the API-backed list dropdown for a database-dropdown cell.
 * Returns a dispose function when the dropdown is shown.
 */
export async function openDatabaseDropdownForCell({
  univerAPI,
  workbook,
  worksheet,
  row,
  column,
  providerId,
  registry,
  onWorkbookDataChange,
  disposeActiveDropdown,
  setActiveDropdownDisposable,
}) {
  if (!providerId || !registry?.has(providerId)) {
    return false;
  }

  disposeActiveDropdown?.();

  const options = await registry.fetchDropdownOptions(providerId);
  if (!options.length) {
    if (DEBUG_DATABASE_DROPDOWN) {
      console.log("[DatabaseDropdown] No options returned for", providerId);
    }
    return false;
  }

  const range = worksheet.getRange(row, column);
  const location = buildSheetLocation({
    workbook,
    worksheet,
    row,
    column,
  });

  const currentValue = range.getValue();
  const defaultValue = currentValue == null ? "" : String(currentValue);

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      try {
        const disposable = range.showDropdown({
          location,
          type: "list",
          closeOnOutSide: true,
          props: {
            options,
            defaultValue,
            showSearch: true,
            showEdit: false,
            onChange: (selectedValues) => {
              const selectedValue = Array.isArray(selectedValues)
                ? selectedValues[0] ?? ""
                : "";

              range.setValue(selectedValue);
              syncDatabaseDropdownShell(univerAPI, range);
              onWorkbookDataChange?.();
              disposeActiveDropdown?.();
              return true;
            },
          },
          onHide: () => {
            setActiveDropdownDisposable?.(null);
          },
        });

        setActiveDropdownDisposable?.(disposable);
        resolve(true);
      } catch (error) {
        if (DEBUG_DATABASE_DROPDOWN) {
          console.log("[DatabaseDropdown] showDropdown failed", error);
        }
        disposeActiveDropdown?.();
        resolve(false);
      }
    });
  });
}