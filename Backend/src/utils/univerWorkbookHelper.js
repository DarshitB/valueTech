const { randomBytes } = require("crypto");

const UNIVER_APP_VERSION = "0.25.1";
const UNIVER_LOCALE = "enUS";

const BOOLEAN_FALSE = 0;
const BOOLEAN_TRUE = 1;

function generateUniverId(length = 6) {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

/**
 * Build a minimum valid Univer IWorkbookData snapshot with one empty worksheet.
 * Structure aligns with @univerjs/core getEmptySnapshot + mergeWorksheetSnapshotWithDefault.
 *
 * @param {string} [name=""]
 * @returns {object}
 */
function createEmptyWorkbookData(name = "") {
  const workbookId = generateUniverId(6);
  const sheetId = generateUniverId(6);

  return {
    id: workbookId,
    name,
    appVersion: UNIVER_APP_VERSION,
    locale: UNIVER_LOCALE,
    styles: {},
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "Sheet1",
        tabColor: "",
        hidden: BOOLEAN_FALSE,
        rowCount: 1000,
        columnCount: 20,
        zoomRatio: 1,
        freeze: {
          xSplit: 0,
          ySplit: 0,
          startRow: -1,
          startColumn: -1,
        },
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 88,
        defaultRowHeight: 24,
        mergeData: [],
        cellData: {},
        rowData: {},
        columnData: {},
        showGridlines: BOOLEAN_TRUE,
        rowHeader: {
          width: 46,
          hidden: BOOLEAN_FALSE,
        },
        columnHeader: {
          height: 20,
          hidden: BOOLEAN_FALSE,
        },
        rightToLeft: BOOLEAN_FALSE,
      },
    },
    resources: [],
  };
}

module.exports = {
  createEmptyWorkbookData,
};
