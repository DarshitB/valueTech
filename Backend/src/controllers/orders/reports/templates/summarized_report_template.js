const renderFieldValue = (value) => {
  if (!value && value !== 0) return "";
  return String(value).replace(/\r\n/g, "<br>").replace(/\n/g, "<br>").replace(/\r/g, "<br>");
};

const FIXED_START = [
  { id: "machine_description", header: "Machine Description" },
  { id: "asset_serial_no", header: "Asset Serial No." },
  { id: "yom", header: "Yom" },
  { id: "supplier_name", header: "Supplier Name" },
  { id: "invoice_no", header: "Invoice No." },
  { id: "invoice_date", header: "Invoice Date" },
  { id: "resource_no", header: "Resource No." },
];

const FIXED_END = [
  { id: "total_invoice_cost", header: "Total Invoice Cost" },
  { id: "estimated_current_replacement_cost", header: "Estimated Current Replacement Cost" },
  { id: "residual_life_of_asset", header: "Residual life of asset" },
  { id: "depr_rate", header: "Depr. Rate" },
  { id: "amount_post_depreciation", header: "Amount Post Depreciation" },
  { id: "estimated_fair_value", header: "Estimated Fair Value" },
];

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
  return [...FIXED_START, ...dynamic, ...FIXED_END];
}

function getCellValue(row, colId) {
  if (!row || !colId) return "";
  const value = row[colId];
  return value === null || value === undefined ? "" : value;
}

function generateSummarizedTableAppendixHTML(formData) {
  const tableData = parseSummarizedTable(formData.summarized_table_data);
  const orderedColumns = getOrderedColumns(tableData);
  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  const colSpan = orderedColumns.length || 1;

  const renderedHeader = orderedColumns
    .map((col) => `<th>${renderFieldValue(col.header || "-")}</th>`)
    .join("");

  const renderedRows =
    rows.length > 0
      ? rows
          .map(
            (row) =>
              `<tr>${orderedColumns
                .map((col) => `<td>${renderFieldValue(getCellValue(row, col.id))}</td>`)
                .join("")}</tr>`
          )
          .join("")
      : `<tr><td colspan="${colSpan}" style="text-align:center;">No summarized table rows.</td></tr>`;

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
    padding: 6px;
    font-size: 10.5px;
    vertical-align: top;
    word-break: break-word;
    white-space: normal;
    text-align: center !important;
    background: transparent !important;
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
  .summary-title {
    font-size: 13px;
    font-weight: 700;
    text-align: center !important;
    background: transparent !important;
  }
  .summary-page .summary-table tfoot .spacer-row td {
    height: var(--bottom-space, 30px) !important;
    line-height: var(--bottom-space, 30px) !important;
  }
</style>
<div class="content-wrapper summary-page">
  <table class="summary-table">
    <thead>
      <tr class="spacer-row">
        <td colspan="${colSpan}" style="height:180px;border:none;padding:0;"></td>
      </tr>
      <tr>
        <th colspan="${colSpan}" class="summary-title">PLANT & MACHINERY - ANNEXURE I INDUSTRIAL</th>
      </tr>
      <tr>${renderedHeader}</tr>
    </thead>
    <tbody>
      ${renderedRows}
    </tbody>
    <tfoot>
      <tr class="spacer-row">
        <td colspan="${colSpan}" style="height:var(--bottom-space,30px);border:none;padding:0;"></td>
      </tr>
    </tfoot>
  </table>
</div>`;
}

module.exports = {
  generateSummarizedTableAppendixHTML,
};
