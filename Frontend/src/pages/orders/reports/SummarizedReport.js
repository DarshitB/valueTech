import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchOrderById,
  fetchOrderByOrderNumber,
} from "../../../redux/reducers/orderReducer";
import {
  fetchOrderReport,
  fetchOrderReportLookup,
  generateOrderReport,
  saveOrderReport,
  clearCurrentReport,
} from "../../../redux/reducers/orderReportReducer";
import { fetchAssetMakesForReports } from "../../../redux/reducers/assetMakesReducer";
import { fetchChildCategories } from "../../../redux/reducers/childCategoryReducer";
import { usePageTitle } from "../../../context/PageTitleContext";
import { resolveAssetUrl } from "../../../utils/urlUtils";
import SingleSearchSelect from "../../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import { selectPermissions } from "../../../redux/selectors/authSelectors";
import { hasPermission } from "../../../utils/permissionUtils";
import "../order.scss";
import { DeleteIcon, ViewIcon } from "../../../components/icons";
import { getFinalizedOrdersByChildCategory } from "../../../api/order.api";
import { getOrderReport } from "../../../api/orderReport.api";
import FairMarketValueAmountInWordsField from "../../../components/reports/FairMarketValueAmountInWordsField";
import { useAutoFillAmountInWordsFromFmv } from "../../../hooks/useAutoFillAmountInWordsFromFmv";
import {
  computeAmountInWordsFromFmv,
  convertNumberToWordsIndian,
  hasAmountInWordsContent,
} from "../../../utils/reportAmountInWords";

// WYSIWYG Textarea Component - preserves HTML formatting
const WysiwygTextarea = ({
  value,
  onChange,
  placeholder,
  rows = 4,
  className = "",
  name,
  readOnly = false,
}) => {
  const editorRef = useRef(null);
  const isUpdatingRef = useRef(false);

  // Normalize empty WYSIWYG HTML created by contentEditable.
  // contentEditable often produces "<br>" / "<div><br></div>" when visually empty.
  const normalizeWysiwygHtml = (html) => {
    if (typeof html !== "string") return html;
    const trimmed = html.trim();
    if (!trimmed) return "";

    const stripped = trimmed
      .replace(/<br\s*\/?>/gi, "")
      .replace(/<\/?(div|p|span)[^>]*>/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, "");

    return stripped === "" ? "" : html;
  };

  // Update content when value prop changes (from external source)
  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      const currentContent = editorRef.current.innerHTML;
      const newContent = normalizeWysiwygHtml(value) || "";

      // Only update if the value is different to avoid cursor jumping
      if (currentContent !== newContent) {
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const wasFocused = document.activeElement === editorRef.current;

        isUpdatingRef.current = true;
        editorRef.current.innerHTML = newContent;

        // Restore cursor position if it was focused
        if (wasFocused && range) {
          try {
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (e) {
            // Ignore if range is invalid
          }
        }

        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }
  }, [value]);

  const handleInput = (e) => {
    if (!isUpdatingRef.current && onChange) {
      const htmlContent = e.target.innerHTML;
      const normalizedValue = normalizeWysiwygHtml(htmlContent);
      onChange({
        target: {
          name: name,
          value: normalizedValue,
        },
      });
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    // Get plain text only - strip all formatting (bold, italic, etc.)
    let plainText = e.clipboardData.getData("text/plain");

    // Remove extra spaces and normalize line breaks
    plainText = plainText
      .replace(/\r\n/g, "\n") // Normalize line breaks
      .replace(/\r/g, "\n") // Normalize line breaks
      .split("\n")
      .map((line) => line.trim()) // Remove leading/trailing spaces from each line
      .filter((line) => line.length > 0) // Remove empty lines
      .join("\n");

    // Convert to HTML with line breaks, but as plain text (no formatting)
    const htmlText = plainText.replace(/\n/g, "<br>");

    // Insert as plain text with line breaks (no bold, italic, etc.)
    document.execCommand("insertHTML", false, htmlText || "");
  };

  // Handle placeholder display
  useEffect(() => {
    if (editorRef.current) {
      const normalized = normalizeWysiwygHtml(value);
      if (!normalized) {
        editorRef.current.classList.add("empty");
      } else {
        editorRef.current.classList.remove("empty");
      }
    }
  }, [value]);

  return (
    <>
      <style>{`
        .wysiwyg-textarea {
          min-height: 80px !important;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          outline: none;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          background-color: white;
        }
        .wysiwyg-textarea:focus {
          border-color: #5864bd;
          box-shadow: 0 0 0 2px rgba(88, 100, 189, 0.1);
        }
        .wysiwyg-textarea.empty:before {
          content: attr(data-placeholder);
          color: #999;
          pointer-events: none;
        }
      `}</style>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning={true}
        onInput={handleInput}
        onPaste={handlePaste}
        className={`form-field wysiwyg-textarea ${className}`}
        data-placeholder={placeholder}
        style={
          readOnly ? { cursor: "default", backgroundColor: "#f5f5f5" } : {}
        }
      />
    </>
  );
};

const AutoGrowTextarea = ({
  value,
  onChange,
  placeholder,
  className = "form-field mb-0",
  style = {},
}) => {
  const textareaRef = useRef(null);

  const resize = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      className={className}
      value={value || ""}
      onChange={onChange}
      onInput={resize}
      placeholder={placeholder}
      style={{
        ...style,
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    />
  );
};

const MACHINERY_CONDITION_OPTIONS = [
  { value: "EXCELLENT", label: "EXCELLENT" },
  { value: "VERY GOOD", label: "VERY GOOD" },
  { value: "GOOD", label: "GOOD" },
  { value: "AVERAGE", label: "AVERAGE" },
  { value: "FAIR", label: "FAIR" },
  { value: "POOR", label: "POOR" },
  { value: "PACKED / KNOCKED DOWN", label: "PACKED / KNOCKED DOWN" },
  { value: "SCRAP CONDITION", label: "SCRAP CONDITION" },
  { value: "STACKED", label: "STACKED" },
  { value: "USABLE", label: "USABLE" },
  { value: "NOT AVAILABLE", label: "NOT AVAILABLE" },
  { value: "NOT APPLICABLE", label: "NOT APPLICABLE" },
];

const SUMMARIZED_SR_NO_COLUMN = { id: "sr_no", header: "SR NO." };

const SUMMARIZED_FIXED_START_COLUMNS = [
  { id: "source_order_number", header: "Select Order" },
  { id: "machine_description", header: "Asset Description" },
  { id: "asset_serial_no", header: "Asset Serial No." },
  { id: "yom", header: "Yom" },
  { id: "supplier_name", header: "Supplier Name" },
  { id: "invoice_no", header: "Invoice No." },
  { id: "invoice_date", header: "Invoice Date" },
];

const SUMMARIZED_FIXED_END_COLUMNS = [
  { id: "total_invoice_cost", header: "Total Invoice Cost" },
  {
    id: "estimated_current_replacement_cost",
    header: "Current Replacement Cost",
  },
  { id: "residual_life_of_asset", header: "Residual life of asset" },
  { id: "depr_rate", header: "Depr. Rate" },
  { id: "amount_post_depreciation", header: "Amount Post Depreciation" },
  { id: "appraisal_value", header: "Appraisal Value" },
  { id: "estimated_fair_value", header: "Fair Value" },
];

const SUMMARIZED_FIXED_END_COLUMN_IDS = new Set(
  SUMMARIZED_FIXED_END_COLUMNS.map((col) => col.id),
);

const SUMMARIZED_TRAILING_COLUMNS = [
  { id: "subcategory_id", header: "Subcategory Selection" },
];

/** Hidden in table UI and Columns picker for now; data key kept on rows for later. */
const SUMMARIZED_UI_HIDDEN_COLUMN_IDS = new Set(["subcategory_id"]);

/**
 * Developer-only allowlist (comma-separated fixed column ids).
 * Only these fixed column headings are editable in the Summarized table UI.
 * Users cannot change this — edit this string in code only.
 *
 * Example: "machine_description,yom,supplier_name,estimated_fair_value"
 *
 * Available ids:
 * sr_no, source_order_number, machine_description, asset_serial_no, yom,
 * supplier_name, invoice_no, invoice_date, subcategory_id,
 * total_invoice_cost, estimated_current_replacement_cost, residual_life_of_asset,
 * depr_rate, amount_post_depreciation, appraisal_value, estimated_fair_value
 */
const SUMMARIZED_EDITABLE_FIXED_HEADER_COLUMN_IDS = "total_invoice_cost";

const parseSummarizedEditableFixedHeaderColumnIds = (raw) =>
  String(raw || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const SUMMARIZED_EDITABLE_FIXED_HEADER_COLUMN_ID_SET = new Set(
  parseSummarizedEditableFixedHeaderColumnIds(
    SUMMARIZED_EDITABLE_FIXED_HEADER_COLUMN_IDS,
  ),
);

const isSummarizedFixedHeaderEditable = (colId) =>
  Boolean(colId && SUMMARIZED_EDITABLE_FIXED_HEADER_COLUMN_ID_SET.has(colId));

const getSummarizedFixedHeaderInputValue = (col, fixedColumnHeaders = {}) => {
  if (
    col?.id &&
    fixedColumnHeaders &&
    Object.prototype.hasOwnProperty.call(fixedColumnHeaders, col.id)
  ) {
    return String(fixedColumnHeaders[col.id] ?? "");
  }
  return col?.header || "";
};

/** Display / PDF: use saved override when non-empty, else default header. */
const resolveSummarizedFixedHeader = (col, fixedColumnHeaders = {}) => {
  const override = fixedColumnHeaders?.[col?.id];
  if (typeof override === "string" && override.trim() !== "") {
    return override;
  }
  return col?.header || "";
};

/** Default tbody vertical padding for summarized appendix table in generated PDF. */
const SUMMARIZED_APPENDIX_DEFAULT_ROW_PADDING_PX = 5;
const SUMMARIZED_APPENDIX_MAX_ROW_PADDING_PX = 100;

const SUMMARIZED_TOGGLEABLE_FIXED_COLUMNS = [
  SUMMARIZED_SR_NO_COLUMN,
  ...SUMMARIZED_TRAILING_COLUMNS,
  ...SUMMARIZED_FIXED_START_COLUMNS,
  ...SUMMARIZED_FIXED_END_COLUMNS,
];

const SUMMARIZED_TOGGLEABLE_FIXED_COLUMN_IDS = new Set(
  SUMMARIZED_TOGGLEABLE_FIXED_COLUMNS.map((col) => col.id),
);

const SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI =
  SUMMARIZED_TOGGLEABLE_FIXED_COLUMNS.filter(
    (col) => !SUMMARIZED_UI_HIDDEN_COLUMN_IDS.has(col.id),
  );

/** Shared across all summarized reports (same idea as dashboard filter_* localStorage keys). */
const SUMMARIZED_REPORT_VISIBLE_COLUMNS_STORAGE_KEY =
  "summarized_report_visible_column_ids";

const SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI_IDS = new Set(
  SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI.map((col) => col.id),
);

const getDefaultSummarizedVisibleColumnIds = () =>
  new Set(SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI_IDS);

const loadSummarizedVisibleColumnIdsFromStorage = () => {
  try {
    const raw = localStorage.getItem(
      SUMMARIZED_REPORT_VISIBLE_COLUMNS_STORAGE_KEY,
    );
    if (!raw) {
      return getDefaultSummarizedVisibleColumnIds();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return getDefaultSummarizedVisibleColumnIds();
    }
    const ids = parsed.filter(
      (id) =>
        typeof id === "string" &&
        SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI_IDS.has(id) &&
        !SUMMARIZED_UI_HIDDEN_COLUMN_IDS.has(id),
    );
    const visible = new Set(ids);
    visible.add("source_order_number");
    return visible;
  } catch {
    return getDefaultSummarizedVisibleColumnIds();
  }
};

const saveSummarizedVisibleColumnIdsToStorage = (visibleIds) => {
  try {
    const ids = [...visibleIds].filter((id) =>
      SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI_IDS.has(id),
    );
    localStorage.setItem(
      SUMMARIZED_REPORT_VISIBLE_COLUMNS_STORAGE_KEY,
      JSON.stringify(ids),
    );
  } catch {
    /* private mode / quota — ignore */
  }
};

const SUMMARIZED_CURRENCY_COLUMN_IDS = new Set([
  "total_invoice_cost",
  "estimated_current_replacement_cost",
  "amount_post_depreciation",
  "appraisal_value",
  "estimated_fair_value",
]);

/** Full-row merge (title row spanning all columns) — stored on each row in table JSON. */
const isSummarizedMergedTitleRow = (row) => Boolean(row?.isMergedRow);

const getSummarizedMergedRowText = (row) => String(row?.mergedRowText ?? "");

/** General fields always driven by summarized table grand totals when table has values. */
const SUMMARIZED_TABLE_DERIVED_GENERAL_FIELDS = new Set([
  "tax_invoice_cost",
  "depreciation_value",
  "appraiser_value",
  "fair_market_value",
  "amount_in_words",
]);

const summarizedRowsHaveValuationTotals = (rows = []) =>
  rows.some((row) => {
    if (isSummarizedMergedTitleRow(row)) return false;
    return (
      parseFloat(String(row?.total_invoice_cost ?? "").replace(/,/g, "")) > 0 ||
      parseFloat(
        String(row?.amount_post_depreciation ?? "").replace(/,/g, ""),
      ) > 0 ||
      parseFloat(String(row?.appraisal_value ?? "").replace(/,/g, "")) > 0 ||
      parseFloat(String(row?.estimated_fair_value ?? "").replace(/,/g, "")) > 0
    );
  });

const SUMMARIZED_DIGITS_ONLY_COLUMN_IDS = new Set([
  "residual_life_of_asset",
  "depr_rate",
]);

const SUMMARIZED_FETCH_ALLOWED_REPORT_TYPES = new Set([
  "report_ce",
  "report_cv",
  "report_machinery",
  "report_avr",
  "report_marine",
]);

const getSummarizedAssetSerialFromReport = (reportType, report = {}) => {
  switch (String(reportType || "").trim()) {
    case "report_machinery":
      return String(report.machine_serial_no ?? "").trim();
    case "report_ce":
      return String(report.crane_chassis_no ?? "").trim();
    case "report_avr":
      return String(report.machine_serial_no ?? "").trim();
    case "report_marine":
      return String(report.imo_or_regd_no ?? "").trim();
    case "report_cv":
      return String(report.registration_no ?? "").trim();
    default:
      return "";
  }
};

const getSummarizedYomFromReport = (reportType, report = {}) => {
  switch (String(reportType || "").trim()) {
    case "report_cv":
    case "report_ce":
    case "report_machinery":
      return String(report.manufacture_year ?? "").trim();
    case "report_avr":
      return String(report.year_of_mfg ?? "").trim();
    case "report_marine":
      return String(report.year_of_built ?? "").trim();
    default:
      return "";
  }
};

const buildEmptySummarizedRow = (dynamicColumns = []) => {
  const base = {
    isMergedRow: false,
    mergedRowText: "",
  };
  [
    SUMMARIZED_SR_NO_COLUMN,
    ...SUMMARIZED_FIXED_START_COLUMNS,
    ...SUMMARIZED_FIXED_END_COLUMNS,
    ...SUMMARIZED_TRAILING_COLUMNS,
  ].forEach((col) => {
    base[col.id] = "";
  });
  dynamicColumns.forEach((col) => {
    base[col.id] = "";
  });
  return base;
};

const normalizeSummarizedRows = (rows, dynamicColumns = []) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [buildEmptySummarizedRow(dynamicColumns)];
  }
  const emptyRow = buildEmptySummarizedRow(dynamicColumns);
  return rows.map((row) => ({
    ...emptyRow,
    ...(row || {}),
    isMergedRow: Boolean(row?.isMergedRow),
    mergedRowText: String(row?.mergedRowText ?? ""),
  }));
};

const getDefaultSummarizedTableData = () => ({
  dynamicColumns: [],
  rows: [buildEmptySummarizedRow([])],
  verticalMergedColumnIds: [],
  verticalMergeValues: {},
  manualEstimatedFairValueGrandTotal: "",
  /** Saved custom labels for fixed columns (keyed by column id). */
  fixedColumnHeaders: {},
});

const SUMMARIZED_VERTICAL_MERGE_BLOCKLIST = new Set([
  "amount_post_depreciation",
  "source_order_number",
]);

const canVerticallyMergeSummarizedColumn = (colId) =>
  Boolean(
    colId &&
    !SUMMARIZED_FIXED_END_COLUMN_IDS.has(colId) &&
    !SUMMARIZED_VERTICAL_MERGE_BLOCKLIST.has(colId),
  );

/** Rowspan must cover every data row plus hover-insert <tr>s between them (2n - 1). */
const getSummarizedVerticalMergeRowSpan = (dataRowCount) =>
  dataRowCount > 0 ? dataRowCount * 2 - 1 : 1;

/**
 * Contiguous segment of non-title rows containing rowIndex (for vertical column merge).
 * Title / full-merged rows break the segment so rowspan never crosses them.
 */
const findSummarizedNonTitleSegmentBounds = (rows, rowIndex) => {
  if (!Array.isArray(rows) || rowIndex < 0 || rowIndex >= rows.length)
    return null;
  if (isSummarizedMergedTitleRow(rows[rowIndex])) return null;
  let start = rowIndex;
  while (start > 0 && !isSummarizedMergedTitleRow(rows[start - 1])) start -= 1;
  let end = rowIndex;
  while (end < rows.length - 1 && !isSummarizedMergedTitleRow(rows[end + 1])) {
    end += 1;
  }
  return { start, end, count: end - start + 1 };
};

const getSummarizedColumnLabel = (
  col,
  dynamicColumns = [],
  fixedColumnHeaders = {},
) => {
  if (!col) return "";
  if (
    fixedColumnHeaders &&
    Object.prototype.hasOwnProperty.call(fixedColumnHeaders, col.id) &&
    String(fixedColumnHeaders[col.id] ?? "").trim() !== ""
  ) {
    return String(fixedColumnHeaders[col.id]);
  }
  if (col.header) return col.header;
  const dynamic = dynamicColumns.find((c) => c.id === col.id);
  return dynamic?.header || col.id || "";
};

const isVerticallyMergedColumn = (colId, verticalMergedColumnIds = []) =>
  Boolean(colId && verticalMergedColumnIds.includes(colId));

const SUMMARIZED_NAV_SKIP_COLUMN_IDS = new Set([
  "amount_post_depreciation",
  "source_order_number",
]);

const isSummarizedNavCellActive = (
  rowIndex,
  colIndex,
  columns,
  mergedColumnIds,
  rows = [],
) => {
  const col = columns[colIndex];
  if (!col) return false;
  if (isSummarizedMergedTitleRow(rows[rowIndex])) return false;
  if (SUMMARIZED_NAV_SKIP_COLUMN_IDS.has(col.id)) return false;
  if (isVerticallyMergedColumn(col.id, mergedColumnIds)) {
    const segment = findSummarizedNonTitleSegmentBounds(rows, rowIndex);
    if (!segment || rowIndex !== segment.start) return false;
  }
  return true;
};

const findSummarizedNavCell = (
  startRow,
  startCol,
  dRow,
  dCol,
  rowCount,
  colCount,
  columns,
  mergedColumnIds,
  rows = [],
) => {
  let row = startRow + dRow;
  let col = startCol + dCol;
  const maxSteps = Math.max(rowCount, colCount) * 2;
  for (let step = 0; step < maxSteps; step += 1) {
    if (row < 0 || row >= rowCount || col < 0 || col >= colCount) {
      return null;
    }
    if (isSummarizedNavCellActive(row, col, columns, mergedColumnIds, rows)) {
      return { row, col };
    }
    row += dRow;
    col += dCol;
  }
  return null;
};

/** Plain ↑/↓: navigate between rows unless user is moving inside a multi-line textarea. */
const shouldSummarizedVerticalNavFromField = (el, direction) => {
  if (!el) return false;
  if (el.tagName === "INPUT" && el.getAttribute("role") !== "combobox")
    return true;
  if (el.tagName !== "TEXTAREA") return false;

  const value = typeof el.value === "string" ? el.value : "";
  if (!value.includes("\n")) return true;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const before = value.slice(0, start);
  const lineIndex = before.split("\n").length - 1;

  if (direction === "up") {
    return lineIndex === 0;
  }
  if (direction === "down") {
    const after = value.slice(end);
    const linesAfter = after.split("\n");
    return linesAfter.length <= 1;
  }
  return false;
};

const focusSummarizedNavCell = (scrollRoot, row, col) => {
  if (!scrollRoot) return false;
  const td = scrollRoot.querySelector(
    `tbody td[data-summarized-nav-row="${row}"][data-summarized-nav-col="${col}"]`,
  );
  if (!td) return false;
  const focusable =
    td.querySelector("textarea.form-field") ||
    td.querySelector('input.form-field:not([readonly]):not([tabindex="-1"])') ||
    td.querySelector('input[role="combobox"]') ||
    td.querySelector('[class*="control"] input');
  if (!focusable) return false;
  focusable.focus();
  const textLength =
    typeof focusable.value === "string" ? focusable.value.length : 0;
  if (typeof focusable.setSelectionRange === "function") {
    focusable.setSelectionRange(textLength, textLength);
  }
  return true;
};

function SummarizedOrderFetchCell({
  rowIndex,
  value,
  onChange,
  onFetch,
  isFetching,
  inputStyle,
}) {
  const inputRef = useRef(null);

  const handleFetchClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const orderNumber = String(inputRef.current?.value ?? value ?? "").trim();
    onFetch(rowIndex, orderNumber);
  };

  return (
    <div className="summarized-order-fetch-cell">
      <input
        ref={inputRef}
        type="text"
        className="form-field mb-0"
        style={{ ...inputStyle, marginBottom: 0 }}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Order No."
      />
      <button
        type="button"
        className="btn btn-outline-primary btn-sm"
        onClick={handleFetchClick}
        disabled={isFetching}
        style={{ whiteSpace: "nowrap", flexShrink: 0 }}
      >
        {isFetching ? "Fetching..." : "Fetch"}
      </button>
    </div>
  );
}

function SummarizedRowInsertZone({ insertIndex, colSpan, onInsert }) {
  return (
    <tr className="summarized-row-insert-zone">
      <td colSpan={colSpan}>
        <div className="summarized-row-insert-zone-inner">
          <button
            type="button"
            className="summarized-row-insert-button"
            onClick={() => onInsert(insertIndex)}
            title="Add row here"
            aria-label="Add row here"
          >
            +
          </button>
          <div className="summarized-row-insert-line" aria-hidden="true" />
        </div>
      </td>
    </tr>
  );
}

