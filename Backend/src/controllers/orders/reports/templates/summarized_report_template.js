const renderFieldValue = (value) => {
  if (!value && value !== 0) return "";
  return String(value).replace(/\r\n/g, "<br>").replace(/\n/g, "<br>").replace(/\r/g, "<br>");
};

/** Appendix column headers: use \\n or <br> for manual line breaks (e.g. "Total\\nInvoice\\nCost"). */
function renderSummarizedTableHeader(header) {
  const trimmed = String(header ?? "").trim();
  if (!trimmed) return "-";
  return renderFieldValue(trimmed);
}

const SUMMARIZED_SR_NO_COLUMN = { id: "sr_no", header: "SR NO." };

const FIXED_START = [
  { id: "machine_description", header: "Asset Description" },
  { id: "asset_serial_no", header: "Asset Serial No." },
  { id: "yom", header: "Yom" },
  { id: "supplier_name", header: "Supplier Name" },
  { id: "invoice_no", header: "Invoice No." },
  { id: "invoice_date", header: "Invoice Date" },
];

const FIXED_END = [
  { id: "total_invoice_cost", header: "Total\nInvoice\nCost" },
  { id: "estimated_current_replacement_cost", header: "Current\nReplacement\nCost" },
  { id: "residual_life_of_asset", header: "Residual\nlife of\nasset" },
  { id: "depr_rate", header: "Depr.\nRate" },
  { id: "amount_post_depreciation", header: "Amount\nPost\nDepreciation" },
  { id: "appraisal_value", header: "Appraisal\nValue" },
  { id: "estimated_fair_value", header: "Fair Value" },
];

const SUMMARIZED_GRAND_TOTAL_CURRENCY_IDS = new Set([
  "total_invoice_cost",
  "estimated_current_replacement_cost",
  "amount_post_depreciation",
  "appraisal_value",
  "estimated_fair_value",
]);

const SUMMARIZED_CURRENCY_PREFIX_IDS = new Set([
  "total_invoice_cost",
  "estimated_current_replacement_cost",
  "amount_post_depreciation",
  "appraisal_value",
  "estimated_fair_value",
]);

const SUMMARIZED_FIXED_END_COLUMN_IDS = new Set(FIXED_END.map((col) => col.id));

/** Columns that cannot be vertically merged (matches SummarizedReport.js). */
const SUMMARIZED_VERTICAL_MERGE_BLOCKLIST = new Set(["amount_post_depreciation"]);

function canVerticallyMergeSummarizedColumn(colId) {
  return Boolean(
    colId &&
      !SUMMARIZED_FIXED_END_COLUMN_IDS.has(colId) &&
      !SUMMARIZED_VERTICAL_MERGE_BLOCKLIST.has(colId)
  );
}

function getVerticalMergedColumnIds(tableData) {
  const ids = Array.isArray(tableData?.verticalMergedColumnIds)
    ? tableData.verticalMergedColumnIds
    : [];
  return ids.filter(canVerticallyMergeSummarizedColumn);
}

function getVerticalMergeValues(tableData) {
  const raw = tableData?.verticalMergeValues;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function isVerticallyMergedColumn(colId, mergedColumnIds) {
  return Boolean(colId && mergedColumnIds.includes(colId));
}

function isSummarizedMergedTitleRow(row) {
  return Boolean(row?.isMergedRow);
}

function getSummarizedMergedRowText(row) {
  return String(row?.mergedRowText ?? "");
}

/** Contiguous non-title rows for vertical merge rowspan (titles break the segment). */
function findSummarizedNonTitleSegmentBounds(rows, rowIndex) {
  if (!Array.isArray(rows) || rowIndex < 0 || rowIndex >= rows.length) return null;
  if (isSummarizedMergedTitleRow(rows[rowIndex])) return null;
  let start = rowIndex;
  while (start > 0 && !isSummarizedMergedTitleRow(rows[start - 1])) start -= 1;
  let end = rowIndex;
  while (end < rows.length - 1 && !isSummarizedMergedTitleRow(rows[end + 1])) {
    end += 1;
  }
  return { start, end, count: end - start + 1 };
}

function parseSummarizedTable(raw) {
  if (!raw) return { dynamicColumns: [], rows: [] };
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { dynamicColumns: [], rows: [] };
  }
}

function getOrderedColumns(tableData) {
  const dynamic = Array.isArray(tableData?.dynamicColumns)
    ? tableData.dynamicColumns.filter((c) => c && c.id).map((c) => ({ id: c.id, header: c.header || "" }))
    : [];
  const overrides =
    tableData?.fixedColumnHeaders &&
    typeof tableData.fixedColumnHeaders === "object" &&
    !Array.isArray(tableData.fixedColumnHeaders)
      ? tableData.fixedColumnHeaders
      : {};

  const applyFixedHeaderOverride = (col) => {
    const override = overrides[col.id];
    if (typeof override === "string" && override.trim() !== "") {
      return { ...col, header: override };
    }
    return col;
  };

  return [
    applyFixedHeaderOverride(SUMMARIZED_SR_NO_COLUMN),
    ...FIXED_START.map(applyFixedHeaderOverride),
    ...dynamic,
    ...FIXED_END.map(applyFixedHeaderOverride),
  ];
}

const SUMMARIZED_FIXED_START_IDS = new Set(FIXED_START.map((c) => c.id));

const SUMMARIZED_CELL_TEXT_LEFT_ATTR =
  'class="cell-text-left" style="text-align:left !important;text-transform:none !important;"';

/** True if at least one row has a non-empty value (trimmed) for this column. */
function hasSummarizedColumnData(rows, colId, tableData) {
  if (!colId) return false;
  const mergedIds = getVerticalMergedColumnIds(tableData || {});
  if (isVerticallyMergedColumn(colId, mergedIds)) {
    const mergedVal = String(getVerticalMergeValues(tableData || {})[colId] ?? "").trim();
    if (mergedVal !== "") return true;
  }
  if (!Array.isArray(rows) || rows.length === 0) return false;
  for (const row of rows) {
    if (!row || isSummarizedMergedTitleRow(row)) continue;
    const trimmed = String(getCellValue(row, colId) ?? "").trim();
    if (trimmed !== "") return true;
  }
  return false;
}

