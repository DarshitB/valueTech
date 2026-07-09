/**
 * Normalize API workbook_data for Univer createWorkbook.
 * When workbook_data is null, return a blank workbook snapshot named after the spreadsheet.
 */
import { sanitizeWorkbookSnapshotForPersistence } from "./workbookSnapshotSanitizer";

export function resolveWorkbookSnapshot(workbookName, workbookData) {
  if (workbookData == null) {
    return {
      name: workbookName || "Untitled Spreadsheet",
    };
  }

  let resolved = workbookData;

  if (typeof workbookData === "string") {
    resolved = JSON.parse(workbookData);
  }

  return sanitizeWorkbookSnapshotForPersistence(resolved);
}
