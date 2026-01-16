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
import "../order.scss";
import { DeleteIcon } from "../../../components/icons";
import axios from "axios";

// WYSIWYG Textarea Component - preserves HTML formatting
const WysiwygTextarea = ({ value, onChange, placeholder, rows = 4, className = "", name, readOnly = false }) => {
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
      .replace(/\r\n/g, '\n') // Normalize line breaks
      .replace(/\r/g, '\n') // Normalize line breaks
      .split('\n')
      .map(line => line.trim()) // Remove leading/trailing spaces from each line
      .filter(line => line.length > 0) // Remove empty lines
      .join('\n');
    
    // Convert to HTML with line breaks, but as plain text (no formatting)
    const htmlText = plainText.replace(/\n/g, '<br>');
    
    // Insert as plain text with line breaks (no bold, italic, etc.)
    document.execCommand("insertHTML", false, htmlText || '');
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
        style={readOnly ? { cursor: 'default', backgroundColor: '#f5f5f5' } : {}}
      />
    </>
  );
};

function CVReport() {
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
  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  // State to track if initial report fetch has completed (using state instead of ref to trigger re-renders)
  const [reportFetchCompleted, setReportFetchCompleted] = useState(false);
  // State to track if external API is currently loading
  const [externalApiLoading, setExternalApiLoading] = useState(false);

  // Ref to track if external RC API has been called (to ensure it's only called once)
  const externalApiCalledRef = useRef(false);
  // Ref to track if we should auto-save after external API prefills data
  const shouldAutoSaveAfterApiRef = useRef(false);
  // Ref to track if we've seen the report loading state (to ensure we wait for the fetch to actually happen)
  const reportLoadingStartedRef = useRef(false);

  // Clear report data when component mounts or order changes
  useEffect(() => {
    // Clear any existing report data first
    dispatch(clearCurrentReport());
    // Reset external API call ref when order changes
    externalApiCalledRef.current = false;
    // Reset auto-save flag when order changes
    shouldAutoSaveAfterApiRef.current = false;
    // Reset report fetch tracking flags when order changes
    reportLoadingStartedRef.current = false;
    setReportFetchCompleted(false); // Reset state
    setExternalApiLoading(false); // Reset external API loading state
  }, [dispatch, id]);

  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      // Mark that we're starting to fetch the report
      /* console.log("📋 CVReport - Dispatching fetchOrderReport"); */
      dispatch(
        fetchOrderReport({ orderId: id, reportType: "report_cv", silent: true })
      );
      // Fetch asset makes for CV report
      dispatch(fetchAssetMakesForReports("report_cv"));
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
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
        "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
      ];
      const currentMonth = new Date().getMonth();
      return months[currentMonth];
    };

    // Reset form data to initial state when order changes
    setReportFormData({
      // Report type and reference details
      report_type: "report_cv",
      ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
      ref_no_bank: "",
      state_name: "", // Default to first option
      ref_no_code: "", // Default to first option
      ref_no_month: `SFW-${getCurrentMonthAbbreviationLocal()}-`, // Default: SFW-(CURRENT_MONTH)
      ref_no_id: "",
      report_date: getCurrentDateLocal(), // Default to today's date

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

      valuation_purpose: "",
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

      engine_no_detail: "",
      chassis_no: "",
      chassis_no_type: "",
      body_type: "",
      fuel_type: "",

      kilometer_reading: "",
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

      battery_available: "YES / TWO LOCAL - 2X12V", // Fixed read-only value
      gross_vehicle_weight: "",

      front_tyre_no: "",
      front_tyre_condition: "",
      middle_tyre_no: "",
      middle_tyre_condition: "",
      rear_tyre_no: "",
      rear_tyre_condition: "",
      no_of_tyres: "",
      stepney: "",

      horse_power: "",
      mechanical_unit_condition: "",
      cubic_capacity: "",

      suspension: "",
    });

    // Reset flexible fields
    setFlexibleFields([]);

    // Reset chassis impression file
    setChassisImpressionFile(null);
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
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
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

  // Form data state for CV report generation
  const [reportFormData, setReportFormData] = useState({
    // Report type and reference details
    report_type: "report_cv",
    ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
    ref_no_bank: "",
    state_name: "", // Default to first option
    ref_no_code: "", // Default to first option
    ref_no_month: `SFW-${getCurrentMonthAbbreviation()}-`, // Default: SFW-(CURRENT_MONTH)
    ref_no_id: "",
    report_date: getCurrentDate(), // Default to today's date

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

    valuation_purpose: "",
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
    chassis_no: "",
    chassis_no_type: "",
    body_type: "",
    fuel_type: "",

    kilometer_reading: "",
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

    battery_available: "YES / TWO LOCAL - 2X12V", // Fixed read-only value
    gross_vehicle_weight: "",

    front_tyre_no: "",
    front_tyre_condition: "",
    middle_tyre_no: "",
    middle_tyre_condition: "",
    rear_tyre_no: "",
    rear_tyre_condition: "",
    no_of_tyres: "",
    stepney: "",

    horse_power: "",
    mechanical_unit_condition: "",
    cubic_capacity: "",

    suspension: "",
    seating_capacity: "",
    tool_kit_available: "",

    vehicle_colour: "",
    color_condition: "",
    damages_if_any: "",

    // RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS
    rc_book_verified: "",
    invoice_verified: "",
    tax_upto: "",
    permit_upto: "",

    permit_type: "",
    fitness_upto: "",
    insurance_co_name: "",
    policy_no: "",

    period_of_insurance: "",
    insured_value: "",
    insurance_verified: "",

    // OVER ALL FEED BACK OF THE INSPECTED
    current_invoice_cost: "",
    depreciation: "",
    depreciation_value: "",
    appraiser_value: "",

    fair_market_value: "",
    amount_in_words: "",
    no_of_photograph: "",
    no_of_collage: "",

    valuer_comments_remarks: "",
    declaration: "",
  });

  // File state for chassis impression
  const [chassisImpressionFile, setChassisImpressionFile] = useState(null);
  const [chassisPreviewUrl, setChassisPreviewUrl] = useState("");

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // Track fields that were explicitly cleared by the user (date and currency fields)
  const clearedFieldsRef = useRef(new Set());

  // Helper function to build category suffix for headings
  const buildCategorySuffix = useCallback((categoryName, subCategoryName, childCategoryName) => {
    const parts = [];
    if (categoryName) parts.push(categoryName);
    if (subCategoryName) parts.push(subCategoryName);
    if (childCategoryName) parts.push(childCategoryName);
    
    if (parts.length === 0) return "";
    
    // Format: (category_name) / (sub_category_name) (child_category_name)
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} / ${parts[1]}`;
    return `${parts[0]} / ${parts[1]} ${parts[2]}`;
  }, []);

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
        const hasSavedReport = reportFetchCompleted && 
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
        const shouldPrefillHeadings = (!hasSavedReport || !hasSavedHeadingValues) && categorySuffix;
        
        const categorySuffixUpper = categorySuffix ? categorySuffix.toUpperCase().trim() : "";

        return {
          ...prev,
          ref_no_bank: order?.bank_initial || "",
          state_name: prev.state_name || "MUM",
          ref_no_code: order?.valuer_name ? getRefNoCode(order.valuer_name) : "",
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
          // Prefill registration number from order if available
          registration_no: order?.registration_number || "",
          // Prefill category_suffix with category information
          // Only prefill if there's no saved report and no existing category_suffix value
          category_suffix: shouldPrefillHeadings && categorySuffix
            ? categorySuffix
            : prev.category_suffix || "",
          // Prefill headings when shouldPrefillHeadings is true (initially when no data saved)
          ...(shouldPrefillHeadings && {
            valueation_report_for_heading: categorySuffixUpper
              ? `VALUATION REPORT FOR ${categorySuffixUpper}`
              : "",
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
  }, [order, getLicenseNumber, getRefNoCode, buildCategorySuffix, currentReport, id, reportFetchCompleted]);

  // Track when the initial report fetch completes
  // We need to ensure: (1) fetch has started (reportLoading = true), (2) fetch has completed (reportLoading = false)
  useEffect(() => {
    // Step 1: Mark that loading has started when reportLoading becomes true
    if (reportLoading && !reportLoadingStartedRef.current) {
      reportLoadingStartedRef.current = true;
      /* console.log("📋 CVReport - Report fetch started (loading = true)"); */
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
        /* console.log("📋 CVReport - Initial report fetch completed (normal flow)", {
          hasReport: !!currentReport,
          hasReportData: !!currentReport?.report,
          timestamp: new Date().toISOString(),
        }); */
      }, 300); // Small delay to ensure state propagation

      return () => clearTimeout(timer);
    }

    // Fallback: If loading state hasn't been detected after 1.5 seconds, assume fetch completed
    // This handles cases where Redux state changes too quickly to detect
    if (!reportLoadingStartedRef.current && !reportFetchCompleted) {
      const fallbackTimer = setTimeout(() => {
        if (!reportFetchCompleted) {
          /* console.log("📋 CVReport - Report fetch completed (fallback - loading state not detected)"); */
          reportLoadingStartedRef.current = true; // Mark as started
          setReportFetchCompleted(true); // Use setState to trigger re-renders
        }
      }, 1500); // Wait 1.5 seconds before using fallback

      return () => clearTimeout(fallbackTimer);
    }
  }, [reportLoading, currentReport, reportFetchCompleted]);

  // Populate form data from fetched report (if available)
  useEffect(() => {
    const report = currentReport?.report;
    if (!report) {
      // If no report and fetch is completed, ensure loading is false
      if (reportFetchCompleted && !reportLoading) {
        setExternalApiLoading(false);
      }
      return; // Gracefully do nothing when data is null
    }

    // Validate that the report belongs to the current order
    if (currentReport?.order_id && currentReport.order_id !== parseInt(id)) {
      // Report belongs to different order, ignore it
      setExternalApiLoading(false);
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
      if (report.general_details_heading && String(report.general_details_heading).trim() !== "") {
        const match = String(report.general_details_heading).match(/GENERAL DETAILS OF THE INSPECTED (.+)/i);
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
      
      // For valueation_report_for_heading: 
      // 1. If saved value exists in database, use it (user may have manually edited it)
      // 2. If no saved value, generate from category_suffix
      if (report.valueation_report_for_heading !== undefined && report.valueation_report_for_heading !== null && String(report.valueation_report_for_heading).trim() !== "") {
        // Use saved value from database exactly as saved - don't modify it
        updated.valueation_report_for_heading = report.valueation_report_for_heading;
      } else {
        // Generate from category_suffix only if no saved value exists
        const categorySuffixUpper = extractedCategorySuffix ? extractedCategorySuffix.toUpperCase().trim() : "";
        updated.valueation_report_for_heading = categorySuffixUpper
          ? `VALUATION REPORT FOR ${categorySuffixUpper}`
          : "";
      }
      
      // Generate other headings from category_suffix
      const categorySuffixUpper = extractedCategorySuffix ? extractedCategorySuffix.toUpperCase().trim() : "";
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

      // Only populate fields that exist in the form structure (editable fields)
      Object.entries(report).forEach(([key, value]) => {
        // Skip system fields and valuer-related fields (those come from order only)
        if (
          key.startsWith("created_") ||
          key.startsWith("updated_") ||
          key === "id" ||
          key === "order_id" ||
          key === "flexible_fields" ||
          key === "valuer_name" ||
          key === "license_no" ||
          key === "ref_no_code"
        ) {
          return;
        }

        // Convert null to empty string
        const fieldValue = value !== null ? value : "";

        // Skip heading fields as they're already handled above
        if (headingFields.includes(key)) {
          // Already handled above, skip to avoid overwriting
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

        // Try to set the field directly first
        if (Object.prototype.hasOwnProperty.call(prev, key)) {
          updated[key] = fieldValue;
        } else {
          // Field not found in form structure, try to set it anyway for dynamic fields
          updated[key] = fieldValue;
        }
      });

      // Ensure ref_no_month has a default value if it's empty or null
      if (!updated.ref_no_month || updated.ref_no_month.trim() === "") {
        const months = [
          "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
        ];
        const currentMonth = new Date().getMonth();
        updated.ref_no_month = `SFW-${months[currentMonth]}-`;
      }

      return updated;
    });

    // Flexible fields - transform API flat list into UI combined sets
    if (Array.isArray(report.flexible_fields)) {
      const apiFields = report.flexible_fields;

      // Group by section and sort by field_order
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
          // For "Add Two" we expect two consecutive rows with col_span === 2
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
            if (second) i++; // skip the paired second item
          } else {
            // Add One
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

    // After form data is populated from report, set loading to false
    // Small delay to ensure all state updates are complete
    setTimeout(() => {
      setExternalApiLoading(false);
    }, 300);
  }, [currentReport, id, reportFetchCompleted, reportLoading]);

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
        &gt; CV Report
      </>
    );
  }, [id, order, setTitle]);

  // Helper function to check if valueation_report_for_heading matches auto-generated pattern
  const isAutoGeneratedHeading = useCallback((heading, categorySuffix) => {
    if (!heading || !categorySuffix) return false;
    const categorySuffixUpper = categorySuffix.toUpperCase().trim();
    const expectedPattern = `VALUATION REPORT FOR ${categorySuffixUpper}`;
    return heading.trim() === expectedPattern;
  }, []);

  // Auto-update heading fields when category_suffix changes
  // BUT don't update valueation_report_for_heading if it has custom text (not matching pattern)
  useEffect(() => {
    const categorySuffix = reportFormData.category_suffix || "";
    const categorySuffixUpper = categorySuffix ? categorySuffix.toUpperCase().trim() : "";
    
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
        updated.valueation_report_for_heading = categorySuffixUpper
          ? `VALUATION REPORT FOR ${categorySuffixUpper}`
          : "";
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
  }, [reportFormData.category_suffix, isAutoGeneratedHeading]);

  // Handle form input changes
  const handleFormChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      // Track cleared fields - if field had a value and is now empty, mark it as cleared
      if (!value || (typeof value === "string" && value.trim() === "")) {
        // Field is being cleared - track it
        clearedFieldsRef.current.add(name);
      } else {
        // Field has a value - remove from cleared fields tracking
        clearedFieldsRef.current.delete(name);
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
            updated.valueation_report_for_heading = categorySuffixUpper
              ? `VALUATION REPORT FOR ${categorySuffixUpper}`
              : "";
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
          name === "current_invoice_cost" ||
          name === "insured_value" ||
          name === "depreciation_value" ||
          name === "appraiser_value"
        ) {
          updated[name] = handleCurrencyFormatting(value);
        }

        // Auto-calculate depreciation_value when current_invoice_cost or depreciation changes
        if (name === "current_invoice_cost" || name === "depreciation") {
          const invoiceCost = parseCurrency(
            name === "current_invoice_cost"
              ? value
              : updated.current_invoice_cost
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
    ]
  );

  // Handle SingleSearchSelect changes
  const handleSelectChange = useCallback(
    (name, value) => {
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

    // Attempt to parse JSON structure first
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && parsed.path) {
        const cleanPath = parsed.path.startsWith("/")
          ? parsed.path
          : `/${parsed.path}`;
        return `${baseUrl}${cleanPath}`;
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
    setFlexibleFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, [fieldType]: value } : field
      )
    );
  }, []);

  // Add flexible fields (Add One - 2 fields, Add Two - 4 fields)
  const addFlexibleFields = useCallback(
    (sectionName, fieldsCount) => {
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

        // Simple logic: if value exists, send it; if null/empty, send null
        // Note: Textarea values (with line breaks, spaces, formatting) are preserved as-is
        if (value !== null && value !== undefined && value !== "") {
          formData.append(key, String(value)); // Preserve all formatting including line breaks
        } else {
          formData.append(key, ""); // Send empty string for null/empty values
        }
      });

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
      parseCurrency,
      convertNumberToWordsIndian,
      numberToWords,
    ]
  );

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

      // Simple logic: if value exists, send it; if null/empty, send null
      // Note: Textarea values (with line breaks, spaces, formatting) are preserved as-is
      if (value !== null && value !== undefined && value !== "") {
        reportData[key] = String(value); // Preserve all formatting including line breaks
      } else {
        reportData[key] = null; // Send null for empty values
      }
    });

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
        reportData[`flexible_fields[${formDataIndex}][field_value]`] =
          String(field.field_value || ""); // Preserve all formatting including line breaks
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
          reportData[`flexible_fields[${formDataIndex}][field_value]`] =
            String(field.field_value_2 || ""); // Preserve all formatting including line breaks
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

    /*    console.log('📤 CVReport - Sending to backend - reportData:', reportData);
    console.log('📤 CVReport - amount_in_words in payload:', reportData.amount_in_words);

    // Debug log for payload
    console.log('🔍 CVReport Save - Final reportData:', reportData);
    console.log('🔍 CVReport Save - amount_in_words in payload:', reportData.amount_in_words);
    console.log('🔍 CVReport Save - fair_market_value:', reportFormData.fair_market_value); */

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
    );
  }, [
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
  ]);

  // Function to call external RC API and prefill form data
  const fetchRCDetailsFromExternalAPI = useCallback(
    async (registrationNumber) => {
      if (!registrationNumber || registrationNumber.trim() === "") {
        /* console.log("🚫 CVReport External API - Skipping: Registration number is empty"); */
        return;
      }

      const apiToken = process.env.REACT_APP_ATTESTR_API_TOKEN;
      if (!apiToken) {
        // API token not found
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

        /* console.log("✅ CVReport External API - Response received:", response.data); */

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
            if (rcData.chassisNumber) updated.chassis_no = rcData.chassisNumber;
            if (rcData.engineNumber)
              updated.engine_no_detail = rcData.engineNumber;
            // if (rcData.makerDescription) updated.asset_make = rcData.makerDescription;
            if (rcData.makerModel) {
              updated.model = rcData.makerModel;
              updated.asset_classification = rcData.makerModel;
            }
            if (rcData.bodyType) updated.body_type = rcData.bodyType;
            if (rcData.fuelType) updated.fuel_type = rcData.fuelType;

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
            if (rcData.cubicCapacity)
              updated.cubic_capacity = rcData.cubicCapacity;
            if (rcData.seatingCapacity)
              updated.seating_capacity = rcData.seatingCapacity;
            if (rcData.colorType) updated.vehicle_colour = rcData.colorType;

            // Owner serial number mapping (ownerNumber -> owner_serial_no)
            if (rcData.ownerNumber) {
              updated.owner_serial_no = formatOwnerNumber(rcData.ownerNumber);
            }

            // Gross vehicle weight mapping (grossWeight -> gross_vehicle_weight)
            if (rcData.grossWeight) {
              updated.gross_vehicle_weight = rcData.grossWeight.toString();
            }

            // RC, Permit, Tax, Fitness & Insurance details
            if (rcData.fitnessUpto) updated.fitness_upto = rcData.fitnessUpto;
            if (rcData.taxUpto) updated.tax_upto = rcData.taxUpto;
            if (rcData.permitUpto) updated.permit_upto = rcData.permitUpto;
            if (rcData.permitType) updated.permit_type = rcData.permitType;

            // Insurance details mapping
            if (rcData.insuranceProvider) {
              updated.insurance_co_name = rcData.insuranceProvider;
            }
            if (rcData.insurancePolicyNumber) {
              updated.policy_no = rcData.insurancePolicyNumber;
            }
            if (rcData.insuranceUpto) {
              updated.period_of_insurance = rcData.insuranceUpto;
            }

            /* console.log("📝 CVReport External API - Updated form data:", updated); */
            return updated;
          });

          /*  console.log("📝 CVReport External API - Form data prefilled successfully"); */

          // Set flag to trigger auto-save after state is updated
          // We'll use a useEffect to watch for the state change and trigger save
          shouldAutoSaveAfterApiRef.current = true;
          /* console.log("💾 CVReport External API - Auto-save flag set, will trigger save after state update"); */

          // Set loading to false after data is prefilled (with small delay to ensure state update)
          setTimeout(() => {
            setExternalApiLoading(false);
          }, 500);
        } else {
          // Invalid RC response
          toast.warning("RC details could not be fetched or RC is invalid");
          setExternalApiLoading(false);
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
      }
    },
    []
  );

  // Call external RC API only when report is blank (no existing report data)
  useEffect(() => {
    /* console.log("🔍 CVReport External API - Checking conditions...", {
      reportLoading,
      reportLoadingStarted: reportLoadingStartedRef.current,
      reportFetchCompleted: reportFetchCompleted,
      hasCurrentReport: !!currentReport,
      hasReportData: !!currentReport?.report,
      apiAlreadyCalled: externalApiCalledRef.current,
      hasRegistrationNumber: !!order?.registration_number,
    }); */

    // Check if report loading is complete, report is blank, and we haven't called the API yet
    // IMPORTANT: Wait for initial report fetch to complete before calling external API
    if (
      reportFetchCompleted && // Initial report fetch has completed (critical to prevent calling API before checking for existing data)
      !currentReport?.report && // No existing report (blank report)
      !externalApiCalledRef.current && // API hasn't been called yet
      order?.registration_number && // Registration number exists
      order.registration_number.trim() !== "" // Registration number is not empty
    ) {
      /* console.log("🔍 CVReport External API - Conditions met. Report is blank, calling external API..."); */
      externalApiCalledRef.current = true; // Mark as called to prevent multiple calls
      fetchRCDetailsFromExternalAPI(order.registration_number);
    } else {
      if (!reportFetchCompleted) {
        // Waiting for report fetch
      } else if (currentReport?.report) {
        // Report already exists
      } else if (externalApiCalledRef.current) {
        // API already called
      } else if (
        !order?.registration_number ||
        order.registration_number.trim() === ""
      ) {
        // Registration number not available
      }
    }
  }, [
    reportLoading,
    currentReport,
    order?.registration_number,
    fetchRCDetailsFromExternalAPI,
    reportFetchCompleted,
  ]);

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
        reportFormData.chassis_no ||
        reportFormData.engine_no_detail ||
        reportFormData.registered_owner_name ||
        reportFormData.no_of_cylinder ||
        reportFormData.owner_serial_no ||
        reportFormData.gross_vehicle_weight;

      if (hasApiData) {
        /* console.log("💾 CVReport External API - State updated, triggering auto-save now"); */
        shouldAutoSaveAfterApiRef.current = false; // Reset flag to prevent multiple saves
        // Use a small timeout to ensure all state updates are batched
        setTimeout(() => {
          handleSaveReport();
        }, 100);
      }
    }
  }, [reportFormData, handleSaveReport]);

  // Handle loading completion when no external API is needed
  useEffect(() => {
    // If report fetch is complete, no external API is needed, and we're not loading external API
    if (
      reportFetchCompleted &&
      !reportLoading &&
      !externalApiLoading &&
      (currentReport?.report || !externalApiCalledRef.current)
    ) {
      // Small delay to ensure all state updates are complete
      const timer = setTimeout(() => {
        setExternalApiLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [reportFetchCompleted, reportLoading, externalApiLoading, currentReport]);

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

  // Calculate overall loading state
  const isLoading = reportLoading || externalApiLoading;

  return (
    <section className="order-details-wrapper">
      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            className="spinner-border text-primary"
            role="status"
            style={{ width: "3rem", height: "3rem" }}
          >
            {/* <span className="visually-hidden">Loading...</span> */}
          </div>
          <div
            style={{
              marginTop: "1rem",
              fontSize: "16px",
              color: "#333",
              textAlign: "center",
            }}
          >
            {reportLoading && externalApiLoading
              ? "Loading Report Data and Fetching RC Details..."
              : reportLoading
              ? "Loading Report Data..."
              : "Fetching RC Details from External API..."}
          </div>
        </div>
      )}
      <div className="row">
        {/* Reference Number Form Section */}
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div className="order-report-container">
            <div className="d-flex justify-content-between align-items-center">
              <h2>CV Report</h2>
              <Link to={`/orders/${id}/details/images`} className="btn btn-primary">View Images</Link>
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
                      This field controls all heading fields below. Enter the category information in the format: (category_name) / (sub_category_name) (child_category_name)
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
                      Ref NO. <span className="text-danger">*</span>
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
                        name="ref_no_id"
                        value={reportFormData.ref_no_id}
                        onChange={handleFormChange}
                        placeholder="Enter ID"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="report_date">
                      Report Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="report_date"
                      name="report_date"
                      value={reportFormData.report_date}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="valuer_name">
                      Valuer Name <span className="text-danger">*</span>
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
                      License No <span className="text-danger">*</span>
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
                      Valuation Purpose <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "FINANCIAL USAGE", label: "FINANCIAL USAGE" },
                        {
                          value: "INUSRANCE USAGE",
                          label: "INUSRANCE USAGE",
                        },
                        {
                          value: "REPO PURPOSE",
                          label: "REPO PURPOSE",
                        },
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
                      Date of Inspection <span className="text-danger">*</span>
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
                      Place of Inspection <span className="text-danger">*</span>
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
                      <span className="text-danger">*</span>
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
                      <span className="text-danger">*</span>
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
                      Proposed Owner Name <span className="text-danger">*</span>
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
                      <span className="text-danger">*</span>
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
                      Registration No <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="registration_no"
                      name="registration_no"
                      value={reportFormData.registration_no}
                      onChange={handleFormChange}
                      placeholder="MH01AB1234"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="registration_date">
                      Registration Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="registration_date"
                      name="registration_date"
                      value={reportFormData.registration_date}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="registered_location">
                      Registered Location <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="registered_location"
                      name="registered_location"
                      value={reportFormData.registered_location}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="owner_serial_no">
                      Owner Serial No <span className="text-danger">*</span>
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
                      Manufacture Year <span className="text-danger">*</span>
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
                      Asset Make <span className="text-danger">*</span>
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
                      Model <span className="text-danger">*</span>
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
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="engine_no_detail">
                      Engine No./ Detail <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="engine_no_detail"
                      name="engine_no_detail"
                      value={reportFormData.engine_no_detail}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="chassis_no">
                      Chassis No <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="chassis_no"
                      name="chassis_no"
                      value={reportFormData.chassis_no}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="body_type">
                      Body Type <span className="text-danger">*</span>
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
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="fuel_type">
                    Chassis No Type <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "ORIGINAL", label: "ORIGINAL" },
                        { value: "NOT PUNCHED", label: "NOT PUNCHED" },
                        { value: "NOT BEDING IN CHASSIS", label: "NOT BEDING IN CHASSIS" },
                      ]}
                      value={reportFormData.chassis_no_type}
                      onChange={(value) => handleSelectChange("chassis_no_type", value)}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="fuel_type">
                      Fuel Type <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="fuel_type"
                      name="fuel_type"
                      value={reportFormData.fuel_type}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="kilometer_reading">
                      Hours / Kilometer Reading{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="kilometer_reading"
                      name="kilometer_reading"
                      value={reportFormData.kilometer_reading}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="invoice_no">Invoice No. & Date</label>
                    <input
                      type="text"
                      className="form-field mb-2"
                      id="invoice_no"
                      name="invoice_no"
                      value={reportFormData.invoice_no}
                      onChange={handleFormChange}
                      placeholder="Invoice No."
                    />
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
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="hyp_with">
                      Hyp With <span className="text-danger">*</span>
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
                      Asset Classification{" "}
                      <span className="text-danger">*</span>
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
                      No of Cylinders <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
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
                      Engine Condition <span className="text-danger">*</span>
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
                      Chassis Condition <span className="text-danger">*</span>
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
                      Body Condition <span className="text-danger">*</span>
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
                      Cabin Condition <span className="text-danger">*</span>
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
                      Electrical Condition{" "}
                      <span className="text-danger">*</span>
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
                <div className="col-md-2">
                  <div className="form-group">
                    <label htmlFor="gear_transmission">
                      Gear Transmission <span className="text-danger">*</span>
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
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="battery_available"
                      name="battery_available"
                      value={reportFormData.battery_available}
                      readOnly
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="gross_vehicle_weight">
                      Gross Vehicle Weight{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="gross_vehicle_weight"
                      name="gross_vehicle_weight"
                      value={reportFormData.gross_vehicle_weight}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label>Tyre Condition</label>
                    <div className="row">
                      <div className="col-md-6">
                        <label htmlFor="front_tyre_no">
                          Number Of Front Tyres{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="front_tyre_no"
                          name="front_tyre_no"
                          value={reportFormData.front_tyre_no}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <label htmlFor="front_tyre_condition">
                          Front Tyre Condition{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="front_tyre_condition"
                          name="front_tyre_condition"
                          value={reportFormData.front_tyre_condition}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>&nbsp;</label>
                    <div className="row">
                      <div className="col-md-6">
                        <label htmlFor="middle_tyre_no">
                          Number Of Middle Tyres
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="middle_tyre_no"
                          name="middle_tyre_no"
                          value={reportFormData.middle_tyre_no}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div className="col-md-6">
                        <label htmlFor="middle_tyre_condition">
                          Middle Tyre Condition
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="middle_tyre_condition"
                          name="middle_tyre_condition"
                          value={reportFormData.middle_tyre_condition}
                          onChange={handleFormChange}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>&nbsp;</label>
                    <div className="row">
                      <div className="col-md-6">
                        <label htmlFor="rear_tyre_no">
                          Number Of Rear Tyres{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="rear_tyre_no"
                          name="rear_tyre_no"
                          value={reportFormData.rear_tyre_no}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <label htmlFor="rear_tyre_condition">
                          Rear Tyre Condition{" "}
                          <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="rear_tyre_condition"
                          name="rear_tyre_condition"
                          value={reportFormData.rear_tyre_condition}
                          onChange={handleFormChange}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>&nbsp;</label>
                    <div className="row">
                      <div className="col-md-6">
                        <label htmlFor="no_of_tyres">
                          Total Tyres <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          id="no_of_tyres"
                          name="no_of_tyres"
                          value={totalTyres}
                          readOnly
                          style={{
                            backgroundColor: "#f8f9fa",
                            cursor: "not-allowed",
                          }}
                          placeholder="Auto-calculated from tyre counts"
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <label htmlFor="stepney">
                          Stepney- Yes/no <span className="text-danger">*</span>
                        </label>
                        <SingleSearchSelect
                          options={[
                            { value: "YES", label: "YES" },
                            { value: "NO", label: "NO" },
                          ]}
                          value={reportFormData.stepney}
                          onChange={(value) =>
                            handleSelectChange("stepney", value)
                          }
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="horse_power">
                      Horse Power <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="horse_power"
                      name="horse_power"
                      value={reportFormData.horse_power}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="mechanical_unit_condition">
                      Mechanical Unit Condition{" "}
                      <span className="text-danger">*</span>
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
                      value={reportFormData.mechanical_unit_condition}
                      onChange={(value) =>
                        handleSelectChange("mechanical_unit_condition", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="cubic_capacity">
                      Cubic Capacity <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="cubic_capacity"
                      name="cubic_capacity"
                      value={reportFormData.cubic_capacity}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="suspension">
                      Suspension <span className="text-danger">*</span>
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
                      value={reportFormData.suspension}
                      onChange={(value) =>
                        handleSelectChange("suspension", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="seating_capacity">
                      Seating Capacity <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="seating_capacity"
                      name="seating_capacity"
                      value={reportFormData.seating_capacity}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="tool_kit_available">
                      Tool Kit Available <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "YES", label: "YES" },
                        { value: "NO", label: "NO" },
                      ]}
                      value={reportFormData.tool_kit_available}
                      onChange={(value) =>
                        handleSelectChange("tool_kit_available", value)
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="vehicle_colour">
                      Vehicle Colour <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="vehicle_colour"
                      name="vehicle_colour"
                      value={reportFormData.vehicle_colour}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="color_condition">
                      Color Condition <span className="text-danger">*</span>
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
                  <h4>RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS</h4>
                  <hr />
                </div>
                <div className="col-12">
                  <div className="form-group">
                    <label htmlFor="rc_permit_tax_fitness_insurance_heading">
                      RC Permit Tax Fitness Insurance Heading
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
                      RC Book Verified <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY", label: "COPY" },
                        {
                          value: "COPY NOT AVAILABLE",
                          label: "COPY NOT AVAILABLE",
                        },
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
                    <label htmlFor="invoice_verified">
                      Invoice Verified <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY", label: "COPY" },
                        {
                          value: "COPY NOT AVAILABLE",
                          label: "COPY NOT AVAILABLE",
                        },
                      ]}
                      value={reportFormData.invoice_verified}
                      onChange={(value) =>
                        handleSelectChange("invoice_verified", value)
                      }
                      required
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
                </div>
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
              </div>

              <div className="row">
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
                    <label htmlFor="period_of_insurance">
                      Period Of Insurance
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="period_of_insurance"
                      name="period_of_insurance"
                      value={reportFormData.period_of_insurance}
                      onChange={handleFormChange}
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
                      Insurance Verified <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY", label: "COPY" },
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
                    <label htmlFor="current_invoice_cost">
                      Current Invoice Cost{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="current_invoice_cost"
                      name="current_invoice_cost"
                      value={reportFormData.current_invoice_cost}
                      onChange={handleCurrencyChange}
                      placeholder="₹ 0.00"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="depreciation">
                      Depreciation <span className="text-danger">*</span>
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
                      Depreciation Value <span className="text-danger">*</span>
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
                      Appraiser Value <span className="text-danger">*</span>
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
                      Fair Market Value <span className="text-danger">*</span>
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
                      <span className="text-danger">*</span>
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
                      No of Photographs <span className="text-danger">*</span>
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
                      No of Collages <span className="text-danger">*</span>
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
                      Valuer Comments/remarks{" "}
                      <span className="text-danger">*</span>
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
                      Declaration <span className="text-danger">*</span>
                    </label>
                    <p className="mb-0">
                      The aforesaid COMMERCIAL VEHICLE / TATA LPT 3518 inspected
                      by us & found in{" "}
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
                      ]}
                      value={reportFormData.declaration}
                      onChange={(value) =>
                        handleSelectChange("declaration", value)
                      }
                      required
                    />
                    <p className="mb-0">
                      on the date of my inspection.This Report issued for
                      [valuation_purpose] of HINDUJA LEYLAND FINANCE LTD, PUNE,
                      GUJARAT Only.
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

              {/* Generate Report Button */}
              <div className="row">
                <div className="col-12 text-center">
                  <div className="form-buttons">
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={generating}
                    >
                      {generating
                        ? "Generating Report..."
                        : "Generate CV Report"}
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

export default CVReport;
