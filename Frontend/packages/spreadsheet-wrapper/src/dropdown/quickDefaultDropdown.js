import { clearDatabaseDropdownShell } from "./dataValidationShell.js";
import { clearDatabaseProviderId } from "./metadata.js";

/**
 * Prefer the full selected range (not just active cell) for validation apply.
 */
export function resolveTargetRangeForValidation(univerAPI) {
  const workbook = univerAPI?.getActiveWorkbook?.();
  if (!workbook) {
    return null;
  }

  const activeRange = workbook.getActiveRange?.();
  if (activeRange) {
    return activeRange;
  }

  const worksheet = workbook.getActiveSheet?.();
  const selection = worksheet?.getSelection?.();
  const selectionRange = selection?.getActiveRange?.();
  if (selectionRange) {
    return selectionRange;
  }

  const selectionRanges = selection?.getActiveRangeList?.();
  if (Array.isArray(selectionRanges) && selectionRanges.length > 0) {
    return selectionRanges[0];
  }

  return workbook.getActiveCell?.() ?? null;
}

/**
 * Apply the same empty custom dropdown users get from manual Data Validation UI:
 * Type = Dropdown, Custom options = empty list.
 */
export function applyQuickDefaultDropdown(univerAPI, range, onWorkbookDataChange) {
  if (!univerAPI?.newDataValidation || !range?.setDataValidation) {
    return false;
  }

  // Ensure this is a normal dropdown, not database-linked dropdown metadata.
  clearDatabaseProviderId(range);
  clearDatabaseDropdownShell(range);

  const rule = univerAPI
    .newDataValidation()
    .requireValueInList([], false, true)
    .setAllowBlank(true)
    .setAllowInvalid(true)
    .setOptions({ showErrorMessage: false })
    .build();

  range.setDataValidation(rule);
  onWorkbookDataChange?.();
  return true;
}
