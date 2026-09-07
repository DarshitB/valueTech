import { syncDatabaseDropdownShell } from "./dataValidationShell.js";
import { DEBUG_DATABASE_DROPDOWN } from "./metadata.js";

function buildDatabaseDropdownSelectTitle(label) {
  const name = String(label || "item").trim() || "item";
  const article = /^[aeiou]/i.test(name) ? "an" : "a";
  return `Select ${article} ${name}`;
}

function applyListDropdownTitle(title) {
  const root = document.querySelector('[data-u-comp="sheets-dropdown-list"]');
  if (!root) {
    return false;
  }

  for (const child of root.children) {
    const className = String(child.className || "");
    const text = String(child.textContent || "").trim();
    if (
      (className.includes("univer-pt-2") &&
        className.includes("univer-text-xs")) ||
      text === "Select an item" ||
      text === "Select items"
    ) {
      child.textContent = title;
      return true;
    }
  }

  return false;
}

function scheduleListDropdownTitle(title) {
  const apply = () => applyListDropdownTitle(title);
  if (apply()) {
    return;
  }

  requestAnimationFrame(() => {
    if (apply()) {
      return;
    }
    window.setTimeout(apply, 16);
  });
}

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
  const selectTitle = buildDatabaseDropdownSelectTitle(
    registry.get(providerId)?.label
  );

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
            title: selectTitle,
            onChange: (selectedValues) => {
              const selectedValue = Array.isArray(selectedValues)
                ? selectedValues[0] ?? ""
                : "";

              range.setValue(selectedValue);
              syncDatabaseDropdownShell(univerAPI, range, providerId);
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
        scheduleListDropdownTitle(selectTitle);
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