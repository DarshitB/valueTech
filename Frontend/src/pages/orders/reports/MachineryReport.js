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
  generateOrderReport,
  saveOrderReport,
  clearCurrentReport,
} from "../../../redux/reducers/orderReportReducer";
import { fetchAssetMakesForReports } from "../../../redux/reducers/assetMakesReducer";
import { usePageTitle } from "../../../context/PageTitleContext";
import SingleSearchSelect from "../../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import { selectPermissions } from "../../../redux/selectors/authSelectors";
import { hasPermission } from "../../../utils/permissionUtils";
import "../order.scss";
import { DeleteIcon } from "../../../components/icons";

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

function MachineryReport() {
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
  const allowedPermissions = useSelector(selectPermissions);
  const canEditRefNoId = hasPermission(allowedPermissions, "edit_report_ref_no_id");
  const [showOtherAssetMake, setShowOtherAssetMake] = useState(false);
  const [otherAssetMake, setOtherAssetMake] = useState("");
  // State to track if initial report fetch has completed (using state instead of ref to trigger re-renders)
  const [reportFetchCompleted, setReportFetchCompleted] = useState(false);
  // State for registration field options (Not Available / Not Applicable)
  const [registrationNoOption, setRegistrationNoOption] = useState(null); // null, "NOT_AVAILABLE", "NOT_APPLICABLE"
  const [registrationDateOption, setRegistrationDateOption] = useState(null);
  const [locationOfMachineryOption, setLocationOfMachineryOption] = useState(null);
  // Ref to track if we've seen the report loading state (to ensure we wait for the fetch to actually happen)
  const reportLoadingStartedRef = useRef(false);
  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  // State for report type selection (Rough/Production)
  const [reportTypeSelection, setReportTypeSelection] = useState("Rough");

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
          reportType: "report_machinery",
          silent: true,
        })
      );
      // Fetch asset makes for Machinery report
      dispatch(fetchAssetMakesForReports("report_machinery"));
    }
  }, [dispatch, id]);

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
      report_type: "report_machinery",
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
      bill_of_entry: "",
    });

    // Reset flexible fields
    setFlexibleFields([]);

    // Clear the cleared fields tracking when form resets
    clearedFieldsRef.current.clear();
    manuallyEditedHeadingsRef.current.clear(); // Reset manually edited headings when form resets
  }, [id]);

  // Build disclaimer text directly with valuer name and bank/branch/city from order
  const getDisclaimer = useCallback(
    (valuerName = "VALUETECH SOLUTIONS", orderForDisclaimer = null) => {
      const name = valuerName?.trim();
      const bank = orderForDisclaimer?.bank_name?.trim();
      const branch = orderForDisclaimer?.branch_name?.trim();
      const city = (orderForDisclaimer?.city || orderForDisclaimer?.city_name)?.trim();
      return `THIS REPORT IS GENERATED BY THE ${name} AT THE SOLE REQUEST OF ${bank}, ${branch}, ${city} WHOM, THIS VALUATION REPORT IS ADDRESSED AND IS TO BE USED SOLELY BY THE SAID PARTY FOR THE STATED PURPOSE ONLY. ${name} WILL NOT BE HELD LIABLE FOR ANY LOSS OR LIABLITY SUSTAINED BY ANY PARTY RELYING ON THIS VALUATION REPORT. ${name} HAS RELIED ON THE DATA PROVIDED BY THE CLIENT & HAS NOT VERIFIED GENUIUNENESS THEREOFF. AS THERE IS NO STANDARD PRICE LIST FOR PRE-OWNED/USED MACHINERY / CRANE, THIS VALUATION INDICATED IN THE REPORT IS OUR PROFESSIONAL OPINION ONLY ON THE MARKET VALUE OF THE PRODUCT SHOWN IN COLLAGE OR IN DETAILS BASED ON STANDARD VALUATION METHODOLOGY & PROCEDURES CALCULATING FLUCTUATIONS & LIMITATIONS OF VALUATED PRODUCTS. ACUAL REALISATION MAY DIFFER FROM THE VALUATION INDICATED IN THE REPORT. ${name} (SIGNATORY & EMPLOYEES WILL NOT BE HELD LIABLE FOR ANY DIRECT, INDIRECT CONSEQUENTIAL OR EXEMPLARY DAMAGES FOR ANY LOSS RESULTING FROM THE USE OF THIS REPORT. ${name} IS NOT RESPONSIBLE FOR VERIFYING THE GENUINENESS OF THE PROVIDED DOCUMENTS. THE VALUATION OF ASSET IS PRIMARILY BASED ON THE CONDITION OF THE MACHINERY AT THE TIME OF INSPECTION & SURVEY. TO GIVE LOAN TO THE APPLICANT IS THE RESPONSIIBLITY OF THE FINANCE COMPANY/BANK. WE ARE NOT RESPONSIBLE OR CONCERNED FOR THE SAME.`;
    },
    []
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

  // Form data state for Machinery report generation
  const [reportFormData, setReportFormData] = useState({
    // Report type and reference details
    report_type: "report_machinery",
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
    tax_invoice_copy: "COPY AVAILABLE & VERIFIED",
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
    declaration: "",
    disclaimer: "", // Will be set dynamically when order loads
  });

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
          prev.insurance_details_heading ||
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
            insurance_details_heading: categorySuffixUpper
              ? `INSURANCE DETAILS OF ${categorySuffixUpper}`
              : "",
            overall_feedback_heading: categorySuffixUpper
              ? `OVER ALL FEED BACK OF THE INSPECTED ${categorySuffixUpper}`
              : "",
          }),
          // Disclaimer: always set from getDisclaimer (rollback point if we need DB-stored value later)
          disclaimer: getDisclaimer(order?.valuer_name || "VALUETECH SOLUTIONS", order),
        };
      });
    }
  }, [
    order,
    getLicenseNumber,
    getRefNoCode,
    getDisclaimer,
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
          updated.valuation_purpose = "REPO PURPOSE";
        }
      } else {
        // Generate from category_suffix only if no saved value exists
        const categorySuffixUpper = extractedCategorySuffix
          ? extractedCategorySuffix.toUpperCase().trim()
          : "";
        const isRepo = (report.valuation_purpose && String(report.valuation_purpose).toUpperCase().trim() === "REPO PURPOSE") || report.is_repo === true;
        updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepo);
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
          key === "disclaimer" ||
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
      updated.disclaimer = getDisclaimer(order?.valuer_name || "VALUETECH SOLUTIONS", order);

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
    getDisclaimer,
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
        &gt; Machinery Report
      </>
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
        isAutoGeneratedHeading(prev.valueation_report_for_heading, prev.category_suffix || "");

      if (shouldUpdateValuationHeading) {
        updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepoPurpose(prev.valuation_purpose));
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
  }, [reportFormData.category_suffix, reportFormData.valuation_purpose, isAutoGeneratedHeading, buildValuationReportHeading, isRepoPurpose]);

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
    if (!reportLoading && initialFormDataRef.current === null && reportFetchCompleted) {
      initialFormDataRef.current = reportFormData;
      initialFlexibleFieldsRef.current = flexibleFields;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportLoading, reportFetchCompleted]);

  // Handle form input changes
  const handleFormChange = useCallback(
    (e) => {
      if (initialFormDataRef.current !== null) isDirtyRef.current = true;
      const { name, value } = e.target;

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
            isAutoGeneratedHeading(prev.valueation_report_for_heading, prev.category_suffix || "");

          if (shouldUpdateValuationHeading) {
            updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepoPurpose(prev.valuation_purpose));
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

        // Auto-calculate depreciation_value when tax_invoice_cost or depreciation changes
        if (name === "tax_invoice_cost" || name === "depreciation") {
          const invoiceCost = parseCurrency(
            name === "tax_invoice_cost" ? value : updated.tax_invoice_cost
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
    [parseCurrency, handleCurrencyFormatting, convertNumberToWordsIndian, isAutoGeneratedHeading, buildValuationReportHeading]
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
            const categorySuffixUpper = categorySuffix ? categorySuffix.toUpperCase().trim() : "";
            updated.valueation_report_for_heading = buildValuationReportHeading(categorySuffixUpper, isRepo);
          } else if (heading.trim() !== "") {
            let newHeading = heading;
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

        return updated;
      });
    },
    [getLicenseNumber, isAutoGeneratedHeading, buildValuationReportHeading, isRepoPurpose]
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
  const validateFlexibleFields = useCallback(() => {
    const errors = [];

    flexibleFields.forEach((field, index) => {
      if (!field.field_label.trim() || !field.field_value.trim()) {
        errors.push(
          `Flexible field ${index + 1}: Label and Value are required`
        );
      }

      // For Add Two fields, validate second set
      if (field.col_span === 2) {
        if (!field.field_label_2?.trim() || !field.field_value_2?.trim()) {
          errors.push(
            `Flexible field ${index + 1}: Second Label and Value are required`
          );
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

        // Skip disclaimer - handled separately below
        if (key === "disclaimer") {
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

        if (key === "location_of_machinery") {
          if (locationOfMachineryOption === "NOT_AVAILABLE") {
            value = "NOT AVAILABLE";
          } else if (locationOfMachineryOption === "NOT_APPLICABLE") {
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

      // ALWAYS include disclaimer in payload
      const valuerName = reportFormData.valuer_name || "VALUETECH SOLUTIONS";
      const defaultDisclaimer = getDisclaimer(valuerName, order);
      formData.append(
        "disclaimer",
        reportFormData.disclaimer || defaultDisclaimer
      );

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
      dispatch,
      id,
      order,
      getRefNoCode,
      parseCurrency,
      convertNumberToWordsIndian,
      registrationNoOption,
      registrationDateOption,
      locationOfMachineryOption,
      reportTypeSelection,
      canEditRefNoId,
    ]
  );

  // Builds the save payload — used by both handleSaveReport and the navigation blocker.
  const buildSavePayload = useCallback(() => {
    const fmvRaw = reportFormData.fair_market_value;
    const fmvAmount = parseCurrency(fmvRaw);
    const computedAmountInWords = fmvRaw ? convertNumberToWordsIndian(fmvAmount) : "";

    const reportData = {};

    const valuerName = reportFormData.valuer_name || "VALUETECH SOLUTIONS";
    reportData.disclaimer = reportFormData.disclaimer || getDisclaimer(valuerName, order);

    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      if (key === "disclaimer") return;
      if (key === "amount_in_words") { reportData[key] = computedAmountInWords || null; return; }
      if (key === "invoice_no_date") return;

      if (key === "registration_no") {
        if (registrationNoOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registrationNoOption === "NOT_APPLICABLE") value = "NOT APPLICABLE";
      }
      if (key === "registration_date") {
        if (registrationDateOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (registrationDateOption === "NOT_APPLICABLE") value = "NOT APPLICABLE";
      }
      if (key === "location_of_machinery") {
        if (locationOfMachineryOption === "NOT_AVAILABLE") value = "NOT AVAILABLE";
        else if (locationOfMachineryOption === "NOT_APPLICABLE") value = "NOT APPLICABLE";
      }

      reportData[key] = (value !== null && value !== undefined && value !== "") ? String(value) : null;
    });

    reportData.report_date_heading = reportFormData.report_date_heading || "Report Date";

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

        if (field.col_span === 2 && field.field_label_2 !== undefined && field.field_value_2 && field.field_value_2.trim() !== "") {
          reportData[`flexible_fields[${formDataIndex}][section_name]`] = field.section_name;
          reportData[`flexible_fields[${formDataIndex}][col_span]`] = field.col_span;
          reportData[`flexible_fields[${formDataIndex}][field_label]`] = field.field_label_2;
          reportData[`flexible_fields[${formDataIndex}][field_value]`] = String(field.field_value_2 || "");
          reportData[`flexible_fields[${formDataIndex}][field_order]`] = field.field_order + 1;
          formDataIndex++;
        }
      }
    });

    return reportData;
  }, [
    reportFormData, flexibleFields,
    registrationNoOption, registrationDateOption, locationOfMachineryOption,
    parseCurrency, convertNumberToWordsIndian, getDisclaimer, order,
  ]);

  // Handle save report data
  const handleSaveReport = useCallback(() => {
    // Validate flexible fields
    const validationErrors = validateFlexibleFields();
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

    // Build payload using shared function
    const reportData = buildSavePayload();

    // Only proceed if there's actual data to save
    if (Object.keys(reportData).length === 0) {
      toast.warning(
        "No data to save. Please fill in some fields before saving."
      );
      return;
    }

    /* console.log("📤 Sending to backend - reportData:", reportData);
    console.log("📤 amount_in_words in payload:", reportData.amount_in_words); */

    // Don't clear clearedFieldsRef after save - user might generate report next
    // It will be cleared when component unmounts or order changes (handled in useEffect)

    // Dispatch save action with JSON data
    dispatch(
      saveOrderReport({
        orderId: id,
        reportData: reportData,
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
    dispatch,
    id,
    buildSavePayload,
    parseCurrency,
    convertNumberToWordsIndian,
  ]);

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

  return (
    <section className="order-details-wrapper">
      <div className="row">
        {/* Reference Number Form Section */}
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div className="order-report-container">
            <div className="d-flex justify-content-between align-items-center">
              <h2>Machinery Report</h2>
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
                      placeholder="Auto-generated from Category Suffix"
                    />
                  </div>
                </div>
                <div className="col-12">
                  <div className="form-group">
                  <div className="d-flex align-items-end gap-3 flex-wrap" style={{ gap: "10px" }}>
                      <div className="flex-grow-1" style={{ minWidth: "200px" }}>
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
                    <label htmlFor="report_date">
                      &nbsp;
                    </label>
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
                        { value: "FINANCIAL USAGE", label: "FINANCIAL USAGE" },
                        { value: "INUSRANCE USAGE", label: "INUSRANCE USAGE" },
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
                        className={`form-field registration-option-btn ${registrationNoOption === "NOT_AVAILABLE"
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
                        className={`form-field registration-option-btn ${registrationNoOption === "NOT_APPLICABLE"
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
                    <label htmlFor="registration_date">Registration Date</label>
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
                        className={`form-field registration-option-btn ${registrationDateOption === "NOT_AVAILABLE"
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
                        className={`form-field registration-option-btn ${registrationDateOption === "NOT_APPLICABLE"
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
                    <label htmlFor="location_of_machinery">
                      Location Of Machinery <span class="text-danger">*</span>
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
                          className={`form-field registration-option-btn ${locationOfMachineryOption === "NOT_AVAILABLE"
                            ? "active"
                            : ""
                            }`}
                          onClick={() =>
                            handleRegistrationOption(
                              "location_of_machinery",
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
                          className={`form-field registration-option-btn ${locationOfMachineryOption === "NOT_APPLICABLE"
                            ? "active"
                            : ""
                            }`}
                          onClick={() =>
                            handleRegistrationOption(
                              "location_of_machinery",
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
              </div>
              <div className="row">
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="asset_make">
                      Asset Make & Supplier <span class="text-danger">*</span>
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
                <div className="col-md-3">
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
              </div>
              <div className="row">
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                      options={[
                        { value: "EXCELLENT", label: "EXCELLENT" },
                        { value: "VERY GOOD", label: "VERY GOOD" },
                        { value: "GOOD", label: "GOOD" },
                        { value: "AVERAGE", label: "AVERAGE" },
                        { value: "FAIR", label: "FAIR" },
                        { value: "POOR", label: "POOR" },
                      ]}
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
                      options={[
                        { value: "EXCELLENT", label: "EXCELLENT" },
                        { value: "VERY GOOD", label: "VERY GOOD" },
                        { value: "GOOD", label: "GOOD" },
                        { value: "AVERAGE", label: "AVERAGE" },
                        { value: "FAIR", label: "FAIR" },
                        { value: "POOR", label: "POOR" },
                      ]}
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
                      ]}
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
                      Mechanical Condition <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "EXCELLENT", label: "EXCELLENT" },
                        { value: "VERY GOOD", label: "VERY GOOD" },
                        { value: "GOOD", label: "GOOD" },
                        { value: "AVERAGE", label: "AVERAGE" },
                        { value: "FAIR", label: "FAIR" },
                        { value: "POOR", label: "POOR" },
                      ]}
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
                      options={[
                        { value: "GOOD", label: "GOOD" },
                        { value: "FAIR", label: "FAIR" },
                        { value: "POOR", label: "POOR" },
                      ]}
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
                      Tax Invoice Copy <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY VERIFIED", label: "COPY VERIFIED" },
                        {
                          value: "COPY NOT AVAILABLE",
                          label: "COPY NOT AVAILABLE",
                        },
                      ]}
                      value={reportFormData.tax_invoice_copy}
                      onChange={(value) =>
                        handleSelectChange("tax_invoice_copy", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="rc_book_verified">
                      Insurance Copy
                    </label>
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
                    <label htmlFor="bill_of_entry">
                      Bill of Entry
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="bill_of_entry"
                      name="bill_of_entry"
                      value={reportFormData.bill_of_entry}
                      onChange={handleFormChange}
                      placeholder="Bill of Entry"
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
              </div>

              <div className="row">
                {/* <div className="col-md-3">
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
                </div> */}
              </div>

              <div className="row">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-12">
                  <div className="form-group">
                    <label htmlFor="declaration">
                      Declaration <span class="text-danger">*</span>
                    </label>
                    <WysiwygTextarea
                      className="form-field"
                      id="declaration"
                      name="declaration"
                      value={reportFormData.declaration}
                      onChange={handleFormChange}
                      rows={2}
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
                        : "Generate Machinery Report"}
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

export default MachineryReport;