function isSummarizedNoteEmpty(raw) {
  if (raw === null || raw === undefined) return true;
  const trimmed = String(raw).trim();
  if (trimmed === "") return true;
  const stripped = trimmed
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/?[^>]+>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, "");
  return stripped === "";
}

function resolveSummarizedNoteText(formData) {
  const candidates = [formData?.end_note, formData?.summarized_table_note];
  for (const raw of candidates) {
    if (!isSummarizedNoteEmpty(raw)) return String(raw).trim();
  }
  return "";
}

/** Omit columns with no data in any row (summarized appendix table only). */
function getVisibleOrderedColumns(tableData) {
  const all = getOrderedColumns(tableData);
  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  if (rows.length === 0) return all;
  const visible = all.filter((col) => hasSummarizedColumnData(rows, col.id, tableData));
  // Keep full header set when only title/merged rows exist (no per-column cell data yet).
  return visible.length > 0 ? visible : all;
}

function parseCurrencyValue(val) {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isDashOnlySummarizedFairValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized === "-" || normalized === "–" || normalized === "—";
}

function areAllSummarizedFairValueRowsDashOnly(rows) {
  const dataRows = (Array.isArray(rows) ? rows : []).filter(
    (row) => !isSummarizedMergedTitleRow(row)
  );
  return (
    dataRows.length > 0 &&
    dataRows.every((row) => isDashOnlySummarizedFairValue(row?.estimated_fair_value))
  );
}

/** Match frontend Indian currency display (digits + grouping + up to 2 decimals) */
function formatIndianCurrencyInputString(value) {
  if (!value || typeof value !== "string") return "";
  let inputVal = value.replace(/[^0-9.]/g, "");
  const parts = inputVal.split(".");
  let integerPart = parts[0] || "";
  let decimalPart = parts[1] ? parts[1].slice(0, 2) : "";
  let lastThree = integerPart.slice(-3);
  let otherNumbers = integerPart.slice(0, -3);
  if (otherNumbers !== "") {
    lastThree = "," + lastThree;
  }
  let formattedInteger =
    otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  let formattedValue = formattedInteger;
  if (decimalPart.length > 0 || inputVal.includes(".")) {
    formattedValue += "." + decimalPart;
  }
  return formattedValue;
}

function computeSummarizedGrandTotals(rows) {
  const totals = {
    total_invoice_cost: 0,
    estimated_current_replacement_cost: 0,
    amount_post_depreciation: 0,
    appraisal_value: 0,
    estimated_fair_value: 0,
  };
  if (!Array.isArray(rows)) return totals;
  for (const row of rows) {
    if (!row || isSummarizedMergedTitleRow(row)) continue;
    totals.total_invoice_cost += parseCurrencyValue(row.total_invoice_cost);
    totals.estimated_current_replacement_cost += parseCurrencyValue(
      row.estimated_current_replacement_cost
    );
    totals.amount_post_depreciation += parseCurrencyValue(row.amount_post_depreciation);
    totals.appraisal_value += parseCurrencyValue(row.appraisal_value);
    totals.estimated_fair_value += parseCurrencyValue(row.estimated_fair_value);
  }
  return totals;
}

/** Sum integer digits-only values per column (matches SummarizedReport.js flex "Allow sum" columns). */
function computeSummarizedDynamicAllowSumTotal(rows, colId) {
  if (!Array.isArray(rows) || !colId) return 0;
  let sum = 0;
  for (const row of rows) {
    if (!row || isSummarizedMergedTitleRow(row)) continue;
    const raw = String(row[colId] ?? "").replace(/\D/g, "");
    if (raw) sum += parseInt(raw, 10) || 0;
  }
  return sum;
}

function renderSummarizedGrandTotalRow(tableData, orderedColumns) {
  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  const dynamicMetaById = new Map(
    (Array.isArray(tableData?.dynamicColumns) ? tableData.dynamicColumns : [])
      .filter((c) => c && c.id)
      .map((c) => [c.id, c])
  );
  const totals = computeSummarizedGrandTotals(rows);
  const useManualFairValueTotal = areAllSummarizedFairValueRowsDashOnly(rows);
  const manualFairValueTotal = parseCurrencyValue(
    tableData?.manualEstimatedFairValueGrandTotal
  );
  if (useManualFairValueTotal && manualFairValueTotal > 0) {
    totals.estimated_fair_value = manualFairValueTotal;
  }
  const cols = Array.isArray(orderedColumns) ? orderedColumns : [];
  const labelStyle =
    "background-color:#c8e6c9;font-weight:700;text-align:center;padding:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;";

  let html = '<tr class="summary-grand-total-row">';
  let i = 0;
  while (i < cols.length) {
    const col = cols[i];
    if (col.id === "sr_no") {
      html += "<td></td>";
      i += 1;
      continue;
    }
    if (SUMMARIZED_FIXED_START_IDS.has(col.id)) {
      let j = i;
      while (j < cols.length && SUMMARIZED_FIXED_START_IDS.has(cols[j].id)) j += 1;
      const span = j - i;
      html += `<td colspan="${span}" class="summary-grand-total-label" style="${labelStyle}">GRAND TOTAL - FAIR VALUATION AMOUNT (marked in green shade)</td>`;
      i = j;
      continue;
    }
    if (dynamicMetaById.has(col.id)) {
      const meta = dynamicMetaById.get(col.id);
      if (meta.allowSum) {
        const dynTotal = computeSummarizedDynamicAllowSumTotal(rows, col.id);
        html += `<td style="font-weight:700;background-color:#f9fafb;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${renderFieldValue(String(dynTotal))}</td>`;
      } else {
        html += "<td></td>";
      }
      i += 1;
      continue;
    }
    if (SUMMARIZED_GRAND_TOTAL_CURRENCY_IDS.has(col.id)) {
      const raw = totals[col.id] ?? 0;
      const rounded = Math.round((raw + Number.EPSILON) * 100) / 100;
      const formatted = formatIndianCurrencyInputString(rounded.toFixed(2));
      const extraStyle =
        col.id === "estimated_fair_value"
          ? "background-color:#daf2d0 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;"
          : "";
      html += `<td style="font-weight:700;${extraStyle}"><span class="summary-currency-value">${renderFieldValue(`₹ ${formatted}`)}</span></td>`;
      i += 1;
      continue;
    }
    html += "<td></td>";
    i += 1;
  }
  html += "</tr>";
  return html;
}