/** Per-column: merge all rows into one cell (rowspan), not merging columns together. */
function SummarizedVerticalColumnMergeDropdown({
  columns,
  dynamicColumns,
  fixedColumnHeaders,
  verticalMergedColumnIds,
  onToggleColumnMerge,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const mergedSet = useMemo(
    () => new Set(verticalMergedColumnIds || []),
    [verticalMergedColumnIds],
  );

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="summarized-vertical-merge-dropdown"
      style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}
    >
      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "fit-content",
          display: "inline-flex",
          whiteSpace: "nowrap",
        }}
        aria-expanded={open}
      >
        Merge column rows
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            minWidth: "240px",
            maxHeight: "320px",
            overflowY: "auto",
            backgroundColor: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
            padding: "4px 0",
          }}
        >
          {columns.map((col) => {
            const blocked = !canVerticallyMergeSummarizedColumn(col.id);
            const merged = mergedSet.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                role="option"
                aria-selected={merged}
                disabled={blocked}
                onClick={() => onToggleColumnMerge(col.id, !merged)}
                title={
                  blocked
                    ? "This column cannot be row-merged"
                    : merged
                      ? "Unmerge rows in this column"
                      : "Merge all rows in this column"
                }
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: merged ? "#dbeafe" : "transparent",
                  color: merged ? "#1d4ed8" : "#111827",
                  fontWeight: merged ? 600 : 400,
                  padding: "8px 12px",
                  cursor: blocked ? "not-allowed" : "pointer",
                  opacity: blocked ? 0.45 : 1,
                }}
              >
                {getSummarizedColumnLabel(
                  col,
                  dynamicColumns,
                  fixedColumnHeaders,
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SummarizedFixedColumnVisibilityDropdown({
  columns,
  visibleIds,
  onVisibleIdsChange,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleColumn = (colId) => {
    const next = new Set(visibleIds);
    if (next.has(colId)) {
      next.delete(colId);
    } else {
      next.add(colId);
    }
    onVisibleIdsChange(next);
  };

  return (
    <div
      ref={containerRef}
      className="summarized-column-visibility-dropdown"
      style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}
    >
      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "fit-content",
          display: "inline-flex",
          whiteSpace: "nowrap",
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        Columns
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            minWidth: "240px",
            maxHeight: "320px",
            overflowY: "auto",
            backgroundColor: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
            padding: "4px 0",
          }}
        >
          {columns.map((col) => {
            const selected = visibleIds.has(col.id);
            return (
              <button
                key={col.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggleColumn(col.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: selected ? "#dbeafe" : "transparent",
                  color: selected ? "#1d4ed8" : "#111827",
                  fontWeight: selected ? 600 : 400,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                {col.header}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SummarizedReport() {
  // Extract order ID from route parameters
  const { id } = useParams();
  // Initialize Redux dispatch function
  const dispatch = useDispatch();
  // Select order data from Redux store
  const order = useSelector((state) => state.orders.selected);
  // Select order report data from Redux store
  const {
    currentReport,
    loading: reportLoading,
    generating,
    saving,
  } = useSelector((state) => state.orderReports);

  // Get asset makes data from Redux store
  const { list: assetMakes, loading: assetMakesLoading } = useSelector(
    (state) => state.assetMakes,
  );
  const allowedPermissions = useSelector(selectPermissions);
  const childCategories = useSelector(
    (state) => state.childcategories?.list || [],
  );
  const canEditRefNoId = hasPermission(
    allowedPermissions,
    "edit_report_ref_no_id",
  );
  const canViewSubCategoryOrders = hasPermission(
    allowedPermissions,
    "view_finalized_sub_category_orders",
  );
  const [showOtherAssetMake, setShowOtherAssetMake] = useState(false);
  const [otherAssetMake, setOtherAssetMake] = useState("");
  // State to track if initial report fetch has completed (using state instead of ref to trigger re-renders)
  const [reportFetchCompleted, setReportFetchCompleted] = useState(false);
  // State for registration field options (Not Available / Not Applicable)
  const [registrationNoOption, setRegistrationNoOption] = useState(null); // null, "NOT_AVAILABLE", "NOT_APPLICABLE"
  const [registrationDateOption, setRegistrationDateOption] = useState(null);
  const [locationOfMachineryOption, setLocationOfMachineryOption] =
    useState(null);
  // Ref to track if we've seen the report loading state (to ensure we wait for the fetch to actually happen)
  const reportLoadingStartedRef = useRef(false);
  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  // State for report type selection (Rough/Production)
  const [reportTypeSelection, setReportTypeSelection] = useState("Rough");
  const [activeReportTab, setActiveReportTab] = useState("general");
  /** Generate-only: appendix table tbody padding (px); not saved to DB. */
  const [summarizedAppendixRowPaddingPx, setSummarizedAppendixRowPaddingPx] =
    useState(String(SUMMARIZED_APPENDIX_DEFAULT_ROW_PADDING_PX));
  const [summarizedTableData, setSummarizedTableData] = useState(
    getDefaultSummarizedTableData,
  );
  const summarizedTableScrollRef = useRef(null);
  const scrollSummarizedTableToBottomRef = useRef(false);
  const [summarizedVisibleFixedColumnIds, setSummarizedVisibleFixedColumnIds] =
    useState(loadSummarizedVisibleColumnIdsFromStorage);

  const handleSummarizedVisibleColumnIdsChange = useCallback(
    (nextVisibleIds) => {
      const nextSet =
        nextVisibleIds instanceof Set
          ? nextVisibleIds
          : new Set(nextVisibleIds);
      setSummarizedVisibleFixedColumnIds(nextSet);
      saveSummarizedVisibleColumnIdsToStorage(nextSet);
    },
    [],
  );
  const [summarizedChildCategories, setSummarizedChildCategories] = useState(
    [],
  );
  const tabButtonStyle = useCallback(
    (tab) => ({
      backgroundColor: activeReportTab === tab ? "#e8edff" : "#ffffff",
      color: activeReportTab === tab ? "#1f2a60" : "#374151",
      border: "1px solid #d1d5db",
      borderRadius: "6px",
      padding: "10px 12px",
      textAlign: "left",
      fontWeight: 500,
      flex: 1,
    }),
    [activeReportTab],
  );
  const reportButtonsStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "12px",
  };
  const roughButtonStyle = {
    backgroundColor: generating ? "#9ca3af" : "#f59e0b",
    borderColor: generating ? "#9ca3af" : "#f59e0b",
    width: "200px",
  };
  const productionButtonStyle = {
    width: "calc(100% - 212px)",
  };

  // Fetch finalized orders for current child category (table summary at bottom)
  const [finalizedReportRows, setFinalizedReportRows] = useState([]);
  const [finalizedReportsLoading, setFinalizedReportsLoading] = useState(false);
  const [
    summarizedOrderFetchLoadingByRow,
    setSummarizedOrderFetchLoadingByRow,
  ] = useState({});
  const [entriesToShow, setEntriesToShow] = useState(5);
  const visibleFinalizedRows = useMemo(
    () => finalizedReportRows.slice(0, entriesToShow),
    [finalizedReportRows, entriesToShow],
  );

  // Clear report data when component mounts or order changes
  useEffect(() => {
    // Clear any existing report data first
    dispatch(clearCurrentReport());
    // Reset report fetch tracking flags when order changes
    reportLoadingStartedRef.current = false;
    setReportFetchCompleted(false); // Reset state
    isDirtyRef.current = false;
    initialFormDataRef.current = null;
    initialFlexibleFieldsRef.current = null;
  }, [dispatch, id]);

  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      dispatch(
        fetchOrderReport({
          orderId: id,
          reportType: "report_summarized",
          silent: true,
        }),
      );
      // Fetch asset makes for Machinery report
      dispatch(fetchAssetMakesForReports("report_summarized"));
    }
  }, [dispatch, id]);

  useEffect(() => {
    dispatch(fetchChildCategories())
      .unwrap()
      .then((data) => {
        setSummarizedChildCategories(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        // Keep dropdown stable even if API call fails
        void error;
        setSummarizedChildCategories([]);
      });
  }, [dispatch]);

  // Fetch finalized orders for current child category and load their Machinery report summary rows
  useEffect(() => {
    if (!canViewSubCategoryOrders) {
      setFinalizedReportRows([]);
      setFinalizedReportsLoading(false);
      return;
    }

    const childCategoryId = order?.child_category_id;
    if (!childCategoryId) {
      setFinalizedReportRows([]);
      return;
    }

    const fetchFinalizedRows = async () => {
      try {
        setFinalizedReportsLoading(true);

        const finalizedRes =
          await getFinalizedOrdersByChildCategory(childCategoryId);
        const finalizedOrders = (finalizedRes?.data?.data?.orders || []).filter(
          (orderItem) =>
            String(orderItem?.id) !== String(id) &&
            String(orderItem?.order_number || "").trim() !==
              String(order?.order_number || "").trim(),
        );

        if (!Array.isArray(finalizedOrders) || finalizedOrders.length === 0) {
          setFinalizedReportRows([]);
          return;
        }

        const rows = await Promise.all(
          finalizedOrders.map(async (orderItem) => {
            try {
              const reportRes = await getOrderReport(
                orderItem.id,
                "report_summarized",
              );
              const report = reportRes?.data?.data?.report || {};

              return {
                id: orderItem.id,
                order_number: orderItem.order_number || "-",
                asset_make:
                  report.asset_make_name ||
                  report.new_asset_make ||
                  report.asset_make ||
                  "-",
                manufacture_year: report.manufacture_year || "-",
                current_invoice_cost:
                  report.invoice_cost ||
                  report.tax_invoice_cost ||
                  report.current_invoice_cost ||
                  "-",
                depreciation: report.depreciation || "-",
                depreciation_value: report.depreciation_value || "-",
                appraiser_value: report.appraiser_value || "-",
                fair_market_value: report.fair_market_value || "-",
              };
            } catch (_) {
              // If report doesn't exist for this finalized order, still show order_number row
              return {
                id: orderItem.id,
                order_number: orderItem.order_number || "-",
                asset_make: "-",
                manufacture_year: "-",
                current_invoice_cost: "-",
                depreciation: "-",
                depreciation_value: "-",
                appraiser_value: "-",
                fair_market_value: "-",
              };
            }
          }),
        );

        setFinalizedReportRows(rows);
      } catch (_) {
        setFinalizedReportRows([]);
      } finally {
        setFinalizedReportsLoading(false);
      }
    };

    fetchFinalizedRows();
  }, [
    order?.child_category_id,
    order?.order_number,
    id,
    canViewSubCategoryOrders,
  ]);

  // Reset form data when component mounts or order ID changes
  useEffect(() => {
    // Get current date in DD-MM-YYYY format
    const getCurrentDateLocal = () => {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Get current month in 3-letter uppercase format
    const getCurrentMonthAbbreviationLocal = () => {
      const months = [
        "JAN",
        "FEB",
        "MAR",
        "APR",
        "MAY",
        "JUN",
        "JUL",
        "AUG",
        "SEP",
        "OCT",
        "NOV",
        "DEC",
      ];
      const currentMonth = new Date().getMonth();
      return months[currentMonth];
    };

    // Reset form data to initial state when order changes
    setReportFormData({
      // Report type and reference details
      report_type: "report_summarized",
      ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
      ref_no_bank: "",
      state_name: "", // Default to first option
      ref_no_code: "", // Default to first option
      ref_no_month: `SFW-${getCurrentMonthAbbreviationLocal()}-`, // Default: SFW-(CURRENT_MONTH)
      ref_no_id: "",
      report_date: getCurrentDateLocal(), // Default to today's date
      report_date_heading: "Report Date",

      valuer_name: "VALUETECH SOLUTIONS", // Default to first option
      license_no: "CAT-VII-A-6019",
      valuer_contact: "99209-88549", // Fixed read-only value

      // Category suffix - controls all heading fields
      category_suffix: "",
      // Heading fields (read-only, auto-generated from category_suffix)
      valueation_report_for_heading: "",
      general_details_heading: "",
      inspected_equipment_heading: "",
      comments_on_equipment_heading: "",
      insurance_details_heading: "",
      overall_feedback_heading: "",

      valuation_purpose: "FINANCIAL USAGE",
      initiated_by: "",
      date_of_inspection: "",
      place_of_inspection: "",

      registered_owner_name: "",
      registered_owner_address: "",
      proposed_owner_name: "",
      proposed_owner_address: "",

      // INSPECTED EQUIPMENT DETAILS
      registration_no: "",
      registration_date: "",
      location_of_machinery: "",

      owner_serial_no: "",
      manufacture_year: "",
      asset_make: "",
      model: "",

      control_system: "",
      machine_serial_no: "",
      laf_id: "",
      application_usage: "",
      control_panel_unit: "",

      invoice_no_heading: "Invoice No. & Date",
      invoice_no_date: "",
      invoice_no: "",
      invoice_date: "",
      hyp_with: "",
      machine_type: "",

      // COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION
      machine_technology: "",
      machine_condition: "",
      electrical_condition: "",
      mechanical_condition: "",

      fix_but_flex_heading_1: "",
      fix_but_flex_value_1: "",
      fix_but_flex_heading_2: "",
      fix_but_flex_value_2: "",

      fix_but_flex_heading_3: "",
      fix_but_flex_value_3: "",
      fix_but_flex_heading_4: "",
      fix_but_flex_value_4: "",

      fix_but_flex_heading_5: "",
      fix_but_flex_value_5: "",
      fix_but_flex_heading_6: "",
      fix_but_flex_value_6: "",
      fix_but_flex_heading_7: "",
      fix_but_flex_value_7: "",

      fix_but_flex_heading_8: "",
      fix_but_flex_value_8: "",

      // INSURANCE DETAILS OF THE
      rc_book_verified: "",
      tax_invoice_copy_heading: "Proforma Invoice Verified",
      tax_invoice_copy: "COPY AVAILABLE & VERIFIED",
      quotation_copy: "",
      supplier_names: "",
      tax_upto_title: "",
      tax_upto: "",
      permit_upto: "",
      permit_type: "",
      fitness_upto_title: "",
      fitness_upto: "",

      insurance_co_name: "",
      policy_no: "",
      insurance_valid_date: "",
      insured_value: "",
      insurance_verified: "",
      bill_of_entry: "",
      bill_of_landing: "",
    });

    // Reset flexible fields
    setFlexibleFields([]);

    // Clear the cleared fields tracking when form resets
    clearedFieldsRef.current.clear();
    manuallyEditedHeadingsRef.current.clear(); // Reset manually edited headings when form resets
    setChassisImpressionFile(null);
    setChassisPreviewUrl("");
  }, [id]);

  const DEFAULT_DECLARATION_CONDITION = "ROAD WORTHY CONDITION";

  const isDeclarationEmpty = useCallback((value) => {
    if (value === null || value === undefined) return true;
    return String(value).trim() === "";
  }, []);

  const getDefaultDeclaration = useCallback(
    (orderData, formSnapshot = {}) => {
      if (!orderData) return "";
      const category = orderData.category_name || "";
      const subCategory = orderData.sub_category_name
        ? ` / ${orderData.sub_category_name}`
        : "";
      const childCategory = orderData.child_category_name
        ? ` ${orderData.child_category_name}`
        : "";
      const valuationPurpose = formSnapshot.valuation_purpose || "";
      const bank = orderData.bank_name || "";
      const branch = orderData.branch_name || "";
      const state = formSnapshot.state_name || "";

      return `The aforesaid ${category}${subCategory}${childCategory} inspected by us & found in ${DEFAULT_DECLARATION_CONDITION} on the date of my inspection. This Report issued for ${valuationPurpose} of ${bank}, ${branch}, ${state} Only.`;
    },
    [DEFAULT_DECLARATION_CONDITION],
  );

  // Build disclaimer text directly with valuer name and bank/branch/city from order
  const getDisclaimer = useCallback(
    (valuerName = "VALUETECH SOLUTIONS", orderForDisclaimer = null) => {
      const name = valuerName?.trim();
      const bank = orderForDisclaimer?.bank_name?.trim();
      const branch = orderForDisclaimer?.branch_name?.trim();
      const city = (
        orderForDisclaimer?.city || orderForDisclaimer?.city_name
      )?.trim();
      return `THIS REPORT IS GENERATED BY THE ${name} AT THE SOLE REQUEST OF ${bank}, ${branch}, ${city} WHOM, THIS VALUATION REPORT IS ADDRESSED AND IS TO BE USED SOLELY BY THE SAID PARTY FOR THE STATED PURPOSE ONLY. ${name} WILL NOT BE HELD LIABLE FOR ANY LOSS OR LIABLITY SUSTAINED BY ANY PARTY RELYING ON THIS VALUATION REPORT. ${name} HAS RELIED ON THE DATA PROVIDED BY THE CLIENT & HAS NOT VERIFIED GENUINESS THEREOFF. AS THERE IS NO STANDARD PRICE LIST FOR PRE-OWNED/USED MACHINERY / CRANE, THIS VALUATION INDICATED IN THE REPORT IS OUR PROFESSIONAL OPINION ONLY ON THE MARKET VALUE OF THE PRODUCT SHOWN IN COLLAGE OR IN DETAILS BASED ON STANDARD VALUATION METHODOLOGY & PROCEDURES CALCULATING FLUCTUATIONS & LIMITATIONS OF VALUATED PRODUCTS. ACTUAL REALISATION MAY DIFFER FROM THE VALUATION INDICATED IN THE REPORT. ${name} (SIGNATORY & EMPLOYEES WILL NOT BE HELD LIABLE FOR ANY DIRECT, INDIRECT CONSEQUENTIAL OR EXEMPLARY DAMAGES FOR ANY LOSS RESULTING FROM THE USE OF THIS REPORT. ${name} IS NOT RESPONSIBLE FOR VERIFYING THE GENUINENESS OF THE PROVIDED DOCUMENTS. THE VALUATION OF ASSET IS PRIMARILY BASED ON THE CONDITION OF THE MACHINERY AT THE TIME OF INSPECTION & SURVEY. TO GIVE LOAN TO THE APPLICANT IS THE RESPONSIBILITY OF THE FINANCE COMPANY/BANK. WE ARE NOT RESPONSIBLE OR CONCERNED FOR THE SAME.`;
    },
    [],
  );

  // Function to get license number based on valuer name
  const getLicenseNumber = useCallback((valuerName) => {
    const licenseMap = {
      "V.K. ASSOCIATES": "SLA-60827",
      "VALUETECH SOLUTIONS": "CAT-VII-A-6019",
      "VISHAL D. KOTHARI": "SLA-60827",
    };
    return licenseMap[valuerName] || "";
  }, []);

  // Build Initiated By: officer, bank, branch, city
  const buildInitiatedBy = useCallback(() => {
    if (!order) return "";
    const parts = [
      order.officer_name,
      order.bank_name,
      order.branch_name,
      order.city || order.city_name,
    ]
      .filter((v) => v && String(v).trim() !== "")
      .map((v) => String(v).trim());
    return parts.join(", ");
  }, [order]);

  // Function to get reference number code based on valuer name
  const getRefNoCode = useCallback((valuerName) => {
    if (!valuerName) return "";

    const name = valuerName.toUpperCase();
    if (
      name.includes("V.K. ASSOCIATES") ||
      name.includes("VISHAL D. KOTHARI")
    ) {
      return "VKM";
    } else if (name.includes("VALUETECH SOLUTIONS")) {
      return "VTS";
    }
    return "";
  }, []);

  // Function to build category suffix from category data
  const buildCategorySuffix = useCallback(
    (categoryName, subCategoryName, childCategoryName) => {
      const parts = [];
      if (categoryName) parts.push(categoryName);
      if (subCategoryName) parts.push(subCategoryName);
      if (childCategoryName) parts.push(childCategoryName);

      if (parts.length === 0) return "";

      // Format: (category_name) / (sub_category_name) (child_category_name)
      if (parts.length === 1) return parts[0];
      if (parts.length === 2) return `${parts[0]} / ${parts[1]}`;
      return `${parts[0]} / ${parts[1]} ${parts[2]}`;
    },
    [],
  );

  // Helper: true when Valuation Purpose is Repo Purpose (case-insensitive)
  const isRepoPurpose = useCallback(
    (vp) =>
      String(vp || "")
        .toUpperCase()
        .trim() === "REPO PURPOSE",
    [],
  );

  // Helper to build valuation report heading with optional (REPOSSESSION) when is_repo is true
  const buildValuationReportHeading = useCallback(
    (categorySuffixUpper, isRepo) => {
      if (!categorySuffixUpper) return "";
      return `VALUATION REPORT${isRepo ? " (REPOSSESSION)" : ""} FOR ${categorySuffixUpper}`;
    },
    [],
  );

  // Helper function to check if valueation_report_for_heading matches auto-generated pattern (with or without REPOSSESSION)
  const isAutoGeneratedHeading = useCallback((heading, categorySuffix) => {
    if (!heading || !categorySuffix) return false;
    const categorySuffixUpper = categorySuffix.toUpperCase().trim();
    const expectedNormal = `VALUATION REPORT FOR ${categorySuffixUpper}`;
    const expectedRepo = `VALUATION REPORT (REPOSSESSION) FOR ${categorySuffixUpper}`;
    const trimmed = heading.trim();
    return trimmed === expectedNormal || trimmed === expectedRepo;
  }, []);

  // Function to get current date in DD-MM-YYYY format
  const getCurrentDate = useCallback(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  // Function to get current month in 3-letter uppercase format (JAN, FEB, MAR, etc.)
  const getCurrentMonthAbbreviation = useCallback(() => {
    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const currentMonth = new Date().getMonth();
    return months[currentMonth];
  }, []);

  // Function to parse currency value (remove commas and convert to number)
  const parseCurrency = useCallback((value) => {
    if (!value || typeof value !== "string") return 0;
    return parseFloat(value.replace(/,/g, "")) || 0;
  }, []);

  // Function to format currency input (Indian number format)
  const handleCurrencyFormatting = useCallback((value) => {
    if (!value || typeof value !== "string") return "";
    // Remove everything except digits and one dot
    let inputVal = value.replace(/[^0-9.]/g, "");

    // Allow only one decimal
    const parts = inputVal.split(".");
    let integerPart = parts[0];
    let decimalPart = parts[1] ? parts[1].slice(0, 2) : ""; // limit to 2 decimal digits

    // Format integer part in Indian number format
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
  }, []);

  const computeSummarizedGrandTotalsFromRows = useCallback(
    (rows = []) => {
      const totals = {
        total_invoice_cost: 0,
        estimated_current_replacement_cost: 0,
        amount_post_depreciation: 0,
        appraisal_value: 0,
        estimated_fair_value: 0,
      };
      rows.forEach((row) => {
        if (isSummarizedMergedTitleRow(row)) return;
        totals.total_invoice_cost += parseCurrency(
          String(row?.total_invoice_cost ?? ""),
        );
        totals.estimated_current_replacement_cost += parseCurrency(
          String(row?.estimated_current_replacement_cost ?? ""),
        );
        totals.amount_post_depreciation += parseCurrency(
          String(row?.amount_post_depreciation ?? ""),
        );
        totals.appraisal_value += parseCurrency(
          String(row?.appraisal_value ?? ""),
        );
        totals.estimated_fair_value += parseCurrency(
          String(row?.estimated_fair_value ?? ""),
        );
      });
      return totals;
    },
    [parseCurrency],
  );

  const formatGrandTotalForGeneralField = useCallback(
    (numeric) => {
      const n = Number(numeric) || 0;
      return handleCurrencyFormatting(
        (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2),
      );
    },
    [handleCurrencyFormatting],
  );

  /** Map summarized table grand totals → general valuation fields. */
  const getGeneralFieldsFromTableTotals = useCallback(
    (totals, convertToWordsIndian) => {
      const fields = {
        tax_invoice_cost: formatGrandTotalForGeneralField(
          totals.total_invoice_cost,
        ),
        depreciation_value: formatGrandTotalForGeneralField(
          totals.amount_post_depreciation,
        ),
        appraiser_value: formatGrandTotalForGeneralField(
          totals.appraisal_value,
        ),
        fair_market_value: formatGrandTotalForGeneralField(
          totals.estimated_fair_value,
        ),
      };
      const fmvNum = Number(totals.estimated_fair_value) || 0;
      if (fmvNum > 0 && convertToWordsIndian) {
        const words = convertToWordsIndian(fmvNum);
        if (words) {
          fields.amount_in_words = words;
        }
      }
      return fields;
    },
    [formatGrandTotalForGeneralField],
  );

  const isDashOnlySummarizedFairValue = useCallback((value) => {
    const normalized = String(value ?? "").trim();
    return normalized === "-" || normalized === "–" || normalized === "—";
  }, []);

  const areAllSummarizedFairValueRowsDashOnly = useCallback(
    (rows = []) => {
      const dataRows = (Array.isArray(rows) ? rows : []).filter(
        (row) => !isSummarizedMergedTitleRow(row),
      );
      return (
        dataRows.length > 0 &&
        dataRows.every((row) =>
          isDashOnlySummarizedFairValue(row?.estimated_fair_value),
        )
      );
    },
    [isDashOnlySummarizedFairValue],
  );

  const getSummarizedResolvedFairValueGrandTotal = useCallback(
    (rows = [], tableData = summarizedTableData) => {
      const computedFairValueTotal =
        computeSummarizedGrandTotalsFromRows(rows).estimated_fair_value;
      if (!areAllSummarizedFairValueRowsDashOnly(rows)) {
        return computedFairValueTotal;
      }
      const manualValue = parseCurrency(
        String(tableData?.manualEstimatedFairValueGrandTotal ?? ""),
      );
      return manualValue > 0 ? manualValue : computedFairValueTotal;
    },
    [
      summarizedTableData,
      computeSummarizedGrandTotalsFromRows,
      areAllSummarizedFairValueRowsDashOnly,
      parseCurrency,
    ],
  );

  // Form data state for Machinery report generation
  const [reportFormData, setReportFormData] = useState({
    // Report type and reference details
    report_type: "report_summarized",
    ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
    ref_no_bank: "",
    state_name: "", // Default to first option
    ref_no_code: "", // Default to first option
    ref_no_month: `SFW-${getCurrentMonthAbbreviation()}-`, // Default: SFW-(CURRENT_MONTH)
    ref_no_id: "",
    report_date: getCurrentDate(), // Default to today's date
    report_date_heading: "Report Date",

    valuer_name: "VALUETECH SOLUTIONS", // Default to first option
    license_no: "CAT-VII-A-6019",
    valuer_contact: "99209-88549", // Fixed read-only value

    // Category suffix - controls all heading fields
    category_suffix: "",
    // Heading fields (read-only, auto-generated from category_suffix)
    valueation_report_for_heading: "",
    general_details_heading: "",
    inspected_equipment_heading: "",
    comments_on_equipment_heading: "",
    insurance_details_heading: "",
    overall_feedback_heading: "",

    valuation_purpose: "FINANCIAL USAGE",
    initiated_by: "",
    date_of_inspection: "",
    place_of_inspection: "",

    registered_owner_name: "",
    registered_owner_address: "",
    proposed_owner_name: "",
    proposed_owner_address: "",

    // INSPECTED EQUIPMENT DETAILS
    registration_no: "",
    registration_date: "",
    location_of_machinery: "",

    owner_serial_no: "",
    manufacture_year: "",
    asset_make: "",
    new_asset_make: "",
    model: "",

    control_system: "",
    machine_serial_no: "",
    laf_id: "",
    application_usage: "",
    control_panel_unit: "",

    invoice_no_date: "",
    invoice_no: "",
    invoice_date: "",
    hyp_with: "",
    machine_type: "",

    // COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION
    asset_classification: "",
    machine_technology: "",
    machine_condition: "",
    electrical_condition: "",
    mechanical_condition: "",

    fix_but_flex_heading_1: "",
    fix_but_flex_value_1: "",
    fix_but_flex_heading_2: "",
    fix_but_flex_value_2: "",

    fix_but_flex_heading_3: "",
    fix_but_flex_value_3: "",
    fix_but_flex_heading_4: "",
    fix_but_flex_value_4: "",

    fix_but_flex_heading_5: "",
    fix_but_flex_value_5: "",
    fix_but_flex_heading_6: "",
    fix_but_flex_value_6: "",
    fix_but_flex_heading_7: "",
    fix_but_flex_value_7: "",

    fix_but_flex_heading_8: "",
    fix_but_flex_value_8: "",
    fix_but_flex_heading_9: "",
    fix_but_flex_value_9: "",
    fix_but_flex_heading_10: "",
    fix_but_flex_value_10: "",

    fix_but_flex_heading_11: "",
    fix_but_flex_value_11: "",
    fix_but_flex_heading_12: "",
    fix_but_flex_value_12: "",

    machine_colour: "",
    color_condition: "",
    damages_if_any: "",

    // INSURANCE DETAILS OF THE
    rc_book_verified: "",
    tax_invoice_copy_heading: "Proforma Invoice Verified",
    tax_invoice_copy: "COPY AVAILABLE & VERIFIED",
    quotation_copy: "",
    supplier_names: "",
    tax_upto_title: "",
    tax_upto: "",
    permit_upto: "",
    permit_type: "",
    fitness_upto_title: "",
    fitness_upto: "",

    insurance_co_name: "",
    policy_no: "",
    insurance_valid_date: "",
    insured_value: "",
    insurance_verified: "",
    bill_of_entry: "",
    bill_of_landing: "",

    // OVER ALL FEED BACK OF THE INSPECTED
    tax_invoice_cost: "",
    depreciation: "",
    depreciation_value: "",
    appraiser_value: "",

    fair_market_value: "",
    amount_in_words: "",
    no_of_photograph: "",
    no_of_collage: "",

    valuer_comments_remarks: "",
    valuer_special_remarks: "",
    declaration: "",
    disclaimer: "", // Will be set dynamically when order loads
    summarized_table_data: "",
    end_note: "",
  });

  // File state for chassis impression
  const [chassisImpressionFile, setChassisImpressionFile] = useState(null);
  const [chassisPreviewUrl, setChassisPreviewUrl] = useState("");

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // Track fields that were explicitly cleared by the user (date and currency fields)
  const clearedFieldsRef = useRef(new Set());
  // Ref to track manually edited heading fields (so they don't get overwritten by category_suffix changes)
  const manuallyEditedHeadingsRef = useRef(new Set());

  // Dirty tracking refs — auto-save on navigation
  const isDirtyRef = useRef(false);
  const initialFormDataRef = useRef(null);
  const initialFlexibleFieldsRef = useRef(null);
  // Ref to store the last intercepted navigation target
  const pendingNavRef = useRef(null);

  const markDirty = useCallback(() => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
  }, []);

  const handleSummarizedTableDataChange = useCallback(
    (nextData) => {
      markDirty();
      setSummarizedTableData(nextData);
      const rows = nextData?.rows || [];
      const generalFromTotals =
        rows.length > 0 && summarizedRowsHaveValuationTotals(rows)
          ? getGeneralFieldsFromTableTotals(
              {
                ...computeSummarizedGrandTotalsFromRows(rows),
                estimated_fair_value: getSummarizedResolvedFairValueGrandTotal(
                  rows,
                  nextData,
                ),
              },
              convertNumberToWordsIndian,
            )
          : {};
      setReportFormData((prev) => ({
        ...prev,
        summarized_table_data: JSON.stringify(nextData),
        ...generalFromTotals,
      }));
    },
    [
      markDirty,
      computeSummarizedGrandTotalsFromRows,
      getGeneralFieldsFromTableTotals,
      getSummarizedResolvedFairValueGrandTotal,
      convertNumberToWordsIndian,
    ],
  );

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      // Build category suffix once
      const categorySuffix = buildCategorySuffix(
        order?.category_name,
        order?.sub_category_name,
        order?.child_category_name,
      );

      setReportFormData((prev) => {
        // Check if there's already a saved report - if so, don't override heading fields
        // The report loading effect will handle setting saved values
        // Also check if report fetch is complete - only prefill if fetch completed and no report exists
        const hasSavedReport =
          reportFetchCompleted &&
          currentReport?.report &&
          currentReport.order_id === parseInt(id);

        // Also check if heading fields already have values (from saved report)
        const hasSavedHeadingValues =
          prev.valueation_report_for_heading ||
          prev.general_details_heading ||
          prev.inspected_equipment_heading ||
          prev.comments_on_equipment_heading ||
          prev.insurance_details_heading ||
          prev.overall_feedback_heading;

        // Prefill headings if:
        // 1. No saved report exists, OR
        // 2. Headings are empty/null (need defaults)
        // This ensures headings always have values when category data is available
        const shouldPrefillHeadings =
          (!hasSavedReport || !hasSavedHeadingValues) && categorySuffix;

        const categorySuffixUpper = categorySuffix
          ? categorySuffix.toUpperCase().trim()
          : "";

        return {
          ...prev,
          ref_no_bank: order?.bank_initial || "",
          state_name: prev.state_name || "MUM",
          ref_no_code: order?.valuer_name
            ? getRefNoCode(order.valuer_name)
            : "",
          initiated_by: buildInitiatedBy() || "",
          model:
            order?.sub_category_name && order?.child_category_name
              ? `${order.sub_category_name}, ${order.child_category_name}`
              : "",
          asset_classification: order?.child_category_name || "",
          hyp_with: order?.bank_name || "",
          // ALWAYS use valuer_name from order (never from report or previous state)
          valuer_name: order?.valuer_name || "",
          license_no: order?.valuer_name
            ? getLicenseNumber(order.valuer_name)
            : "",
          // Prefill category_suffix with category information
          // Only prefill if there's no saved report and no existing category_suffix value
          category_suffix:
            shouldPrefillHeadings && categorySuffix
              ? categorySuffix
              : prev.category_suffix || "",
          // Prefill headings when shouldPrefillHeadings is true (initially when no data saved)
          ...(shouldPrefillHeadings && {
            valueation_report_for_heading: buildValuationReportHeading(
              categorySuffixUpper,
              isRepoPurpose(prev.valuation_purpose),
            ),
            general_details_heading: categorySuffixUpper
              ? `GENERAL DETAILS OF THE INSPECTED ${categorySuffixUpper}`
              : "",
            inspected_equipment_heading: categorySuffixUpper
              ? `INSPECTED EQUIPMENT DETAILS OF ${categorySuffixUpper}`
              : "",
            comments_on_equipment_heading: categorySuffixUpper
              ? `COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${categorySuffixUpper}`
              : "",
            insurance_details_heading: categorySuffixUpper
              ? `INSURANCE DETAILS OF ${categorySuffixUpper}`
              : "",
            overall_feedback_heading: categorySuffixUpper
              ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
              : "",
          }),
          // Disclaimer: always set from getDisclaimer (rollback point if we need DB-stored value later)
          disclaimer: getDisclaimer(
            order?.valuer_name || "VALUETECH SOLUTIONS",
            order,
          ),
          declaration:
            hasSavedReport || !isDeclarationEmpty(prev.declaration)
              ? prev.declaration
              : getDefaultDeclaration(order, prev),
        };
      });
    }
  }, [
    order,
    getLicenseNumber,
    getRefNoCode,
    getDisclaimer,
    getDefaultDeclaration,
    isDeclarationEmpty,
    buildCategorySuffix,
    buildValuationReportHeading,
    currentReport,
    id,
    reportFetchCompleted,
  ]);

  // Track when the initial report fetch completes
  // We need to ensure: (1) fetch has started (reportLoading = true), (2) fetch has completed (reportLoading = false)
  useEffect(() => {
    // Step 1: Mark that loading has started when reportLoading becomes true
    if (reportLoading && !reportLoadingStartedRef.current) {
      reportLoadingStartedRef.current = true;
    }

    // Step 2: Mark as completed only after loading has started AND then becomes false
    // This prevents treating the initial false state as "fetch completed"
    if (
      !reportLoading &&
      reportLoadingStartedRef.current &&
      !reportFetchCompleted
    ) {
      // Add a small delay to ensure Redux state has fully updated
      const timer = setTimeout(() => {
        setReportFetchCompleted(true); // Use setState to trigger re-renders
      }, 300); // Small delay to ensure state propagation

      return () => clearTimeout(timer);
    }

    // Fallback: If loading state hasn't been detected after 1.5 seconds, assume fetch completed
    // This handles cases where Redux state changes too quickly to detect
    if (!reportLoadingStartedRef.current && !reportFetchCompleted) {
      const fallbackTimer = setTimeout(() => {
        if (!reportFetchCompleted) {
          reportLoadingStartedRef.current = true; // Mark as started
          setReportFetchCompleted(true); // Use setState to trigger re-renders
        }
      }, 1500); // Wait 1.5 seconds before using fallback

      return () => clearTimeout(fallbackTimer);
    }
  }, [reportLoading, currentReport, reportFetchCompleted]);

  // Populate form data from fetched Machinery report (if available)
  useEffect(() => {
    const report = currentReport?.report;
    if (!report) {
      // If no report and fetch is completed, ensure default values are set
      if (reportFetchCompleted && !reportLoading) {
        // Ensure ref_no_month has a default value if it's empty or null
        setReportFormData((prev) => {
          if (!prev.ref_no_month || prev.ref_no_month.trim() === "") {
            const months = [
              "JAN",
              "FEB",
              "MAR",
              "APR",
              "MAY",
              "JUN",
              "JUL",
              "AUG",
              "SEP",
              "OCT",
              "NOV",
              "DEC",
            ];
            const currentMonth = new Date().getMonth();
            return {
              ...prev,
              ref_no_month: `SFW-${months[currentMonth]}-`,
            };
          }
          return prev;
        });
      }
      return; // Gracefully do nothing when data is null
    }

    // Validate that the report belongs to the current order
    if (currentReport?.order_id && currentReport.order_id !== parseInt(id)) {
      // Report belongs to different order, ignore it
      return;
    }

    // Clear the cleared fields tracking when loading report data
    clearedFieldsRef.current.clear();
    manuallyEditedHeadingsRef.current.clear(); // Reset manually edited headings when loading new report

    setReportFormData((prev) => {
      const updated = { ...prev };

      // Define all heading fields to ensure they're all handled
      const headingFields = [
        "valueation_report_for_heading",
        "general_details_heading",
        "inspected_equipment_heading",
        "comments_on_equipment_heading",
        "insurance_details_heading",
        "overall_feedback_heading",
      ];

      // Extract category_suffix from saved headings or use default from order
      let extractedCategorySuffix = "";

      // IMPORTANT: Don't extract category_suffix from valueation_report_for_heading if it exists
      // because user may have manually edited it with extra text
      // Only extract from other headings or use default from order
      if (
        report.general_details_heading &&
        String(report.general_details_heading).trim() !== ""
      ) {
        const match = String(report.general_details_heading).match(
          /GENERAL DETAILS OF THE INSPECTED (.+)/i,
        );
        if (match && match[1]) {
          extractedCategorySuffix = match[1].trim();
        }
      }

      // If no category_suffix found in headings, use default from order
      if (!extractedCategorySuffix && order) {
        extractedCategorySuffix = buildCategorySuffix(
          order?.category_name,
          order?.sub_category_name,
          order?.child_category_name,
        );
      }

      // Set category_suffix
      updated.category_suffix = extractedCategorySuffix;

      // For valueation_report_for_heading: ALWAYS use saved value from database if exists
      // Don't try to extract or regenerate - user may have manually edited it with extra text
      if (
        report.valueation_report_for_heading !== undefined &&
        report.valueation_report_for_heading !== null &&
        String(report.valueation_report_for_heading).trim() !== ""
      ) {
        // Use saved value from database exactly as saved - don't modify it
        updated.valueation_report_for_heading =
          report.valueation_report_for_heading;
        if (
          String(report.valueation_report_for_heading).includes(
            "(REPOSSESSION)",
          )
        ) {
          updated.valuation_purpose = "REPO PURPOSE";
        }
      } else {
        // Generate from category_suffix only if no saved value exists
        const categorySuffixUpper = extractedCategorySuffix
          ? extractedCategorySuffix.toUpperCase().trim()
          : "";
        const isRepo =
          (report.valuation_purpose &&
            String(report.valuation_purpose).toUpperCase().trim() ===
              "REPO PURPOSE") ||
          report.is_repo === true;
        updated.valueation_report_for_heading = buildValuationReportHeading(
          categorySuffixUpper,
          isRepo,
        );
        if (isRepo) updated.valuation_purpose = "REPO PURPOSE";
      }

      // Generate other headings from category_suffix
      const categorySuffixUpper = extractedCategorySuffix
        ? extractedCategorySuffix.toUpperCase().trim()
        : "";
      updated.general_details_heading = categorySuffixUpper
        ? `GENERAL DETAILS OF THE INSPECTED ${categorySuffixUpper}`
        : "";
      updated.inspected_equipment_heading = categorySuffixUpper
        ? `INSPECTED EQUIPMENT DETAILS OF ${categorySuffixUpper}`
        : "";
      updated.comments_on_equipment_heading = categorySuffixUpper
        ? `COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${categorySuffixUpper}`
        : "";
      updated.insurance_details_heading = categorySuffixUpper
        ? `INSURANCE DETAILS OF ${categorySuffixUpper}`
        : "";
      updated.overall_feedback_heading = categorySuffixUpper
        ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
        : "";

      let generalFromTableTotalsOnLoad = {};
      if (report.summarized_table_data) {
        try {
          const parsed = JSON.parse(report.summarized_table_data);
          const dynamicColumns = Array.isArray(parsed?.dynamicColumns)
            ? parsed.dynamicColumns
            : [];
          const rows = normalizeSummarizedRows(parsed?.rows, dynamicColumns);
          if (rows.length > 0 && summarizedRowsHaveValuationTotals(rows)) {
            generalFromTableTotalsOnLoad = getGeneralFieldsFromTableTotals(
              {
                ...computeSummarizedGrandTotalsFromRows(rows),
                estimated_fair_value: getSummarizedResolvedFairValueGrandTotal(
                  rows,
                  parsed,
                ),
              },
              convertNumberToWordsIndian,
            );
          }
        } catch (_) {
          /* use DB values for derived fields if table JSON is invalid */
        }
      }

      const preferTableTotalsForGeneralFields =
        Object.keys(generalFromTableTotalsOnLoad).length > 0;

      // More robust field population - try to set all relevant fields
      Object.entries(report).forEach(([key, value]) => {
        // Skip system fields, valuer-related fields, heading fields, and disclaimer (always use getDisclaimer)
        if (
          key.startsWith("created_") ||
          key.startsWith("updated_") ||
          key === "id" ||
          key === "order_id" ||
          key === "flexible_fields" ||
          key === "valuer_name" ||
          key === "license_no" ||
          key === "ref_no_code" ||
          key === "ref_no_bank" ||
          key === "disclaimer" ||
          headingFields.includes(key) ||
          (preferTableTotalsForGeneralFields &&
            SUMMARIZED_TABLE_DERIVED_GENERAL_FIELDS.has(key))
        ) {
          return;
        }

        // Convert null to empty string
        const fieldValue = value !== null ? value : "";

        // Special handling for registration fields - check for "NOT AVAILABLE" or "NOT APPLICABLE"
        if (key === "registration_no") {
          const upperValue = String(fieldValue).toUpperCase().trim();
          if (upperValue === "NOT AVAILABLE") {
            setRegistrationNoOption("NOT_AVAILABLE");
            updated.registration_no = "";
          } else if (upperValue === "NOT APPLICABLE") {
            setRegistrationNoOption("NOT_APPLICABLE");
            updated.registration_no = "";
          } else {
            setRegistrationNoOption(null);
            updated.registration_no = fieldValue;
          }
          return;
        }

        if (key === "registration_date") {
          const upperValue = String(fieldValue).toUpperCase().trim();
          if (upperValue === "NOT AVAILABLE") {
            setRegistrationDateOption("NOT_AVAILABLE");
            updated.registration_date = "";
          } else if (upperValue === "NOT APPLICABLE") {
            setRegistrationDateOption("NOT_APPLICABLE");
            updated.registration_date = "";
          } else {
            setRegistrationDateOption(null);
            updated.registration_date = fieldValue;
          }
          return;
        }

        if (key === "location_of_machinery") {
          const upperValue = String(fieldValue).toUpperCase().trim();
          if (upperValue === "NOT AVAILABLE") {
            setLocationOfMachineryOption("NOT_AVAILABLE");
            updated.location_of_machinery = "";
          } else if (upperValue === "NOT APPLICABLE") {
            setLocationOfMachineryOption("NOT_APPLICABLE");
            updated.location_of_machinery = "";
          } else {
            setLocationOfMachineryOption(null);
            updated.location_of_machinery = fieldValue;
          }
          return;
        }

        // Special handling for invoice_no_date - split into separate fields
        if (key === "invoice_no_date" && fieldValue) {
          // Parse possible formats:
          // 1. "InvoiceNo Dated Date" - both invoice number and date
          // 2. "Dated Date" - only date (no invoice number)
          // 3. "InvoiceNo" - only invoice number (no date)
          if (fieldValue.startsWith("Dated ")) {
            // Only date format: "Dated Date"
            updated.invoice_no = "";
            updated.invoice_date = fieldValue.replace("Dated ", "").trim();
          } else {
            // Check if it contains " Dated " separator
            const parts = fieldValue.split(" Dated ");
            if (parts.length === 2) {
              // Both invoice number and date: "InvoiceNo Dated Date"
              updated.invoice_no = parts[0].trim();
              updated.invoice_date = parts[1].trim();
            } else {
              // Only invoice number: "InvoiceNo"
              updated.invoice_no = fieldValue.trim();
              updated.invoice_date = "";
            }
          }
          return;
        }

        // Try to set the field (both existing and dynamic fields)
        updated[key] = fieldValue;
      });

      // Disclaimer: always use getDisclaimer (never override with saved data)
      updated.disclaimer = getDisclaimer(
        order?.valuer_name || "VALUETECH SOLUTIONS",
        order,
      );

      if (isDeclarationEmpty(updated.declaration)) {
        updated.declaration = getDefaultDeclaration(order, updated);
      }

      // Ensure ref_no_month has a default value if it's empty or null
      if (!updated.ref_no_month || updated.ref_no_month.trim() === "") {
        const months = [
          "JAN",
          "FEB",
          "MAR",
          "APR",
          "MAY",
          "JUN",
          "JUL",
          "AUG",
          "SEP",
          "OCT",
          "NOV",
          "DEC",
        ];
        const currentMonth = new Date().getMonth();
        updated.ref_no_month = `SFW-${months[currentMonth]}-`;
      }

      if (preferTableTotalsForGeneralFields) {
        Object.assign(updated, generalFromTableTotalsOnLoad);
      }

      // Always use live order bank initial (matches read-only Ref NO. UI)
      updated.ref_no_bank = order?.bank_initial || "";

      return updated;
    });

    // Flexible fields - combine pairs for Add Two
    if (Array.isArray(report.flexible_fields)) {
      const apiFields = report.flexible_fields;
      const sectionToFields = apiFields.reduce((acc, f) => {
        const key = f.section_name || "__UNKNOWN__";
        if (!acc[key]) acc[key] = [];
        acc[key].push(f);
        return acc;
      }, {});

      const combined = [];
      Object.keys(sectionToFields).forEach((section) => {
        const list = sectionToFields[section]
          .slice()
          .sort((a, b) => (a.field_order || 0) - (b.field_order || 0));
        for (let i = 0; i < list.length; i++) {
          const first = list[i];
          if (first.col_span === 2) {
            const second =
              list[i + 1] && list[i + 1].col_span === 2 ? list[i + 1] : null;
            combined.push({
              id: `${section}_${first.id || first.field_order || i}_combined`,
              section_name: section,
              col_span: 2,
              field_label: first.field_label || "",
              field_value: first.field_value || "",
              field_label_2: second?.field_label || "",
              field_value_2: second?.field_value || "",
              field_order: first.field_order || i + 1,
            });
            if (second) i++;
          } else {
            combined.push({
              id: `${section}_${first.id || first.field_order || i}`,
              section_name: section,
              col_span: 1,
              field_label: first.field_label || "",
              field_value: first.field_value || "",
              field_order: first.field_order || i + 1,
            });
          }
        }
      });

      setFlexibleFields(combined);
    }
  }, [
    currentReport,
    id,
    reportFetchCompleted,
    reportLoading,
    order,
    buildCategorySuffix,
    buildValuationReportHeading,
    getDisclaimer,
    computeSummarizedGrandTotalsFromRows,
    getGeneralFieldsFromTableTotals,
  ]);

  // Prefill proposed_owner_name from order.customer_name_2 only when API/report didn't provide it.
  // This prevents overwriting user input or saved API values.
  useEffect(() => {
    if (!reportFetchCompleted || reportLoading) return;
    const customerName2 = order?.customer_name_2;
    if (!customerName2 || String(customerName2).trim() === "") return;

    const currentValue = reportFormData.proposed_owner_name;
    if (currentValue && String(currentValue).trim() !== "") return;

    setReportFormData((prev) => ({
      ...prev,
      proposed_owner_name: customerName2,
    }));
  }, [
    reportFetchCompleted,
    reportLoading,
    order?.customer_name_2,
    reportFormData.proposed_owner_name,
  ]);

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/dashboard" className="text-blue-600 hover:underline">
          Orders
        </Link>{" "}
        &gt;{" "}
        <Link
          to={`/orders/${id}/details`}
          className="text-blue-600 hover:underline"
        >
          {order && order.order_number ? order.order_number : "-"}
        </Link>{" "}
        &gt; Summarized Report
      </>,
    );
  }, [id, order, setTitle]);

  // Auto-update all heading fields when category_suffix changes (for programmatic updates)
  // BUT don't update valueation_report_for_heading if it has custom text (not matching pattern)
  useEffect(() => {
    const categorySuffix = reportFormData.category_suffix || "";
    const categorySuffixUpper = categorySuffix
      ? categorySuffix.toUpperCase().trim()
      : "";

    setReportFormData((prev) => {
      // Only update if category_suffix has changed to avoid infinite loops
      if (prev.category_suffix === categorySuffix) {
        return prev;
      }

      const updated = { ...prev };

      // Only auto-update valueation_report_for_heading if:
      // 1. It's empty (no data saved), OR
      // 2. It matches the auto-generated pattern (was auto-generated, not manually edited)
      const shouldUpdateValuationHeading =
        !prev.valueation_report_for_heading ||
        prev.valueation_report_for_heading.trim() === "" ||
        isAutoGeneratedHeading(
          prev.valueation_report_for_heading,
          prev.category_suffix || "",
        );

      if (shouldUpdateValuationHeading) {
        updated.valueation_report_for_heading = buildValuationReportHeading(
          categorySuffixUpper,
          isRepoPurpose(prev.valuation_purpose),
        );
      }
      // Always update other headings (they are not editable)
      updated.general_details_heading = categorySuffixUpper
        ? `GENERAL DETAILS OF THE INSPECTED ${categorySuffixUpper}`
        : "";
      updated.inspected_equipment_heading = categorySuffixUpper
        ? `INSPECTED EQUIPMENT DETAILS OF ${categorySuffixUpper}`
        : "";
      updated.comments_on_equipment_heading = categorySuffixUpper
        ? `COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${categorySuffixUpper}`
        : "";
      updated.insurance_details_heading = categorySuffixUpper
        ? `INSURANCE DETAILS OF ${categorySuffixUpper}`
        : "";
      updated.overall_feedback_heading = categorySuffixUpper
        ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
        : "";

      return updated;
    });
  }, [
    reportFormData.category_suffix,
    reportFormData.valuation_purpose,
    isAutoGeneratedHeading,
    buildValuationReportHeading,
    isRepoPurpose,
  ]);

  // Handle registration field option buttons
  const handleRegistrationOption = useCallback((fieldName, option) => {
    if (fieldName === "registration_no") {
      setRegistrationNoOption(option);
      setReportFormData((prev) => ({
        ...prev,
        registration_no: "", // Clear input when button is selected
      }));
    } else if (fieldName === "registration_date") {
      setRegistrationDateOption(option);
      setReportFormData((prev) => ({
        ...prev,
        registration_date: "", // Clear input when button is selected
      }));
    } else if (fieldName === "location_of_machinery") {
      setLocationOfMachineryOption(option);
      setReportFormData((prev) => ({
        ...prev,
        location_of_machinery: "", // Clear input when button is selected
      }));
    }
  }, []);

  // Capture a clean snapshot the first time initial loading finishes.
  // Any change after this point is considered "dirty".
  useEffect(() => {
    if (
      !reportLoading &&
      initialFormDataRef.current === null &&
      reportFetchCompleted
    ) {
      initialFormDataRef.current = reportFormData;
      initialFlexibleFieldsRef.current = flexibleFields;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportLoading, reportFetchCompleted]);

  useEffect(() => {
    const raw = reportFormData?.summarized_table_data;
    if (!raw) {
      setSummarizedTableData(getDefaultSummarizedTableData());
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const dynamicColumns = Array.isArray(parsed?.dynamicColumns)
        ? parsed.dynamicColumns
            .filter((c) => c?.id)
            .map((c) => ({
              ...c,
              allowSum: Boolean(c.allowSum),
            }))
        : [];
      const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      const verticalMergedColumnIds = Array.isArray(
        parsed?.verticalMergedColumnIds,
      )
        ? parsed.verticalMergedColumnIds.filter((id) =>
            canVerticallyMergeSummarizedColumn(id),
          )
        : [];
      const verticalMergeValues =
        parsed?.verticalMergeValues &&
        typeof parsed.verticalMergeValues === "object"
          ? parsed.verticalMergeValues
          : {};
      setSummarizedTableData({
        dynamicColumns,
        rows: normalizeSummarizedRows(rows, dynamicColumns),
        verticalMergedColumnIds,
        verticalMergeValues,
        manualEstimatedFairValueGrandTotal:
          parsed?.manualEstimatedFairValueGrandTotal || "",
        fixedColumnHeaders:
          parsed?.fixedColumnHeaders &&
          typeof parsed.fixedColumnHeaders === "object" &&
          !Array.isArray(parsed.fixedColumnHeaders)
            ? parsed.fixedColumnHeaders
            : {},
      });
    } catch (err) {
      setSummarizedTableData(getDefaultSummarizedTableData());
    }
  }, [reportFormData?.summarized_table_data]);

  // When table rows load or change, push grand totals into general fields (same as table footer).
  useEffect(() => {
    const rows = summarizedTableData?.rows;
    if (!Array.isArray(rows) || rows.length === 0) return;
    if (!summarizedRowsHaveValuationTotals(rows)) return;

    const generalFromTotals = getGeneralFieldsFromTableTotals(
      {
        ...computeSummarizedGrandTotalsFromRows(rows),
        estimated_fair_value: getSummarizedResolvedFairValueGrandTotal(
          rows,
          summarizedTableData,
        ),
      },
      convertNumberToWordsIndian,
    );
    setReportFormData((prev) => ({
      ...prev,
      ...generalFromTotals,
    }));
  }, [
    summarizedTableData.rows,
    summarizedTableData.manualEstimatedFairValueGrandTotal,
    computeSummarizedGrandTotalsFromRows,
    getSummarizedResolvedFairValueGrandTotal,
    getGeneralFieldsFromTableTotals,
    convertNumberToWordsIndian,
  ]);

  useAutoFillAmountInWordsFromFmv({
    fairMarketValue: reportFormData.fair_market_value,
    setReportFormData,
    parseCurrency,
    convertNumberToWordsIndian,
  });

  const summarizedSubcategoryOptions = useMemo(
    () =>
      (summarizedChildCategories || []).map((item) => ({
        value: item?.id,
        label: item?.name || "",
      })),
    [summarizedChildCategories],
  );

  const summarizedOrderedColumns = useMemo(
    () => [
      SUMMARIZED_SR_NO_COLUMN,
      ...SUMMARIZED_TRAILING_COLUMNS,
      ...SUMMARIZED_FIXED_START_COLUMNS,
      ...(summarizedTableData?.dynamicColumns || []),
      ...SUMMARIZED_FIXED_END_COLUMNS,
    ],
    [summarizedTableData?.dynamicColumns],
  );

  const isSummarizedFixedColumnVisible = useCallback(
    (colId) => {
      if (SUMMARIZED_UI_HIDDEN_COLUMN_IDS.has(colId)) return false;
      if (!SUMMARIZED_TOGGLEABLE_FIXED_COLUMN_IDS.has(colId)) return true;
      return summarizedVisibleFixedColumnIds.has(colId);
    },
    [summarizedVisibleFixedColumnIds],
  );

  const summarizedDisplayOrderedColumns = useMemo(
    () =>
      summarizedOrderedColumns.filter((col) =>
        isSummarizedFixedColumnVisible(col.id),
      ),
    [summarizedOrderedColumns, isSummarizedFixedColumnVisible],
  );

  const summarizedVerticalMergeEligibleColumns = useMemo(
    () =>
      summarizedDisplayOrderedColumns.filter((col) =>
        canVerticallyMergeSummarizedColumn(col.id),
      ),
    [summarizedDisplayOrderedColumns],
  );

  const summarizedVisibleFixedStartColumns = useMemo(
    () =>
      SUMMARIZED_FIXED_START_COLUMNS.filter((col) =>
        isSummarizedFixedColumnVisible(col.id),
      ),
    [isSummarizedFixedColumnVisible],
  );

  const summarizedVerticalMergedColumnIds = useMemo(
    () => summarizedTableData?.verticalMergedColumnIds || [],
    [summarizedTableData?.verticalMergedColumnIds],
  );

  const summarizedVerticalMergedSet = useMemo(
    () => new Set(summarizedVerticalMergedColumnIds),
    [summarizedVerticalMergedColumnIds],
  );

  const summarizedVerticalMergeValues = useMemo(
    () => summarizedTableData?.verticalMergeValues || {},
    [summarizedTableData?.verticalMergeValues],
  );

  const getSummarizedColumnWidth = useCallback((colId) => {
    if (colId === "sr_no") return 90;
    if (colId === "subcategory_id") return 200;
    if (colId === "source_order_number") return 240;
    if (colId === "machine_description") return 400;
    if (colId === "yom") return 125;
    if (colId === "invoice_no") return 175;
    if (colId === "invoice_date") return 125;
    if (colId === "total_invoice_cost") return 175;
    if (colId === "estimated_current_replacement_cost") return 175;
    if (colId === "residual_life_of_asset") return 75;
    if (colId === "depr_rate") return 75;
    if (colId === "amount_post_depreciation") return 175;
    if (colId === "appraisal_value") return 175;
    if (colId === "estimated_fair_value") return 175;
    return 200;
  }, []);

  const summarizedTableMinWidth = useMemo(
    () =>
      summarizedDisplayOrderedColumns.reduce(
        (total, col) => total + getSummarizedColumnWidth(col.id),
        0,
      ) + 160, // Action column (delete + merge checkbox)
    [summarizedDisplayOrderedColumns, getSummarizedColumnWidth],
  );

  const summarizedGrandTotalsByColumn = useMemo(
    () => computeSummarizedGrandTotalsFromRows(summarizedTableData.rows || []),
    [summarizedTableData.rows, computeSummarizedGrandTotalsFromRows],
  );

  const summarizedAllFairValueRowsDashOnly = useMemo(
    () => areAllSummarizedFairValueRowsDashOnly(summarizedTableData.rows || []),
    [summarizedTableData.rows, areAllSummarizedFairValueRowsDashOnly],
  );

  const summarizedDisplayedFairValueGrandTotal = useMemo(() => {
    if (!summarizedAllFairValueRowsDashOnly) {
      return summarizedGrandTotalsByColumn.estimated_fair_value ?? 0;
    }
    const manualValue = parseCurrency(
      String(summarizedTableData.manualEstimatedFairValueGrandTotal ?? ""),
    );
    return manualValue > 0
      ? manualValue
      : (summarizedGrandTotalsByColumn.estimated_fair_value ?? 0);
  }, [
    summarizedAllFairValueRowsDashOnly,
    summarizedTableData.manualEstimatedFairValueGrandTotal,
    summarizedGrandTotalsByColumn.estimated_fair_value,
    parseCurrency,
  ]);

  const handleSummarizedManualFairValueGrandTotalChange = useCallback(
    (value) => {
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        manualEstimatedFairValueGrandTotal: handleCurrencyFormatting(value),
      });
    },
    [
      summarizedTableData,
      handleSummarizedTableDataChange,
      handleCurrencyFormatting,
    ],
  );

  const summarizedDynamicColumnTotals = useMemo(() => {
    const dynamicCols = summarizedTableData.dynamicColumns || [];
    const rows = summarizedTableData.rows || [];
    const totals = {};
    dynamicCols.forEach((col) => {
      if (!col.allowSum) return;
      let sum = 0;
      rows.forEach((row) => {
        if (isSummarizedMergedTitleRow(row)) return;
        const raw = String(row?.[col.id] ?? "").replace(/\D/g, "");
        sum += raw ? parseInt(raw, 10) || 0 : 0;
      });
      totals[col.id] = sum;
    });
    return totals;
  }, [summarizedTableData.dynamicColumns, summarizedTableData.rows]);

  const handleSummarizedDynamicAllowSumChange = useCallback(
    (columnId, allowSum) => {
      const nextDynamicColumns = (summarizedTableData.dynamicColumns || []).map(
        (col) => (col.id === columnId ? { ...col, allowSum } : col),
      );
      const nextRows =
        allowSum === true
          ? (summarizedTableData.rows || []).map((row) => ({
              ...row,
              [columnId]: String(row[columnId] ?? "").replace(/\D/g, ""),
            }))
          : summarizedTableData.rows;
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        dynamicColumns: nextDynamicColumns,
        rows: nextRows,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const formatSummarizedGrandTotalCell = useCallback(
    (numeric) =>
      handleCurrencyFormatting(
        (Math.round((Number(numeric) + Number.EPSILON) * 100) / 100).toFixed(2),
      ),
    [handleCurrencyFormatting],
  );

  const summarizedInputStyle = useMemo(
    () => ({
      minHeight: "42px",
      width: "100%",
      padding: "8px 12px",
      marginBottom: 0,
      borderRadius: "4px",
      lineHeight: "1.4",
      border: "1px solid #d1d5db",
    }),
    [],
  );

  const summarizedSelectStyles = useMemo(
    () => ({
      container: (base) => ({ ...base, minHeight: "42px", width: "100%" }),
      control: (base) => ({
        ...base,
        minHeight: "42px",
        height: "42px",
        width: "100%",
      }),
      valueContainer: (base) => ({
        ...base,
        minHeight: "42px",
        padding: "0 8px",
      }),
      indicatorsContainer: (base) => ({ ...base, height: "42px" }),
      menu: (base) => ({ ...base, zIndex: 20 }),
    }),
    [],
  );

  const computeAmountPostDepreciation = useCallback(
    (row) => {
      const totalInvoiceCost = parseCurrency(
        String(row?.total_invoice_cost ?? ""),
      );
      const depreciationRate =
        Number(String(row?.depr_rate ?? "").replace(/\D/g, "")) || 0;
      const computedValue =
        totalInvoiceCost - (totalInvoiceCost * depreciationRate) / 100;
      const normalizedValue = Number.isFinite(computedValue)
        ? Math.max(computedValue, 0)
        : 0;
      return handleCurrencyFormatting(
        (Math.round((normalizedValue + Number.EPSILON) * 100) / 100).toFixed(2),
      );
    },
    [parseCurrency, handleCurrencyFormatting],
  );

  const handleSummarizedCellChange = useCallback(
    (rowIndex, columnId, value) => {
      if (columnId === "amount_post_depreciation") return;
      const nextRows = (summarizedTableData.rows || []).map((row, idx) =>
        idx === rowIndex
          ? (() => {
              const updatedRow = { ...row, [columnId]: value };
              if (
                columnId === "total_invoice_cost" ||
                columnId === "depr_rate"
              ) {
                updatedRow.amount_post_depreciation =
                  computeAmountPostDepreciation(updatedRow);
              }
              return updatedRow;
            })()
          : row,
      );
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        rows: nextRows,
      });
    },
    [
      summarizedTableData,
      handleSummarizedTableDataChange,
      computeAmountPostDepreciation,
    ],
  );

  const handleFetchSummarizedOrderIntoRow = useCallback(
    async (rowIndex, orderNumberFromInput) => {
      const rows = summarizedTableData.rows || [];
      const sourceOrderNumber = String(
        orderNumberFromInput ?? rows[rowIndex]?.source_order_number ?? "",
      ).trim();

      if (!sourceOrderNumber) {
        toast.error("Please enter order number first.");
        return;
      }

      setSummarizedOrderFetchLoadingByRow((prev) => ({
        ...prev,
        [rowIndex]: true,
      }));
      try {
        const matchedOrder = await dispatch(
          fetchOrderByOrderNumber(sourceOrderNumber),
        ).unwrap();

        if (!matchedOrder?.id) {
          toast.error("Order number not found.");
          return;
        }

        const reportType = String(matchedOrder.report_type || "").trim();
        if (
          !reportType ||
          !SUMMARIZED_FETCH_ALLOWED_REPORT_TYPES.has(reportType)
        ) {
          toast.error(
            reportType
              ? `Report type "${reportType}" is not allowed. Allowed: report_ce, report_cv, report_machinery, report_avr, report_marine.`
              : "This order does not have an allowed report type.",
          );
          return;
        }

        let report = {};
        try {
          const reportPayload = await dispatch(
            fetchOrderReportLookup({
              orderId: matchedOrder.id,
              reportType,
            }),
          ).unwrap();
          report = reportPayload?.data?.report || {};
        } catch (_) {
          report = {};
        }

        if (!report || Object.keys(report).length === 0) {
          toast.error(`No ${reportType} data found for this order.`);
          return;
        }

        const currencyOrBlank = (val) => {
          const text = String(val ?? "").trim();
          if (!text) return "";
          if (text === "-" || text === "–" || text === "—") return "";
          return handleCurrencyFormatting(text);
        };

        const digitsOnly = (val) => String(val ?? "").replace(/\D/g, "");
        const rawInvoiceNoDate = String(report?.invoice_no_date || "").trim();
        let parsedInvoiceNo = String(report?.invoice_no || "").trim();
        let parsedInvoiceDate = String(report?.invoice_date || "").trim();

        if (rawInvoiceNoDate) {
          const match = rawInvoiceNoDate.match(/^(.*?)\s*Dated\s*(.*)$/i);
          if (match) {
            const leftInvoiceNo = String(match[1] || "").trim();
            const rightInvoiceDate = String(match[2] || "").trim();
            if (leftInvoiceNo) parsedInvoiceNo = leftInvoiceNo;
            if (rightInvoiceDate) parsedInvoiceDate = rightInvoiceDate;
          } else if (!parsedInvoiceNo) {
            parsedInvoiceNo = rawInvoiceNoDate;
          }
        }

        const fetchedMachineDescription = String(
          matchedOrder?.child_category_name ?? "",
        ).trim();
        const fetchedSupplierName = String(
          matchedOrder?.sub_category_name ?? "",
        ).trim();
        const fetchedAssetSerialNo = getSummarizedAssetSerialFromReport(
          reportType,
          report,
        );
        const fetchedYom = getSummarizedYomFromReport(reportType, report);
        const verticalMergedColumnIds =
          summarizedTableData.verticalMergedColumnIds || [];
        const nextVerticalMergeValues = {
          ...(summarizedTableData.verticalMergeValues || {}),
        };
        if (verticalMergedColumnIds.includes("asset_serial_no")) {
          nextVerticalMergeValues.asset_serial_no = fetchedAssetSerialNo;
        }
        if (verticalMergedColumnIds.includes("yom")) {
          nextVerticalMergeValues.yom = fetchedYom;
        }

        const nextRows = rows.map((row, idx) => {
          if (idx !== rowIndex) return row;

          const keepIfPresent = (existing, fetched) => {
            const current = String(existing ?? "").trim();
            return current ? existing : fetched;
          };

          const updatedRow = {
            ...row,
            source_order_number: matchedOrder.order_number || sourceOrderNumber,
            machine_description: keepIfPresent(
              row.machine_description,
              fetchedMachineDescription,
            ),
            supplier_name: keepIfPresent(
              row.supplier_name,
              fetchedSupplierName,
            ),
            asset_serial_no: fetchedAssetSerialNo,
            yom: fetchedYom,
            invoice_no: parsedInvoiceNo,
            invoice_date: parsedInvoiceDate,
            total_invoice_cost: currencyOrBlank(
              report?.invoice_cost ||
              report?.tax_invoice_cost ||
                report?.current_invoice_cost ||
                report?.total_invoice_cost,
            ),
            depr_rate: digitsOnly(report?.depreciation),
            appraisal_value: currencyOrBlank(report?.appraiser_value),
            estimated_fair_value: currencyOrBlank(report?.fair_market_value),
          };

          updatedRow.amount_post_depreciation = currencyOrBlank(
            report?.depreciation_value,
          );
          if (!updatedRow.amount_post_depreciation) {
            updatedRow.amount_post_depreciation =
              computeAmountPostDepreciation(updatedRow);
          }

          console.warn("[Summarized Fetch] MAPPED ROW VALUES", {
            rowIndex,
            reportType,
            sourceFields: {
              tax_invoice_cost: report?.tax_invoice_cost,
              current_invoice_cost: report?.current_invoice_cost,
              total_invoice_cost: report?.total_invoice_cost,
              depreciation: report?.depreciation,
              depreciation_value: report?.depreciation_value,
              appraiser_value: report?.appraiser_value,
              fair_market_value: report?.fair_market_value,
              invoice_no: report?.invoice_no,
              invoice_date: report?.invoice_date,
              invoice_no_date: report?.invoice_no_date,
            },
            updatedRow,
          });

          return updatedRow;
        });

        handleSummarizedTableDataChange({
          ...summarizedTableData,
          rows: nextRows,
          verticalMergeValues: nextVerticalMergeValues,
        });
        toast.success(
          `Row filled from order ${matchedOrder.order_number || sourceOrderNumber} (${reportType}).`,
        );
      } catch (err) {
        const message =
          typeof err === "string"
            ? err
            : err?.message || "Could not fetch report for this order.";
        toast.error(message);
      } finally {
        setSummarizedOrderFetchLoadingByRow((prev) => ({
          ...prev,
          [rowIndex]: false,
        }));
      }
    },
    [
      dispatch,
      summarizedTableData,
      handleCurrencyFormatting,
      handleSummarizedTableDataChange,
      computeAmountPostDepreciation,
    ],
  );

  const handleSummarizedDynamicHeaderChange = useCallback(
    (columnId, value) => {
      const nextDynamicColumns = (summarizedTableData.dynamicColumns || []).map(
        (col) => (col.id === columnId ? { ...col, header: value } : col),
      );
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        dynamicColumns: nextDynamicColumns,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleSummarizedFixedHeaderChange = useCallback(
    (columnId, value) => {
      if (!isSummarizedFixedHeaderEditable(columnId)) return;
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        fixedColumnHeaders: {
          ...(summarizedTableData.fixedColumnHeaders || {}),
          [columnId]: value,
        },
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const renderSummarizedFixedHeaderContent = useCallback(
    (col) => {
      const fixedColumnHeaders = summarizedTableData.fixedColumnHeaders || {};
      if (isSummarizedFixedHeaderEditable(col.id)) {
        return (
          <AutoGrowTextarea
            className="form-field mb-0"
            style={summarizedInputStyle}
            value={getSummarizedFixedHeaderInputValue(col, fixedColumnHeaders)}
            onChange={(e) =>
              handleSummarizedFixedHeaderChange(col.id, e.target.value)
            }
            placeholder={col.header || "Enter column heading"}
          />
        );
      }
      return resolveSummarizedFixedHeader(col, fixedColumnHeaders);
    },
    [
      summarizedTableData.fixedColumnHeaders,
      summarizedInputStyle,
      handleSummarizedFixedHeaderChange,
    ],
  );

  const handleAddSummarizedRow = useCallback(() => {
    const dynamicCols = summarizedTableData.dynamicColumns || [];
    const nextRows = [
      ...(summarizedTableData.rows || []),
      buildEmptySummarizedRow(dynamicCols),
    ];
    scrollSummarizedTableToBottomRef.current = true;
    handleSummarizedTableDataChange({
      ...summarizedTableData,
      rows: nextRows,
    });
  }, [summarizedTableData, handleSummarizedTableDataChange]);

  const handleInsertSummarizedRowAt = useCallback(
    (insertIndex) => {
      const dynamicCols = summarizedTableData.dynamicColumns || [];
      const existingRows = summarizedTableData.rows || [];
      const newRow = buildEmptySummarizedRow(dynamicCols);
      const nextRows = [
        ...existingRows.slice(0, insertIndex),
        newRow,
        ...existingRows.slice(insertIndex),
      ];
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        rows: nextRows,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  useLayoutEffect(() => {
    if (!scrollSummarizedTableToBottomRef.current) return;
    scrollSummarizedTableToBottomRef.current = false;
    const scrollEl = summarizedTableScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
  }, [summarizedTableData.rows]);

  const handleAddSummarizedColumn = useCallback(() => {
    const nextIndex = (summarizedTableData.dynamicColumns || []).length + 1;
    const newColumn = {
      id: `dynamic_col_${Date.now()}_${nextIndex}`,
      header: "",
      allowSum: false,
    };
    const nextDynamicColumns = [
      ...(summarizedTableData.dynamicColumns || []),
      newColumn,
    ];
    const nextRows = (summarizedTableData.rows || []).map((row) => ({
      ...row,
      [newColumn.id]: "",
    }));
    handleSummarizedTableDataChange({
      ...summarizedTableData,
      dynamicColumns: nextDynamicColumns,
      rows: nextRows,
    });
  }, [summarizedTableData, handleSummarizedTableDataChange]);

  const handleRemoveSummarizedRow = useCallback(
    (rowIndex) => {
      const existingRows = summarizedTableData.rows || [];
      // Keep the first row as the base fixed row.
      if (rowIndex === 0 || existingRows.length <= 1) return;
      const nextRows = existingRows.filter((_, idx) => idx !== rowIndex);
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        rows: nextRows,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleToggleSummarizedRowMerge = useCallback(
    (rowIndex, shouldMerge) => {
      const nextRows = (summarizedTableData.rows || []).map((row, idx) => {
        if (idx !== rowIndex) return row;
        return {
          ...row,
          isMergedRow: Boolean(shouldMerge),
          mergedRowText: shouldMerge
            ? String(row.mergedRowText ?? "")
            : String(row.mergedRowText ?? ""),
        };
      });
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        rows: nextRows,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleSummarizedMergedRowTextChange = useCallback(
    (rowIndex, value) => {
      const nextRows = (summarizedTableData.rows || []).map((row, idx) =>
        idx === rowIndex ? { ...row, mergedRowText: value } : row,
      );
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        rows: nextRows,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleRemoveSummarizedColumn = useCallback(
    (columnId) => {
      const nextDynamicColumns = (
        summarizedTableData.dynamicColumns || []
      ).filter((col) => col.id !== columnId);
      const nextRows = (summarizedTableData.rows || []).map((row) => {
        const nextRow = { ...row };
        delete nextRow[columnId];
        return nextRow;
      });
      const nextVerticalMergedColumnIds = (
        summarizedTableData.verticalMergedColumnIds || []
      ).filter((id) => id !== columnId);
      const nextVerticalMergeValues = {
        ...(summarizedTableData.verticalMergeValues || {}),
      };
      delete nextVerticalMergeValues[columnId];
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        dynamicColumns: nextDynamicColumns,
        rows: nextRows,
        verticalMergedColumnIds: nextVerticalMergedColumnIds,
        verticalMergeValues: nextVerticalMergeValues,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleToggleVerticalColumnMerge = useCallback(
    (columnId, shouldMerge) => {
      if (!canVerticallyMergeSummarizedColumn(columnId)) return;
      const currentIds = summarizedTableData.verticalMergedColumnIds || [];
      if (shouldMerge) {
        if (currentIds.includes(columnId)) return;
        const seedValue = String(
          (summarizedTableData.rows || [])[0]?.[columnId] ?? "",
        );
        handleSummarizedTableDataChange({
          ...summarizedTableData,
          verticalMergedColumnIds: [...currentIds, columnId],
          verticalMergeValues: {
            ...(summarizedTableData.verticalMergeValues || {}),
            [columnId]: seedValue,
          },
        });
        return;
      }
      const sharedValue =
        summarizedTableData.verticalMergeValues?.[columnId] ?? "";
      const nextVerticalMergeValues = {
        ...(summarizedTableData.verticalMergeValues || {}),
      };
      delete nextVerticalMergeValues[columnId];
      const nextRows = (summarizedTableData.rows || []).map((row) => ({
        ...row,
        [columnId]: sharedValue,
      }));
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        verticalMergedColumnIds: currentIds.filter((id) => id !== columnId),
        verticalMergeValues: nextVerticalMergeValues,
        rows: nextRows,
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleVerticalMergeValueChange = useCallback(
    (columnId, value) => {
      handleSummarizedTableDataChange({
        ...summarizedTableData,
        verticalMergeValues: {
          ...(summarizedTableData.verticalMergeValues || {}),
          [columnId]: value,
        },
      });
    },
    [summarizedTableData, handleSummarizedTableDataChange],
  );

  const handleSummarizedTableKeyDown = useCallback(
    (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const isVertical = e.key === "ArrowUp" || e.key === "ArrowDown";
      const isHorizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isVertical && !isHorizontal) return;

      const useGridNav = e.shiftKey ? isVertical || isHorizontal : isVertical;
      if (!useGridNav) return;

      const scrollRoot = summarizedTableScrollRef.current;
      if (!scrollRoot?.contains(document.activeElement)) return;

      const active = document.activeElement;
      if (active?.getAttribute("aria-expanded") === "true") return;
      if (active?.closest('[class*="menu"], [role="listbox"]')) return;

      if (!e.shiftKey) {
        if (active?.getAttribute("role") === "combobox") return;
        const verticalDir = e.key === "ArrowUp" ? "up" : "down";
        if (!shouldSummarizedVerticalNavFromField(active, verticalDir)) return;
      }

      const tbody = scrollRoot.querySelector("tbody");
      const activeTd = active?.closest("td[data-summarized-nav-row]");
      if (!tbody || !activeTd || !tbody.contains(activeTd)) return;

      const startRow = parseInt(
        activeTd.getAttribute("data-summarized-nav-row"),
        10,
      );
      const startCol = parseInt(
        activeTd.getAttribute("data-summarized-nav-col"),
        10,
      );
      if (!Number.isFinite(startRow) || !Number.isFinite(startCol)) return;

      const rowCount = (summarizedTableData.rows || []).length;
      const columns = summarizedDisplayOrderedColumns;
      const colCount = columns.length;
      const mergedColumnIds = summarizedVerticalMergedColumnIds;

      let dRow = 0;
      let dCol = 0;
      if (e.key === "ArrowUp") dRow = -1;
      else if (e.key === "ArrowDown") dRow = 1;
      else if (e.key === "ArrowLeft") dCol = -1;
      else if (e.key === "ArrowRight") dCol = 1;

      const target = findSummarizedNavCell(
        startRow,
        startCol,
        dRow,
        dCol,
        rowCount,
        colCount,
        columns,
        mergedColumnIds,
        summarizedTableData.rows || [],
      );
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();
      focusSummarizedNavCell(scrollRoot, target.row, target.col);
    },
    [
      summarizedTableData.rows,
      summarizedDisplayOrderedColumns,
      summarizedVerticalMergedColumnIds,
    ],
  );

  const renderSummarizedDataCell = (col, row, rowIndex, colIndex) => {
    if (isSummarizedMergedTitleRow(row)) {
      return null;
    }

    const columnId = col.id;
    const verticallyMerged = summarizedVerticalMergedSet.has(columnId);
    const rows = summarizedTableData.rows || [];
    const segment = verticallyMerged
      ? findSummarizedNonTitleSegmentBounds(rows, rowIndex)
      : null;

    if (verticallyMerged && (!segment || rowIndex !== segment.start)) {
      return null;
    }

    const cellStyle = {
      minWidth: `${getSummarizedColumnWidth(columnId)}px`,
      width: `${getSummarizedColumnWidth(columnId)}px`,
    };
    const mergedTdProps = verticallyMerged
      ? {
          rowSpan: getSummarizedVerticalMergeRowSpan(segment?.count || 1),
          className: "summarized-merged-cell",
          style: { ...cellStyle, verticalAlign: "top", textAlign: "center" },
        }
      : { style: cellStyle };

    const cellValue = verticallyMerged
      ? (summarizedVerticalMergeValues[columnId] ?? "")
      : row[columnId] || "";

    const setCellValue = (nextValue) => {
      if (verticallyMerged) {
        handleVerticalMergeValueChange(columnId, nextValue);
      } else {
        handleSummarizedCellChange(rowIndex, columnId, nextValue);
      }
    };

    let cellContent;
    if (columnId === "source_order_number") {
      cellContent = (
        <SummarizedOrderFetchCell
          rowIndex={rowIndex}
          value={cellValue}
          onChange={setCellValue}
          onFetch={handleFetchSummarizedOrderIntoRow}
          isFetching={Boolean(summarizedOrderFetchLoadingByRow[rowIndex])}
          inputStyle={summarizedInputStyle}
        />
      );
    } else if (columnId === "subcategory_id") {
      cellContent = (
        <SingleSearchSelect
          options={summarizedSubcategoryOptions}
          value={cellValue}
          onChange={setCellValue}
          placeholder="Select Subcategory"
          styles={summarizedSelectStyles}
        />
      );
    } else if (columnId === "invoice_date") {
      cellContent = (
        <input
          type="text"
          inputMode="numeric"
          className="form-field mb-0"
          style={summarizedInputStyle}
          value={cellValue}
          maxLength={10}
          onChange={(e) => {
            let numericValue = (e.target.value || "").replace(/\D/g, "");
            if (numericValue.length > 8) {
              numericValue = numericValue.substring(0, 8);
            }
            let formattedValue = "";
            if (numericValue.length > 4) {
              formattedValue =
                numericValue.substring(0, 2) +
                "-" +
                numericValue.substring(2, 4) +
                "-" +
                numericValue.substring(4);
            } else if (numericValue.length > 2) {
              formattedValue =
                numericValue.substring(0, 2) + "-" + numericValue.substring(2);
            } else {
              formattedValue = numericValue;
            }
            setCellValue(formattedValue);
          }}
          placeholder="DD-MM-YYYY"
        />
      );
    } else if (SUMMARIZED_DIGITS_ONLY_COLUMN_IDS.has(columnId)) {
      cellContent = (
        <input
          type="text"
          inputMode="numeric"
          className="form-field mb-0"
          style={summarizedInputStyle}
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value.replace(/\D/g, ""))}
          placeholder="0"
        />
      );
    } else if (columnId === "amount_post_depreciation") {
      cellContent = (
        <input
          type="text"
          className="form-field mb-0"
          style={{
            ...summarizedInputStyle,
            backgroundColor: "#f9fafb",
            cursor: "not-allowed",
          }}
          value={row[columnId] || ""}
          readOnly
          tabIndex={-1}
          placeholder="Auto calculated"
        />
      );
    } else if (columnId === "estimated_fair_value") {
      cellContent = (
        <input
          type="text"
          className="form-field mb-0"
          style={summarizedInputStyle}
          value={cellValue}
          onChange={(e) => {
            const next = e.target.value || "";
            const trimmed = next.trim();
            if (trimmed === "-" || trimmed === "–" || trimmed === "—") {
              setCellValue("-");
              return;
            }
            setCellValue(handleCurrencyFormatting(next));
          }}
          placeholder="0.00"
        />
      );
    } else if (SUMMARIZED_CURRENCY_COLUMN_IDS.has(columnId)) {
      cellContent = (
        <input
          type="text"
          className="form-field mb-0"
          style={summarizedInputStyle}
          value={cellValue}
          onChange={(e) =>
            setCellValue(handleCurrencyFormatting(e.target.value))
          }
          placeholder="0.00"
        />
      );
    } else if (
      (summarizedTableData.dynamicColumns || []).find((c) => c.id === columnId)
        ?.allowSum
    ) {
      cellContent = (
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="form-field mb-0"
          style={summarizedInputStyle}
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value.replace(/\D/g, ""))}
          placeholder="0"
        />
      );
    } else {
      cellContent = (
        <AutoGrowTextarea
          className="form-field mb-0"
          style={summarizedInputStyle}
          value={cellValue}
          onChange={(e) => setCellValue(e.target.value)}
        />
      );
    }

    const isNavCell =
      !SUMMARIZED_NAV_SKIP_COLUMN_IDS.has(columnId) &&
      (!verticallyMerged || (segment && rowIndex === segment.start));

    return (
      <td
        key={
          verticallyMerged
            ? `${columnId}-merged-rows-${segment?.start ?? 0}-${segment?.count ?? 1}`
            : `${rowIndex}-${columnId}`
        }
        {...mergedTdProps}
        {...(isNavCell
          ? {
              "data-summarized-nav-row": rowIndex,
              "data-summarized-nav-col": colIndex,
            }
          : {})}
      >
        {cellContent}
      </td>
    );
  };

  // Handle form input changes
  const handleFormChange = useCallback(
    (e) => {
      if (initialFormDataRef.current !== null) isDirtyRef.current = true;
      const { name } = e.target;

      // Normalize WysiwygTextarea "empty" value when visually blank.
      // WYSIWYG contentEditable can produce "<br>", "<div><br></div>", "<p><br></p>", etc.
      let value = e.target.value;
      if (typeof value === "string") {
        const trimmed = value.trim();
        const stripped = trimmed
          .replace(/<br\s*\/?>/gi, "")
          .replace(/<\/?(div|p|span)[^>]*>/gi, "")
          .replace(/&nbsp;/gi, " ")
          .replace(/\s+/g, "");
        if (stripped === "") value = "";
      }

      // Track cleared fields - if field had a value and is now empty, mark it as cleared
      if (!value || (typeof value === "string" && value.trim() === "")) {
        // Field is being cleared - track it
        clearedFieldsRef.current.add(name);
      } else {
        // Field has a value - remove from cleared fields tracking
        clearedFieldsRef.current.delete(name);
      }

      // Clear button selection when user types in registration fields
      if (name === "registration_no" && value) {
        setRegistrationNoOption(null);
      } else if (name === "registration_date" && value) {
        setRegistrationDateOption(null);
      } else if (name === "location_of_machinery" && value) {
        setLocationOfMachineryOption(null);
      }

      setReportFormData((prev) => {
        let updated = {
          ...prev,
          [name]: value,
        };

        // Track if user manually edits heading fields
        if (
          name === "valueation_report_for_heading" ||
          name === "general_details_heading" ||
          name === "inspected_equipment_heading" ||
          name === "comments_on_equipment_heading" ||
          name === "insurance_details_heading" ||
          name === "overall_feedback_heading"
        ) {
          // Mark this heading field as manually edited
          manuallyEditedHeadingsRef.current.add(name);
        }

        // If category_suffix changes, update all heading fields automatically
        // BUT don't update valueation_report_for_heading if it has custom text (not matching pattern)
        if (name === "category_suffix") {
          const categorySuffixUpper = value ? value.toUpperCase().trim() : "";

          // Only auto-update valueation_report_for_heading if:
          // 1. It's empty (no data saved), OR
          // 2. It matches the auto-generated pattern (was auto-generated, not manually edited)
          const shouldUpdateValuationHeading =
            !prev.valueation_report_for_heading ||
            prev.valueation_report_for_heading.trim() === "" ||
            isAutoGeneratedHeading(
              prev.valueation_report_for_heading,
              prev.category_suffix || "",
            );

          if (shouldUpdateValuationHeading) {
            updated.valueation_report_for_heading = buildValuationReportHeading(
              categorySuffixUpper,
              isRepoPurpose(prev.valuation_purpose),
            );
          }

          // Always update other headings (they are not editable)
          updated.general_details_heading = categorySuffixUpper
            ? `GENERAL DETAILS OF THE INSPECTED ${categorySuffixUpper}`
            : "";
          updated.inspected_equipment_heading = categorySuffixUpper
            ? `INSPECTED EQUIPMENT DETAILS OF ${categorySuffixUpper}`
            : "";
          updated.comments_on_equipment_heading = categorySuffixUpper
            ? `COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${categorySuffixUpper}`
            : "";
          updated.insurance_details_heading = categorySuffixUpper
            ? `INSURANCE DETAILS OF ${categorySuffixUpper}`
            : "";
          updated.overall_feedback_heading = categorySuffixUpper
            ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
            : "";
        }

        // Handle currency formatting for currency fields
        if (
          name === "fair_market_value" ||
          name === "tax_invoice_cost" ||
          name === "insured_value" ||
          name === "depreciation_value" ||
          name === "appraiser_value"
        ) {
          updated[name] = handleCurrencyFormatting(value);
        }

        if (name === "fair_market_value") {
          updated.amount_in_words = computeAmountInWordsFromFmv(
            updated.fair_market_value,
            parseCurrency,
            convertNumberToWordsIndian,
          );
        }

        // Auto-combine invoice_no and invoice_date into invoice_no_date
        if (name === "invoice_no" || name === "invoice_date") {
          const invoiceNo = name === "invoice_no" ? value : updated.invoice_no;
          const invoiceDate =
            name === "invoice_date" ? value : updated.invoice_date;

          if (invoiceNo && invoiceDate) {
            updated.invoice_no_date = `${invoiceNo} Dated ${invoiceDate}`;
          } else if (invoiceNo) {
            updated.invoice_no_date = invoiceNo;
          } else if (invoiceDate) {
            updated.invoice_no_date = `Dated ${invoiceDate}`;
          } else {
            updated.invoice_no_date = "";
          }
        }

        return updated;
      });
    },
    [
      parseCurrency,
      handleCurrencyFormatting,
      convertNumberToWordsIndian,
      isAutoGeneratedHeading,
      buildValuationReportHeading,
    ],
  );

  // Handle SingleSearchSelect changes
  const handleSelectChange = useCallback(
    (name, value) => {
      if (initialFormDataRef.current !== null) isDirtyRef.current = true;
      // Track cleared fields - if field had a value and is now empty/null, mark it as cleared
      if (!value || (typeof value === "string" && value.trim() === "")) {
        // Field is being cleared - track it
        clearedFieldsRef.current.add(name);
      } else {
        // Field has a value - remove from cleared fields tracking
        clearedFieldsRef.current.delete(name);
      }

      setReportFormData((prev) => {
        const updated = {
          ...prev,
          [name]: value,
        };

        // Auto-update license_no when valuer_name changes
        if (name === "valuer_name") {
          updated.license_no = getLicenseNumber(value);
        }

        // When valuation_purpose changes to/from Repo Purpose, add/remove (REPOSSESSION) in heading
        if (name === "valuation_purpose") {
          const heading = prev.valueation_report_for_heading || "";
          const categorySuffix = prev.category_suffix || "";
          const isRepo = isRepoPurpose(value);
          if (isAutoGeneratedHeading(heading, categorySuffix)) {
            const categorySuffixUpper = categorySuffix
              ? categorySuffix.toUpperCase().trim()
              : "";
            updated.valueation_report_for_heading = buildValuationReportHeading(
              categorySuffixUpper,
              isRepo,
            );
          } else if (heading.trim() !== "") {
            let newHeading = heading;
            if (isRepo) {
              if (
                newHeading.includes("VALUATION REPORT FOR ") &&
                !newHeading.includes("(REPOSSESSION)")
              ) {
                newHeading = newHeading.replace(
                  "VALUATION REPORT FOR ",
                  "VALUATION REPORT (REPOSSESSION) FOR ",
                );
              }
            } else {
              newHeading = newHeading.replace(
                "VALUATION REPORT (REPOSSESSION) FOR ",
                "VALUATION REPORT FOR ",
              );
            }
            updated.valueation_report_for_heading = newHeading;
          }
        }

        return updated;
      });
    },
    [
      getLicenseNumber,
      isAutoGeneratedHeading,
      buildValuationReportHeading,
      isRepoPurpose,
    ],
  );

  // Handle file input changes

  // Handle date input formatting (DD-MM-YYYY)
  const handleDateChange = useCallback((e) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    const { name, value } = e.target;

    // Allow empty strings to clear the field
    if (!value || value.trim() === "") {
      // Track that this field was explicitly cleared
      clearedFieldsRef.current.add(name);
      setReportFormData((prev) => ({
        ...prev,
        [name]: "",
      }));
      return;
    }

    // If field gets a value, remove it from cleared fields tracking
    clearedFieldsRef.current.delete(name);

    if (typeof value !== "string") return;

    let numericValue = value.replace(/\D/g, ""); // Remove non-numeric characters
    if (numericValue.length > 8) numericValue = numericValue.substring(0, 8); // Limit to 8 digits (DDMMYYYY)

    let formattedValue = "";
    if (numericValue.length > 4) {
      formattedValue =
        numericValue.substring(0, 2) +
        "-" +
        numericValue.substring(2, 4) +
        "-" +
        numericValue.substring(4);
    } else if (numericValue.length > 2) {
      formattedValue =
        numericValue.substring(0, 2) + "-" + numericValue.substring(2);
    } else {
      formattedValue = numericValue;
    }

    setReportFormData((prev) => ({
      ...prev,
      [name]: formattedValue,
    }));
  }, []);

  // Handle currency input formatting (Indian number format)
  const handleCurrencyChange = useCallback((e) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    const { name, value } = e.target;

    // Allow empty strings to clear the field
    if (!value || value.trim() === "") {
      // Track that this field was explicitly cleared
      clearedFieldsRef.current.add(name);
      setReportFormData((prev) => ({
        ...prev,
        [name]: "",
      }));
      return;
    }

    // If field gets a value, remove it from cleared fields tracking
    clearedFieldsRef.current.delete(name);

    if (typeof value !== "string") return;

    // Remove everything except digits and one dot
    let inputVal = value.replace(/[^0-9.]/g, "");

    // Allow only one decimal
    const parts = inputVal.split(".");
    let integerPart = parts[0];
    let decimalPart = parts[1] ? parts[1].slice(0, 2) : ""; // limit to 2 decimal digits

    // Format integer part in Indian number format
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

    setReportFormData((prev) => ({
      ...prev,
      [name]: formattedValue,
    }));
  }, []);

  // Handle chassis impression file selection
  const handleFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setChassisImpressionFile(file);
  }, []);

  const resolveChassisImageUrl = useCallback((value) => {
    if (!value || typeof value !== "string") return "";

    // Attempt to parse JSON structure first
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && parsed.path) {
        return resolveAssetUrl(parsed.path);
      }
    } catch (err) {
      // Ignore JSON parse errors, fall back to raw string
    }

    // Allow absolute URLs or data URIs as is
    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("data:")
    ) {
      return value;
    }

    return resolveAssetUrl(value);
  }, []);

  // Show either the newly selected image OR the stored image path preview
  useEffect(() => {
    let objectUrl = "";

    if (chassisImpressionFile instanceof File) {
      objectUrl = URL.createObjectURL(chassisImpressionFile);
      setChassisPreviewUrl(objectUrl);
    } else {
      const existingValue = reportFormData?.chassis_no_pencil_impression;
      if (
        existingValue &&
        existingValue !== null &&
        existingValue !== undefined
      ) {
        const resolved = resolveChassisImageUrl(existingValue);
        setChassisPreviewUrl(resolved);
      } else {
        setChassisPreviewUrl("");
      }
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    chassisImpressionFile,
    reportFormData?.chassis_no_pencil_impression,
    resolveChassisImageUrl,
  ]);

  // Handle flexible field changes
  const handleFlexibleFieldChange = useCallback((fieldId, fieldType, value) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    setFlexibleFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, [fieldType]: value } : field,
      ),
    );
  }, []);

  // Add flexible fields (Add One - 2 fields, Add Two - 4 fields)
  const addFlexibleFields = useCallback(
    (sectionName, fieldsCount) => {
      if (initialFormDataRef.current !== null) isDirtyRef.current = true;
      // Calculate the next order by counting total fields in this section
      // For Add Two sets, each set contributes 2 to the count
      // For Add One sets, each set contributes 1 to the count
      let nextOrder = 1;
      flexibleFields
        .filter((f) => f.section_name === sectionName)
        .forEach((field) => {
          if (field.col_span === 2) {
            nextOrder += 2; // Add Two contributes 2 fields
          } else {
            nextOrder += 1; // Add One contributes 1 field
          }
        });

      const fieldId = `${sectionName}_${Date.now()}`;

      const newField = {
        id: fieldId,
        section_name: sectionName,
        col_span: fieldsCount === 2 ? 1 : 2, // 1 for Add One (2 fields), 2 for Add Two (4 fields)
        field_label: "",
        field_value: "",
        field_label_2: fieldsCount === 4 ? "" : undefined,
        field_value_2: fieldsCount === 4 ? "" : undefined,
        field_order: nextOrder, // This will be the order for the first field
      };

      setFlexibleFields((prev) => [...prev, newField]);
    },
    [flexibleFields],
  );

  // Remove flexible field
  const removeFlexibleField = useCallback((fieldId) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    setFlexibleFields((prev) => prev.filter((field) => field.id !== fieldId));
  }, []);

  // Validate flexible fields
  const validateFlexibleFields = useCallback(() => {
    const errors = [];

    flexibleFields.forEach((field, index) => {
      if (!field.field_label.trim() || !field.field_value.trim()) {
        errors.push(
          `Flexible field ${index + 1}: Label and Value are required`,
        );
      }

      // For Add Two fields, validate second set
      if (field.col_span === 2) {
        if (!field.field_label_2?.trim() || !field.field_value_2?.trim()) {
          errors.push(
            `Flexible field ${index + 1}: Second Label and Value are required`,
          );
        }
      }
    });

    return errors;
  }, [flexibleFields]);

  const handleSummarizedAppendixRowPaddingChange = useCallback((event) => {
    const raw = event.target.value;
    if (raw === "") {
      setSummarizedAppendixRowPaddingPx("");
      return;
    }
    if (/^\d+$/.test(raw)) {
      setSummarizedAppendixRowPaddingPx(raw);
    }
  }, []);

  const handleSummarizedAppendixRowPaddingBlur = useCallback(() => {
    setSummarizedAppendixRowPaddingPx((prev) => {
      const parsed = parseInt(prev, 10);
      if (Number.isNaN(parsed) || prev === "") {
        return String(SUMMARIZED_APPENDIX_DEFAULT_ROW_PADDING_PX);
      }
      return String(
        Math.min(SUMMARIZED_APPENDIX_MAX_ROW_PADDING_PX, Math.max(0, parsed)),
      );
    });
  }, []);

  const resolveSummarizedAppendixRowPaddingForGenerate = useCallback(() => {
    const parsed = parseInt(summarizedAppendixRowPaddingPx, 10);
    if (Number.isNaN(parsed) || summarizedAppendixRowPaddingPx === "") {
      return SUMMARIZED_APPENDIX_DEFAULT_ROW_PADDING_PX;
    }
    return Math.min(
      SUMMARIZED_APPENDIX_MAX_ROW_PADDING_PX,
      Math.max(0, parsed),
    );
  }, [summarizedAppendixRowPaddingPx]);

  // Handle form submission for report generation
  const handleReportSubmit = useCallback(
    (e) => {
      e.preventDefault();

      // Pre-open a tab synchronously to avoid popup blockers
      const preOpenedTab = window.open("about:blank", "_blank");
      if (preOpenedTab && !preOpenedTab.closed) {
        try {
          const doc = preOpenedTab.document;
          doc.open();
          doc.write(
            `<!doctype html><html><head><meta charset="utf-8"><title>Preparing report…</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}.box{text-align:center}.spinner{width:44px;height:44px;border: 4px solid rgba(88, 100, 189, 0.2);border-top-color: #5864bd;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}small{opacity:.75}</style></head><body><div class="box"><div class="spinner"></div><div>Preparing your Report...</div><small>This tab will update automatically. So don't close the tab.</small></div></body></html>`,
          );
          doc.close();
        } catch (err) {
          // If writing fails, ignore and proceed
        }
      }

      // Validate flexible fields
      const validationErrors = validateFlexibleFields();
      if (validationErrors.length > 0) {
        validationErrors.forEach((error) => toast.error(error));
        // Close the preOpenedTab if validation fails
        if (preOpenedTab && !preOpenedTab.closed) {
          preOpenedTab.close();
        }
        return;
      }

      const fmvRaw = reportFormData.fair_market_value;
      const computedAmountInWords = computeAmountInWordsFromFmv(
        fmvRaw,
        parseCurrency,
        convertNumberToWordsIndian,
      );
      if (
        fmvRaw &&
        !hasAmountInWordsContent(reportFormData.amount_in_words) &&
        !computedAmountInWords
      ) {
        toast.error(
          "Amount in words missing. Please enter a valid Fair Market Value.",
        );
        if (preOpenedTab && !preOpenedTab.closed) {
          preOpenedTab.close();
        }
        return;
      }

      // Create FormData for multipart/form-data submission
      const formData = new FormData();

      // Add report type selection (Rough/Production)
      formData.append("report_type_selection", reportTypeSelection);

      // Ensure invoice_no_date is properly combined before sending
      const invoiceNo = reportFormData.invoice_no || "";
      const invoiceDate = reportFormData.invoice_date || "";
      let combinedInvoiceData = "";

      if (invoiceNo && invoiceDate) {
        combinedInvoiceData = `${invoiceNo} Dated ${invoiceDate}`;
      } else if (invoiceNo) {
        combinedInvoiceData = invoiceNo;
      } else if (invoiceDate) {
        combinedInvoiceData = `Dated ${invoiceDate}`;
      }

      // Add all form fields to FormData - simple logic: if value exists send it, if null/empty send null
      Object.keys(reportFormData).forEach((key) => {
        let value = reportFormData[key];

        // Skip disclaimer - handled separately below
        if (key === "disclaimer") {
          return;
        }

        // Skip invoice_no_date - will be added separately with fresh computed value
        if (key === "invoice_no_date") {
          return;
        }

        // When a new chassis file is selected, only send the File (not the old path/URL)
        if (key === "chassis_no_pencil_impression" && chassisImpressionFile) {
          return;
        }

        // Default for tax_invoice_copy_heading when empty
        if (
          key === "tax_invoice_copy_heading" &&
          (!value || String(value).trim() === "")
        ) {
          value = "Proforma Invoice Verified";
        }

        // Handle registration fields with options
        if (key === "registration_no") {
          if (registrationNoOption === "NOT_AVAILABLE") {
            value = "NOT AVAILABLE";
          } else if (registrationNoOption === "NOT_APPLICABLE") {
            value = "NOT APPLICABLE";
          }
        }

        if (key === "registration_date") {
          if (registrationDateOption === "NOT_AVAILABLE") {
            value = "NOT AVAILABLE";
          } else if (registrationDateOption === "NOT_APPLICABLE") {
            value = "NOT APPLICABLE";
          }
        }

        if (key === "location_of_machinery") {
          if (locationOfMachineryOption === "NOT_AVAILABLE") {
            value = "NOT AVAILABLE";
          } else if (locationOfMachineryOption === "NOT_APPLICABLE") {
            value = "NOT APPLICABLE";
          }
        }

        // Final guard: normalize any WYSIWYG empties already present in state.
        if (typeof value === "string") {
          const trimmed = value.trim();
          const stripped = trimmed
            .replace(/<br\s*\/?>/gi, "")
            .replace(/<\/?(div|p|span)[^>]*>/gi, "")
            .replace(/&nbsp;/gi, " ")
            .replace(/\s+/g, "");
          if (stripped === "") value = "";
        }

        // Simple logic: if value exists, send it; if null/empty, send null
        // Note: Textarea values (with line breaks, spaces, formatting) are preserved as-is
        if (value !== null && value !== undefined && value !== "") {
          formData.append(key, String(value)); // Preserve all formatting including line breaks
        } else {
          formData.append(key, ""); // Send empty string for null/empty values
        }
      });

      // Always include report_date_heading in payload (even if user did not change it - use preselected default)
      formData.set(
        "report_date_heading",
        reportFormData.report_date_heading || "Report Date",
      );

      // Always use live order bank initial so PDF matches frontend Ref NO. display
      formData.set("ref_no_bank", order?.bank_initial || "");

      // Add invoice_no_date (combined from invoice_no and invoice_date) - always include with fresh computed value
      formData.append("invoice_no_date", combinedInvoiceData || "");

      // ALWAYS include disclaimer in payload
      const valuerName = reportFormData.valuer_name || "VALUETECH SOLUTIONS";
      const defaultDisclaimer = getDisclaimer(valuerName, order);
      formData.append(
        "disclaimer",
        reportFormData.disclaimer || defaultDisclaimer,
      );

      // Add chassis impression image if selected
      if (chassisImpressionFile) {
        formData.append("chassis_no_pencil_impression", chassisImpressionFile);
      }

      // Generate-only: appendix table row padding (sent for PDF; not saved to DB)
      formData.append(
        "summarized_appendix_cell_padding_px",
        String(resolveSummarizedAppendixRowPaddingForGenerate()),
      );

      // Add flexible fields to FormData with proper sequential ordering
      let formDataIndex = 0;
      flexibleFields.forEach((field) => {
        // Add first field (or only field for Add One)
        formData.append(
          `flexible_fields[${formDataIndex}][section_name]`,
          field.section_name,
        );
        formData.append(
          `flexible_fields[${formDataIndex}][col_span]`,
          field.col_span,
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_label]`,
          field.field_label,
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_value]`,
          String(field.field_value || ""), // Preserve all formatting including line breaks
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_order]`,
          field.field_order,
        );
        formDataIndex++;

        // Add second field for "Add Two" functionality
        if (field.col_span === 2 && field.field_label_2 !== undefined) {
          formData.append(
            `flexible_fields[${formDataIndex}][section_name]`,
            field.section_name,
          );
          formData.append(
            `flexible_fields[${formDataIndex}][col_span]`,
            field.col_span,
          );
          formData.append(
            `flexible_fields[${formDataIndex}][field_label]`,
            field.field_label_2,
          );
          formData.append(
            `flexible_fields[${formDataIndex}][field_value]`,
            String(field.field_value_2 || ""), // Preserve all formatting including line breaks
          );
          formData.append(
            `flexible_fields[${formDataIndex}][field_order]`,
            field.field_order + 1, // Sequential order for second field
          );
          formDataIndex++;
        }
      });

      // Console log flexible fields ordering for debugging
      const sectionGroups = {};
      flexibleFields.forEach((field) => {
        if (!sectionGroups[field.section_name]) {
          sectionGroups[field.section_name] = [];
        }

        // Add first field
        sectionGroups[field.section_name].push({
          label: field.field_label,
          value: field.field_value,
          order: field.field_order,
          type: field.col_span === 1 ? "Add One" : "Add Two (1st)",
        });

        // Add second field if exists
        if (field.col_span === 2 && field.field_label_2) {
          sectionGroups[field.section_name].push({
            label: field.field_label_2,
            value: field.field_value_2,
            order: field.field_order + 1,
            type: "Add Two (2nd)",
          });
        }
      });

      /* Object.keys(sectionGroups).forEach(section => {
      console.log(`\n${section}:`);
      sectionGroups[section]
        .sort((a, b) => a.order - b.order)
        .forEach(field => {
          console.log(`  Order ${field.order}: [${field.type}] ${field.label} = ${field.value}`);
        });
    });
    console.log("=== END FLEXIBLE FIELDS ORDERING ===\n"); */
      // Dispatch report generation action
      dispatch(
        generateOrderReport({
          orderId: id,
          data: formData,
        }),
      ).then((result) => {
        if (result.meta.requestStatus === "fulfilled") {
          // Open PDF in the pre-opened tab
          const downloadUrl = result.payload.data.download_url;
          const fullUrl = resolveAssetUrl(downloadUrl);
          if (preOpenedTab && !preOpenedTab.closed) {
            preOpenedTab.location.href = fullUrl;
          } else {
            window.open(fullUrl, "_blank");
          }
        } else {
          // Close the preOpenedTab if generation failed
          if (preOpenedTab && !preOpenedTab.closed) {
            preOpenedTab.close();
          }
        }
      });
    },
    [
      reportFormData,
      flexibleFields,
      validateFlexibleFields,
      dispatch,
      id,
      order,
      getRefNoCode,
      parseCurrency,
      convertNumberToWordsIndian,
      registrationNoOption,
      registrationDateOption,
      locationOfMachineryOption,
      chassisImpressionFile,
      reportTypeSelection,
      canEditRefNoId,
      resolveSummarizedAppendixRowPaddingForGenerate,
    ],
  );

  // Builds the save payload — used by both handleSaveReport and the navigation blocker.
  const buildSavePayload = useCallback(() => {
    const reportData = {};

    const valuerName = reportFormData.valuer_name || "VALUETECH SOLUTIONS";
    reportData.disclaimer =
      reportFormData.disclaimer || getDisclaimer(valuerName, order);

    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      if (key === "disclaimer") return;
      if (key === "invoice_no_date") return;

      // Default for tax_invoice_copy_heading when empty
      if (
        key === "tax_invoice_copy_heading" &&
        (!value || String(value).trim() === "")
      ) {
        value = "Proforma Invoice Verified";
      }

      if (key === "registration_no") {
        if (registrationNoOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registrationNoOption === "NOT_APPLICABLE")
          value = "NOT APPLICABLE";
      }
      if (key === "registration_date") {
        if (registrationDateOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registrationDateOption === "NOT_APPLICABLE")
          value = "NOT APPLICABLE";
      }
      if (key === "location_of_machinery") {
        if (locationOfMachineryOption === "NOT_AVAILABLE")
          value = "NOT AVAILABLE";
        else if (locationOfMachineryOption === "NOT_APPLICABLE")
          value = "NOT APPLICABLE";
      }

      // Final guard: normalize any WYSIWYG empties already present in state.
      if (typeof value === "string") {
        const trimmed = value.trim();
        const stripped = trimmed
          .replace(/<br\s*\/?>/gi, "")
          .replace(/<\/?(div|p|span)[^>]*>/gi, "")
          .replace(/&nbsp;/gi, " ")
          .replace(/\s+/g, "");
        if (stripped === "") value = "";
      }

      reportData[key] =
        value !== null && value !== undefined && value !== ""
          ? String(value)
          : null;
    });

    reportData.report_date_heading =
      reportFormData.report_date_heading || "Report Date";

    // Always use live order bank initial so saved data matches frontend Ref NO. display
    reportData.ref_no_bank = order?.bank_initial || null;

    const invoiceNo = reportFormData.invoice_no || "";
    const invoiceDate = reportFormData.invoice_date || "";
    let combinedInvoiceData = "";
    if (invoiceNo && invoiceDate)
      combinedInvoiceData = `${invoiceNo} Dated ${invoiceDate}`;
    else if (invoiceNo) combinedInvoiceData = invoiceNo;
    else if (invoiceDate) combinedInvoiceData = `Dated ${invoiceDate}`;
    reportData.invoice_no_date = combinedInvoiceData || null;

    let formDataIndex = 0;
    flexibleFields.forEach((field) => {
      if (field.field_value && field.field_value.trim() !== "") {
        reportData[`flexible_fields[${formDataIndex}][section_name]`] =
          field.section_name;
        reportData[`flexible_fields[${formDataIndex}][col_span]`] =
          field.col_span;
        reportData[`flexible_fields[${formDataIndex}][field_label]`] =
          field.field_label;
        reportData[`flexible_fields[${formDataIndex}][field_value]`] = String(
          field.field_value || "",
        );
        reportData[`flexible_fields[${formDataIndex}][field_order]`] =
          field.field_order;
        formDataIndex++;

        if (
          field.col_span === 2 &&
          field.field_label_2 !== undefined &&
          field.field_value_2 &&
          field.field_value_2.trim() !== ""
        ) {
          reportData[`flexible_fields[${formDataIndex}][section_name]`] =
            field.section_name;
          reportData[`flexible_fields[${formDataIndex}][col_span]`] =
            field.col_span;
          reportData[`flexible_fields[${formDataIndex}][field_label]`] =
            field.field_label_2;
          reportData[`flexible_fields[${formDataIndex}][field_value]`] = String(
            field.field_value_2 || "",
          );
          reportData[`flexible_fields[${formDataIndex}][field_order]`] =
            field.field_order + 1;
          formDataIndex++;
        }
      }
    });

    // Attach selected chassis impression file (if any)
    if (chassisImpressionFile) {
      reportData["chassis_no_pencil_impression"] = chassisImpressionFile;
    }

    return reportData;
  }, [
    reportFormData,
    flexibleFields,
    chassisImpressionFile,
    registrationNoOption,
    registrationDateOption,
    locationOfMachineryOption,
    parseCurrency,
    convertNumberToWordsIndian,
    getDisclaimer,
    order,
  ]);

  // Handle save report data
  const handleSaveReport = useCallback(() => {
    // Validate flexible fields
    const validationErrors = validateFlexibleFields();
    if (validationErrors.length > 0) {
      toast.error("Please fix validation errors before saving");
      return;
    }

    const fmvRaw = reportFormData.fair_market_value;
    const computedAmountInWords = computeAmountInWordsFromFmv(
      fmvRaw,
      parseCurrency,
      convertNumberToWordsIndian,
    );
    if (
      fmvRaw &&
      !hasAmountInWordsContent(reportFormData.amount_in_words) &&
      !computedAmountInWords
    ) {
      toast.error(
        "Amount in words missing. Please enter a valid Fair Market Value.",
      );
      return;
    }

    // Build payload using shared function
    const reportData = buildSavePayload();

    // Only proceed if there's actual data to save
    if (Object.keys(reportData).length === 0) {
      toast.warning(
        "No data to save. Please fill in some fields before saving.",
      );
      return;
    }

    /* console.log("📤 Sending to backend - reportData:", reportData);
    console.log("📤 amount_in_words in payload:", reportData.amount_in_words); */

    // Don't clear clearedFieldsRef after save - user might generate report next
    // It will be cleared when component unmounts or order changes (handled in useEffect)

    // If chassis impression is selected, save as multipart/form-data
    const savePayload = chassisImpressionFile
      ? (() => {
          const fd = new FormData();
          Object.entries(reportData).forEach(([key, value]) => {
            if (value instanceof File || value instanceof Blob) {
              fd.append(key, value);
            } else if (value === null) {
              fd.append(key, "");
            } else if (value !== undefined) {
              fd.append(key, value);
            }
          });
          return fd;
        })()
      : reportData;

    // Dispatch save action with JSON data
    dispatch(
      saveOrderReport({
        orderId: id,
        reportData: savePayload,
      }),
    ).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        isDirtyRef.current = false;
        initialFormDataRef.current = reportFormData;
        initialFlexibleFieldsRef.current = flexibleFields;
      }
    });
  }, [
    reportFormData,
    flexibleFields,
    validateFlexibleFields,
    chassisImpressionFile,
    dispatch,
    id,
    buildSavePayload,
    parseCurrency,
    convertNumberToWordsIndian,
  ]);

  // Keyboard shortcut: Ctrl+S (Windows/Linux) / Cmd+S (Mac)
  useEffect(() => {
    const onSaveShortcut = (event) => {
      const isSaveKey =
        (event.ctrlKey || event.metaKey) &&
        String(event.key).toLowerCase() === "s";
      if (!isSaveKey) return;

      event.preventDefault();
      handleSaveReport();
    };

    window.addEventListener("keydown", onSaveShortcut);
    return () => window.removeEventListener("keydown", onSaveShortcut);
  }, [handleSaveReport]);

  // In-app navigation blocker — works with BrowserRouter (no data router needed).
  // Intercepts pushState (Link clicks) and popstate (browser back/forward).
  // Saves silently then navigates. 100% reliable for in-app navigation.
  // Navigation Blocker - Shows confirmation dialog for unsaved changes
  useEffect(() => {
    if (!id) return;

    // --- Intercept pushState (Link clicks, programmatic navigation) ---
    // Keep auto-save behavior for React Router navigation (sidebar links, etc.)
    const originalPushState = window.history.pushState.bind(window.history);

    // Push initial state to enable blocking (BEFORE intercepting pushState)
    originalPushState(null, "", window.location.href);

    window.history.pushState = function (state, title, url) {
      if (!isDirtyRef.current) {
        return originalPushState(state, title, url);
      }

      // Block the navigation, save, then replay it (existing auto-save behavior)
      pendingNavRef.current = { type: "push", state, title, url };

      const saveAndNavigate = async () => {
        try {
          const reportData = buildSavePayload();
          const payload = chassisImpressionFile
            ? (() => {
                const fd = new FormData();
                Object.entries(reportData).forEach(([key, value]) => {
                  if (value instanceof File || value instanceof Blob) {
                    fd.append(key, value);
                  } else if (value === null) {
                    fd.append(key, "");
                  } else if (value !== undefined) {
                    fd.append(key, value);
                  }
                });
                return fd;
              })()
            : reportData;
          const result = await dispatch(
            saveOrderReport({ orderId: id, reportData: payload }),
          );
          if (result.meta.requestStatus === "fulfilled") {
            isDirtyRef.current = false;
            initialFormDataRef.current = reportFormData;
            initialFlexibleFieldsRef.current = flexibleFields;
          }
        } catch (_) {
          // toast already shown by thunk
        } finally {
          if (pendingNavRef.current?.type === "push") {
            originalPushState(
              pendingNavRef.current.state,
              pendingNavRef.current.title,
              pendingNavRef.current.url,
            );
            // Dispatch a popstate so React Router picks up the URL change
            window.dispatchEvent(
              new PopStateEvent("popstate", {
                state: pendingNavRef.current.state,
              }),
            );
            pendingNavRef.current = null;
          }
        }
      };

      saveAndNavigate();
    };

    // --- Block BROWSER BACK/FORWARD BUTTON when dirty ---
    // Completely stop Back/Forward from working when there are unsaved changes
    const handlePopState = (e) => {
      if (isDirtyRef.current) {
        // BLOCK navigation - push state back immediately to stay on current page
        originalPushState(null, "", window.location.href);

        // Show alert to inform user
        alert(
          "You have unsaved changes. Please save or discard changes before navigating.",
        );
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener("popstate", handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, buildSavePayload, chassisImpressionFile, dispatch]);

  // Shows browser's native "Leave site?" dialog when user tries to refresh,
  // close the tab, or navigate away from the site entirely.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Render flexible fields for a section
  const renderFlexibleFields = useCallback(
    (sectionName) => {
      const sectionFields = flexibleFields.filter(
        (field) => field.section_name === sectionName,
      );

      return sectionFields.map((field) => (
        <div
          key={field.id}
          className="row mt-3"
          style={{
            border: "1px dashed #ccc",
            padding: "10px",
            borderRadius: "5px",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => removeFlexibleField(field.id)}
            className="flexible-field-remove-button"
          >
            <DeleteIcon />
          </button>

          {field.col_span === 1 ? (
            // Add One: 2 fields (1 heading, 1 value)
            <>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    Field Label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_label}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_label",
                        e.target.value,
                      )
                    }
                    placeholder="Enter field label"
                    required
                  />
                </div>
              </div>
              <div className="col-md-9">
                <div className="form-group">
                  <label>
                    Field Value <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_value}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_value",
                        e.target.value,
                      )
                    }
                    placeholder="Enter field value"
                    required
                  />
                </div>
              </div>
            </>
          ) : (
            // Add Two: 4 fields (2 headings, 2 values)
            <>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    First Label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_label}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_label",
                        e.target.value,
                      )
                    }
                    placeholder="Enter first label"
                    required
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    First Value <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_value}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_value",
                        e.target.value,
                      )
                    }
                    placeholder="Enter first value"
                    required
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    Second Label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_label_2 || ""}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_label_2",
                        e.target.value,
                      )
                    }
                    placeholder="Enter second label"
                    required
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    Second Value <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_value_2 || ""}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_value_2",
                        e.target.value,
                      )
                    }
                    placeholder="Enter second value"
                    required
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ));
    },
    [flexibleFields, handleFlexibleFieldChange, removeFlexibleField],
  );

  // Render flexible fields with textarea for specific section
  const renderFlexibleFieldsWithTextarea = useCallback(
    (sectionName) => {
      const sectionFields = flexibleFields.filter(
        (field) => field.section_name === sectionName,
      );

      return sectionFields.map((field) => (
        <div
          key={field.id}
          className="row mb-3"
          style={{
            border: "1px dashed #ccc",
            padding: "10px",
            borderRadius: "5px",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => removeFlexibleField(field.id)}
            className="flexible-field-remove-button"
          >
            <DeleteIcon />
          </button>

          {field.col_span === 1 ? (
            // Add One: 2 fields (1 heading, 1 value)
            <>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    Field Label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_label}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_label",
                        e.target.value,
                      )
                    }
                    placeholder="Enter field label"
                    required
                  />
                </div>
              </div>
              <div className="col-md-9">
                <div className="form-group">
                  <label>
                    Field Value <span className="text-danger">*</span>
                  </label>
                  <WysiwygTextarea
                    className="form-field"
                    name={`field_value_${field.id}`}
                    value={field.field_value}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_value",
                        e.target.value,
                      )
                    }
                    placeholder="Enter field value"
                    rows={2}
                  />
                </div>
              </div>
            </>
          ) : (
            // Add Two: 4 fields (2 headings, 2 values)
            <>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    First Label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_label}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_label",
                        e.target.value,
                      )
                    }
                    placeholder="Enter first label"
                    required
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    First Value <span className="text-danger">*</span>
                  </label>
                  <WysiwygTextarea
                    className="form-field"
                    name={`field_value_${field.id}`}
                    value={field.field_value}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_value",
                        e.target.value,
                      )
                    }
                    placeholder="Enter first value"
                    rows={2}
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    Second Label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-field"
                    value={field.field_label_2 || ""}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_label_2",
                        e.target.value,
                      )
                    }
                    placeholder="Enter second label"
                    required
                  />
                </div>
              </div>
              <div className="col-md-3">
                <div className="form-group">
                  <label>
                    Second Value <span className="text-danger">*</span>
                  </label>
                  <WysiwygTextarea
                    className="form-field"
                    name={`field_value_2_${field.id}`}
                    value={field.field_value_2 || ""}
                    onChange={(e) =>
                      handleFlexibleFieldChange(
                        field.id,
                        "field_value_2",
                        e.target.value,
                      )
                    }
                    placeholder="Enter second value"
                    rows={2}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ));
    },
    [flexibleFields, handleFlexibleFieldChange, removeFlexibleField],
  );

  // Memoized values for expensive calculations
  const currentDate = useMemo(() => getCurrentDate(), [getCurrentDate]);

  return (
    <section className="order-details-wrapper">
      <div className="row">
        {/* Reference Number Form Section */}
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div className="order-report-container">
            <div className="d-flex justify-content-between align-items-center">
              <h2>Summarized Report</h2>
              <div className="d-flex align-items-center gap-2">
                <Link
                  to={`/orders/${id}/details/documents`}
                  className="btn btn-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Documents
                </Link>
                <Link
                  to={`/orders/${id}/details/images`}
                  className="btn btn-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Images
                </Link>
              </div>
            </div>
            <form onSubmit={handleReportSubmit} className="body-form-box">
              <div className="row mb-3">
                <div className="col-12">
                  <div className="d-flex gap-2" style={{ width: "100%" }}>
                    <button
                      type="button"
                      className="form-field"
                      onClick={() => setActiveReportTab("general")}
                      style={tabButtonStyle("general")}
                    >
                      General Fields
                    </button>
                    <button
                      type="button"
                      className="form-field"
                      onClick={() => setActiveReportTab("summarized")}
                      style={tabButtonStyle("summarized")}
                    >
                      Summarized Table
                    </button>
                  </div>
                </div>
              </div>
              {activeReportTab === "general" ? (
                <>
                  <div className="row">
                    <div className="col-12">
                      <div className="form-group">
                        <label htmlFor="category_suffix">
                          Category Suffix <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="category_suffix"
                          name="category_suffix"
                          value={reportFormData.category_suffix || ""}
                          onChange={handleFormChange}
                          placeholder="Enter category/subcategory/child-category (e.g., COMMERCIAL VEHICLE / CV CV-IN 11)"
                        />
                        <small className="form-text text-muted">
                          This field controls all heading fields below. Enter
                          the category information in the format:
                          (category_name) / (sub_category_name)
                          (child_category_name)
                        </small>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <label htmlFor="valueation_report_for_heading">
                          Valuation Report For Heading
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="valueation_report_for_heading"
                          name="valueation_report_for_heading"
                          value={
                            reportFormData.valueation_report_for_heading || ""
                          }
                          onChange={handleFormChange}
                          placeholder="Auto-generated from Category Suffix"
                        />
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <div
                          className="d-flex align-items-end gap-3 flex-wrap"
                          style={{ gap: "10px" }}
                        >
                          <div
                            className="flex-grow-1"
                            style={{ minWidth: "200px" }}
                          >
                            <label htmlFor="general_details_heading">
                              General Details Heading
                            </label>
                            <input
                              type="text"
                              className="form-field"
                              id="general_details_heading"
                              name="general_details_heading"
                              value={
                                reportFormData.general_details_heading || ""
                              }
                              readOnly
                              placeholder="Auto-generated from Category Suffix"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group ">
                        <label>
                          Ref NO. <span class="text-danger">*</span>
                        </label>
                        <div className="ref-no-input">
                          <input
                            type="text"
                            className="form-field"
                            name="ref_no_year"
                            value={reportFormData.ref_no_year}
                            onChange={handleFormChange}
                          />
                          <span className="ref-no-slash">/</span>
                          <input
                            type="text"
                            className="form-field"
                            name="ref_no_bank"
                            value={order?.bank_initial || ""}
                            onChange={handleFormChange}
                            readOnly
                          />
                          <span className="ref-no-slash">/</span>
                          <SingleSearchSelect
                            options={[
                              { value: "MUM", label: "MUM" },
                              { value: "GUJ", label: "GUJ" },
                            ]}
                            value={reportFormData.state_name || "MUM"}
                            onChange={(value) =>
                              handleSelectChange("state_name", value)
                            }
                          />
                          <span className="ref-no-slash">/</span>
                          <input
                            type="text"
                            className="form-field"
                            value={reportFormData.ref_no_code || ""}
                            readOnly
                            required
                          />
                          <span className="ref-no-slash">/</span>
                          <input
                            type="text"
                            className="form-field"
                            name="ref_no_month"
                            value={reportFormData.ref_no_month || ""}
                            onChange={handleFormChange}
                            placeholder="Enter Month"
                            required
                          />
                          <input
                            type="text"
                            className="form-field"
                            {...(canEditRefNoId ? { name: "ref_no_id" } : {})}
                            value={reportFormData.ref_no_id}
                            onChange={
                              canEditRefNoId ? handleFormChange : undefined
                            }
                            readOnly={!canEditRefNoId}
                            placeholder="Enter ID"
                            required
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="report_date">
                          Report Date <span className="text-danger">*</span>
                        </label>
                        <div className="d-flex gap-2 align-items-center mb-2 drop-down-w-100">
                          <div style={{ width: "80px", flexShrink: 0 }}>
                            Heading:
                          </div>
                          <SingleSearchSelect
                            options={[
                              { value: "Report Date", label: "Report Date" },
                              {
                                value: "Rev-Report Date",
                                label: "Rev-Report Date",
                              },
                            ]}
                            value={
                              reportFormData.report_date_heading ||
                              "Report Date"
                            }
                            onChange={(value) =>
                              handleSelectChange("report_date_heading", value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="report_date">&nbsp;</label>
                        <div className="d-flex gap-2 align-items-center">
                          <div style={{ width: "80px", flexShrink: 0 }}>
                            Value:
                          </div>
                          <input
                            type="text"
                            className="form-field flex-grow-1"
                            id="report_date"
                            name="report_date"
                            value={reportFormData.report_date}
                            onChange={handleDateChange}
                            placeholder="DD-MM-YYYY"
                            maxLength="10"
                            required
                            style={{ marginBottom: 0, minWidth: 0 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="valuer_name">
                          Valuer Name <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="valuer_name"
                          name="valuer_name"
                          value={reportFormData.valuer_name}
                          readOnly
                          placeholder="Set from order attributes"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="license_no">
                          License No <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="license_no"
                          name="license_no"
                          value={reportFormData.license_no}
                          readOnly
                          placeholder="Auto-populated based on valuer"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="valuer_contact">Valuer Contact</label>
                        <input
                          type="text"
                          className="form-field"
                          id="valuer_contact"
                          name="valuer_contact"
                          value={reportFormData.valuer_contact}
                          readOnly
                          placeholder="Fixed contact number"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="valuation_purpose">
                          Valuation Purpose <span class="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={[
                            {
                              value: "FINANCIAL USAGE",
                              label: "FINANCIAL USAGE",
                            },
                            {
                              value: "INUSRANCE USAGE",
                              label: "INUSRANCE USAGE",
                            },
                            { value: "REPO PURPOSE", label: "REPO PURPOSE" },
                          ]}
                          value={reportFormData.valuation_purpose}
                          onChange={(value) =>
                            handleSelectChange("valuation_purpose", value)
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="initiated_by">Initiated By</label>
                        <WysiwygTextarea
                          className="form-field"
                          id="initiated_by"
                          name="initiated_by"
                          value={reportFormData.initiated_by || ""}
                          onChange={handleFormChange}
                          rows={2}
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="date_of_inspection">
                          Date of Inspection
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="date_of_inspection"
                          name="date_of_inspection"
                          value={reportFormData.date_of_inspection}
                          onChange={handleFormChange}
                          placeholder="e.g. DD-MM-YYYY or text"
                          maxLength="255"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="place_of_inspection">
                          Place of Inspection <span class="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="place_of_inspection"
                          name="place_of_inspection"
                          value={reportFormData.place_of_inspection}
                          onChange={handleFormChange}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="registered_owner_name">
                          Registered Owner Name{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="registered_owner_name"
                          name="registered_owner_name"
                          value={reportFormData.registered_owner_name}
                          onChange={handleFormChange}
                          placeholder="ABC Company"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="registered_owner_address">
                          Registered Owner Address{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="registered_owner_address"
                          name="registered_owner_address"
                          value={reportFormData.registered_owner_address}
                          onChange={handleFormChange}
                          rows={2}
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="proposed_owner_name">
                          Proposed Owner Name <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="proposed_owner_name"
                          name="proposed_owner_name"
                          value={reportFormData.proposed_owner_name}
                          onChange={handleFormChange}
                          placeholder="XYZ Company"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="proposed_owner_address">
                          Proposed Owner Address{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="proposed_owner_address"
                          name="proposed_owner_address"
                          value={reportFormData.proposed_owner_address}
                          onChange={handleFormChange}
                          rows={2}
                          placeholder="456 Corporate Avenue, Mumbai"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inspected Equipment Details Section */}
                  <div className="row">
                    <div className="col-12">
                      <h4>INSPECTED EQUIPMENT DETAILS</h4>
                      <hr />
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <label htmlFor="inspected_equipment_heading">
                          Inspected Equipment Heading
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="inspected_equipment_heading"
                          name="inspected_equipment_heading"
                          value={
                            reportFormData.inspected_equipment_heading || ""
                          }
                          readOnly
                          placeholder="Auto-generated from Category Suffix"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="registration_no">Registration No</label>
                        <div className="d-flex gap-2 align-items-center">
                          <input
                            type="text"
                            className="form-field flex-grow-1"
                            id="registration_no"
                            name="registration_no"
                            value={reportFormData.registration_no}
                            onChange={handleFormChange}
                            placeholder="MH01AB1234"
                            style={{ marginBottom: 0 }}
                          />
                          <button
                            type="button"
                            className={`form-field registration-option-btn ${
                              registrationNoOption === "NOT_AVAILABLE"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              handleRegistrationOption(
                                "registration_no",
                                "NOT_AVAILABLE",
                              )
                            }
                            style={{
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              marginBottom: 0,
                            }}
                          >
                            Not Available
                          </button>
                          <button
                            type="button"
                            className={`form-field registration-option-btn ${
                              registrationNoOption === "NOT_APPLICABLE"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              handleRegistrationOption(
                                "registration_no",
                                "NOT_APPLICABLE",
                              )
                            }
                            style={{
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              marginBottom: 0,
                            }}
                          >
                            Not Applicable
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="registration_date">
                          Registration Date
                        </label>
                        <div className="d-flex gap-2 align-items-center">
                          <input
                            type="text"
                            className="form-field flex-grow-1"
                            id="registration_date"
                            name="registration_date"
                            value={reportFormData.registration_date}
                            onChange={handleDateChange}
                            placeholder="DD-MM-YYYY"
                            maxLength="10"
                            style={{ marginBottom: 0 }}
                          />
                          <button
                            type="button"
                            className={`form-field registration-option-btn ${
                              registrationDateOption === "NOT_AVAILABLE"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              handleRegistrationOption(
                                "registration_date",
                                "NOT_AVAILABLE",
                              )
                            }
                            style={{
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              marginBottom: 0,
                            }}
                          >
                            Not Available
                          </button>
                          <button
                            type="button"
                            className={`form-field registration-option-btn ${
                              registrationDateOption === "NOT_APPLICABLE"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              handleRegistrationOption(
                                "registration_date",
                                "NOT_APPLICABLE",
                              )
                            }
                            style={{
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              marginBottom: 0,
                            }}
                          >
                            Not Applicable
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="location_of_machinery">
                          Location Of Machinery{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <div className="d-flex gap-2 align-items-start">
                          <WysiwygTextarea
                            className="form-field flex-grow-1"
                            id="location_of_machinery"
                            name="location_of_machinery"
                            value={reportFormData.location_of_machinery}
                            onChange={handleFormChange}
                            rows={2}
                            style={{ marginBottom: 0 }}
                          />
                          <div className="d-flex flex-column gap-2">
                            <button
                              type="button"
                              className={`form-field registration-option-btn ${
                                locationOfMachineryOption === "NOT_AVAILABLE"
                                  ? "active"
                                  : ""
                              }`}
                              onClick={() =>
                                handleRegistrationOption(
                                  "location_of_machinery",
                                  "NOT_AVAILABLE",
                                )
                              }
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                                marginBottom: 0,
                              }}
                            >
                              Not Available
                            </button>
                            <button
                              type="button"
                              className={`form-field registration-option-btn ${
                                locationOfMachineryOption === "NOT_APPLICABLE"
                                  ? "active"
                                  : ""
                              }`}
                              onClick={() =>
                                handleRegistrationOption(
                                  "location_of_machinery",
                                  "NOT_APPLICABLE",
                                )
                              }
                              style={{
                                padding: "8px 12px",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                                marginBottom: 0,
                              }}
                            >
                              Not Applicable
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="owner_serial_no">Owner Serial No</label>
                        <SingleSearchSelect
                          options={[
                            { value: "1ST OWNER", label: "1ST OWNER" },
                            { value: "2ND OWNER", label: "2ND OWNER" },
                            { value: "3RD OWNER", label: "3RD OWNER" },
                            { value: "4TH OWNER", label: "4TH OWNER" },
                            { value: "5TH OWNER", label: "5TH OWNER" },
                            { value: "6TH OWNER", label: "6TH OWNER" },
                            { value: "7TH OWNER", label: "7TH OWNER" },
                            { value: "8TH OWNER", label: "8TH OWNER" },
                            { value: "9TH OWNER", label: "9TH OWNER" },
                            { value: "10TH OWNER", label: "10TH OWNER" },
                            {
                              value: "AS PER ANIXTURE",
                              label: "AS PER ANIXTURE",
                            },
                          ]}
                          value={reportFormData.owner_serial_no}
                          onChange={(value) =>
                            handleSelectChange("owner_serial_no", value)
                          }
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="manufacture_year">
                          Manufacture Year <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="manufacture_year"
                          name="manufacture_year"
                          value={reportFormData.manufacture_year}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="supplier_names">Supplier Name</label>
                        <input
                          type="text"
                          className="form-field"
                          id="supplier_names"
                          name="supplier_names"
                          value={reportFormData.supplier_names}
                          onChange={handleFormChange}
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="asset_make">
                          Asset Make & Supplier{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <div>
                          <SingleSearchSelect
                            options={[
                              ...assetMakes.map((make) => ({
                                value: make.id,
                                label: make.name,
                              })),
                              { value: "OTHERS", label: "OTHERS" },
                            ]}
                            value={parseInt(reportFormData.asset_make)}
                            onChange={(value) => {
                              handleSelectChange("asset_make", value);
                              setShowOtherAssetMake(value === "OTHERS");
                              if (value !== "OTHERS") {
                                setOtherAssetMake("");
                              }
                            }}
                            isLoading={assetMakesLoading}
                          />
                          {showOtherAssetMake && (
                            <input
                              type="text"
                              className="form-field mt-2"
                              name="new_asset_make"
                              placeholder="Enter Asset Make"
                              value={otherAssetMake}
                              onChange={(e) => {
                                const value = e.target.value.toUpperCase();
                                setOtherAssetMake(value);
                                handleSelectChange(
                                  "new_asset_make",
                                  value || "OTHERS",
                                );
                              }}
                              required
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="model">
                          Model <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="model"
                          name="model"
                          value={reportFormData.model || ""}
                          onChange={handleFormChange}
                          placeholder="Enter Model"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="control_system">
                          Control System <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="control_system"
                          name="control_system"
                          value={reportFormData.control_system}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="machine_serial_no">
                          Machine Serial No <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="machine_serial_no"
                          name="machine_serial_no"
                          value={reportFormData.machine_serial_no}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="laf_id">
                          LAF Id <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="laf_id"
                          name="laf_id"
                          value={reportFormData.laf_id}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="application_usage">
                          Application / Usage <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="application_usage"
                          name="application_usage"
                          value={reportFormData.application_usage}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="invoice_no">Invoice No. & Date</label>
                        <div className="d-flex gap-2 align-items-center mb-2 drop-down-w-100">
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            Heading:
                          </div>
                          <SingleSearchSelect
                            options={[
                              {
                                value: "Invoice No. & Date",
                                label: "Invoice No. & Date",
                              },
                              {
                                value: "Proforma Invoice no. and date",
                                label: "Proforma Invoice no. and date",
                              },
                              {
                                value: "Quotation no. and date",
                                label: "Quotation no. and date",
                              },
                            ]}
                            value={
                              reportFormData.invoice_no_heading ||
                              "Invoice No. & Date"
                            }
                            onChange={(value) =>
                              handleSelectChange("invoice_no_heading", value)
                            }
                          />
                        </div>
                        <div className="d-flex gap-2 align-items-center">
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            Invoice No.:
                          </div>
                          <input
                            type="text"
                            className="form-field mb-2"
                            id="invoice_no"
                            name="invoice_no"
                            value={reportFormData.invoice_no}
                            onChange={handleFormChange}
                            placeholder="Invoice No."
                          />
                        </div>
                        <div className="d-flex gap-2 align-items-center">
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            Invoice Date:
                          </div>
                          <input
                            type="text"
                            className="form-field"
                            id="invoice_date"
                            name="invoice_date"
                            value={reportFormData.invoice_date}
                            placeholder="DD-MM-YYYY"
                            maxLength="10"
                            onChange={handleDateChange}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="hyp_with">
                          Hyp With <span class="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="hyp_with"
                          name="hyp_with"
                          value={reportFormData.hyp_with}
                          onChange={handleFormChange}
                          rows={2}
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="machine_type">Machine Type</label>
                        <input
                          type="text"
                          className="form-field"
                          id="machine_type"
                          name="machine_type"
                          value={reportFormData.machine_type}
                          onChange={handleFormChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Flexible Fields for INSPECTED EQUIPMENT DETAILS */}
                  <div className="row mt-3">
                    <div className="col-12">
                      <div className="flexible-buttons-container">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() =>
                            addFlexibleFields("INSPECTED_EQUIPMENT_DETAILS", 2)
                          }
                        >
                          Add One Set
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() =>
                            addFlexibleFields("INSPECTED_EQUIPMENT_DETAILS", 4)
                          }
                        >
                          Add Two Set
                        </button>
                      </div>
                      {renderFlexibleFields("INSPECTED_EQUIPMENT_DETAILS")}
                    </div>
                  </div>

                  {/* Comments on Equipment at the Time of Inspection Section */}
                  <div className="row">
                    <div className="col-12">
                      <h4>COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION</h4>
                      <hr />
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <label htmlFor="comments_on_equipment_heading">
                          Comments on Equipment Heading
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="comments_on_equipment_heading"
                          name="comments_on_equipment_heading"
                          value={
                            reportFormData.comments_on_equipment_heading || ""
                          }
                          readOnly
                          placeholder="Auto-generated from Category Suffix"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="asset_classification">
                          Asset Classification{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="asset_classification"
                          name="asset_classification"
                          value={reportFormData.asset_classification || ""}
                          onChange={handleFormChange}
                          placeholder="Enter Asset Classification"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor="machine_technology">
                          Machine Technology <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="machine_technology"
                          name="machine_technology"
                          value={reportFormData.machine_technology}
                          onChange={handleFormChange}
                          placeholder="Enter Machine Technology"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="control_panel_unit">
                          Control Panel Unit <span class="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={MACHINERY_CONDITION_OPTIONS}
                          value={reportFormData.control_panel_unit}
                          onChange={(value) =>
                            handleSelectChange("control_panel_unit", value)
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="machine_condition">
                          Machine Condition <span class="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={MACHINERY_CONDITION_OPTIONS}
                          value={reportFormData.machine_condition}
                          onChange={(value) =>
                            handleSelectChange("machine_condition", value)
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="electrical_condition">
                          Electrical Condition{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={MACHINERY_CONDITION_OPTIONS}
                          value={reportFormData.electrical_condition}
                          onChange={(value) =>
                            handleSelectChange("electrical_condition", value)
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="mechanical_condition">
                          Mechanical Condition{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={MACHINERY_CONDITION_OPTIONS}
                          value={reportFormData.mechanical_condition}
                          onChange={(value) =>
                            handleSelectChange("mechanical_condition", value)
                          }
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Fix But Flex */}
                  <div className="row">
                    <div className="col-12">
                      <div className="form-group mb-0">
                        <label>Fix But Flex</label>
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_1"
                          name="fix_but_flex_heading_1"
                          value={reportFormData.fix_but_flex_heading_1}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_1"
                          name="fix_but_flex_value_1"
                          value={reportFormData.fix_but_flex_value_1}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_2"
                          name="fix_but_flex_heading_2"
                          value={reportFormData.fix_but_flex_heading_2}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_2"
                          name="fix_but_flex_value_2"
                          value={reportFormData.fix_but_flex_value_2}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_3"
                          name="fix_but_flex_heading_3"
                          value={reportFormData.fix_but_flex_heading_3}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_3"
                          name="fix_but_flex_value_3"
                          value={reportFormData.fix_but_flex_value_3}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_4"
                          name="fix_but_flex_heading_4"
                          value={reportFormData.fix_but_flex_heading_4}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_4"
                          name="fix_but_flex_value_4"
                          value={reportFormData.fix_but_flex_value_4}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_5"
                          name="fix_but_flex_heading_5"
                          value={reportFormData.fix_but_flex_heading_5}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_5"
                          name="fix_but_flex_value_5"
                          value={reportFormData.fix_but_flex_value_5}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-1">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_6"
                          name="fix_but_flex_heading_6"
                          value={reportFormData.fix_but_flex_heading_6}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-1">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_6"
                          name="fix_but_flex_value_6"
                          value={reportFormData.fix_but_flex_value_6}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_7"
                          name="fix_but_flex_heading_7"
                          value={reportFormData.fix_but_flex_heading_7}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_7"
                          name="fix_but_flex_value_7"
                          value={reportFormData.fix_but_flex_value_7}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_8"
                          name="fix_but_flex_heading_8"
                          value={reportFormData.fix_but_flex_heading_8}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_8"
                          name="fix_but_flex_value_8"
                          value={reportFormData.fix_but_flex_value_8}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_9"
                          name="fix_but_flex_heading_9"
                          value={reportFormData.fix_but_flex_heading_9}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-1">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_9"
                          name="fix_but_flex_value_9"
                          value={reportFormData.fix_but_flex_value_9}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-1">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_10"
                          name="fix_but_flex_heading_10"
                          value={reportFormData.fix_but_flex_heading_10}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_10"
                          name="fix_but_flex_value_10"
                          value={reportFormData.fix_but_flex_value_10}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_11"
                          name="fix_but_flex_heading_11"
                          value={reportFormData.fix_but_flex_heading_11}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <WysiwygTextarea
                          className="form-field"
                          id="fix_but_flex_value_11"
                          name="fix_but_flex_value_11"
                          value={reportFormData.fix_but_flex_value_11}
                          onChange={handleFormChange}
                          placeholder="Value..."
                          rows={2}
                        />
                      </div>
                    </div>
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_12"
                          name="fix_but_flex_heading_12"
                          value={reportFormData.fix_but_flex_heading_12}
                          onChange={handleFormChange}
                          placeholder="Title..."
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_12"
                          name="fix_but_flex_value_12"
                          value={reportFormData.fix_but_flex_value_12}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="machine_colour">
                          Machine Colour <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="machine_colour"
                          name="machine_colour"
                          value={reportFormData.machine_colour}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="color_condition">
                          Color Condition <span class="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={MACHINERY_CONDITION_OPTIONS}
                          value={reportFormData.color_condition}
                          onChange={(value) =>
                            handleSelectChange("color_condition", value)
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="damages_if_any">Damages If Any</label>
                        <input
                          type="text"
                          className="form-field"
                          id="damages_if_any"
                          name="damages_if_any"
                          value={reportFormData.damages_if_any}
                          onChange={handleFormChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Flexible Fields for COMMENTS ON EQUIPMENT */}
                  <div className="row mt-3">
                    <div className="col-12">
                      <div className="flexible-buttons-container">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() =>
                            addFlexibleFields(
                              "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION",
                              2,
                            )
                          }
                        >
                          Add One Set
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() =>
                            addFlexibleFields(
                              "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION",
                              4,
                            )
                          }
                        >
                          Add Two Set
                        </button>
                      </div>
                      {renderFlexibleFields(
                        "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION",
                      )}
                    </div>
                  </div>

                  {/* RC, PERMIT, TAX, FITNESS & INSURANCE Section */}
                  <div className="row">
                    <div className="col-12">
                      <h4>INSURANCE DETAILS OF THE</h4>
                      <hr />
                    </div>
                    <div className="col-12">
                      <div className="form-group">
                        <label htmlFor="insurance_details_heading">
                          Insurance Details Heading
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="insurance_details_heading"
                          name="insurance_details_heading"
                          value={reportFormData.insurance_details_heading || ""}
                          readOnly
                          placeholder="Auto-generated from Category Suffix"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="tax_invoice_copy">
                          Tax Invoice Copy
                        </label>
                        <div className="d-flex gap-2 align-items-center mb-2 drop-down-w-100">
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            Heading:
                          </div>
                          <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <SingleSearchSelect
                              options={[
                                {
                                  value: "Proforma Invoice",
                                  label: "Proforma Invoice",
                                },
                                {
                                  value: "Tax Invoice",
                                  label: "Tax Invoice",
                                },
                              ]}
                              value={
                                reportFormData.tax_invoice_copy_heading ||
                                "Proforma Invoice Verified"
                              }
                              onChange={(value) =>
                                handleSelectChange(
                                  "tax_invoice_copy_heading",
                                  value,
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="d-flex gap-2 align-items-center">
                          <div style={{ width: "100px", flexShrink: 0 }}>
                            Value:
                          </div>
                          <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <SingleSearchSelect
                              options={[
                                {
                                  value: "COPY VERIFIED",
                                  label: "COPY VERIFIED",
                                },
                                {
                                  value: "COPY NOT AVAILABLE",
                                  label: "COPY NOT AVAILABLE",
                                },
                                {
                                  value: "AS PER ANIXTURE",
                                  label: "AS PER ANIXTURE",
                                },
                              ]}
                              value={reportFormData.tax_invoice_copy}
                              onChange={(value) =>
                                handleSelectChange("tax_invoice_copy", value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="rc_book_verified">Quotation Copy</label>
                        <SingleSearchSelect
                          options={[
                            { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                            {
                              value: "COPY NOT AVAILABLE",
                              label: "COPY NOT AVAILABLE",
                            },
                          ]}
                          value={reportFormData.quotation_copy}
                          onChange={(value) =>
                            handleSelectChange("quotation_copy", value)
                          }
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="rc_book_verified">Insurance Copy</label>
                        <SingleSearchSelect
                          options={[
                            { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                            {
                              value: "COPY NOT AVAILABLE",
                              label: "COPY NOT AVAILABLE",
                            },
                          ]}
                          value={reportFormData.rc_book_verified}
                          onChange={(value) =>
                            handleSelectChange("rc_book_verified", value)
                          }
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="bill_of_entry">Bill of Entry</label>
                        <SingleSearchSelect
                          options={[
                            { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                            {
                              value: "COPY NOT AVAILABLE",
                              label: "COPY NOT AVAILABLE",
                            },
                          ]}
                          value={reportFormData.bill_of_entry}
                          onChange={(value) =>
                            handleSelectChange("bill_of_entry", value)
                          }
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="bill_of_entry">Bill of Landing</label>
                        <SingleSearchSelect
                          options={[
                            { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                            {
                              value: "COPY NOT AVAILABLE",
                              label: "COPY NOT AVAILABLE",
                            },
                          ]}
                          value={reportFormData.bill_of_landing}
                          onChange={(value) =>
                            handleSelectChange("bill_of_landing", value)
                          }
                        />
                      </div>
                    </div>

                    {/* <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="tax_upto_title">Title</label>
                    <input
                      type="text"
                      className="form-field"
                      id="tax_upto_title"
                      name="tax_upto_title"
                      value={reportFormData.tax_upto_title}
                      onChange={handleFormChange}
                      placeholder="Tax Upto"
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="tax_upto">Tax Upto</label>
                    <input
                      type="text"
                      className="form-field"
                      id="tax_upto"
                      name="tax_upto"
                      value={reportFormData.tax_upto}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                    />
                  </div>
                </div> */}

                    {/* <div className="row">
                 <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="permit_upto">Permit Upto</label>
                    <input
                      type="text"
                      className="form-field"
                      id="permit_upto"
                      name="permit_upto"
                      value={reportFormData.permit_upto}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="permit_type">Permit Type</label>
                    <input
                      type="text"
                      className="form-field"
                      id="permit_type"
                      name="permit_type"
                      value={reportFormData.permit_type}
                      onChange={handleFormChange}
                      placeholder="All India"
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="fitness_upto_title">Title</label>
                    <input
                      type="text"
                      className="form-field"
                      id="fitness_upto_title"
                      name="fitness_upto_title"
                      value={reportFormData.fitness_upto_title}
                      onChange={handleFormChange}
                      placeholder="Fitness Upto"
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="fitness_upto">Fitness Upto</label>
                    <input
                      type="text"
                      className="form-field"
                      id="fitness_upto"
                      name="fitness_upto"
                      value={reportFormData.fitness_upto}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="insurance_co_name">Insurance Co.name</label>
                    <input
                      type="text"
                      className="form-field"
                      id="insurance_co_name"
                      name="insurance_co_name"
                      value={reportFormData.insurance_co_name}
                      onChange={handleFormChange}
                      placeholder="New India Assurance"
                    />
                  </div>
                </div> 
              </div>*/}

                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="policy_no">Policy No</label>
                        <input
                          type="text"
                          className="form-field"
                          id="policy_no"
                          name="policy_no"
                          value={reportFormData.policy_no}
                          onChange={handleFormChange}
                          placeholder="POL123456789"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="insurance_valid_date">
                          Insurance Val. Date
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="insurance_valid_date"
                          name="insurance_valid_date"
                          value={reportFormData.insurance_valid_date}
                          onChange={handleDateChange}
                          placeholder="DD-MM-YYYY"
                          maxLength="10"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="insured_value">Insured Value</label>
                        <input
                          type="text"
                          className="form-field"
                          id="insured_value"
                          name="insured_value"
                          value={reportFormData.insured_value}
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <label htmlFor="insurance_verified">
                          Insurance Verified
                        </label>
                        <SingleSearchSelect
                          options={[
                            { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                            {
                              value: "COPY NOT AVAILABLE",
                              label: "COPY NOT AVAILABLE",
                            },
                          ]}
                          value={reportFormData.insurance_verified}
                          onChange={(value) =>
                            handleSelectChange("insurance_verified", value)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {canViewSubCategoryOrders && (
                    <div className="row">
                      <div className="col-12 mb-3">
                        <h4>Sub Category Orders</h4>
                        <hr />
                        <div className="show-x-entries mb-2">
                          Show &nbsp;
                          <select
                            value={entriesToShow}
                            onChange={(e) =>
                              setEntriesToShow(Number(e.target.value))
                            }
                            className="count-of-page-selector"
                          >
                            {[5, 10, 25, 50, 100].map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>{" "}
                          &nbsp; Entries of {finalizedReportRows.length} entries
                        </div>
                        <div className="finalized-reports-table-scroll">
                          <table className="table table-bordered table-striped">
                            <thead>
                              <tr>
                                <th>Order Number</th>
                                <th>Asset Make</th>
                                <th>Manufacture Year</th>
                                <th>Current Invoice Cost</th>
                                <th>Depreciation</th>
                                <th>Depreciation Value</th>
                                <th>Appraiser Value</th>
                                <th>Fair Market Value</th>
                                <th>View</th>
                              </tr>
                            </thead>
                            <tbody>
                              {finalizedReportsLoading ? (
                                <tr>
                                  <td colSpan={9} className="text-center">
                                    Loading finalized reports...
                                  </td>
                                </tr>
                              ) : finalizedReportRows.length === 0 ? (
                                <tr>
                                  <td colSpan={9} className="text-center">
                                    No finalized reports found
                                  </td>
                                </tr>
                              ) : (
                                visibleFinalizedRows.map((row) => (
                                  <tr key={row.id}>
                                    <td>{row.order_number}</td>
                                    <td>{row.asset_make}</td>
                                    <td>{row.manufacture_year}</td>
                                    <td>{row.current_invoice_cost}</td>
                                    <td>{row.depreciation}%</td>
                                    <td>{row.depreciation_value}</td>
                                    <td>{row.appraiser_value}</td>
                                    <td>{row.fair_market_value}</td>
                                    <td>
                                      <Link
                                        to={`/orders/${row.id}/details`}
                                        className=""
                                        title="View"
                                      >
                                        <ViewIcon size={16} color="#fff" />
                                      </Link>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="row">
                    <div className="col-12">
                      <h4>OVER ALL FEED BACK OF THE INSPECTED</h4>
                      <hr />
                    </div>

                    <div className="col-12">
                      <div className="form-group">
                        <label htmlFor="overall_feedback_heading">
                          Overall Feedback Heading
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="overall_feedback_heading"
                          name="overall_feedback_heading"
                          value={reportFormData.overall_feedback_heading || ""}
                          readOnly
                          placeholder="Auto-generated from Category Suffix"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="tax_invoice_cost">
                          Tax Invoice Cost <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="tax_invoice_cost"
                          name="tax_invoice_cost"
                          value={reportFormData.tax_invoice_cost}
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="depreciation">
                          Depreciation <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="depreciation"
                          name="depreciation"
                          value={reportFormData.depreciation}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="depreciation_value">
                          Depreciation Value <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="depreciation_value"
                          name="depreciation_value"
                          value={reportFormData.depreciation_value}
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="appraiser_value">
                          Appraiser Value <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="appraiser_value"
                          name="appraiser_value"
                          value={reportFormData.appraiser_value}
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="fair_market_value">
                          Fair Market Value <span class="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="fair_market_value"
                          name="fair_market_value"
                          value={reportFormData.fair_market_value}
                          onChange={handleFormChange}
                          placeholder="₹ 0.00"
                          required
                        />
                      </div>
                    </div>
                    <FairMarketValueAmountInWordsField
                      value={reportFormData.amount_in_words}
                      onChange={handleFormChange}
                    />
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="no_of_photograph">
                          No of Photographs
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="no_of_photograph"
                          name="no_of_photograph"
                          value={reportFormData.no_of_photograph}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only allow numbers, + and -
                            const sanitized = value.replace(/[^0-9+\-]/g, "");
                            e.target.value = sanitized;
                            handleFormChange(e);
                          }}
                          placeholder="e.g., 10 or 1+3+6 or 5-2"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label htmlFor="no_of_collage">No of Collages</label>
                        <input
                          type="text"
                          className="form-field"
                          id="no_of_collage"
                          name="no_of_collage"
                          value={reportFormData.no_of_collage}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only allow numbers, + and -
                            const sanitized = value.replace(/[^0-9+\-]/g, "");
                            e.target.value = sanitized;
                            handleFormChange(e);
                          }}
                          placeholder="e.g., 2 or 1+1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-12">
                      <div className="form-group">
                        <label htmlFor="valuer_comments_remarks">
                          Valuer Comments/remarks{" "}
                          <span class="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="valuer_comments_remarks"
                          name="valuer_comments_remarks"
                          value={reportFormData.valuer_comments_remarks}
                          onChange={handleFormChange}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-12">
                      <div className="form-group">
                        <label htmlFor="valuer_special_remarks">
                          Valuer Special Remarks
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="valuer_special_remarks"
                          name="valuer_special_remarks"
                          value={reportFormData.valuer_special_remarks}
                          onChange={handleFormChange}
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Flexible Fields for Additional Fields */}
                  <div className="row mt-3">
                    <div className="col-12">
                      <div className="flexible-buttons-container">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() =>
                            addFlexibleFields(
                              "OVER_ALL_FEED_BACK_OF_THE_INSPECTED",
                              2,
                            )
                          }
                        >
                          Add New Set
                        </button>
                      </div>
                      {renderFlexibleFieldsWithTextarea(
                        "OVER_ALL_FEED_BACK_OF_THE_INSPECTED",
                      )}
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-12">
                      <div className="form-group">
                        <label htmlFor="declaration">
                          Declaration <span className="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="declaration"
                          name="declaration"
                          value={reportFormData.declaration}
                          onChange={handleFormChange}
                          rows={6}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-12">
                      <div className="form-group">
                        <label htmlFor="disclaimer">
                          Disclaimer <span className="text-danger">*</span>
                        </label>
                        <WysiwygTextarea
                          className="form-field"
                          id="disclaimer"
                          name="disclaimer"
                          value={reportFormData.disclaimer}
                          onChange={handleFormChange}
                          rows={8}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Generate Report Buttons - Rough and Production */}
                  <div className="row">
                    <div className="col-md-12">
                      <div className="form-group">
                        <label htmlFor="chassis_no_pencil_impression">
                          Chassis No Pencil Impression (Image)
                        </label>
                        <input
                          type="file"
                          className="form-field"
                          id="chassis_no_pencil_impression"
                          name="chassis_no_pencil_impression"
                          onChange={handleFileChange}
                          accept="image/*"
                        />
                        {chassisPreviewUrl && (
                          <div
                            style={{
                              marginTop: "12px",
                              maxWidth: "320px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "6px",
                              padding: "8px",
                              backgroundColor: "#f9fafb",
                            }}
                          >
                            <img
                              src={chassisPreviewUrl}
                              alt="Chassis impression preview"
                              style={{
                                width: "100%",
                                height: "auto",
                                display: "block",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="row">
                  <div className="col-12">
                    <div
                      className="form-group mb-3 summarized-table-toolbar"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        width: "100%",
                        flexDirection: "row",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <SummarizedFixedColumnVisibilityDropdown
                          columns={SUMMARIZED_COLUMNS_FOR_VISIBILITY_UI}
                          visibleIds={summarizedVisibleFixedColumnIds}
                          onVisibleIdsChange={
                            handleSummarizedVisibleColumnIdsChange
                          }
                        />
                        <SummarizedVerticalColumnMergeDropdown
                          columns={summarizedVerticalMergeEligibleColumns}
                          dynamicColumns={
                            summarizedTableData.dynamicColumns || []
                          }
                          fixedColumnHeaders={
                            summarizedTableData.fixedColumnHeaders || {}
                          }
                          verticalMergedColumnIds={
                            summarizedVerticalMergedColumnIds
                          }
                          onToggleColumnMerge={handleToggleVerticalColumnMerge}
                        />
                        <label
                          className="summarized-appendix-row-padding-control"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            margin: 0,
                            fontSize: "14px",
                            whiteSpace: "nowrap",
                          }}
                          title="Vertical padding for appendix table rows in the generated PDF only (not saved)"
                        >
                          Table row padding (px)
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="form-control form-control-sm"
                            style={{ width: "72px" }}
                            value={summarizedAppendixRowPaddingPx}
                            onChange={handleSummarizedAppendixRowPaddingChange}
                            onBlur={handleSummarizedAppendixRowPaddingBlur}
                            aria-label="Appendix table row padding in pixels"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={handleAddSummarizedColumn}
                        style={{
                          width: "fit-content",
                          display: "inline-flex",
                          flex: "0 0 auto",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        Add Column
                      </button>
                    </div>
                    <div
                      ref={summarizedTableScrollRef}
                      className="summarized-table-scroll"
                      style={{
                        "--summarized-table-min-width": `${summarizedTableMinWidth}px`,
                      }}
                      onKeyDown={handleSummarizedTableKeyDown}
                    >
                      <table
                        className="table table-bordered summarized-data-table"
                        style={{
                          minWidth: `${summarizedTableMinWidth}px`,
                          tableLayout: "fixed",
                        }}
                      >
                        <thead>
                          <tr>
                            {isSummarizedFixedColumnVisible(
                              SUMMARIZED_SR_NO_COLUMN.id,
                            ) && (
                              <th
                                style={{
                                  minWidth: `${getSummarizedColumnWidth(SUMMARIZED_SR_NO_COLUMN.id)}px`,
                                  width: `${getSummarizedColumnWidth(SUMMARIZED_SR_NO_COLUMN.id)}px`,
                                }}
                              >
                                {renderSummarizedFixedHeaderContent(
                                  SUMMARIZED_SR_NO_COLUMN,
                                )}
                              </th>
                            )}
                            {SUMMARIZED_TRAILING_COLUMNS.filter((col) =>
                              isSummarizedFixedColumnVisible(col.id),
                            ).map((col) => (
                              <th
                                key={col.id}
                                style={{
                                  minWidth: `${getSummarizedColumnWidth(col.id)}px`,
                                  width: `${getSummarizedColumnWidth(col.id)}px`,
                                }}
                              >
                                {renderSummarizedFixedHeaderContent(col)}
                              </th>
                            ))}
                            {SUMMARIZED_FIXED_START_COLUMNS.filter((col) =>
                              isSummarizedFixedColumnVisible(col.id),
                            ).map((col) => (
                              <th
                                key={col.id}
                                style={{
                                  minWidth: `${getSummarizedColumnWidth(col.id)}px`,
                                  width: `${getSummarizedColumnWidth(col.id)}px`,
                                }}
                              >
                                {renderSummarizedFixedHeaderContent(col)}
                              </th>
                            ))}
                            {(summarizedTableData.dynamicColumns || []).map(
                              (col) => (
                                <th
                                  key={col.id}
                                  style={{
                                    minWidth: `${getSummarizedColumnWidth(col.id)}px`,
                                    width: `${getSummarizedColumnWidth(col.id)}px`,
                                  }}
                                >
                                  <div
                                    className="d-flex flex-column gap-1"
                                    style={{ position: "relative" }}
                                  >
                                    <div className="d-flex align-items-start gap-1">
                                      <AutoGrowTextarea
                                        className="form-field mb-0"
                                        style={summarizedInputStyle}
                                        value={col.header || ""}
                                        onChange={(e) =>
                                          handleSummarizedDynamicHeaderChange(
                                            col.id,
                                            e.target.value,
                                          )
                                        }
                                        placeholder="Enter column heading"
                                      />
                                      <button
                                        type="button"
                                        className="flexible-field-remove-button"
                                        onClick={() =>
                                          handleRemoveSummarizedColumn(col.id)
                                        }
                                        style={{ top: "-8px", right: "-8px" }}
                                        title="Remove this column"
                                      >
                                        <DeleteIcon />
                                      </button>
                                    </div>
                                    <label
                                      className="d-flex align-items-center gap-2 mb-0"
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: 500,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={Boolean(col.allowSum)}
                                        onChange={(e) =>
                                          handleSummarizedDynamicAllowSumChange(
                                            col.id,
                                            e.target.checked,
                                          )
                                        }
                                      />
                                      Allow sum
                                    </label>
                                  </div>
                                </th>
                              ),
                            )}
                            {SUMMARIZED_FIXED_END_COLUMNS.filter((col) =>
                              isSummarizedFixedColumnVisible(col.id),
                            ).map((col) => (
                              <th
                                key={col.id}
                                style={{
                                  minWidth: `${getSummarizedColumnWidth(col.id)}px`,
                                  width: `${getSummarizedColumnWidth(col.id)}px`,
                                }}
                              >
                                {renderSummarizedFixedHeaderContent(col)}
                              </th>
                            ))}
                            <th style={{ minWidth: "160px", width: "160px" }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(summarizedTableData.rows || []).map(
                            (row, rowIndex) => (
                              <React.Fragment key={`sum-row-block-${rowIndex}`}>
                                {rowIndex > 0 ? (
                                  <SummarizedRowInsertZone
                                    insertIndex={rowIndex}
                                    colSpan={
                                      summarizedDisplayOrderedColumns.length + 1
                                    }
                                    onInsert={handleInsertSummarizedRowAt}
                                  />
                                ) : null}
                                <tr key={`sum-row-${rowIndex}`}>
                                  {isSummarizedMergedTitleRow(row) ? (
                                    <td
                                      colSpan={
                                        summarizedDisplayOrderedColumns.length
                                      }
                                      className="summarized-merged-title-cell"
                                      style={{
                                        textAlign: "center",
                                        verticalAlign: "middle",
                                      }}
                                    >
                                      <AutoGrowTextarea
                                        className="form-field mb-0"
                                        style={summarizedInputStyle}
                                        value={getSummarizedMergedRowText(row)}
                                        onChange={(e) =>
                                          handleSummarizedMergedRowTextChange(
                                            rowIndex,
                                            e.target.value,
                                          )
                                        }
                                        placeholder="Enter merged row title"
                                      />
                                    </td>
                                  ) : (
                                    summarizedDisplayOrderedColumns
                                      .map((col, colIndex) =>
                                        renderSummarizedDataCell(
                                          col,
                                          row,
                                          rowIndex,
                                          colIndex,
                                        ),
                                      )
                                      .filter(Boolean)
                                  )}
                                  <td
                                    style={{
                                      minWidth: "160px",
                                      width: "160px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                        gap: "8px",
                                      }}
                                    >
                                      <label
                                        className="d-flex align-items-center gap-2 mb-0"
                                        style={{
                                          fontSize: "12px",
                                          fontWeight: 500,
                                          cursor: "pointer",
                                          whiteSpace: "nowrap",
                                        }}
                                        title="Merge all columns in this row into one title cell"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSummarizedMergedTitleRow(
                                            row,
                                          )}
                                          onChange={(e) =>
                                            handleToggleSummarizedRowMerge(
                                              rowIndex,
                                              e.target.checked,
                                            )
                                          }
                                        />
                                        Merge row
                                      </label>
                                      {rowIndex > 0 ? (
                                        <button
                                          type="button"
                                          className="flexible-field-remove-button"
                                          onClick={() =>
                                            handleRemoveSummarizedRow(rowIndex)
                                          }
                                          style={{ position: "static" }}
                                          title="Remove this row"
                                        >
                                          <DeleteIcon />
                                        </button>
                                      ) : (
                                        <span
                                          style={{
                                            color: "#9ca3af",
                                            fontSize: "12px",
                                          }}
                                        >
                                          Base Row
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            ),
                          )}
                          <tr
                            key="sum-row-grand-total"
                            className="summarized-grand-total-row"
                          >
                            {isSummarizedFixedColumnVisible(
                              SUMMARIZED_SR_NO_COLUMN.id,
                            ) && <td />}
                            {SUMMARIZED_TRAILING_COLUMNS.filter((col) =>
                              isSummarizedFixedColumnVisible(col.id),
                            ).map((col) => (
                              <td key={`grand-total-trail-${col.id}`} />
                            ))}
                            {summarizedVisibleFixedStartColumns.length > 0 && (
                              <td
                                className="summarized-grand-total-label-cell"
                                colSpan={
                                  summarizedVisibleFixedStartColumns.length
                                }
                              >
                                GRAND TOTAL - FAIR VALUATION AMOUNT (marked in
                                green shade)
                              </td>
                            )}
                            {(summarizedTableData.dynamicColumns || []).map(
                              (col) => (
                                <td key={`grand-total-dynamic-${col.id}`}>
                                  {col.allowSum
                                    ? (summarizedDynamicColumnTotals[col.id] ??
                                      0)
                                    : ""}
                                </td>
                              ),
                            )}
                            {SUMMARIZED_FIXED_END_COLUMNS.filter((col) =>
                              isSummarizedFixedColumnVisible(col.id),
                            ).map((col) => (
                              <td
                                key={`grand-total-${col.id}`}
                                className={
                                  col.id === "estimated_fair_value"
                                    ? "summarized-grand-total-fmv-cell"
                                    : ""
                                }
                              >
                                {SUMMARIZED_CURRENCY_COLUMN_IDS.has(col.id) ? (
                                  col.id === "estimated_fair_value" &&
                                  summarizedAllFairValueRowsDashOnly ? (
                                    <input
                                      type="text"
                                      className="form-field mb-0"
                                      style={{
                                        ...summarizedInputStyle,
                                        backgroundColor: "#daf2d0",
                                        fontWeight: 700,
                                      }}
                                      value={
                                        summarizedTableData.manualEstimatedFairValueGrandTotal ||
                                        formatSummarizedGrandTotalCell(
                                          summarizedDisplayedFairValueGrandTotal,
                                        )
                                      }
                                      onChange={(e) =>
                                        handleSummarizedManualFairValueGrandTotalChange(
                                          e.target.value,
                                        )
                                      }
                                      placeholder="0.00"
                                    />
                                  ) : (
                                    formatSummarizedGrandTotalCell(
                                      col.id === "estimated_fair_value"
                                        ? summarizedDisplayedFairValueGrandTotal
                                        : (summarizedGrandTotalsByColumn[
                                            col.id
                                          ] ?? 0),
                                    )
                                  )
                                ) : (
                                  ""
                                )}
                              </td>
                            ))}
                            <td className="summarized-grand-total-action-cell" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div
                      className="form-group mb-3 mt-2"
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "flex-start",
                        gap: "8px",
                        width: "100%",
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={handleAddSummarizedRow}
                        style={{
                          width: "fit-content",
                          display: "inline-flex",
                          flex: "0 0 auto",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Add Row
                      </button>
                    </div>
                    <div className="form-group mt-3">
                      <label htmlFor="end_note">Note</label>
                      <textarea
                        className="form-field"
                        id="end_note"
                        name="end_note"
                        value={reportFormData.end_note || ""}
                        onChange={handleFormChange}
                        rows={4}
                        placeholder="Enter note"
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="col-12">
                  <div className="form-buttons" style={reportButtonsStyle}>
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={generating}
                      onClick={() => setReportTypeSelection("Rough")}
                      style={roughButtonStyle}
                    >
                      {generating && reportTypeSelection === "Rough"
                        ? "Generating Rough..."
                        : "Rough"}
                    </button>
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={generating}
                      onClick={() => setReportTypeSelection("Production")}
                      style={productionButtonStyle}
                    >
                      {generating && reportTypeSelection === "Production"
                        ? "Generating Report..."
                        : "Generate Summarized Report"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Fixed Save Button - Bottom Right Corner */}
      <button
        type="button"
        className="btn save-report"
        onClick={handleSaveReport}
        disabled={saving}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 1000,
          padding: "12px 24px",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </section>
  );
}

export default SummarizedReport;
