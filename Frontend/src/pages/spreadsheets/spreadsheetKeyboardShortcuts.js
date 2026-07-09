import { useEffect } from "react";

function isEditableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  // Univer keeps an internal contenteditable editor mounted even when the cell
  // is not in active edit mode. Treat it as editable only while the editor is
  // actually visible (active cell text editing).
  const univerEditor = element.closest("[data-u-comp='editor']");
  if (univerEditor instanceof HTMLElement) {
    const style = window.getComputedStyle(univerEditor);
    const rect = univerEditor.getBoundingClientRect();
    const isVisibleEditor =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;

    return isVisibleEditor;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return Boolean(
    element.closest(
      "[contenteditable='true'], [role='textbox'], [role='combobox']"
    )
  );
}

/**
 * Spreadsheet-only keyboard shortcuts.
 * - Cmd/Ctrl+S -> existing manual save callback
 * - Cmd/Ctrl+Shift+Z and Ctrl+Y -> Univer redo command
 *
 * Undo (Cmd/Ctrl+Z) is intentionally untouched.
 */
export function useSpreadsheetKeyboardShortcuts({ spreadsheetRef, onManualSave }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const spreadsheet = spreadsheetRef?.current;
      if (!spreadsheet?.isFocused?.()) {
        return;
      }

      const target = event.target;
      if (isEditableElement(target)) {
        return;
      }

      const hasModifier = event.metaKey || event.ctrlKey;
      if (!hasModifier || event.altKey) {
        return;
      }

      const key = String(event.key || "").toLowerCase();

      // Cmd/Ctrl+S: reuse exact save handler used by the Save button.
      if (key === "s") {
        event.preventDefault();
        onManualSave?.();
        return;
      }

      // Cmd/Ctrl+Shift+Z: redo
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        spreadsheet.redo?.();
        return;
      }

      // Ctrl+Y (Windows): redo
      if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        spreadsheet.redo?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [spreadsheetRef, onManualSave]);
}