function getCellValue(row, colId) {
  if (!row || !colId) return "";
  const value = row[colId];
  return value === null || value === undefined ? "" : value;
}

function formatSummarizedCellDisplay(colId, value) {
  if (value === null || value === undefined || value === "") return "";
  const normalizedValue = String(value ?? "").trim();
  const isDashOnlyValue =
    normalizedValue === "-" || normalizedValue === "–" || normalizedValue === "—";
  if (SUMMARIZED_CURRENCY_PREFIX_IDS.has(colId)) {
    if (colId === "estimated_fair_value" && isDashOnlyValue) {
      return normalizedValue;
    }
    return `<span class="summary-currency-value">₹ ${value}</span>`;
  }
  if (colId === "depr_rate") {
    return `${value}%`;
  }
  return value;
}

function resolveSummarizedBodyCellValue(colId, row, tableData, mergedColumnIds) {
  if (isVerticallyMergedColumn(colId, mergedColumnIds)) {
    return getVerticalMergeValues(tableData)[colId] ?? "";
  }
  return getCellValue(row, colId);
}

function renderSummarizedBodyCell(colId, row, rowIndex, tableData, mergedColumnIds, rows) {
  if (isSummarizedMergedTitleRow(row)) {
    return "";
  }

  if (isVerticallyMergedColumn(colId, mergedColumnIds)) {
    const segment = findSummarizedNonTitleSegmentBounds(rows, rowIndex);
    if (!segment || rowIndex !== segment.start) {
      return "";
    }
    const rawValue = resolveSummarizedBodyCellValue(colId, row, tableData, mergedColumnIds);
    const inner = renderFieldValue(formatSummarizedCellDisplay(colId, rawValue));
    const rowSpan = Math.max(segment.count, 1);
    return `<td rowspan="${rowSpan}" class="summarized-vertical-merged-cell" data-col-id="${colId}">${inner}</td>`;
  }

  const rawValue = resolveSummarizedBodyCellValue(colId, row, tableData, mergedColumnIds);
  const inner = renderFieldValue(formatSummarizedCellDisplay(colId, rawValue));
  return `<td data-col-id="${colId}">${inner}</td>`;
}

