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
import { fetchOrderById } from "../../../redux/reducers/orderReducer";
import {
  fetchOrderReport,
  fetchOrderReportByChildCategory,
  generateOrderReport,
  saveOrderReport,
  clearCurrentReport,
} from "../../../redux/reducers/orderReportReducer";
import { fetchAssetMakesForReports } from "../../../redux/reducers/assetMakesReducer";
import { usePageTitle } from "../../../context/PageTitleContext";
import SingleSearchSelect from "../../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import axios from "axios";
import { selectPermissions } from "../../../redux/selectors/authSelectors";
import { hasPermission } from "../../../utils/permissionUtils";
import "../order.scss";
import { DeleteIcon, ViewIcon } from "../../../components/icons";
import { getFinalizedOrdersByChildCategory } from "../../../api/order.api";
import { getOrderReport } from "../../../api/orderReport.api";

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

  // Update content when value prop changes (from external source)
  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      const currentContent = editorRef.current.innerHTML;
      const newContent = value || "";

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
      onChange({
        target: {
          name: name,
          value: htmlContent,
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
      if (!value || value === "" || value === "<br>") {
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

function CEReport() {
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
    (state) => state.assetMakes
  );
  const [showOtherAssetMake, setShowOtherAssetMake] = useState(false);
  const [otherAssetMake, setOtherAssetMake] = useState("");
  // State to track if initial report fetch has completed (using state instead of ref to trigger re-renders)
  const [reportFetchCompleted, setReportFetchCompleted] = useState(false);
  // Ref to track if we've seen the report loading state (to ensure we wait for the fetch to actually happen)
  const reportLoadingStartedRef = useRef(false);
  // State to track if we're in initial loading phase (covers entire form)
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Ref to track if we've attempted the child category fallback
  const childCategoryFallbackAttemptedRef = useRef(false);
  // Ref to track if we've processed the child category report data
  const childCategoryDataProcessedRef = useRef(false);
  // State for external RC API loading
  const [externalApiLoading, setExternalApiLoading] = useState(false);
  // Ref to track if external RC API has been called
  const externalApiCalledRef = useRef(false);
  // Ref to track if we should auto-save after external API prefills data
  const shouldAutoSaveAfterApiRef = useRef(false);
  // Set page title using custom hook
  const { setTitle } = usePageTitle();
  const allowedPermissions = useSelector(selectPermissions);
  const canEditRefNoId = hasPermission(allowedPermissions, "edit_report_ref_no_id");
  const canViewSubCategoryOrders = hasPermission(
    allowedPermissions,
    "view_finalized_sub_category_orders"
  );

  // State for report type selection (Rough/Production)
  const [reportTypeSelection, setReportTypeSelection] = useState("Rough");

  // Fetch finalized orders for current child category (table summary at bottom)
  const [finalizedReportRows, setFinalizedReportRows] = useState([]);
  const [finalizedReportsLoading, setFinalizedReportsLoading] = useState(false);
  const [entriesToShow, setEntriesToShow] = useState(5);
  const visibleFinalizedRows = useMemo(
    () => finalizedReportRows.slice(0, entriesToShow),
    [finalizedReportRows, entriesToShow]
  );

  // Clear report data when component mounts or order changes
  useEffect(() => {
    // Clear any existing report data first
    dispatch(clearCurrentReport());
    // Reset report fetch tracking flags when order changes
    reportLoadingStartedRef.current = false;
    setReportFetchCompleted(false); // Reset state
    setIsInitialLoading(true); // Reset initial loading state
    childCategoryFallbackAttemptedRef.current = false; // Reset fallback attempt flag
    childCategoryDataProcessedRef.current = false; // Reset child category data processed flag
    // Reset external RC API tracking
    externalApiCalledRef.current = false;
    shouldAutoSaveAfterApiRef.current = false;
    // Reset registration field options
    setRegistrationNoOption(null);
    setRegistrationDateOption(null);
    setRegisteredLocationOption(null);
    isDirtyRef.current = false;
    initialFormDataRef.current = null;
    initialFlexibleFieldsRef.current = null;
  }, [dispatch, id]);

  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      dispatch(
        fetchOrderReport({ orderId: id, reportType: "report_ce", silent: true })
      );
      // Fetch asset makes for CE report
      dispatch(fetchAssetMakesForReports("report_ce"));
    }
  }, [dispatch, id]);

  // Fetch finalized orders for current child category and load their CE report summary rows
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

        const finalizedRes = await getFinalizedOrdersByChildCategory(childCategoryId);
        const finalizedOrders = (finalizedRes?.data?.data?.orders || []).filter(
          (orderItem) =>
            String(orderItem?.id) !== String(id) &&
            String(orderItem?.order_number || "").trim() !==
              String(order?.order_number || "").trim()
        );

        if (!Array.isArray(finalizedOrders) || finalizedOrders.length === 0) {
          setFinalizedReportRows([]);
          return;
        }

        const rows = await Promise.all(
          finalizedOrders.map(async (orderItem) => {
            try {
              const reportRes = await getOrderReport(orderItem.id, "report_ce");
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
                current_invoice_cost: report.invoice_cost || "-",
                depreciation: report.depreciation || "-",
                depreciation_value: report.depreciation_value || "-",
                appraiser_value: report.appraiser_value || "-",
                fair_market_value: report.fair_market_value || "-",
              };
            } catch (_) {
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
          })
        );

        setFinalizedReportRows(rows);
      } catch (_) {
        setFinalizedReportRows([]);
      } finally {
        setFinalizedReportsLoading(false);
      }
    };

    fetchFinalizedRows();
  }, [order?.child_category_id, order?.order_number, id, canViewSubCategoryOrders]);

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
      report_type: "report_ce",
      ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
      ref_no_bank: "",
      state_name: "", // Default to first option
      ref_no_code: "", // Default to first option
      ref_no_month: `SFW-${getCurrentMonthAbbreviationLocal()}-`, // Default: SFW-(CURRENT_MONTH)
      ref_no_id: "",
      rev_report_date: getCurrentDateLocal(), // Default to today's date
      report_date_heading: "Report Date",

      valuer_name: "V.K. ASSOCIATES", // Default to first option
      license_no: "SLA-60827",
      valuer_contact: "99209-88549", // Fixed read-only value

      // Category suffix - controls all heading fields
      category_suffix: "",
      // Heading fields (read-only, auto-generated from category_suffix)
      valueation_report_for_heading: "",
      general_details_heading: "",
      inspected_equipment_heading: "",
      comments_on_equipment_heading: "",
      rc_permit_tax_fitness_insurance_heading: "",
      // Needed so RC Book Verified is always part of state/payload.
      rc_book_verified: "",
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
      registered_location: "",

      owner_serial_no: "",
      manufacture_year: "",
      asset_make: "",
      model: "",

      engine_no_heading: "Engine No./ Details",
      engine_no_detail: "",
      chassis_no_heading: "Asset Chassis No",
      crane_chassis_no: "",
      body_type: "",
      crane_model_code: "",

      hours_meter_reading: "",
      invoice_no_heading: "Invoice No. & Date",
      invoice_no_date: "",
      invoice_no: "",
      invoice_date: "",
      hyp_with: "",
      hyp_from_date: "",

      // COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION
      no_of_cylinder: "",

      engine_condition: "",
      chassis_condition: "",
      body_condition: "",
      cabin_condition: "",
      electrical_condition: "",
      gear_transmission: "",

      battery_available: "YES / TWO", // Fixed read-only value
      machine_weight_heading: "Gross Machine Weight",
      gross_machine_weight: "",

      // FIX BUT FLEX
      fix_but_flex_heading_1: "",
      fix_but_flex_value_1: "",
      fix_but_flex_heading_2: "",
      fix_but_flex_value_2: "",
      fix_but_flex_heading_3: "",
      fix_but_flex_value_3: "",
      supplier_names: "",

      fix_but_flex_title_1: "",
      fix_but_flex_title_2: "",
      fix_but_flex_title_3: "",
    });

    // Reset flexible fields
    setFlexibleFields([]);

    // Reset chassis impression file
    setChassisImpressionFile(null);

    // Clear the cleared fields tracking when form resets
    clearedFieldsRef.current.clear();
  }, [id]);

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
    []
  );

  // Helper: true when Valuation Purpose is Repo Purpose (case-insensitive)
  const isRepoPurpose = useCallback((vp) => (String(vp || "").toUpperCase().trim() === "REPO PURPOSE"), []);

  // Helper to build valuation report heading with optional (REPOSSESSION) when is_repo is true
  const buildValuationReportHeading = useCallback((categorySuffixUpper, isRepo) => {
    if (!categorySuffixUpper) return "";
    return `VALUATION REPORT${isRepo ? " (REPOSSESSION)" : ""} FOR ${categorySuffixUpper}`;
  }, []);

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

  // Function to convert number to words in Indian format
  const convertNumberToWordsIndian = useCallback((num) => {
    const a = [
      "",
      "ONE",
      "TWO",
      "THREE",
      "FOUR",
      "FIVE",
      "SIX",
      "SEVEN",
      "EIGHT",
      "NINE",
      "TEN",
      "ELEVEN",
      "TWELVE",
      "THIRTEEN",
      "FOURTEEN",
      "FIFTEEN",
      "SIXTEEN",
      "SEVENTEEN",
      "EIGHTEEN",
      "NINETEEN",
    ];
    const b = [
      "",
      "",
      "TWENTY",
      "THIRTY",
      "FORTY",
      "FIFTY",
      "SIXTY",
      "SEVENTY",
      "EIGHTY",
      "NINETY",
    ];

    if (num === 0) return "ZERO ONLY";

    function numToWords(n) {
      let str = "";
      if (n > 19) {
        str += b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
      } else {
        str += a[n];
      }
      return str;
    }

    let words = "";

    const crore = Math.floor(num / 10000000);
    if (crore > 0) {
      words += numToWords(crore) + " CRORE ";
      num %= 10000000;
    }

    const lakh = Math.floor(num / 100000);
    if (lakh > 0) {
      words += numToWords(lakh) + " LAKH ";
      num %= 100000;
    }

    const thousand = Math.floor(num / 1000);
    if (thousand > 0) {
      words += numToWords(thousand) + " THOUSAND ";
      num %= 1000;
    }

    const hundred = Math.floor(num / 100);
    if (hundred > 0) {
      words += a[hundred] + " HUNDRED ";
      num %= 100;
    }

    if (num > 0) {
      if (words !== "") words += "AND ";
      words += numToWords(num) + " ";
    }

    return words.trim() + " ONLY";
  }, []);

  // Function to convert number to words for tyres
  const numberToWords = useCallback((n) => {
    const words = [
      "",
      "ONE",
      "TWO",
      "THREE",
      "FOUR",
      "FIVE",
      "SIX",
      "SEVEN",
      "EIGHT",
      "NINE",
      "TEN",
      "ELEVEN",
      "TWELVE",
      "THIRTEEN",
      "FOURTEEN",
      "FIFTEEN",
      "SIXTEEN",
      "SEVENTEEN",
      "EIGHTEEN",
      "NINETEEN",
      "TWENTY",
    ];

    if (n <= 20) {
      return words[n];
    }

    const tens = [
      "",
      "",
      "TWENTY",
      "THIRTY",
      "FORTY",
      "FIFTY",
      "SIXTY",
      "SEVENTY",
      "EIGHTY",
      "NINETY",
    ];
    if (n < 100) {
      return (
        tens[Math.floor(n / 10)] + (n % 10 !== 0 ? "-" + words[n % 10] : "")
      );
    }

    return n.toString(); // fallback for numbers above 99
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

  // Form data state for CE report generation
  const [reportFormData, setReportFormData] = useState({
    // Report type and reference details
    report_type: "report_ce",
    ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
    ref_no_bank: "",
    state_name: "", // Default to first option
    ref_no_code: "", // Default to first option
    ref_no_month: `SFW-${getCurrentMonthAbbreviation()}-`, // Default: SFW-(CURRENT_MONTH)
    ref_no_id: "",
    rev_report_date: getCurrentDate(), // Default to today's date
    report_date_heading: "Report Date",

    valuer_name: "V.K. ASSOCIATES", // Default to first option
    license_no: "SLA-60827",
    valuer_contact: "99209-88549", // Fixed read-only value

    // Category suffix - controls all heading fields
    category_suffix: "",
    // Heading fields (read-only, auto-generated from category_suffix)
    valueation_report_for_heading: "",
    general_details_heading: "",
    inspected_equipment_heading: "",
    comments_on_equipment_heading: "",
    rc_permit_tax_fitness_insurance_heading: "",
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
    registered_location: "",

    owner_serial_no: "",
    manufacture_year: "",
    asset_make: "",
    new_asset_make: "",
    model: "",

    engine_no_detail: "",
    crane_chassis_no: "",
    body_type: "",
    crane_model_code: "",

    hours_meter_reading: "",
    invoice_no_heading: "Invoice No. & Date",
    invoice_no_date: "",
    invoice_no: "",
    invoice_date: "",
    hyp_with: "",
    hyp_from_date: "",

    // COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION
    asset_classification: "",
    no_of_cylinder: "",

    engine_condition: "",
    chassis_condition: "",
    body_condition: "",
    cabin_condition: "",
    electrical_condition: "",
    gear_transmission: "",

    battery_available: "YES / TWO", // Fixed read-only value
    machine_weight_heading: "Gross Machine Weight",
    gross_machine_weight: "",

    // FIX BUT FLEX
    fix_but_flex_heading_1: "",
    fix_but_flex_value_1: "",
    fix_but_flex_heading_2: "",
    fix_but_flex_value_2: "",
    fix_but_flex_heading_3: "",
    fix_but_flex_value_3: "",
    supplier_names: "",

    fix_but_flex_title_1: "",
    fix_but_flex_title_2: "",
    fix_but_flex_title_3: "",

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

    fix_but_flex_top_heading_13: "",
    fix_but_flex_heading_13: "",
    fix_but_flex_value_13: "",
    fix_but_flex_heading_14: "",
    fix_but_flex_value_14: "",
    fix_but_flex_heading_15: "",
    fix_but_flex_value_15: "",

    fix_but_flex_heading_16: "",
    fix_but_flex_value_16: "",
    fix_but_flex_heading_17: "",
    fix_but_flex_value_17: "",

    fix_but_flex_heading_18: "",
    fix_but_flex_value_18: "",
    fix_but_flex_heading_19: "MECHANICAL UNIT CONDITION",
    fix_but_flex_value_19: "",
    fix_but_flex_heading_20: "",
    fix_but_flex_value_20: "",

    fix_but_flex_heading_21: "TOOL KIT AVAILABLE",
    fix_but_flex_value_21: "",
    fix_but_flex_heading_22: " SEATING CAPACITY",
    fix_but_flex_value_22: "",
    fix_but_flex_heading_23: "",
    fix_but_flex_value_23: "",

    fix_but_flex_heading_24: "",
    fix_but_flex_value_24: "",
    fix_but_flex_heading_25: "",
    fix_but_flex_value_25: "",

    damages_if_any: "",

    // RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS
    rc_book_verified: "",
    bill_of_entry: "",
    proforma_invoice_heading: "Proforma Invoice Verified",
    proforma_invoice_verified: "",
    tax_upto: "",
    bill_of_lading: "",

    chartered_engineer_certificate: "",
    fitness_upto: "",
    insurance_co_name: "",
    policy_no: "",

    insurance_valid_date: "",
    insured_value: "",
    insurance_verified: "",

    // OVER ALL FEED BACK OF THE INSPECTED
    invoice_cost: "",
    depreciation: "",
    depreciation_value: "",
    appraiser_value: "",

    fair_market_value_heading: "Fair Market Value",
    fair_market_value_heading: "Fair Market Value",
    fair_market_value: "",
    amount_in_words: "",
    no_of_photograph: "",
    no_of_collage: "",

    valuer_comments_remarks: "",
    valuer_special_remarks: "",
    declaration: "",
  });

  // File state for chassis impression
  const [chassisImpressionFile, setChassisImpressionFile] = useState(null);
  const [chassisPreviewUrl, setChassisPreviewUrl] = useState("");

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // Track fields that were explicitly cleared by the user (date and currency fields)
  const clearedFieldsRef = useRef(new Set());

  // Dirty tracking refs
  const isDirtyRef = useRef(false);
  const initialFormDataRef = useRef(null);
  const initialFlexibleFieldsRef = useRef(null);

  // Ref to store the unblock function for navigation interception
  const unblockRef = useRef(null);
  // Ref to store the last intercepted navigation target
  const pendingNavRef = useRef(null);

  // State for registration field options (Not Available / Not Applicable)
  const [registrationNoOption, setRegistrationNoOption] = useState(null); // null, "NOT_AVAILABLE", "NOT_APPLICABLE"
  const [registrationDateOption, setRegistrationDateOption] = useState(null);
  const [registeredLocationOption, setRegisteredLocationOption] =
    useState(null);

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      // Build category suffix once
      const categorySuffix = buildCategorySuffix(
        order?.category_name,
        order?.sub_category_name,
        order?.child_category_name
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
          prev.rc_permit_tax_fitness_insurance_heading ||
          prev.overall_feedback_heading;

        // Prefill headings if:
        // 1. No saved report exists, OR
        // 2. Headings are empty/null (need defaults)
        // This ensures headings always have values when category data is available
        const shouldPrefillHeadings =
          (!hasSavedReport || !hasSavedHeadingValues) && categorySuffix;

        const categorySuffixUpper = categorySuffix ? categorySuffix.toUpperCase().trim() : "";

        return {
          ...prev,
          ref_no_bank: order?.bank_initial || "",
          state_name: prev.state_name || "MUM",
          ref_no_code: order?.valuer_name
            ? getRefNoCode(order.valuer_name)
            : "",
          initiated_by:
            buildInitiatedBy() || "",
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
            valueation_report_for_heading: buildValuationReportHeading(categorySuffixUpper, isRepoPurpose(prev.valuation_purpose)),
            general_details_heading: categorySuffixUpper
              ? `GENERAL DETAILS OF THE INSPECTED ${categorySuffixUpper}`
              : "",
            inspected_equipment_heading: categorySuffixUpper
              ? `INSPECTED EQUIPMENT DETAILS OF ${categorySuffixUpper}`
              : "",
            comments_on_equipment_heading: categorySuffixUpper
              ? `COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${categorySuffixUpper}`
              : "",
            rc_permit_tax_fitness_insurance_heading: categorySuffixUpper
              ? `RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS OF ${categorySuffixUpper}`
              : "",
            overall_feedback_heading: categorySuffixUpper
              ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
              : "",
          }),
        };
      });
    }
  }, [
    order,
    getLicenseNumber,
    getRefNoCode,
    buildCategorySuffix,
    buildValuationReportHeading,
    currentReport,
    id,
    reportFetchCompleted,
  ]);

  // Track when the initial report fetch completes and handle fallback to child category API
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

        // Check if the first API returned null or no report data
        const report = currentReport?.report;
        if (
          !report &&
          order?.child_category_id &&
          !childCategoryFallbackAttemptedRef.current
        ) {
          // First API returned no data, try fallback to child category API
          childCategoryFallbackAttemptedRef.current = true;
          dispatch(
            fetchOrderReportByChildCategory({
              childCategoryId: order.child_category_id,
              reportType: "report_ce",
            })
          );
        } else {
          // Either we have a report or no child_category_id
          // If no child_category_id, child category API won't be called, so RC API also won't be called
          // If we have a report, it's already handled in the populate report useEffect
          // In both cases, all API calls are complete - remove loading
          if (!order?.child_category_id) {
            // No child_category_id - no child category API, no RC API - remove loading
            setIsInitialLoading(false);
          }
          // If child_category_id exists, child category API will be called, then RC API (if registration number exists)
        }
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

          // Check if the first API returned null or no report data
          const report = currentReport?.report;
          if (
            !report &&
            order?.child_category_id &&
            !childCategoryFallbackAttemptedRef.current
          ) {
            // First API returned no data, try fallback to child category API
            childCategoryFallbackAttemptedRef.current = true;
            dispatch(
              fetchOrderReportByChildCategory({
                childCategoryId: order.child_category_id,
                reportType: "report_ce",
              })
            );
          } else {
            // Either we have a report or no child_category_id, so we're done loading
            setIsInitialLoading(false);
          }
        }
      }, 1500); // Wait 1.5 seconds before using fallback

      return () => clearTimeout(fallbackTimer);
    }
  }, [reportLoading, currentReport, reportFetchCompleted, dispatch, order]);

  // Populate form data from fetched CE report (if available)
  useEffect(() => {
    const report = currentReport?.report;

    // If we have a report and it belongs to the current order
    // Main report has data - no child category API or RC API will be called, so remove loading
    if (
      report &&
      currentReport?.order_id === parseInt(id) &&
      reportFetchCompleted
    ) {
      // Main report exists - all API calls are complete, remove loading
      setIsInitialLoading(false);
    }

    if (!report) {
      // If no report and fetch is completed, ensure default values are set
      // Only do this if we haven't attempted the child category fallback yet
      if (
        reportFetchCompleted &&
        !reportLoading &&
        !childCategoryFallbackAttemptedRef.current
      ) {
        // Ensure ref_no_month and fix_but_flex_heading fields have default values
        setReportFormData((prev) => {
          const updated = { ...prev };

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

          // Ensure fix_but_flex_heading fields always have their default values
          const defaultHeadingValues = {
            fix_but_flex_heading_19: "MECHANICAL UNIT CONDITION",
            fix_but_flex_heading_21: "TOOL KIT AVAILABLE",
            fix_but_flex_heading_22: " SEATING CAPACITY",
          };

          Object.entries(defaultHeadingValues).forEach(
            ([fieldName, defaultValue]) => {
              // If the field is null, undefined, or empty string, use the default value
              if (
                !updated[fieldName] ||
                updated[fieldName] === null ||
                String(updated[fieldName]).trim() === ""
              ) {
                updated[fieldName] = defaultValue;
              }
            }
          );

          return updated;
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

    setReportFormData((prev) => {
      const updated = { ...prev };

      // Define all heading fields to ensure they're all handled
      const headingFields = [
        "valueation_report_for_heading",
        "general_details_heading",
        "inspected_equipment_heading",
        "comments_on_equipment_heading",
        "rc_permit_tax_fitness_insurance_heading",
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
          /GENERAL DETAILS OF THE INSPECTED (.+)/i
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
          order?.child_category_name
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
        if (String(report.valueation_report_for_heading).includes("(REPOSSESSION)")) {
          updated.valuation_purpose = "Repo Purpose";
        }
      } else {
        // Generate from category_suffix only if no saved value exists
        const categorySuffixUpper = extractedCategorySuffix
          ? extractedCategorySuffix.toUpperCase().trim()
          : "";
        const isRepo = isRepoPurpose(report.valuation_purpose) || report.is_repo === true;
        updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepo);
        if (isRepo) updated.valuation_purpose = "Repo Purpose";
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
      updated.rc_permit_tax_fitness_insurance_heading = categorySuffixUpper
        ? `RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS OF ${categorySuffixUpper}`
        : "";
      updated.overall_feedback_heading = categorySuffixUpper
        ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
        : "";

      // More robust field population - try to set all relevant fields
      Object.entries(report).forEach(([key, value]) => {
        // Skip system fields, valuer-related fields, and heading fields (already handled above)
        if (
          key.startsWith("created_") ||
          key.startsWith("updated_") ||
          key === "id" ||
          key === "order_id" ||
          key === "flexible_fields" ||
          key === "valuer_name" ||
          key === "license_no" ||
          key === "ref_no_code" ||
          headingFields.includes(key)
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

        if (key === "registered_location") {
          const upperValue = String(fieldValue).toUpperCase().trim();
          if (upperValue === "NOT AVAILABLE") {
            setRegisteredLocationOption("NOT_AVAILABLE");
            updated.registered_location = "";
          } else if (upperValue === "NOT APPLICABLE") {
            setRegisteredLocationOption("NOT_APPLICABLE");
            updated.registered_location = "";
          } else {
            setRegisteredLocationOption(null);
            updated.registered_location = fieldValue;
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

      // Ensure fix_but_flex_heading fields always have their default values
      // These fields should always show their defaults, even if database has null/empty values
      const defaultHeadingValues = {
        fix_but_flex_heading_19: "MECHANICAL UNIT CONDITION",
        fix_but_flex_heading_21: "TOOL KIT AVAILABLE",
        fix_but_flex_heading_22: " SEATING CAPACITY",
      };

      Object.entries(defaultHeadingValues).forEach(
        ([fieldName, defaultValue]) => {
          // If the field is null, undefined, or empty string, use the default value
          if (
            !updated[fieldName] ||
            updated[fieldName] === null ||
            String(updated[fieldName]).trim() === ""
          ) {
            updated[fieldName] = defaultValue;
          }
        }
      );

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
  ]);

  // Handle child category report data (fallback API) - populate only specified fields
  useEffect(() => {
    // Only process if:
    // 1. We attempted the fallback
    // 2. Loading is complete
    // 3. We haven't processed this data yet
    // 4. We have report data
    if (
      !childCategoryFallbackAttemptedRef.current ||
      reportLoading ||
      childCategoryDataProcessedRef.current ||
      !currentReport?.report
    ) {
      return;
    }

    // Check if this report doesn't belong to current order (indicating it's from child category)
    // OR if we attempted fallback and this is the first time we're seeing report data after fallback
    const report = currentReport.report;
    const isChildCategoryReport =
      !currentReport.order_id ||
      currentReport.order_id !== parseInt(id) ||
      (childCategoryFallbackAttemptedRef.current &&
        !childCategoryDataProcessedRef.current);

    if (isChildCategoryReport) {
      // Mark as processed to avoid re-processing
      childCategoryDataProcessedRef.current = true;

      // This is the child category report, populate only specified fields
      setReportFormData((prev) => {
        const updated = { ...prev };

        // List of fields to populate from child category report
        // NOTE: registration_no, registration_date, registered_location are handled separately below
        const fieldsToPopulate = [
          "report_date_heading",
          "engine_no_heading",
          "chassis_no_heading",
          "no_of_cylinder",
          "machine_weight_heading",
          "rc_book_verified",
          "fix_but_flex_heading_1",
          "fix_but_flex_heading_2",
          "fix_but_flex_heading_3",
          "fix_but_flex_title_1",
          "fix_but_flex_title_3",
          "fix_but_flex_heading_4",
          "fix_but_flex_heading_5",
          "fix_but_flex_heading_6",
          "fix_but_flex_heading_7",
          "fix_but_flex_heading_8",
          "fix_but_flex_heading_9",
          "fix_but_flex_heading_10",
          "fix_but_flex_heading_11",
          "fix_but_flex_heading_12",
          "fix_but_flex_top_heading_13",
          "fix_but_flex_value_13",
          "fix_but_flex_value_14",
          "fix_but_flex_heading_16",
          "fix_but_flex_heading_17",
          "fix_but_flex_heading_18",
          "fix_but_flex_heading_24",
          "fix_but_flex_heading_25",
          "fair_market_value_heading",
        ];

        // Populate non-registration fields
        fieldsToPopulate.forEach((fieldName) => {
          if (report[fieldName] !== undefined && report[fieldName] !== null) {
            updated[fieldName] = report[fieldName];
          }
        });

        // Special handling for registration fields - check for "NOT AVAILABLE" or "NOT APPLICABLE"
        // IMPORTANT: When value is "NOT AVAILABLE" or "NOT APPLICABLE":
        // 1. Set the button state (so it appears selected in UI)
        // 2. Leave input field empty (so user sees empty input)
        // 3. The save/generate functions will check button state and add "NOT AVAILABLE" or "NOT APPLICABLE" to payload
        // BUT: If order has registration_number, use that instead of "NOT AVAILABLE" or empty
        if (
          report.registration_no !== undefined &&
          report.registration_no !== null
        ) {
          const upperValue = String(report.registration_no)
            .toUpperCase()
            .trim();
          if (upperValue === "NOT AVAILABLE") {
            // If order has registration_number, use it instead of "NOT AVAILABLE"
            if (
              order?.registration_number &&
              order.registration_number.trim() !== ""
            ) {
              setRegistrationNoOption(null);
              updated.registration_no = order.registration_number;
            } else {
              setRegistrationNoOption("NOT_AVAILABLE");
              updated.registration_no = ""; // Leave input empty - button state will be used in payload
            }
          } else if (upperValue === "NOT APPLICABLE") {
            // If order has registration_number, use it instead of "NOT APPLICABLE"
            if (
              order?.registration_number &&
              order.registration_number.trim() !== ""
            ) {
              setRegistrationNoOption(null);
              updated.registration_no = order.registration_number;
            } else {
              setRegistrationNoOption("NOT_APPLICABLE");
              updated.registration_no = ""; // Leave input empty - button state will be used in payload
            }
          } else {
            // Regular value from child category report
            // BUT: If order has registration_number, prioritize order's value over child category report
            if (
              order?.registration_number &&
              order.registration_number.trim() !== ""
            ) {
              // Order has registration_number - use it (priority to order)
              setRegistrationNoOption(null);
              updated.registration_no = order.registration_number;
            } else {
              // Order doesn't have registration_number - use child category report's value
              setRegistrationNoOption(null);
              updated.registration_no = report.registration_no;
            }
          }
        } else if (
          order?.registration_number &&
          order.registration_number.trim() !== ""
        ) {
          // If child category report doesn't have registration_no but order has it, use order's value
          setRegistrationNoOption(null);
          updated.registration_no = order.registration_number;
        }

        if (
          report.registration_date !== undefined &&
          report.registration_date !== null
        ) {
          const upperValue = String(report.registration_date)
            .toUpperCase()
            .trim();
          if (upperValue === "NOT AVAILABLE") {
            setRegistrationDateOption("NOT_AVAILABLE");
            updated.registration_date = ""; // Leave input empty - button state will be used in payload
          } else if (upperValue === "NOT APPLICABLE") {
            setRegistrationDateOption("NOT_APPLICABLE");
            updated.registration_date = ""; // Leave input empty - button state will be used in payload
          } else {
            // Regular value - clear button state and set input value
            setRegistrationDateOption(null);
            updated.registration_date = report.registration_date;
          }
        }

        if (
          report.registered_location !== undefined &&
          report.registered_location !== null
        ) {
          const upperValue = String(report.registered_location)
            .toUpperCase()
            .trim();
          if (upperValue === "NOT AVAILABLE") {
            setRegisteredLocationOption("NOT_AVAILABLE");
            updated.registered_location = ""; // Leave input empty - button state will be used in payload
          } else if (upperValue === "NOT APPLICABLE") {
            setRegisteredLocationOption("NOT_APPLICABLE");
            updated.registered_location = ""; // Leave input empty - button state will be used in payload
          } else {
            // Regular value - clear button state and set input value
            setRegisteredLocationOption(null);
            updated.registered_location = report.registered_location;
          }
        }

        return updated;
      });

      // Handle flexible fields from child category report
      // Only process COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION section
      // Prefill labels only, keep values blank
      if (Array.isArray(report.flexible_fields) && report.flexible_fields.length > 0) {
        // Get existing flexible fields to preserve other sections
        setFlexibleFields((prevFields) => {
          // Filter out existing COMMENTS section fields (if any)
          const otherFields = prevFields.filter(
            (field) => field.section_name !== "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION"
          );

          // Process only COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION section from child category report
          const apiFields = report.flexible_fields;
          const commentsFields = apiFields.filter(
            (f) => f.section_name === "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION"
          );

          if (commentsFields.length === 0) {
            // No COMMENTS fields in child category report, return existing fields
            return prevFields;
          }

          // Group by section and process
          const sectionToFields = commentsFields.reduce((acc, f) => {
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
                  field_label: first.field_label || "", // Prefill label
                  field_value: "", // Keep value blank
                  field_label_2: second?.field_label || "", // Prefill label
                  field_value_2: "", // Keep value blank
                  field_order: first.field_order || i + 1,
                });
                if (second) i++;
              } else {
                combined.push({
                  id: `${section}_${first.id || first.field_order || i}`,
                  section_name: section,
                  col_span: 1,
                  field_label: first.field_label || "", // Prefill label
                  field_value: "", // Keep value blank
                  field_order: first.field_order || i + 1,
                });
              }
            }
          });

          // Combine: other existing fields + new COMMENTS fields
          return [...otherFields, ...combined];
        });
      }

      // Check if RC API will be called - if not, remove loading now
      // RC API will only be called if registration number exists
      if (
        !order?.registration_number ||
        order.registration_number.trim() === ""
      ) {
        // No registration number - RC API won't be called, all API calls complete
        setIsInitialLoading(false);
      }
      // If registration number exists, RC API will be called and will remove loading
    }
  }, [currentReport, reportLoading, id, order]);

  // Handle case where child category API also returns no data
  useEffect(() => {
    if (
      !reportLoading &&
      reportFetchCompleted &&
      childCategoryFallbackAttemptedRef.current &&
      !currentReport?.report &&
      !childCategoryDataProcessedRef.current
    ) {
      // Child category API also returned no data
      childCategoryDataProcessedRef.current = true; // Mark as processed to prevent re-running
      // Check if RC API will be called - if not, remove loading now
      if (
        !order?.registration_number ||
        order.registration_number.trim() === ""
      ) {
        // No registration number, RC API won't be called - remove loading
        setIsInitialLoading(false);
      }
      // If registration number exists, RC API will be called and will remove loading
    }
  }, [reportLoading, reportFetchCompleted, currentReport, order]);

  // Prefill proposed_owner_name from order.customer_name_2 only when the
  // API/report didn't provide it (null/empty) after all loading is complete.
  // This prevents overwriting saved API values or user input.
  useEffect(() => {
    if (isInitialLoading) return;
    if (!reportFetchCompleted) return;

    const customerName2 = order?.customer_name_2;
    if (!customerName2 || String(customerName2).trim() === "") return;

    const currentValue = reportFormData.proposed_owner_name;
    if (currentValue && String(currentValue).trim() !== "") return;

    setReportFormData((prev) => ({
      ...prev,
      proposed_owner_name: customerName2,
    }));
  }, [
    isInitialLoading,
    reportFetchCompleted,
    order?.customer_name_2,
    reportFormData.proposed_owner_name,
  ]);

  // Capture a clean snapshot the first time initial loading finishes.
  // Any change after this point is considered "dirty".
  useEffect(() => {
    if (!isInitialLoading && initialFormDataRef.current === null) {
      initialFormDataRef.current = reportFormData;
      initialFlexibleFieldsRef.current = flexibleFields;
    }
  }, [isInitialLoading]); // intentionally only depends on isInitialLoading

  // Function to call external RC API and prefill form data
  const fetchRCDetailsFromExternalAPI = useCallback(
    async (registrationNumber) => {
      if (!registrationNumber || registrationNumber.trim() === "") {
        // No registration number - all API calls complete, remove loading
        setIsInitialLoading(false);
        return;
      }

      const apiToken = process.env.REACT_APP_ATTESTR_API_TOKEN;
      if (!apiToken) {
        // API token not found - all API calls complete, remove loading
        setIsInitialLoading(false);
        return;
      }

      // Set loading state to true when external API starts
      setExternalApiLoading(true);

      // Clean and format registration number: remove spaces, dashes, and convert to uppercase
      // Example: "GJ-03-BZ-0618" or "gj 03 bz 0618" → "GJ03BZ0618"
      const cleanedRegistrationNumber = registrationNumber
        .replace(/[\s\-]/g, "") // Remove spaces and dashes
        .toUpperCase(); // Convert to uppercase

      // Calling external RC API
      try {
        const response = await axios.post(
          "https://api.attestr.com/api/v2/public/checkx/rc",
          {
            reg: cleanedRegistrationNumber,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${apiToken}`,
            },
          }
        );

        if (response.data && response.data.valid) {
          const rcData = response.data;

          // Helper function to convert owner number to format (e.g., "1" -> "1ST OWNER")
          const formatOwnerNumber = (ownerNum) => {
            const num = parseInt(ownerNum);
            if (isNaN(num) || num < 1) return "";

            // Handle special cases: 11th, 12th, 13th use "TH"
            const lastDigit = num % 10;
            const lastTwoDigits = num % 100;

            let suffix = "TH";
            if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
              suffix = "TH";
            } else if (lastDigit === 1) {
              suffix = "ST";
            } else if (lastDigit === 2) {
              suffix = "ND";
            } else if (lastDigit === 3) {
              suffix = "RD";
            }

            return `${num}${suffix} OWNER`;
          };

          // Helper function to convert cylinders to format (e.g., "6" -> "6 (SIX)")
          const formatCylinders = (cylinders) => {
            const num = parseInt(cylinders);
            if (isNaN(num) || num < 1) return "";
            const words = [
              "",
              "ONE",
              "TWO",
              "THREE",
              "FOUR",
              "FIVE",
              "SIX",
              "SEVEN",
              "EIGHT",
              "NINE",
              "TEN",
            ];
            const word = num <= 10 ? words[num] : "";
            return word ? `${num} (${word})` : cylinders;
          };

          // Map API response to form fields
          setReportFormData((prev) => {
            const updated = { ...prev };

            // Basic vehicle information
            // Note: registration_no is from user input (not in API response), so we keep the existing value
            if (rcData.registered)
              updated.registration_date = rcData.registered;
            if (rcData.rto) updated.registered_location = rcData.rto;

            // Owner information
            if (rcData.owner) updated.registered_owner_name = rcData.owner;
            if (rcData.currentAddress)
              updated.registered_owner_address = rcData.currentAddress;
            if (rcData.permanentAddress)
              updated.proposed_owner_address = rcData.permanentAddress;

            // Vehicle details
            if (rcData.chassisNumber)
              updated.crane_chassis_no = rcData.chassisNumber;
            if (rcData.engineNumber)
              updated.engine_no_detail = rcData.engineNumber;
            if (rcData.makerModel) {
              updated.model = rcData.makerModel;
              updated.asset_classification = rcData.makerModel;
            }
            if (rcData.bodyType) updated.body_type = rcData.bodyType;
            if (rcData.fuelType) updated.crane_model_code = rcData.fuelType; // Fuel Type field in CE

            // Manufacturing details
            if (rcData.manufactured) {
              // Convert "11/2024" to "2024" or keep as is
              const manufacturedDate = rcData.manufactured.split("/");
              if (manufacturedDate.length > 1) {
                updated.manufacture_year = manufacturedDate[1];
              } else {
                updated.manufacture_year = rcData.manufactured;
              }
            }

            // Technical specifications
            if (rcData.cylinders) {
              updated.no_of_cylinder = formatCylinders(rcData.cylinders);
            }

            // Owner serial number mapping (ownerNumber -> owner_serial_no)
            if (rcData.ownerNumber) {
              updated.owner_serial_no = formatOwnerNumber(rcData.ownerNumber);
            }

            // RC, Permit, Tax, Fitness & Insurance details
            if (rcData.fitnessUpto) updated.fitness_upto = rcData.fitnessUpto;
            if (rcData.taxUpto) updated.tax_upto = rcData.taxUpto;

            // Insurance details mapping
            if (rcData.insuranceProvider) {
              updated.insurance_co_name = rcData.insuranceProvider;
            }
            if (rcData.insurancePolicyNumber) {
              updated.policy_no = rcData.insurancePolicyNumber;
            }
            if (rcData.insuranceUpto) {
              updated.insurance_valid_date = rcData.insuranceUpto;
            }

            return updated;
          });

          // Set flag to trigger auto-save after state is updated
          shouldAutoSaveAfterApiRef.current = true;

          // Set external API loading to false after data is prefilled (with small delay to ensure state update)
          setTimeout(() => {
            setExternalApiLoading(false);
            // All API calls are now complete - remove initial loading
            setIsInitialLoading(false);
          }, 500);
        } else {
          // Invalid RC response
          toast.warning("RC details could not be fetched or RC is invalid");
          setExternalApiLoading(false);
          // All API calls are now complete - remove initial loading
          setIsInitialLoading(false);
        }
      } catch (error) {
        // Error calling external API
        if (error.response) {
          toast.error(
            "Failed to fetch RC details. Please check the registration number."
          );
        } else {
          toast.error("Failed to fetch RC details. Please try again later.");
        }
        setExternalApiLoading(false);
        // All API calls are now complete - remove initial loading
        setIsInitialLoading(false);
      }
    },
    []
  );

  // Call external RC API after fetchOrderReportByChildCategory completes (whether it has data or not)
  useEffect(() => {
    // Only call RC API if:
    // 1. Child category fallback was attempted (fetchOrderReportByChildCategory was called)
    // 2. Report loading is complete
    // 3. RC API hasn't been called yet
    // 4. Registration number exists in order
    if (
      childCategoryFallbackAttemptedRef.current && // Child category API was called
      !reportLoading && // Report loading is complete
      !externalApiCalledRef.current && // RC API hasn't been called yet
      order?.registration_number && // Registration number exists
      order.registration_number.trim() !== "" // Registration number is not empty
    ) {
      externalApiCalledRef.current = true; // Mark as called to prevent multiple calls
      fetchRCDetailsFromExternalAPI(order.registration_number);
    }
  }, [
    reportLoading,
    order?.registration_number,
    fetchRCDetailsFromExternalAPI,
  ]);

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/" className="text-blue-600 hover:underline">
          Orders
        </Link>{" "}
        &gt;{" "}
        <Link
          to={`/orders/${id}/details`}
          className="text-blue-600 hover:underline"
        >
          {order && order.order_number ? order.order_number : "-"}
        </Link>{" "}
        &gt; CE Report
      </>
    );
  }, [id, order, setTitle]);

  // Auto-update all heading fields when category_suffix or valuation_purpose (Repo Purpose) changes
  // BUT don't update valueation_report_for_heading if it has custom text (not matching pattern)
  useEffect(() => {
    const categorySuffix = reportFormData.category_suffix || "";
    const categorySuffixUpper = categorySuffix
      ? categorySuffix.toUpperCase().trim()
      : "";
    const isRepo = isRepoPurpose(reportFormData.valuation_purpose);

    setReportFormData((prev) => {
      // Skip if neither category_suffix nor repo-ness (from valuation_purpose) changed
      const prevIsRepo = isRepoPurpose(prev.valuation_purpose);
      if (prev.category_suffix === categorySuffix && prevIsRepo === isRepo) {
        return prev;
      }

      const updated = { ...prev };

      // Only auto-update valueation_report_for_heading if:
      // 1. It's empty (no data saved), OR
      // 2. It matches the auto-generated pattern (was auto-generated, not manually edited)
      const shouldUpdateValuationHeading = 
        !prev.valueation_report_for_heading ||
        prev.valueation_report_for_heading.trim() === "" ||
        isAutoGeneratedHeading(prev.valueation_report_for_heading, prev.category_suffix || "");

      if (shouldUpdateValuationHeading) {
        updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepo);
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
      updated.rc_permit_tax_fitness_insurance_heading = categorySuffixUpper
        ? `RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS OF ${categorySuffixUpper}`
        : "";
      updated.overall_feedback_heading = categorySuffixUpper
        ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
        : "";

      return updated;
    });
  }, [reportFormData.category_suffix, reportFormData.valuation_purpose, isAutoGeneratedHeading, buildValuationReportHeading]);

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
    } else if (fieldName === "registered_location") {
      setRegisteredLocationOption(option);
      setReportFormData((prev) => ({
        ...prev,
        registered_location: "", // Clear input when button is selected
      }));
    }
  }, []);

  // Handle form input changes
  const handleFormChange = useCallback(
    (e) => {
      if (initialFormDataRef.current !== null) isDirtyRef.current = true;
      const { name } = e.target;

      // Normalize WysiwygTextarea "empty" value: it can send "<br>" when visually blank
      let value = e.target.value;
      if (typeof value === "string" && value.trim() === "<br>") {
        value = "";
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
      } else if (name === "registered_location" && value) {
        setRegisteredLocationOption(null);
      }

      setReportFormData((prev) => {
        let updated = {
          ...prev,
          [name]: value,
        };

        // If valueation_report_for_heading changes, it's completely standalone - don't affect any other fields
        if (name === "valueation_report_for_heading") {
          // Just update this field, nothing else - completely independent
          return updated;
        }

        // If valuation_purpose changes to/from "Repo Purpose", add/remove (REPOSSESSION) in heading
        if (name === "valuation_purpose") {
          const isRepo = isRepoPurpose(value);
          const categorySuffixUpper = (prev.category_suffix || "").toUpperCase().trim();
          const shouldUpdateValuationHeading =
            !prev.valueation_report_for_heading ||
            prev.valueation_report_for_heading.trim() === "" ||
            isAutoGeneratedHeading(prev.valueation_report_for_heading, prev.category_suffix || "");
          if (shouldUpdateValuationHeading && categorySuffixUpper) {
            updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepo);
          } else {
            let newHeading = prev.valueation_report_for_heading || "";
            if (isRepo) {
              if (newHeading.includes("VALUATION REPORT FOR ") && !newHeading.includes("(REPOSSESSION)")) {
                newHeading = newHeading.replace("VALUATION REPORT FOR ", "VALUATION REPORT (REPOSSESSION) FOR ");
              }
            } else {
              newHeading = newHeading.replace("VALUATION REPORT (REPOSSESSION) FOR ", "VALUATION REPORT FOR ");
            }
            updated.valueation_report_for_heading = newHeading;
          }
        }

        // If category_suffix changes, update all heading fields automatically
        // BUT don't update valueation_report_for_heading if it has custom text (not matching pattern)
        if (name === "category_suffix") {
          const categorySuffixUpper = value ? value.toUpperCase().trim() : "";
          const isRepo = isRepoPurpose(prev.valuation_purpose);

          // Only auto-update valueation_report_for_heading if:
          // 1. It's empty (no data saved), OR
          // 2. It matches the auto-generated pattern (was auto-generated, not manually edited)
          const shouldUpdateValuationHeading = 
            !prev.valueation_report_for_heading ||
            prev.valueation_report_for_heading.trim() === "" ||
            isAutoGeneratedHeading(prev.valueation_report_for_heading, prev.category_suffix || "");

          if (shouldUpdateValuationHeading) {
            updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepo);
          }
          updated.general_details_heading = categorySuffixUpper
            ? `GENERAL DETAILS OF THE INSPECTED ${categorySuffixUpper}`
            : "";
          updated.inspected_equipment_heading = categorySuffixUpper
            ? `INSPECTED EQUIPMENT DETAILS OF ${categorySuffixUpper}`
            : "";
          updated.comments_on_equipment_heading = categorySuffixUpper
            ? `COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${categorySuffixUpper}`
            : "";
          updated.rc_permit_tax_fitness_insurance_heading = categorySuffixUpper
            ? `RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS OF ${categorySuffixUpper}`
            : "";
          updated.overall_feedback_heading = categorySuffixUpper
            ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
            : "";
        }

        // Handle currency formatting for currency fields
        if (
          name === "fair_market_value" ||
          name === "invoice_cost" ||
          name === "insured_value" ||
          name === "depreciation_value" ||
          name === "appraiser_value"
        ) {
          updated[name] = handleCurrencyFormatting(value);
        }

        // Auto-calculate depreciation_value when invoice_cost or depreciation changes
        if (name === "invoice_cost" || name === "depreciation") {
          const invoiceCost = parseCurrency(
            name === "invoice_cost" ? value : updated.invoice_cost
          );
          const depreciationRate = parseFloat(
            name === "depreciation" ? value : updated.depreciation
          );

          if (invoiceCost > 0 && depreciationRate >= 0) {
            const depreciationAmount = (invoiceCost * depreciationRate) / 100;
            const depreciationValue = invoiceCost - depreciationAmount;
            updated.depreciation_value = handleCurrencyFormatting(
              depreciationValue.toString()
            );
          } else {
            updated.depreciation_value = "";
          }
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
      numberToWords,
      convertNumberToWordsIndian,
      isAutoGeneratedHeading,
      buildValuationReportHeading,
    ]
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

        return updated;
      });
    },
    [getLicenseNumber]
  );

  const handleFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setChassisImpressionFile(file);
  }, []);

  const resolveChassisImageUrl = useCallback((value) => {
    if (!value || typeof value !== "string") return "";

    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && parsed.path) {
        const cleanPath = parsed.path.startsWith("/")
          ? parsed.path
          : `/${parsed.path}`;
        return `${baseUrl}${cleanPath}`;
      }
    } catch (err) {
      // Ignore parsing errors
    }

    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("data:")
    ) {
      return value;
    }

    const cleanPath = value.startsWith("/") ? value : `/${value}`;
    return `${baseUrl}${cleanPath}`;
  }, []);

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
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    chassisImpressionFile,
    reportFormData?.chassis_no_pencil_impression,
    resolveChassisImageUrl,
  ]);

  // Handle date input formatting (DD-MM-YYYY)
  const handleDateChange = useCallback((e) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    const { name, value } = e.target;

    // Clear button selection when user types in registration_date
    if (name === "registration_date" && value) {
      setRegistrationDateOption(null);
    }

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

  // Handle flexible field changes
  const handleFlexibleFieldChange = useCallback((fieldId, fieldType, value) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    setFlexibleFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, [fieldType]: value } : field
      )
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
    [flexibleFields]
  );

  // Remove flexible field
  const removeFlexibleField = useCallback((fieldId) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    setFlexibleFields((prev) => prev.filter((field) => field.id !== fieldId));
  }, []);

  // Validate flexible fields
  // isForGenerate: true for Generate API (strict validation), false for Save API (allow blank values for COMMENTS section)
  const validateFlexibleFields = useCallback((isForGenerate = true) => {
    const errors = [];

    flexibleFields.forEach((field, index) => {
      const isCommentsSection = field.section_name === "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION";
      
      // Label is always required
      if (!field.field_label.trim()) {
        errors.push(
          `Flexible field ${index + 1}: Label is required`
        );
      }

      // Value validation:
      // - For Generate API: Always required (including COMMENTS section)
      // - For Save API: Required for all sections EXCEPT COMMENTS section
      if (isForGenerate || !isCommentsSection) {
        if (!field.field_value.trim()) {
          errors.push(
            `Flexible field ${index + 1}: Value is required`
          );
        }
      }

      // For Add Two fields, validate second set
      if (field.col_span === 2) {
        // Second label is always required
        if (!field.field_label_2?.trim()) {
          errors.push(
            `Flexible field ${index + 1}: Second Label is required`
          );
        }

        // Second value validation:
        // - For Generate API: Always required (including COMMENTS section)
        // - For Save API: Required for all sections EXCEPT COMMENTS section
        if (isForGenerate || !isCommentsSection) {
          if (!field.field_value_2?.trim()) {
            errors.push(
              `Flexible field ${index + 1}: Second Value is required`
            );
          }
        }
      }
    });

    return errors;
  }, [flexibleFields]);

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
            `<!doctype html><html><head><meta charset="utf-8"><title>Preparing report…</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}.box{text-align:center}.spinner{width:44px;height:44px;border: 4px solid rgba(88, 100, 189, 0.2);border-top-color: #5864bd;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}small{opacity:.75}</style></head><body><div class="box"><div class="spinner"></div><div>Preparing your Report...</div><small>This tab will update automatically. So don't close the tab.</small></div></body></html>`
          );
          doc.close();
        } catch (err) {
          // If writing fails, ignore and proceed
        }
      }

      // Validate registration fields - must have either input value or button selected
      const registrationErrors = [];
      if (!reportFormData.registration_no && !registrationNoOption) {
        registrationErrors.push(
          "Registration No is required. Please enter a value or select an option."
        );
      }
      if (!reportFormData.registration_date && !registrationDateOption) {
        registrationErrors.push(
          "Registration Date is required. Please enter a value or select an option."
        );
      }
      if (!reportFormData.registered_location && !registeredLocationOption) {
        registrationErrors.push(
          "Registered Location is required. Please enter a value or select an option."
        );
      }
      if (registrationErrors.length > 0) {
        registrationErrors.forEach((error) => toast.error(error));
        if (preOpenedTab && !preOpenedTab.closed) {
          preOpenedTab.close();
        }
        return;
      }

      // Validate flexible fields (strict validation for Generate API)
      const validationErrors = validateFlexibleFields(true);
      if (validationErrors.length > 0) {
        validationErrors.forEach((error) => toast.error(error));
        // Close the preOpenedTab if validation fails
        if (preOpenedTab && !preOpenedTab.closed) {
          preOpenedTab.close();
        }
        return;
      }

      // Compute and validate amount_in_words centrally based on fair_market_value
      const fmvRaw = reportFormData.fair_market_value;
      const fmvAmount = parseCurrency(fmvRaw);
      const computedAmountInWords = fmvRaw
        ? convertNumberToWordsIndian(fmvAmount)
        : "";

      // If FMV is present but amount_in_words couldn't be computed, block submit
      if (fmvRaw && !computedAmountInWords) {
        toast.error(
          "Amount in words missing. Please enter a valid Fair Market Value."
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

      // Ensure amount_in_words is present in payload when FMV exists
      if (fmvRaw) {
        formData.set("amount_in_words", computedAmountInWords);
      }

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

        // Skip amount_in_words - handled separately above
        if (key === "amount_in_words") {
          return;
        }

        // Skip invoice_no_date - will be added separately with fresh computed value
        if (key === "invoice_no_date") {
          return;
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

        if (key === "registered_location") {
          if (registeredLocationOption === "NOT_AVAILABLE") {
            value = "NOT AVAILABLE";
          } else if (registeredLocationOption === "NOT_APPLICABLE") {
            value = "NOT APPLICABLE";
          }
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
      formData.set("report_date_heading", reportFormData.report_date_heading || "Report Date");

      // Add invoice_no_date (combined from invoice_no and invoice_date) - always include with fresh computed value
      formData.append("invoice_no_date", combinedInvoiceData || "");

      // Add chassis impression file if selected
      if (chassisImpressionFile) {
        formData.append("chassis_no_pencil_impression", chassisImpressionFile);
      }

      // Add flexible fields to FormData with proper sequential ordering
      let formDataIndex = 0;
      flexibleFields.forEach((field) => {
        // Add first field (or only field for Add One)
        formData.append(
          `flexible_fields[${formDataIndex}][section_name]`,
          field.section_name
        );
        formData.append(
          `flexible_fields[${formDataIndex}][col_span]`,
          field.col_span
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_label]`,
          field.field_label
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_value]`,
          String(field.field_value || "") // Preserve all formatting including line breaks
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_order]`,
          field.field_order
        );
        formDataIndex++;

        // Add second field for "Add Two" functionality
        if (field.col_span === 2 && field.field_label_2 !== undefined) {
          formData.append(
            `flexible_fields[${formDataIndex}][section_name]`,
            field.section_name
          );
          formData.append(
            `flexible_fields[${formDataIndex}][col_span]`,
            field.col_span
          );
          formData.append(
            `flexible_fields[${formDataIndex}][field_label]`,
            field.field_label_2
          );
          formData.append(
            `flexible_fields[${formDataIndex}][field_value]`,
            String(field.field_value_2 || "") // Preserve all formatting including line breaks
          );
          formData.append(
            `flexible_fields[${formDataIndex}][field_order]`,
            field.field_order + 1 // Sequential order for second field
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
        })
      ).then((result) => {
        if (result.meta.requestStatus === "fulfilled") {
          // Open PDF in the pre-opened tab
          const downloadUrl = result.payload.data.download_url;
          const baseUrl =
            process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
          const fullUrl = `${baseUrl}${downloadUrl}`;
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
      chassisImpressionFile,
      dispatch,
      id,
      order,
      getRefNoCode,
      parseCurrency,
      convertNumberToWordsIndian,
      numberToWords,
      registrationNoOption,
      registrationDateOption,
      registeredLocationOption,
      reportTypeSelection,
      canEditRefNoId,
    ]
  );

  // Handle save report data
  // Builds FormData payload for the Save API.
  // Used by both handleSaveReport and the navigation blocker.
  const buildSavePayload = useCallback(() => {
    const fmvRaw = reportFormData.fair_market_value;
    const fmvAmount = parseCurrency(fmvRaw);
    const computedAmountInWords = fmvRaw ? convertNumberToWordsIndian(fmvAmount) : "";

    const reportData = {};

    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      if (key === "amount_in_words") {
        reportData[key] = computedAmountInWords || null;
        return;
      }
      if (key === "invoice_no_date") return;

      if (key === "registration_no") {
        if (registrationNoOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registrationNoOption === "NOT_APPLICABLE") value = "NOT APPLICABLE";
      }
      if (key === "registration_date") {
        if (registrationDateOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registrationDateOption === "NOT_APPLICABLE") value = "NOT APPLICABLE";
      }
      if (key === "registered_location") {
        if (registeredLocationOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registeredLocationOption === "NOT_APPLICABLE") value = "NOT APPLICABLE";
      }

      reportData[key] =
        value !== null && value !== undefined && value !== ""
          ? String(value)
          : null;
    });

    reportData.report_date_heading =
      reportFormData.report_date_heading || "Report Date";

    const invoiceNo = reportFormData.invoice_no || "";
    const invoiceDate = reportFormData.invoice_date || "";
    let combinedInvoiceData = "";
    if (invoiceNo && invoiceDate) combinedInvoiceData = `${invoiceNo} Dated ${invoiceDate}`;
    else if (invoiceNo) combinedInvoiceData = invoiceNo;
    else if (invoiceDate) combinedInvoiceData = `Dated ${invoiceDate}`;
    reportData.invoice_no_date = combinedInvoiceData || null;

    let formDataIndex = 0;
    flexibleFields.forEach((field) => {
      if (field.field_value && field.field_value.trim() !== "") {
        reportData[`flexible_fields[${formDataIndex}][section_name]`] = field.section_name;
        reportData[`flexible_fields[${formDataIndex}][col_span]`] = field.col_span;
        reportData[`flexible_fields[${formDataIndex}][field_label]`] = field.field_label;
        reportData[`flexible_fields[${formDataIndex}][field_value]`] = String(field.field_value || "");
        reportData[`flexible_fields[${formDataIndex}][field_order]`] = field.field_order;
        formDataIndex++;

        if (
          field.col_span === 2 &&
          field.field_label_2 !== undefined &&
          field.field_value_2 &&
          field.field_value_2.trim() !== ""
        ) {
          reportData[`flexible_fields[${formDataIndex}][section_name]`] = field.section_name;
          reportData[`flexible_fields[${formDataIndex}][col_span]`] = field.col_span;
          reportData[`flexible_fields[${formDataIndex}][field_label]`] = field.field_label_2;
          reportData[`flexible_fields[${formDataIndex}][field_value]`] = String(field.field_value_2 || "");
          reportData[`flexible_fields[${formDataIndex}][field_order]`] = field.field_order + 1;
          formDataIndex++;
        }
      }
    });

    if (chassisImpressionFile) {
      reportData["chassis_no_pencil_impression"] = chassisImpressionFile;
    }

    const formData = new FormData();
    Object.entries(reportData).forEach(([key, value]) => {
      if (value instanceof File || value instanceof Blob) formData.append(key, value);
      else if (value === null) formData.append(key, "");
      else if (value !== undefined) formData.append(key, value);
    });

    return formData;
  }, [
    reportFormData,
    flexibleFields,
    chassisImpressionFile,
    parseCurrency,
    convertNumberToWordsIndian,
    registrationNoOption,
    registrationDateOption,
    registeredLocationOption,
  ]);

  const handleSaveReport = useCallback(() => {
    // Validate registration fields - must have either input value or button selected
    const registrationErrors = [];
    if (!reportFormData.registration_no && !registrationNoOption) {
      registrationErrors.push(
        "Registration No is required. Please enter a value or select an option."
      );
    }
    if (!reportFormData.registration_date && !registrationDateOption) {
      registrationErrors.push(
        "Registration Date is required. Please enter a value or select an option."
      );
    }
    if (!reportFormData.registered_location && !registeredLocationOption) {
      registrationErrors.push(
        "Registered Location is required. Please enter a value or select an option."
      );
    }
    if (registrationErrors.length > 0) {
      registrationErrors.forEach((error) => toast.error(error));
      return;
    }

    // Validate flexible fields (allow blank values for COMMENTS section in Save API)
    const validationErrors = validateFlexibleFields(false);
    if (validationErrors.length > 0) {
      toast.error("Please fix validation errors before saving");
      return;
    }

    // Compute and validate amount_in_words centrally based on fair_market_value
    const fmvRaw = reportFormData.fair_market_value;
    const fmvAmount = parseCurrency(fmvRaw);
    const computedAmountInWords = fmvRaw
      ? convertNumberToWordsIndian(fmvAmount)
      : "";

    // If FMV is present but amount_in_words couldn't be computed, block save
    if (fmvRaw && !computedAmountInWords) {
      toast.error(
        "Amount in words missing. Please enter a valid Fair Market Value."
      );
      return;
    }

    // Create report data object with only non-empty fields
    const reportData = {};

    // Add all form fields to reportData - simple logic: if value exists send it, if null/empty send null
    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      // Handle amount_in_words - use computed value
      if (key === "amount_in_words") {
        reportData[key] = computedAmountInWords || null;
        return;
      }

// Skip invoice_no_date - will be added separately with fresh computed value
      if (key === "invoice_no_date") {
        return;
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

      if (key === "registered_location") {
        if (registeredLocationOption === "NOT_AVAILABLE") {
          value = "NOT AVAILABLE";
        } else if (registeredLocationOption === "NOT_APPLICABLE") {
          value = "NOT APPLICABLE";
        }
      }

      // Simple logic: if value exists, send it; if null/empty, send null
      // Note: Textarea values (with line breaks, spaces, formatting) are preserved as-is
      if (value !== null && value !== undefined && value !== "") {
        reportData[key] = String(value); // Preserve all formatting including line breaks
      } else {
        reportData[key] = null; // Send null for empty values
      }
    });

    // Always include report_date_heading in payload (even if user did not change it - use preselected default)
    reportData.report_date_heading = reportFormData.report_date_heading || "Report Date";

    // Add invoice_no_date (combined from invoice_no and invoice_date) - always include with fresh computed value
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
    reportData.invoice_no_date = combinedInvoiceData || null;

    // Add flexible fields in the same format as report generation
    let formDataIndex = 0;
    flexibleFields.forEach((field) => {
      // Only include fields with actual values
      if (field.field_value && field.field_value.trim() !== "") {
        reportData[`flexible_fields[${formDataIndex}][section_name]`] =
          field.section_name;
        reportData[`flexible_fields[${formDataIndex}][col_span]`] =
          field.col_span;
        reportData[`flexible_fields[${formDataIndex}][field_label]`] =
          field.field_label;
        reportData[`flexible_fields[${formDataIndex}][field_value]`] = String(
          field.field_value || ""
        ); // Preserve all formatting including line breaks
        reportData[`flexible_fields[${formDataIndex}][field_order]`] =
          field.field_order;
        formDataIndex++;

        // Add second field for "Add Two" functionality
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
            field.field_value_2 || ""
          ); // Preserve all formatting including line breaks
          reportData[`flexible_fields[${formDataIndex}][field_order]`] =
            field.field_order + 1;
          formDataIndex++;
        }
      }
    });

    // Add chassis impression file if available (as base64 or file path)
    if (chassisImpressionFile) {
      reportData["chassis_no_pencil_impression"] = chassisImpressionFile;
    }

    // Only proceed if there's actual data to save
    if (Object.keys(reportData).length === 0) {
      toast.warning(
        "No data to save. Please fill in some fields before saving."
      );
      return;
    }

    /* console.log("📤 CEReport - Sending to backend - reportData:", reportData);
    console.log(
      "📤 CEReport - amount_in_words in payload:",
      reportData.amount_in_words
    ); */

    // Debug log for payload
    /* console.log("🔍 CEReport Save - Final reportData:", reportData);
    console.log(
      "🔍 CEReport Save - amount_in_words in payload:",
      reportData.amount_in_words
    );
    console.log(
      "🔍 CEReport Save - fair_market_value:",
      reportFormData.fair_market_value
    ); */

    // Convert reportData object to FormData for multipart submission
    const formData = new FormData();
    Object.entries(reportData).forEach(([key, value]) => {
      if (value instanceof File || value instanceof Blob) {
        formData.append(key, value);
      } else if (value === null) {
        // Explicitly send null values for cleared fields (as empty string for FormData)
        formData.append(key, "");
      } else if (value !== undefined) {
        formData.append(key, value);
      }
    });

    // Don't clear clearedFieldsRef after save - user might generate report next
    // It will be cleared when component unmounts or order changes (handled in useEffect)

    // Dispatch save action with FormData payload
    dispatch(
      saveOrderReport({
        orderId: id,
        reportData: formData,
      })
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
    order,
    parseCurrency,
    convertNumberToWordsIndian,
    numberToWords,
    canEditRefNoId,
    registrationNoOption,
    registrationDateOption,
    registeredLocationOption,
  ]);

  // In-app navigation blocker — works with BrowserRouter (no data router needed).
  // Intercepts pushState (Link clicks) and popstate (browser back/forward).
  // Saves silently then navigates. 100% reliable for in-app navigation.
  // Navigation Blocker - Shows confirmation dialog for unsaved changes
  useEffect(() => {
    if (!id) return;

    // Push a dummy state immediately so we can intercept back button
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
          const formData = buildSavePayload();
          const result = await dispatch(
            saveOrderReport({ orderId: id, reportData: formData })
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
              pendingNavRef.current.url
            );
            // Dispatch a popstate so React Router picks up the URL change
            window.dispatchEvent(new PopStateEvent("popstate", { state: pendingNavRef.current.state }));
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
        alert("You have unsaved changes. Please save or discard changes before navigating.");
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener("popstate", handlePopState);
    };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, buildSavePayload, dispatch]);

  // Shows browser's native "Leave site?" dialog when user tries to refresh,
  // close the tab, or navigate away from the site entirely.
  // This is warning-only — saving before hard unload is not possible in browsers.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Auto-save after external API prefills data
  useEffect(() => {
    // Only trigger if flag is set and we have some form data (indicating state was updated)
    if (
      shouldAutoSaveAfterApiRef.current &&
      reportFormData &&
      Object.keys(reportFormData).length > 0
    ) {
      // Check if we have some of the key fields that would be set by the API
      const hasApiData =
        reportFormData.crane_chassis_no ||
        reportFormData.engine_no_detail ||
        reportFormData.registered_owner_name ||
        reportFormData.no_of_cylinder ||
        reportFormData.owner_serial_no;

      if (hasApiData) {
        shouldAutoSaveAfterApiRef.current = false; // Reset flag to prevent multiple saves
        // Use a small timeout to ensure all state updates are batched
        setTimeout(() => {
          handleSaveReport();
        }, 100);
      }
    }
  }, [reportFormData, handleSaveReport]);

  // Render flexible fields for a section
  const renderFlexibleFields = useCallback(
    (sectionName) => {
      const sectionFields = flexibleFields.filter(
        (field) => field.section_name === sectionName
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
    [flexibleFields, handleFlexibleFieldChange, removeFlexibleField]
  );

  // Render flexible fields with textarea for specific section
  const renderFlexibleFieldsWithTextarea = useCallback(
    (sectionName) => {
      const sectionFields = flexibleFields.filter(
        (field) => field.section_name === sectionName
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
                        e.target.value
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
    [flexibleFields, handleFlexibleFieldChange, removeFlexibleField]
  );

  // Memoized values for expensive calculations
  const currentDate = useMemo(() => getCurrentDate(), [getCurrentDate]);
  const amountInWords = useMemo(() => {
    const value = reportFormData.fair_market_value;
    const amount = parseCurrency(value);
    return amount > 0 ? convertNumberToWordsIndian(amount) : "";
  }, [
    reportFormData.fair_market_value,
    parseCurrency,
    convertNumberToWordsIndian,
  ]);

  const tyreCountInWords = useMemo(() => {
    const count = parseInt(reportFormData.tyre_count) || 0;
    return count > 0 ? numberToWords(count) : "";
  }, [reportFormData.tyre_count, numberToWords]);

  const totalTyres = useMemo(() => {
    const front = parseInt(reportFormData.front_tyre_no) || 0;
    const middle = parseInt(reportFormData.middle_tyre_no) || 0;
    const rear = parseInt(reportFormData.rear_tyre_no) || 0;
    const total = front + middle + rear;
    const word = numberToWords(total);
    return `${total} (${word})`;
  }, [
    reportFormData.front_tyre_no,
    reportFormData.middle_tyre_no,
    reportFormData.rear_tyre_no,
    numberToWords,
  ]);

  return (
    <section className="order-details-wrapper">
      <div className="row">
        {/* Reference Number Form Section */}
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div
            className="order-report-container"
            style={{ position: "relative" }}
          >
            {/* Loading Overlay */}
            {isInitialLoading && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                  borderRadius: "4px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    className="spinner-border text-primary"
                    role="status"
                    style={{ width: "3rem", height: "3rem" }}
                  >
                    <span className="sr-only">Loading...</span>
                  </div>
                  <p
                    style={{
                      marginTop: "1rem",
                      fontSize: "1.1rem",
                      color: "#5864bd",
                    }}
                  >
                    Loading report data...
                  </p>
                </div>
              </div>
            )}
            <div className="d-flex justify-content-between align-items-center">
              <h2>CE Report</h2>
              <div className="d-flex align-items-center gap-2">
                <Link
                  to={`/orders/${id}/details/documents`}
                  className="btn btn-primary"
                >
                  View Documents
                </Link>
                <Link
                  to={`/orders/${id}/details/images`}
                  className="btn btn-primary"
                >
                  View Images
                </Link>
              </div>
            </div>
            <form onSubmit={handleReportSubmit} className="body-form-box">
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
                      This field controls all heading fields below. Enter the
                      category information in the format: (category_name) /
                      (sub_category_name) (child_category_name)
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
                      value={reportFormData.valueation_report_for_heading || ""}
                      onChange={handleFormChange}
                      placeholder="Auto-generated from Category Suffix (editable)"
                    />
                  </div>
                </div>
                <div className="col-12">
                  <div className="form-group">
                    <label htmlFor="general_details_heading">
                      General Details Heading
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="general_details_heading"
                      name="general_details_heading"
                      value={reportFormData.general_details_heading || ""}
                      readOnly
                      placeholder="Auto-generated from Category Suffix"
                    />
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
                        onChange={canEditRefNoId ? handleFormChange : undefined}
                        readOnly={!canEditRefNoId}
                        placeholder="Enter ID"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="report_date_heading">
                      Rev-Report Date <span className="text-danger">*</span>
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
                          "Rev-Report Date"
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
                    <label htmlFor="rev_report_date">&nbsp;</label>
                    <div className="d-flex gap-2 align-items-center">
                      <div style={{ width: "80px", flexShrink: 0 }}>
                        Value:
                      </div>
                      <input
                        type="text"
                        className="form-field flex-grow-1"
                        id="rev_report_date"
                        name="rev_report_date"
                        value={reportFormData.rev_report_date}
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
                      SLA NO <span class="text-danger">*</span>
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
                    <input
                      type="text"
                      className="form-field"
                      id="valuation_purpose"
                      name="valuation_purpose"
                      value={reportFormData.valuation_purpose}
                      readOnly
                      placeholder="Fixed purpose"
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
                      Date of Inspection <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="date_of_inspection"
                      name="date_of_inspection"
                      value={reportFormData.date_of_inspection}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                      required
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

              {/* General Details Section - heading already added at top */}

              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="registered_owner_name">
                      Registered Owner Name <span class="text-danger">*</span>
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
                      Proposed Owner Address <span class="text-danger">*</span>
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
                      value={reportFormData.inspected_equipment_heading || ""}
                      readOnly
                      placeholder="Auto-generated from Category Suffix"
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="registration_no">
                      Registration No <span class="text-danger">*</span>
                    </label>
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
                            "NOT_AVAILABLE"
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
                            "NOT_APPLICABLE"
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
                      Registration Date <span class="text-danger">*</span>
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
                            "NOT_AVAILABLE"
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
                            "NOT_APPLICABLE"
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
                    <label htmlFor="registered_location">
                      Registered Location <span class="text-danger">*</span>
                    </label>
                    <div className="d-flex gap-2 align-items-center">
                      <input
                        type="text"
                        className="form-field flex-grow-1"
                        id="registered_location"
                        name="registered_location"
                        value={reportFormData.registered_location}
                        onChange={handleFormChange}
                        style={{ marginBottom: 0 }}
                      />
                      <button
                        type="button"
                        className={`form-field registration-option-btn ${
                          registeredLocationOption === "NOT_AVAILABLE"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          handleRegistrationOption(
                            "registered_location",
                            "NOT_AVAILABLE"
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
                          registeredLocationOption === "NOT_APPLICABLE"
                            ? "active"
                            : ""
                        }`}
                        onClick={() =>
                          handleRegistrationOption(
                            "registered_location",
                            "NOT_APPLICABLE"
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
              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="owner_serial_no">
                      Owner Serial No <span class="text-danger">*</span>
                    </label>
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
                      ]}
                      value={reportFormData.owner_serial_no}
                      onChange={(value) =>
                        handleSelectChange("owner_serial_no", value)
                      }
                      required
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
                    <label htmlFor="supplier_names">
                      Supplier Name
                    </label>
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
                      Asset Make <span class="text-danger">*</span>
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
                              value || "OTHERS"
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
                    <label htmlFor="engine_no_detail">
                      Engine No./ Detail <span class="text-danger">*</span>
                    </label>
                    <div className="d-flex gap-2 align-items-center mb-2 drop-down-w-100">
                      <div style={{ width: "100px", flexShrink: 0 }}>
                        Heading:
                      </div>
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Engine No./ Details",
                            label: "Engine No./ Details",
                          },
                          {
                            value: "Motor No./Details",
                            label: "Motor No./Details",
                          },
                        ]}
                        value={
                          reportFormData.engine_no_heading ||
                          "Engine No./ Details"
                        }
                        onChange={(value) =>
                          handleSelectChange("engine_no_heading", value)
                        }
                      />
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      <div style={{ width: "100px", flexShrink: 0 }}>
                        Value:
                      </div>
                      <input
                        type="text"
                        className="form-field flex-grow-1"
                        id="engine_no_detail"
                        name="engine_no_detail"
                        value={reportFormData.engine_no_detail}
                        onChange={handleFormChange}
                        required
                        style={{ marginBottom: 0, minWidth: 0 }}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="crane_chassis_no">
                      Crane Chassis No <span class="text-danger">*</span>
                    </label>
                    <div className="d-flex gap-2 align-items-center mb-2 drop-down-w-100">
                      <div style={{ width: "100px", flexShrink: 0 }}>
                        Heading:
                      </div>
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Asset Chassis No",
                            label: "Asset Chassis No",
                          },
                          {
                            value: "Asset Model No",
                            label: "Asset Model No",
                          },
                          {
                            value: "Asset Serial No",
                            label: "Asset Serial No",
                          },
                        ]}
                        value={
                          reportFormData.chassis_no_heading ||
                          "Asset Chassis No"
                        }
                        onChange={(value) =>
                          handleSelectChange("chassis_no_heading", value)
                        }
                      />
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      <div style={{ width: "100px", flexShrink: 0 }}>
                        Value:
                      </div>
                      <input
                        type="text"
                        className="form-field flex-grow-1"
                        id="crane_chassis_no"
                        name="crane_chassis_no"
                        value={reportFormData.crane_chassis_no}
                        onChange={handleFormChange}
                        required
                        style={{ marginBottom: 0, minWidth: 0 }}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="body_type">
                      Body Type <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="body_type"
                      name="body_type"
                      value={reportFormData.body_type}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="crane_model_code">
                      Fuel Type <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="crane_model_code"
                      name="crane_model_code"
                      value={reportFormData.crane_model_code}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="hours_meter_reading">
                      Hours Meter Reading <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="hours_meter_reading"
                      name="hours_meter_reading"
                      value={reportFormData.hours_meter_reading}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="hyp_from_date">Hyp From Date</label>
                    <input
                      type="text"
                      className="form-field"
                      id="hyp_from_date"
                      name="hyp_from_date"
                      value={reportFormData.hyp_from_date}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
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
                      value={reportFormData.comments_on_equipment_heading || ""}
                      readOnly
                      placeholder="Auto-generated from Category Suffix"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="asset_classification">
                      Asset Classification <span class="text-danger">*</span>
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
                    <label htmlFor="no_of_cylinder">
                      No of Cylinders <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "0 (ZERO)", label: "0 (ZERO)" },
                        { value: "1 (ONE)", label: "1 (ONE)" },
                        { value: "2 (TWO)", label: "2 (TWO)" },
                        { value: "3 (THREE)", label: "3 (THREE)" },
                        { value: "4 (FOUR)", label: "4 (FOUR)" },
                        { value: "5 (FIVE)", label: "5 (FIVE)" },
                        { value: "6 (SIX)", label: "6 (SIX)" },
                        { value: "7 (SEVEN)", label: "7 (SEVEN)" },
                        { value: "8 (EIGHT)", label: "8 (EIGHT)" },
                        { value: "9 (NINE)", label: "9 (NINE)" },
                        { value: "10 (TEN)", label: "10 (TEN)" },
                        { value: "NOT APPLICABLE", label: "NOT APPLICABLE" },
                      ]}
                      value={reportFormData.no_of_cylinder}
                      onChange={(value) =>
                        handleSelectChange("no_of_cylinder", value)
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="engine_condition">
                      Engine Condition <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      ]}
                      value={reportFormData.engine_condition}
                      onChange={(value) =>
                        handleSelectChange("engine_condition", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="chassis_condition">
                      Chassis Condition <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      ]}
                      value={reportFormData.chassis_condition}
                      onChange={(value) =>
                        handleSelectChange("chassis_condition", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="body_condition">
                      Body Condition <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      ]}
                      value={reportFormData.body_condition}
                      onChange={(value) =>
                        handleSelectChange("body_condition", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="cabin_condition">
                      Cabin Condition <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      ]}
                      value={reportFormData.cabin_condition}
                      onChange={(value) =>
                        handleSelectChange("cabin_condition", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="electrical_condition">
                      Electrical Condition <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      ]}
                      value={reportFormData.electrical_condition}
                      onChange={(value) =>
                        handleSelectChange("electrical_condition", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="gear_transmission">
                      Gear Transmission <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      ]}
                      value={reportFormData.gear_transmission}
                      onChange={(value) =>
                        handleSelectChange("gear_transmission", value)
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="battery_available">
                      Battery Available-yes/no{" "}
                      <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="battery_available"
                      name="battery_available"
                      value={reportFormData.battery_available}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="gross_machine_weight">
                      Gross Machine Weight <span class="text-danger">*</span>
                    </label>
                    <div className="d-flex gap-2 align-items-center">
                      <div style={{ width: "200px", flexShrink: 0 }}>
                        <SingleSearchSelect
                          options={[
                            {
                              value: "Gross Machine Weight",
                              label: "Gross Machine Weight",
                            },
                            {
                              value: "Gross Vehicle Weight",
                              label: "Gross Vehicle Weight",
                            },
                          ]}
                          value={
                            reportFormData.machine_weight_heading ||
                            "Gross Machine Weight"
                          }
                          onChange={(value) =>
                            handleSelectChange("machine_weight_heading", value)
                          }
                        />
                      </div>
                      <input
                        type="text"
                        className="form-field flex-grow-1"
                        id="gross_machine_weight"
                        name="gross_machine_weight"
                        value={reportFormData.gross_machine_weight}
                        onChange={handleFormChange}
                        required
                        style={{ marginBottom: 0, minWidth: 0 }}
                      />
                    </div>
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
                <div className="col-md-2">
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
                <div className="col-md-2">
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
                <div className="col-md-2">
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
              </div>
              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_title_1"
                      name="fix_but_flex_title_1"
                      value={reportFormData.fix_but_flex_title_1}
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
                      id="fix_but_flex_title_2"
                      name="fix_but_flex_title_2"
                      value={reportFormData.fix_but_flex_title_2}
                      onChange={handleFormChange}
                      placeholder="Value..."
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_title_3"
                      name="fix_but_flex_title_3"
                      value={reportFormData.fix_but_flex_title_3}
                      onChange={handleFormChange}
                      placeholder="Title..."
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
                      id="fix_but_flex_heading_4"
                      name="fix_but_flex_heading_4"
                      value={reportFormData.fix_but_flex_heading_4}
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
                      id="fix_but_flex_value_4"
                      name="fix_but_flex_value_4"
                      value={reportFormData.fix_but_flex_value_4}
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
                <div className="col-md-2">
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
                <div className="col-md-2">
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
              </div>
              <div className="row">
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
                <div className="col-md-2">
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
                <div className="col-md-2">
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
              </div>
              <div className="row">
                <div className="col-md-2">
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
                <div className="col-md-2">
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
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_value_11"
                      name="fix_but_flex_value_11"
                      value={reportFormData.fix_but_flex_value_11}
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
                      id="fix_but_flex_heading_12"
                      name="fix_but_flex_heading_12"
                      value={reportFormData.fix_but_flex_heading_12}
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
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_top_heading_13"
                      name="fix_but_flex_top_heading_13"
                      value={reportFormData.fix_but_flex_top_heading_13}
                      onChange={handleFormChange}
                      placeholder="Title..."
                    />
                  </div>
                </div>
                <div className="col-md-10">
                  <div className="row">
                    <div className="col-md-2">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_13"
                          name="fix_but_flex_heading_13"
                          value={reportFormData.fix_but_flex_heading_13}
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
                          id="fix_but_flex_value_13"
                          name="fix_but_flex_value_13"
                          value={reportFormData.fix_but_flex_value_13}
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
                          id="fix_but_flex_heading_14"
                          name="fix_but_flex_heading_14"
                          value={reportFormData.fix_but_flex_heading_14}
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
                          id="fix_but_flex_value_14"
                          name="fix_but_flex_value_14"
                          value={reportFormData.fix_but_flex_value_14}
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
                          id="fix_but_flex_heading_15"
                          name="fix_but_flex_heading_15"
                          value={reportFormData.fix_but_flex_heading_15}
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
                          id="fix_but_flex_value_15"
                          name="fix_but_flex_value_15"
                          value={reportFormData.fix_but_flex_value_15}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_heading_16"
                      name="fix_but_flex_heading_16"
                      value={reportFormData.fix_but_flex_heading_16}
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
                      id="fix_but_flex_value_16"
                      name="fix_but_flex_value_16"
                      value={reportFormData.fix_but_flex_value_16}
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
                      id="fix_but_flex_heading_17"
                      name="fix_but_flex_heading_17"
                      value={reportFormData.fix_but_flex_heading_17}
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
                      id="fix_but_flex_value_17"
                      name="fix_but_flex_value_17"
                      value={reportFormData.fix_but_flex_value_17}
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
                      id="fix_but_flex_heading_18"
                      name="fix_but_flex_heading_18"
                      value={reportFormData.fix_but_flex_heading_18}
                      onChange={handleFormChange}
                      placeholder="Title..."
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_18"
                          name="fix_but_flex_value_18"
                          value={reportFormData.fix_but_flex_value_18}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_19"
                          name="fix_but_flex_heading_19"
                          value={reportFormData.fix_but_flex_heading_19}
                          onChange={handleFormChange}
                          placeholder="Title..."
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_value_19"
                      name="fix_but_flex_value_19"
                      value={reportFormData.fix_but_flex_value_19}
                      onChange={handleFormChange}
                      placeholder="Value..."
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_20"
                          name="fix_but_flex_heading_20"
                          value={reportFormData.fix_but_flex_heading_20}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_20"
                          name="fix_but_flex_value_20"
                          value={reportFormData.fix_but_flex_value_20}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_heading_21"
                      name="fix_but_flex_heading_21"
                      value={reportFormData.fix_but_flex_heading_21}
                      onChange={handleFormChange}
                      placeholder="Title..."
                      readOnly
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_21"
                          name="fix_but_flex_value_21"
                          value={reportFormData.fix_but_flex_value_21}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_22"
                          name="fix_but_flex_heading_22"
                          value={reportFormData.fix_but_flex_heading_22}
                          onChange={handleFormChange}
                          placeholder="Title..."
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_value_22"
                      name="fix_but_flex_value_22"
                      value={reportFormData.fix_but_flex_value_22}
                      onChange={handleFormChange}
                      placeholder="Value..."
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_heading_23"
                          name="fix_but_flex_heading_23"
                          value={reportFormData.fix_but_flex_heading_23}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          id="fix_but_flex_value_23"
                          name="fix_but_flex_value_23"
                          value={reportFormData.fix_but_flex_value_23}
                          onChange={handleFormChange}
                          placeholder="Value..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      id="fix_but_flex_heading_24"
                      name="fix_but_flex_heading_24"
                      value={reportFormData.fix_but_flex_heading_24}
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
                      id="fix_but_flex_value_24"
                      name="fix_but_flex_value_24"
                      value={reportFormData.fix_but_flex_value_24}
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
                      id="fix_but_flex_heading_25"
                      name="fix_but_flex_heading_25"
                      value={reportFormData.fix_but_flex_heading_25}
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
                      id="fix_but_flex_value_25"
                      name="fix_but_flex_value_25"
                      value={reportFormData.fix_but_flex_value_25}
                      onChange={handleFormChange}
                      placeholder="Value..."
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
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
                          2
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
                          4
                        )
                      }
                    >
                      Add Two Set
                    </button>
                  </div>
                  {renderFlexibleFields(
                    "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION"
                  )}
                </div>
              </div>

              {/* RC, PERMIT, TAX, FITNESS & INSURANCE Section */}
              <div className="row">
                <div className="col-12">
                  <h4>RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS</h4>
                  <hr />
                </div>
                <div className="col-12">
                  <div className="form-group">
                    <label htmlFor="rc_permit_tax_fitness_insurance_heading">
                      RC, Permit, Tax, Fitness & Insurance Heading
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="rc_permit_tax_fitness_insurance_heading"
                      name="rc_permit_tax_fitness_insurance_heading"
                      value={
                        reportFormData.rc_permit_tax_fitness_insurance_heading ||
                        ""
                      }
                      readOnly
                      placeholder="Auto-generated from Category Suffix"
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="rc_book_verified">
                      RC Book Verified <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                        {
                          value: "COPY NOT AVAILABLE",
                          label: "COPY NOT AVAILABLE",
                        },
                        { value: "NOT APPLICABLE", label: "NOT APPLICABLE" },
                        { value: "NOT AVAILABLE", label: "NOT AVAILABLE" },
                      ]}
                      value={reportFormData.rc_book_verified}
                      onChange={(value) =>
                        handleSelectChange("rc_book_verified", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="bill_of_entry">
                      Bill Of Entry <span class="text-danger">*</span>
                    </label>
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
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="proforma_invoice_verified">
                      Proforma / Tax Invoice{" "}
                      <span className="text-danger">*</span>
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
                            reportFormData.proforma_invoice_heading ||
                            "Proforma Invoice Verified"
                          }
                          onChange={(value) =>
                            handleSelectChange("proforma_invoice_heading", value)
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
                            { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                            {
                              value: "COPY NOT AVAILABLE",
                              label: "COPY NOT AVAILABLE",
                            },
                          ]}
                          value={reportFormData.proforma_invoice_verified}
                          onChange={(value) =>
                            handleSelectChange("proforma_invoice_verified", value)
                          }
                          required
                        />
                      </div>
                    </div>
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
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="bill_of_lading">Bill Of Lading</label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                        {
                          value: "COPY NOT AVAILABLE",
                          label: "COPY NOT AVAILABLE",
                        },
                      ]}
                      value={reportFormData.bill_of_lading}
                      onChange={(value) =>
                        handleSelectChange("bill_of_lading", value)
                      }
                    />
                    {/* <input
                      type="text"
                      className="form-field"
                      id="bill_of_lading"
                      name="bill_of_lading"
                      value={reportFormData.bill_of_lading}
                      onChange={handleFormChange}
                    /> */}
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="chartered_engineer_certificate">
                      Chartered Engineer Certificate
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                        {
                          value: "COPY NOT AVAILABLE",
                          label: "COPY NOT AVAILABLE",
                        },
                      ]}
                      value={reportFormData.chartered_engineer_certificate}
                      onChange={(value) =>
                        handleSelectChange("chartered_engineer_certificate", value)
                      }
                    />
                    {/* <input
                      type="text"
                      className="form-field"
                      id="chartered_engineer_certificate"
                      name="chartered_engineer_certificate"
                      value={reportFormData.chartered_engineer_certificate}
                      onChange={handleFormChange}
                      placeholder="All India"
                    /> */}
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
              </div>

              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="insurance_valid_date" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      Insurance Val. Date
                      <small className="text-muted d-block mt-1">
                        ( Add just end date )
                      </small>
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
                      Insurance Verified <span class="text-danger">*</span>
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
                      required
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
                      onChange={(e) => setEntriesToShow(Number(e.target.value))}
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
                  <div className="table-responsive">
                    <table className="table table-bordered table-striped">
                      <thead
                        style={{
                          backgroundColor: "rgba(88, 100, 189, 0.7)",
                          color: "#fff",
                        }}
                      >
                        <tr>
                          <th style={{ color: "#fff" }}>Order Number</th>
                          <th style={{ color: "#fff" }}>Asset Make</th>
                          <th style={{ color: "#fff" }}>Manufacture Year</th>
                          <th style={{ color: "#fff" }}>Current Invoice Cost</th>
                          <th style={{ color: "#fff" }}>Depreciation</th>
                          <th style={{ color: "#fff" }}>Depreciation Value</th>
                          <th style={{ color: "#fff" }}>Appraiser Value</th>
                          <th style={{ color: "#fff" }}>Fair Market Value</th>
                          <th style={{ color: "#fff" }}>View</th>
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

              {/* Over All Feed Back Of The Inspected Section */}
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
                    <label htmlFor="invoice_cost">
                      Invoice Cost <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="invoice_cost"
                      name="invoice_cost"
                      value={reportFormData.invoice_cost}
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
                      readOnly
                      placeholder="Auto-calculated from invoice cost and depreciation rate"
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
                    <div className="d-flex gap-2 align-items-center mb-2 drop-down-w-100">
                      <div style={{ width: "100px", flexShrink: 0 }}>
                        Heading:
                      </div>
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Fair Market Value",
                            label: "Fair Market Value",
                          },
                          {
                            value: "Distress Value",
                            label: "Distress Value",
                          },
                        ]}
                        value={
                          reportFormData.fair_market_value_heading ||
                          "Fair Market Value"
                        }
                        onChange={(value) =>
                          handleSelectChange("fair_market_value_heading", value)
                        }
                      />
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      <div style={{ width: "100px", flexShrink: 0 }}>
                        Value:
                      </div>
                      <input
                        type="text"
                        className="form-field flex-grow-1"
                        id="fair_market_value"
                        name="fair_market_value"
                        value={reportFormData.fair_market_value}
                        onChange={handleFormChange}
                        placeholder="₹ 0.00"
                        required
                        style={{ marginBottom: 0, minWidth: 0 }}
                      />
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="amount_in_words">
                      Fair Market Value Amount In Words{" "}
                      <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="amount_in_words"
                      name="amount_in_words"
                      value={amountInWords}
                      readOnly
                      placeholder="Auto-generated from fair market value"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="no_of_photograph">
                      No of Photographs <span class="text-danger">*</span>
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
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="no_of_collage">
                      No of Collages <span class="text-danger">*</span>
                    </label>
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
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label htmlFor="valuer_comments_remarks">
                      Valuer Comments/remarks <span class="text-danger">*</span>
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
                          2
                        )
                      }
                    >
                      Add New Set
                    </button>
                  </div>
                  {renderFlexibleFieldsWithTextarea(
                    "OVER_ALL_FEED_BACK_OF_THE_INSPECTED"
                  )}
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label htmlFor="declaration">
                      Declaration <span class="text-danger">*</span>
                    </label>
                    <p className="mb-0">
                      The aforesaid{" "}
                      {order?.category_name || ""}
                      {order?.sub_category_name
                        ? ` / ${order.sub_category_name}`
                        : ""}{" "} {order?.child_category_name || ""} {" "}
                      inspected by us & found in{" "}
                    </p>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "ROAD WORTHY CONDITION",
                          label: "ROAD WORTHY CONDITION",
                        },
                        {
                          value: "ACCIDENTAL CONDITION",
                          label: "ACCIDENTAL CONDITION",
                        },
                        { value: "NOT WORKING", label: "NOT WORKING" },
                        { value: "SCRAP CONDITION", label: "SCRAP CONDITION" },
                        {
                          value: "STACKED CONDITION",
                          label: "STACKED CONDITION",
                        },
                        { value: "KNOCK DOWN", label: "KNOCK DOWN" },
                        { value: "PARKING YARD", label: "PARKING YARD" },
                        { value: "Dismantled Condition", label: "Dismantled Condition" },
                        { value: "Normal Working Condition", label: "Normal Working Condition" },
                        { value: "Total Operational & Functional Condition", label: "Total Operational & Functional Condition" },
                        { value: "PACKED / KNOCKED DOWN", label: "PACKED / KNOCKED DOWN" },
                        { value: "WORKABLE CONDITION", label: "WORKABLE CONDITION" },
                        { value: "STACKED", label: "STACKED" },
                        { value: "USABLE", label: "USABLE" },
                        { value: "NOT AVAILABLE", label: "NOT AVAILABLE" },
                        { value: "NOT APPLICABLE", label: "NOT APPLICABLE" },
                      ]}
                      value={reportFormData.declaration}
                      onChange={(value) =>
                        handleSelectChange("declaration", value)
                      }
                      required
                    />
                    <p className="mb-0">
                      on the date of my inspection. This Report issued for{" "}
                      {reportFormData.valuation_purpose || ""} of{" "}
                      {order?.bank_name || ""}, {order?.branch_name || ""},{" "}
                      {reportFormData.state_name || ""} Only.
                    </p>
                  </div>
                </div>
              </div>

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

              {/* Generate Report Buttons - Rough and Production */}
              <div className="row">
                <div className="col-12">
                  <div className="form-buttons" style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "12px" }}>
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={generating}
                      onClick={() => setReportTypeSelection("Rough")}
                      style={{
                        backgroundColor: generating ? "#9ca3af" : "#f59e0b",
                        borderColor: generating ? "#9ca3af" : "#f59e0b",
                        width: "200px",
                      }}
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
                      style={{
                        width: "calc(100% - 212px)",
                      }}
                    >
                      {generating && reportTypeSelection === "Production"
                        ? "Generating Report..."
                        : "Generate CE Report"}
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

export default CEReport;
