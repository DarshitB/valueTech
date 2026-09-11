import { useEffect } from "react";
import { getSpreadsheetCollaborationConfig } from "../../realtime/spreadsheet/collaborationConfig";

function isSpreadsheetEditorContext(element, spreadsheet) {
  if (spreadsheet?.isFocused?.()) {
    return true;
  }

  if (!(element instanceof Element)) {
    return false;
  }

  return Boolean(
    element.closest(".spreadsheet-editor-container") ||
      element.closest("[data-u-comp='find-replace-dialog']") ||
      element.closest(".univer-find-input")
  );
}

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
 * - Cmd/Ctrl+F -> Univer find (blocks native browser find on the editor)
 * - Ctrl+H -> Univer replace (does not steal Cmd+H on macOS)
 * - Cmd/Ctrl+Z -> safe undo when Phase 6 flag is on; otherwise Univer-native
 * - Cmd/Ctrl+Shift+Z and Ctrl+Y -> redo (safe when Phase 6 flag is on)
 *
 * Cell newline (Cmd/Ctrl+Enter) is handled in CompanySpreadsheet so it
 * runs before Univer's own shortcut listener.
 * These listeners are mounted only on the spreadsheet editor page.
 */
export function useSpreadsheetKeyboardShortcuts({
  spreadsheetRef,
  onManualSave,
  onUnsafeUndoBlocked,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const spreadsheet = spreadsheetRef?.current;
      const hasModifier = event.metaKey || event.ctrlKey;
      if (!hasModifier || event.altKey) {
        return;
      }

      const key = String(event.key || "").toLowerCase();
      const inEditorContext = isSpreadsheetEditorContext(
        event.target,
        spreadsheet
      );

      // Cmd/Ctrl+F: keep find inside the sheet; do not open browser find.
      if (key === "f" && inEditorContext) {
        event.preventDefault();
        spreadsheet?.openFind?.();
        return;
      }

      // Ctrl+H: open replace. Leave Cmd+H alone on macOS (hides the window).
      if (key === "h" && inEditorContext && event.ctrlKey) {
        event.preventDefault();
        spreadsheet?.openReplace?.();
        return;
      }

      if (!spreadsheet?.isFocused?.()) {
        return;
      }

      const target = event.target;
      if (isEditableElement(target)) {
        return;
      }

      // Cmd/Ctrl+S: reuse exact save handler used by the Save button.
      if (key === "s") {
        event.preventDefault();
        onManualSave?.();
        return;
      }

      const safeUndoEnabled =
        getSpreadsheetCollaborationConfig().safeUndoEnabled;

      // Cmd/Ctrl+Shift+Z: redo
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        if (!safeUndoEnabled) {
          spreadsheet.redo?.();
          return;
        }
        const result = spreadsheet.redo?.();
        if (result === "blocked" || result === "unavailable") {
          onUnsafeUndoBlocked?.("redo");
        }
        return;
      }

      // Ctrl+Y (Windows): redo
      if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        if (!safeUndoEnabled) {
          spreadsheet.redo?.();
          return;
        }
        const result = spreadsheet.redo?.();
        if (result === "blocked" || result === "unavailable") {
          onUnsafeUndoBlocked?.("redo");
        }
        return;
      }

      // Cmd/Ctrl+Z: undo (safe path when Phase 6 flag is on)
      if (key === "z" && !event.shiftKey) {
        if (!safeUndoEnabled) {
          return;
        }
        event.preventDefault();
        const result = spreadsheet.undo?.();
        if (result === "blocked" || result === "unavailable") {
          onUnsafeUndoBlocked?.("undo");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [spreadsheetRef, onManualSave, onUnsafeUndoBlocked]);
}