function renderSummarizedDataRowsHtml(rows, orderedColumns, tableData) {
  const mergedColumnIds = getVerticalMergedColumnIds(tableData);
  const colSpan = orderedColumns.length || 1;
  return rows
    .map((row, rowIndex) => {
      if (isSummarizedMergedTitleRow(row)) {
        const text = renderFieldValue(getSummarizedMergedRowText(row));
        return `<tr class="summary-merged-row"><td colspan="${colSpan}" class="summary-title">${text || "-"}</td></tr>`;
      }
      return `<tr>${orderedColumns
        .map((col) =>
          renderSummarizedBodyCell(
            col.id,
            row,
            rowIndex,
            tableData,
            mergedColumnIds,
            rows
          )
        )
        .join("")}</tr>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Helper: additional rows (inspected / comments sections) — 9 col
// ---------------------------------------------------------------------------
function generateSummarizedAdditionalRows(formData, type) {
  let html = "";
  const prefix =
    type === "inspected"
      ? "additional_rows_inspected"
      : "additional_rows_comments";

  if (formData[`${prefix}_headding_1`] || formData[`${prefix}_value_1`]) {
    html += `
    <tr>
        <td>${formData[`${prefix}_headding_1`] || ""}</td>
        <td colspan="8">${formData[`${prefix}_value_1`] || ""}</td>
    </tr>`;
  }

  if (
    formData[`${prefix}_headding_2`] ||
    formData[`${prefix}_value_2`] ||
    formData[`${prefix}_headding_3`] ||
    formData[`${prefix}_value_3`]
  ) {
    html += `
    <tr>
        <td>${formData[`${prefix}_headding_2`] || ""}</td>
        <td colspan="3">${formData[`${prefix}_value_2`] || ""}</td>
        <td>${formData[`${prefix}_headding_3`] || ""}</td>
        <td colspan="4">${formData[`${prefix}_value_3`] || ""}</td>
    </tr>`;
  }

  return html;
}

// ---------------------------------------------------------------------------
// Helper: flexible fields per section — 9 col
// ---------------------------------------------------------------------------
function generateSummarizedFlexibleFieldsForSection(flexibleFields, sectionName) {
  if (!flexibleFields || flexibleFields.length === 0) return "";

  const sectionFields = flexibleFields.filter(
    (field) => field.section_name === sectionName
  );

  if (sectionFields.length === 0) return "";

  let html = "";
  let i = 0;

  while (i < sectionFields.length) {
    // First pass: collect all fields that fit in this row
    const rowFields = [];
    let rowCols = 0;
    let j = i;

    while (j < sectionFields.length && rowCols < 9) {
      const field = sectionFields[j];
      const colSpan = field.col_span ? parseInt(field.col_span) : 2;
      const fCols = colSpan === 1 ? 9 : 3;

      if (rowCols + fCols <= 9) {
        rowFields.push({ field, fCols });
        rowCols += fCols;
        j++;
      } else {
        break;
      }
    }

    // Distribute value columns evenly; last field absorbs the remainder
    // e.g. n=1 → value(8); n=2 → value(3)+value(4); n=3 → value(2)×3
    const n = rowFields.length;
    const totalValueCols = 9 - n; // n label cells each take 1 col
    const baseValue = Math.floor(totalValueCols / n);
    const remainder = totalValueCols % n;

    html += "<tr>";
    for (let k = 0; k < n; k++) {
      const { field } = rowFields[k];
      const isLast = k === n - 1;
      const valueColSpan = isLast ? baseValue + remainder : baseValue;
      html += `<td style="font-weight: bold;">${field.field_label || ""}</td>`;
      html += `<td colspan="${valueColSpan}">${field.field_value || ""}</td>`;
    }
    html += "</tr>";

    i = j;
  }

  return html;
}

// ---------------------------------------------------------------------------
// Main: Summarized report — normal-fields page (independent of machinery)
// ---------------------------------------------------------------------------
function generateSummarizedNormalFieldsHTML(
  formData,
  extraData,
  bgImageBase64,
  stampImageBase64,
  reportTypeSelection
) {
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        @page {
            margin: 0px;
            size: 8.5in 14in;
        }

        body {
            font-family: sans-serif;
            padding: 0px;
            margin: 0px;
            box-sizing: border-box;
            width: 8.5in;
            background-image: url('${bgImageBase64 || ""}');
            background-size: 8.5in 14in;
            background-repeat: repeat-y;
            background-position: top left;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }

        .content-wrapper {
            padding: 30px 25px;
            width: 100%;
            box-sizing: border-box;
            position: relative;
            background: transparent;
        }

        body {
            position: relative;
            min-height: 14in;
        }

        .footer {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .footer .page-number {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .footer .page-number .number {
            font-weight: bold;
            color: #000;
        }

        .footer .page-number .separator { color: #000; }

        .footer .page-number .label {
            color: #999;
            font-weight: normal;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: -30px;
            margin-bottom: 0;
        }

        table.main-table {
            table-layout: fixed;
            width: 100%;
        }
        table.main-table col.col-1,
        table.main-table col.col-2,
        table.main-table col.col-3,
        table.main-table col.col-4,
        table.main-table col.col-5,
        table.main-table col.col-6,
        table.main-table col.col-7,
        table.main-table col.col-8 { width: 11.111% !important; }
        table.main-table col.col-9 { width: 11.112% !important; }
        table.main-table td:not([colspan]),
        table.main-table th:not([colspan]) { width: 11.111% !important; min-width: 11.111% !important; max-width: 11.111% !important; }
        table.main-table td[colspan="2"],
        table.main-table th[colspan="2"] { width: 22.222% !important; min-width: 22.222% !important; max-width: 22.222% !important; }
        table.main-table td[colspan="3"],
        table.main-table th[colspan="3"] { width: 33.333% !important; min-width: 33.333% !important; max-width: 33.333% !important; }
        table.main-table td[colspan="4"],
        table.main-table th[colspan="4"] { width: 44.444% !important; min-width: 44.444% !important; max-width: 44.444% !important; }
        table.main-table td[colspan="5"],
        table.main-table th[colspan="5"] { width: 55.555% !important; min-width: 55.555% !important; max-width: 55.555% !important; }
        table.main-table td[colspan="6"],
        table.main-table th[colspan="6"] { width: 66.666% !important; min-width: 66.666% !important; max-width: 66.666% !important; }
        table.main-table td[colspan="7"],
        table.main-table th[colspan="7"] { width: 77.777% !important; min-width: 77.777% !important; max-width: 77.777% !important; }
        table.main-table td[colspan="8"],
        table.main-table th[colspan="8"] { width: 88.888% !important; min-width: 88.888% !important; max-width: 88.888% !important; }
        table.main-table td[colspan="9"],
        table.main-table th[colspan="9"] { width: 100% !important; min-width: 100% !important; max-width: 100% !important; }

        table.main-table tr.column-definition-row {
            height: 0 !important; min-height: 0 !important; max-height: 0 !important; line-height: 0 !important; border: none !important;
        }
        table.main-table tr.column-definition-row td {
            height: 0 !important; min-height: 0 !important; max-height: 0 !important;
            padding: 0 !important; margin: 0 !important; border: none !important; border-width: 0 !important;
            visibility: hidden !important; line-height: 0 !important; overflow: hidden !important; font-size: 0 !important;
        }

        body.single-page {
            height: 100%;
            min-height: 14in;
            display: flex;
            flex-direction: column;
        }
        body.single-page .main-table {
            flex: 1;
            height: 100% !important;
            min-height: calc(100% - 225px);
        }
        body.single-page .content-wrapper {
            min-height: 14in;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        thead { display: table-header-group; }

        thead .spacer-row {
            height: 225px;
            border: none;
            visibility: hidden;
        }
        thead .spacer-row td {
            border: none;
            padding: 0;
            height: 225px;
            line-height: 225px;
        }

        tbody { display: table-row-group; }
        tfoot { display: table-footer-group; }

        tfoot .footer-row {
            height: 30px;
            border-top: 1px solid #e0e0e0;
        }
        tfoot .footer-row td {
            border: none;
            padding: 8px 10px;
            font-size: 10px;
            text-align: left;
            vertical-align: middle;
        }
        tfoot .footer-row .page-number { font-weight: bold; color: #000; }
        tfoot .footer-row .continue-text { text-align: right; color: #666; }

        body.last-page tfoot .footer-row .continue-text,
        table.last-page tfoot .footer-row .continue-text { display: none; }

        body.single-page tfoot .footer-row { display: none !important; }

        @media print {
            body {
                background-image: url('${bgImageBase64 || ""}');
                background-size: 8.5in 14in;
                background-repeat: repeat-y;
                background-position: top left;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
            }
            .content-wrapper { padding: 30px 25px; }
            .footer .page-number .number::before { content: counter(page); }
            @page { margin: 0; size: 8.5in 14in; }
            .footer .page-number .number { display: inline-block; }
            .footer .page-number .number::before { content: counter(page); font-weight: bold; color: #000; }
            thead { display: table-header-group; }
            tbody { display: table-row-group; }
            tfoot { display: table-footer-group; }
            tfoot .footer-row { border-top: 1px solid #e0e0e0; }
            tfoot .footer-row .page-number .page-number-value { display: inline-block; font-size: 10px; font-weight: bold; }
            body.last-page tfoot .footer-row .continue-text,
            table.last-page tfoot .footer-row .continue-text { display: none !important; }
            body.single-page tfoot .footer-row { display: none !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        }

        th, td {
            border: 1px solid #000;
            padding: 1.5px;
            text-align: center;
            font-size: 9.3px;
            text-transform: uppercase;
            word-wrap: break-word;
        }
        table.main-table th,
        table.main-table td {
            box-sizing: border-box;
            overflow: hidden;
            overflow-wrap: break-word;
        }
        table.main-table tr.tyre-image-row td,
        table.main-table tr.signature-row td { overflow: visible; }

        /* Left-aligned narrative blocks (PDF override uses !important on all td) */
        td.cell-text-left,
        table.main-table td.cell-text-left {
            text-align: left !important;
            text-transform: none !important;
        }

        ${reportTypeSelection === "Rough" ? `
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.15);
            z-index: 9999;
            pointer-events: none;
            user-select: none;
            white-space: nowrap;
            font-family: Arial, sans-serif;
        }
        @media print {
            .watermark {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
            }
        }
        ` : ""}
    </style>
</head>
<body>
    ${reportTypeSelection === "Rough" ? '<div class="watermark">Rough</div>' : ""}
    <div class="content-wrapper">
        <table class="main-table" style="min-height: calc(100% - 225px);">
        <colgroup>
            <col class="col-1"><col class="col-2"><col class="col-3"><col class="col-4"><col class="col-5"><col class="col-6"><col class="col-7"><col class="col-8"><col class="col-9">
        </colgroup>
        <thead>
        <tr class="column-definition-row" aria-hidden="true">
            <td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.111%;border:none !important;border-width:0;"></td><td style="width:11.112%;border:none !important;border-width:0;"></td>
        </tr>
        <tr class="spacer-row">
            <td colspan="9" style="height: 225px; border: none; padding: 0;"></td>
        </tr>
        <tr>
            <th colspan="9">${extraData.bank_name}</th>
        </tr>
        <tr>
            <th colspan="9">${formData.valueation_report_for_heading}</th>
        </tr>
        <tr class="general-details-row" data-first-page-only="true">
            <th colspan="9">${formData.general_details_heading}</th>
        </tr>
        <tr>
            <td>REF NO.</td>
            <td colspan="2">${formData.ref_no_year}/${formData.ref_no_bank}/${formData.state_name}/${formData.ref_no_code}/${formData.ref_no_month}${formData.ref_no_id}</td>
            <td style="text-transform:uppercase;">VALUATION PURPOSE:</td>
            <td colspan="2">${formData.valuation_purpose}</td>
            <td style="text-transform:uppercase;">${formData.report_date_heading}:</td>
            <td colspan="2">${formData.report_date}</td>
        </tr>
        </thead>
        <tbody>
        <tr>
            <td>VALUER NAME:</td>
            <td colspan="2">${formData.valuer_name}</td>
            <td>${formData.valuer_name === "VALUETECH SOLUTIONS" ? "LICENCE NO." : "LICENCE NO:"}</td>
            <td colspan="2">${formData.license_no}</td>
            <td>VALUER CONTACT:</td>
            <td colspan="2">${formData.valuer_contact}</td>
        </tr>
        <tr>
            <td>INITIATED BY:</td>
            <td colspan="2">${renderFieldValue(formData.initiated_by) || "NOT AVAILABLE"}</td>
            <td>PLACE OF INSPECTION:</td>
            <td colspan="3">${renderFieldValue(formData.place_of_inspection)}</td>
            <td>DATE OF INSPECTION:</td>
            <td>${renderFieldValue(formData.date_of_inspection) || "-"}</td>
        </tr>
        <tr>
            <td>REGISTERED OWNER NAME:</td>
            <th colspan="3">${formData.registered_owner_name}</th>
            <td>ADDRESS:</td>
            <td colspan="4">${renderFieldValue(formData.registered_owner_address)}</td>
        </tr>
        <tr data-proposed-owner-address="true">
            <td>PROPOSED OWNER NAME:</td>
            <th colspan="3">${formData.proposed_owner_name}</th>
            <td>ADDRESS:</td>
            <td colspan="4">${renderFieldValue(formData.proposed_owner_address)}</td>
        </tr>
        <tr>
            <th colspan="9">${formData.inspected_equipment_heading}</th>
        </tr>
        <tr>
            <td>REGISTRATION NO:</td>
            <td colspan="2">${formData.registration_no ? formData.registration_no : "NOT APPLICABLE"}</td>
            <td>REGISTRATION DATE:</td>
            <td>${formData.registration_date === "00-00-0000" ? "NA" : formData.registration_date}</td>
            <td>LOCATION OF MACHINERY:</td>
            <td colspan="3">${renderFieldValue(formData.location_of_machinery)}</td>
        </tr>
        <tr>
            <td>OWNER SERIAL NO:</td>
            <td colspan="2">${renderFieldValue(formData.owner_serial_no) || "-"}</td>
            <td>MANUFACTURE YEAR:</td>
            <td colspan="2">${formData.manufacture_year}</td>
            <td>ASSET MAKE &amp; SUPPLIER:</td>
            <td colspan="2">${formData.asset_make}</td>
        </tr>
        <tr>
            <td>CONTROL SYSTEM:</td>
            <td >${formData.control_system}</td>
            <td>MACHINE SERIAL NO:</td>
            <td>${formData.machine_serial_no}</td>
            <td>LAF ID:</td>
            <td>${formData.laf_id}</td>
            <td>MODEL:</td>
            <td colspan="2">${formData.model}</td>
        </tr>
        <tr>
            <td>APPLICATION / USAGE:</td>
            <td colspan="2">${formData.application_usage}</td>
            <td style="text-transform:uppercase;">${formData.invoice_no_heading || "INVOICE NO. & DATE:"}</td>
            <td colspan="2">${formData.invoice_no_date ? formData.invoice_no_date : "NOT AVAILABLE"}</td>
            <td>MACHINE TYPE:</td>
            <td colspan="2">${formData.machine_type ? formData.machine_type : "NOT AVAILABLE"}</td>
        </tr>
        <tr>
            <td>HYP WITH:</td>
            <td colspan="4">${renderFieldValue(formData.hyp_with)}</td>
            <td colspan="2">SUPPLIER NAME:</td>
            <td colspan="2">${formData.supplier_names ? formData.supplier_names : "NOT AVAILABLE"}</td>
        </tr>
        ${generateSummarizedAdditionalRows(formData, "inspected")}
        ${generateSummarizedFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "INSPECTED_EQUIPMENT_DETAILS"
        )}
        <tr>
            <th colspan="9">${formData.comments_on_equipment_heading}</th>
        </tr>
        <tr>
            <td>ASSET CLASSIFICATION:</td>
            <td colspan="2">${formData.asset_classification}</td>
            <td>MACHINE TECHNOLOGY:</td>
            <td colspan="2">${formData.machine_technology}</td>
            <td>MACHINE CONDITION:</td>
            <td colspan="2">${formData.machine_condition}</td>
        </tr>
        <tr>
            <td>CONTROL PANEL UNIT:</td>
            <td colspan="2">${formData.control_panel_unit}</td>
            <td>ELECTRICAL CONDITION:</td>
            <td colspan="2">${formData.electrical_condition}</td>
            <td>MECHANICAL CONDITION:</td>
            <td colspan="2">${formData.mechanical_condition}</td>
        </tr>
        <tr>
            <td>MACHINE COLOUR:</td>
            <td colspan="3">${formData.machine_colour}</td>
            <td>COLOR CONDITION:</td>
            <td colspan="4">${formData.color_condition}</td>
        </tr>
        ${formData.fix_but_flex_heading_1 && formData.fix_but_flex_value_1 && formData.fix_but_flex_heading_2 && formData.fix_but_flex_value_2
          ? `<tr>
            <td>${formData.fix_but_flex_heading_1}:</td>
            <td colspan="3">${formData.fix_but_flex_value_1}</td>
            <td>${formData.fix_but_flex_heading_2}:</td>
            <td colspan="4">${formData.fix_but_flex_value_2}</td>
        </tr>` : ""}
        ${formData.fix_but_flex_heading_3 && formData.fix_but_flex_value_3 && formData.fix_but_flex_heading_4 && formData.fix_but_flex_value_4
          ? `<tr>
            <td>${formData.fix_but_flex_heading_3}:</td>
            <td colspan="3">${formData.fix_but_flex_value_3}</td>
            <td>${formData.fix_but_flex_heading_4}:</td>
            <td colspan="4">${formData.fix_but_flex_value_4}</td>
        </tr>` : ""}
        ${formData.fix_but_flex_heading_5 && formData.fix_but_flex_value_5 && formData.fix_but_flex_heading_6 && formData.fix_but_flex_value_6 && formData.fix_but_flex_heading_7 && formData.fix_but_flex_value_7
          ? `<tr>
            <td>${formData.fix_but_flex_heading_5}:</td>
            <td colspan="2">${formData.fix_but_flex_value_5}</td>
            <td>${formData.fix_but_flex_heading_6}:</td>
            <td colspan="2">${formData.fix_but_flex_value_6}</td>
            <td>${formData.fix_but_flex_heading_7}:</td>
            <td colspan="2">${formData.fix_but_flex_value_7}</td>
        </tr>` : ""}
        ${formData.fix_but_flex_heading_8 && formData.fix_but_flex_value_8 && formData.fix_but_flex_heading_9 && formData.fix_but_flex_value_9 && formData.fix_but_flex_heading_10 && formData.fix_but_flex_value_10
          ? `<tr>
            <td>${formData.fix_but_flex_heading_8}:</td>
            <td colspan="2">${formData.fix_but_flex_value_8}</td>
            <td>${formData.fix_but_flex_heading_9}:</td>
            <td colspan="2">${formData.fix_but_flex_value_9}</td>
            <td>${formData.fix_but_flex_heading_10}:</td>
            <td colspan="2">${formData.fix_but_flex_value_10}</td>
        </tr>` : ""}
        ${formData.fix_but_flex_heading_11 && formData.fix_but_flex_value_11 && formData.fix_but_flex_heading_12 && formData.fix_but_flex_value_12
          ? `<tr>
            <td>${formData.fix_but_flex_heading_11}:</td>
            <td colspan="3">${renderFieldValue(formData.fix_but_flex_value_11)}</td>
            <td>${formData.fix_but_flex_heading_12}:</td>
            <td colspan="4">${formData.fix_but_flex_value_12}</td>
        </tr>` : ""}
        ${generateSummarizedAdditionalRows(formData, "comments")}
        ${generateSummarizedFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION"
        )}
        <tr>
            <th>DAMAGES IF ANY:</th>
            <td colspan="8">${formData.damages_if_any ? formData.damages_if_any : "NOT VISIBLE"}</td>
        </tr>
        <tr>
            <th colspan="9">${formData.insurance_details_heading}</th>
        </tr>
        <tr>
            <td>${formData.tax_invoice_copy_heading || "PROFORMA INVOICE"}:</td>
            <td colspan="2">${formData.tax_invoice_copy ? formData.tax_invoice_copy : "NOT AVAILABLE"}</td>
            <td>QUOTATION COPY:</td>
            <td colspan="2">${formData.quotation_copy ? formData.quotation_copy : "NOT AVAILABLE"}</td>
            <td>BILL OF ENTRY:</td>
            <td colspan="2">${formData.bill_of_entry ? formData.bill_of_entry : "NOT AVAILABLE"}</td>
        </tr>
        <tr>
            <td>BILL OF LANDING:</td>
            <td colspan="2">${formData.bill_of_landing ? formData.bill_of_landing : "NOT AVAILABLE"}</td>
            <td>INSURANCE COPY:</td>
            <td colspan="2">${formData.rc_book_verified ? formData.rc_book_verified : "NOT AVAILABLE"}</td>
            <td>POLICY NO:</td>
            <td colspan="2">${formData.policy_no ? formData.policy_no : "NOT AVAILABLE"}</td>
        </tr>
        <tr>
            <td>INSURANCE VAL. DATE:</td>
            <td colspan="2">${extraData.insurance_valid_date ? extraData.insurance_valid_date : "NOT AVAILABLE"}</td>
            <td>INSURED VALUE:</td>
            <td colspan="2">${formData.insured_value ? "RS. " + formData.insured_value : "NOT AVAILABLE"}</td>
            <td>INS VERIFIED:</td>
            <td colspan="2">${formData.insurance_verified ? formData.insurance_verified : "NOT AVAILABLE"}</td>
        </tr>
        <tr>
            <th colspan="9">${formData.overall_feedback_heading}</th>
        </tr>
        <tr>
            <td>TAX INVOICE COST:</td>
            <td colspan="2">Rs. ${formData.tax_invoice_cost}</td>
            <td>DEPRECIATION:</td>
            <td>${formData.depreciation}</td>
            <td>Rs. ${formData.depreciation_value}</td>
            <td>APPRAISER VALUE:</td>
            <td colspan="2">Rs. ${formData.appraiser_value}</td>
        </tr>
        <tr>
            <td>NO OF PHOTOGRAPH:</td>
            <td colspan="3">${renderFieldValue(formData.no_of_photograph) ? `${renderFieldValue(formData.no_of_photograph)} PHOTOS` : "-"}</td>
            <td>FAIR MARKET VALUE:</td>
            <th colspan="4">Rs. ${formData.fair_market_value}</th>
        </tr>
        <tr>
            <td>NO OF COLLAGE:</td>
            <td colspan="3">${renderFieldValue(formData.no_of_collage) ? `${renderFieldValue(formData.no_of_collage)} COLLAGE` : "-"}</td>
            <td>AMOUNT IN WORDS:</td>
            <th colspan="4">${formData.amount_in_words}</th>
        </tr>
        <tr>
            <td>VALUER COMMENTS/REMARKS:</td>
            <td colspan="8" ${SUMMARIZED_CELL_TEXT_LEFT_ATTR}>${renderFieldValue(formData.valuer_comments_remarks)}</td>
        </tr>
        ${formData.valuer_special_remarks != null && formData.valuer_special_remarks !== ""
          ? `<tr>
            <td>VALUER SPECIAL REMARKS:</td>
            <td colspan="8" ${SUMMARIZED_CELL_TEXT_LEFT_ATTR}>${renderFieldValue(formData.valuer_special_remarks)}</td>
        </tr>` : ""}
        ${generateSummarizedFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "OVER_ALL_FEED_BACK_OF_THE_INSPECTED"
        )}
        <tr>
            <td>DECLARATION:</td>
            <td colspan="8" ${SUMMARIZED_CELL_TEXT_LEFT_ATTR}>${renderFieldValue(formData.declaration)}</td>
        </tr>
        <tr>
            <td>DISCLAIMER:</td>
            <td colspan="8" ${SUMMARIZED_CELL_TEXT_LEFT_ATTR}>${renderFieldValue(formData.disclaimer)}</td>
        </tr>
        <tr class="tyre-image-row">
            <td colspan="9" style="height:58px; position:relative; overflow: hidden; max-width: 0; text-align: center;">
                ${formData.tyre_image_base64
                  ? `<img src="${formData.tyre_image_base64}" style="max-width: 100%; max-height: 70px; width: auto; height: auto; object-fit: contain; object-position: center center; display: block; margin: 0 auto; position:relative; z-index:1;" alt="">`
                  : ""}
            </td>
        </tr>
        <tr class="signature-row">
            <td colspan="9" style="height:48px; position:relative;">
                ${stampImageBase64 ? `<img src="${stampImageBase64}" alt="stamp" style="position:absolute; left:50%; bottom:-5px; transform:translateX(calc(-50% - 250px)); height:125px; z-index:2; pointer-events:none;" />` : ""}
                SIGNATURE WITH SEAL &amp; STAMP
            </td>
        </tr>
        </tbody>
        <tfoot>
            <tr class="footer-row">
                <td colspan="4" class="page-number">
                    <span class="page-number-value" data-page-number="">Page 1</span>
                </td>
                <td colspan="5" class="continue-text">
                    Continue to next page...
                </td>
            </tr>
        </tfoot>
    </table>
    </div>
</body>
</html>
  `;
}

