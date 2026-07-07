/**
 * Normalize API workbook_data for Univer createWorkbook.
 * When workbook_data is null, return a blank workbook snapshot named after the spreadsheet.
 */
export function resolveWorkbookSnapshot(workbookName, workbookData) {
  if (workbookData == null) {
    return {
      name: workbookName || "Untitled Spreadsheet",
    };
  }

  if (typeof workbookData === "string") {
    return JSON.parse(workbookData);
  }

  return workbookData;
}