/** Generate-only: tbody vertical padding for appendix table (default 5px). */
function resolveSummarizedAppendixCellPaddingPx(formData) {
  const raw = formData?.summarized_appendix_cell_padding_px;
  const parsed = parseInt(String(raw ?? "5").trim(), 10);
  if (Number.isNaN(parsed)) return 5;
  return Math.min(100, Math.max(0, parsed));
}

// ---------------------------------------------------------------------------
// Summarized table appendix (second page)
// ---------------------------------------------------------------------------
function generateSummarizedTableAppendixHTML(formData, stampImageBase64) {
  const appendixCellPaddingPx = resolveSummarizedAppendixCellPaddingPx(formData);
  const tableData = parseSummarizedTable(formData.summarized_table_data);
  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  const orderedColumns = getVisibleOrderedColumns(tableData);
  const colSpan = orderedColumns.length || 1;
  const summarizedNoteText = resolveSummarizedNoteText(formData);
  const summarizedNoteInnerHtml = summarizedNoteText
    ? `<strong>*NOTE:</strong><br>${renderFieldValue(summarizedNoteText)}`
    : "";

  const renderedHeader = orderedColumns
    .map(
      (col) =>
        `<th data-col-id="${col.id}">${renderSummarizedTableHeader(col.header)}</th>`
    )
    .join("");

  const dataRowsHtml =
    rows.length > 0
      ? renderSummarizedDataRowsHtml(rows, orderedColumns, tableData)
      : `<tr><td colspan="${colSpan}" style="text-align:center;">No summarized table rows.</td></tr>`;

  const renderedRows = dataRowsHtml + renderSummarizedGrandTotalRow(tableData, orderedColumns);

  return `
<style>
  .summary-page {
    page-break-before: always;
    break-before: page;
  }
  .summary-table {
    margin-top: -30px;
    table-layout: auto;
    width: 100%;
    border-collapse: collapse;
  }
  .summary-table thead { display: table-header-group; }
  .summary-table tbody { display: table-row-group; }
  .summary-table tfoot { display: table-footer-group; }
  .summary-table tr { page-break-inside: avoid; }
  .summary-table th, .summary-table td {
    border: 1px solid #111;
    padding: 2px;
    font-size: 9px;
    line-height: 1.3;
    vertical-align: middle;
    word-break: normal;
    overflow-wrap: break-word;
    hyphens: auto;
    white-space: normal;
    text-align: center !important;
    background: transparent !important;
  }
  .summary-table tbody td {
    padding-top: ${appendixCellPaddingPx}px !important;
    padding-bottom: ${appendixCellPaddingPx}px !important;
  }
  .summary-table .summary-currency-value {
    display: inline-block;
    white-space: nowrap !important;
  }
  .summary-table thead th {
    text-align: center !important;
    vertical-align: middle !important;
    line-height: 1.15;
    white-space: normal !important;
  }
  .summary-table tr.summary-grand-total-row td {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .summary-table td.summarized-vertical-merged-cell {
    vertical-align: middle !important;
    text-align: center !important;
  }
  .summary-table .spacer-row {
    height: 180px;
    border: none;
    visibility: hidden;
  }
  .summary-table .spacer-row td {
    border: none !important;
    padding: 0 !important;
    height: 180px !important;
    line-height: 180px !important;
    background: transparent !important;
  }
  .summary-table th.summary-title,
  .summary-table td.summary-title {
    font-size: 10px;
    font-weight: 700;
    text-align: center !important;
    background: #993366 !important;
    color: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .summary-table thead tr:nth-child(3) th {
    background: #e8beda !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .summary-page .summary-footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0;
    padding: 8px 10px;
    font-size: 10px;
    font-weight: normal;
  }
  .summary-page .summary-footer-row .page-number {
    font-weight: bold;
    color: #000;
  }
  .summary-page .summary-footer-row .continue-text {
    text-align: right;
    color: #666;
    text-transform: uppercase;
  }
  .summary-note {
    width: 80%;
    margin-top: 10px;
    font-size: 12px;
    line-height: 1.3;
    text-align: left;
    text-transform: uppercase;
  }
  .summary-stamp-source {
    display: none;
  }
  .summary-stamp-per-page {
    position: absolute;
    left: 40%;
    bottom: -50px;
    width: auto;
    height: 105px;
    object-fit: contain;
    z-index: 5;
    pointer-events: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  .summary-note-stamp-row {
    display: block;
    margin-top: 10px;
    text-transform: uppercase;
  }
  .summary-note-stamp-row .summary-note {
    width: 100%;
    margin-top: 0;
  }
  .summary-note-stamp-row .summary-note-stamp {
    float: right;
    width: 190px;
    margin: 0 0 8px 8px;
    padding-top: 0;
    display: block;
    position: relative;
  }
  .summary-note-stamp-row .summary-note-stamp img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 120px;
    max-width: 190px;
    margin-top: -15px;
    object-fit: contain;
    position: static;
    transform: none;
  }
</style>
<div class="content-wrapper summary-page" lang="en">
  <table class="summary-table">
    <thead>
      <tr class="spacer-row">
        <td colspan="${colSpan}" style="height:180px;border:none;padding:0;"></td>
      </tr>
      <tr>
      <!--
        <th colspan="${colSpan}" class="summary-title">PLANT & MACHINERY - ANNEXURE I INDUSTRIAL</th> -->
      </tr>
      <tr>${renderedHeader}</tr>
    </thead>
    <tbody>
      ${renderedRows}
    </tbody>
  </table>
  <div class="summary-note">
    ${summarizedNoteInnerHtml}
    <div class="summary-stamp-source">
      ${stampImageBase64 ? `<img src="${stampImageBase64}" alt="Stamp">` : ""}
    </div>
  </div>
  <div class="summary-footer-row">
    <span class="summary-page-number-value" data-page-number="2">Page 2</span>
    <span class="summary-continue-text"></span>
  </div>
</div>`;
}

module.exports = {
  generateSummarizedNormalFieldsHTML,
  generateSummarizedTableAppendixHTML,
  // Exported for unit tests / reuse
  canVerticallyMergeSummarizedColumn,
  getVerticalMergedColumnIds,
  getVerticalMergeValues,
  renderSummarizedDataRowsHtml,
  hasSummarizedColumnData,
};
