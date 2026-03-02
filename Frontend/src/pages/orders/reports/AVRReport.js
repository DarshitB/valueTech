import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
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

function AVRReport() {
  const { id } = useParams();
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
  // Set page title using custom hook
  const { setTitle } = usePageTitle();
  
  // State for report type selection (Rough/Production)
  const [reportTypeSelection, setReportTypeSelection] = useState("Rough");

  // State to track if initial report fetch has completed
  const [reportFetchCompleted, setReportFetchCompleted] = useState(false);
  // Ref to track if we've seen the report loading state
  const reportLoadingStartedRef = useRef(false);

  // Clear report data when component mounts or order changes
  useEffect(() => {
    // Clear any existing report data first
    dispatch(clearCurrentReport());
    isDirtyRef.current = false;
    initialFormDataRef.current = null;
    initialFlexibleFieldsRef.current = null;
    reportLoadingStartedRef.current = false;
    setReportFetchCompleted(false);
  }, [dispatch, id]);

  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      dispatch(
        fetchOrderReport({
          orderId: id,
          reportType: "report_avr",
          silent: true,
        })
      );
      // Fetch asset makes for AVR report
      dispatch(fetchAssetMakesForReports("report_avr"));
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
      report_type: "report_avr",
      ref_no_year: new Date().getFullYear().toString(),
      ref_no_bank: "",
      ref_no_code: "VKM",
      ref_no_month: `SFW-${getCurrentMonthAbbreviationLocal()}-`, // Default: SFW-(CURRENT_MONTH)
      ref_no_id: "",
      lan_no: "",
      report_date: getCurrentDateLocal(),
      bank_name: "",
      branch_name: "",
      state_name: "",
      model_number: "",
      officer_name: "",
      officer_designation: "",
      inspected_item: "",
      inspected_date: "",
      inspection_address: "",
      customer_name: "",
      address_as_per_kyc: "",
      machinery_locations: "",
      lan_city_no: "",
      date_of_disbursement: "",
      date_of_invoice_delivery_no: "",
      invoice_price: "",
      invoice_price_in_word: "",
      loan_amount: "",
      loan_amount_in_word: "",
      lien_of_bank: "",
      model_name: "",
      chassis_no: "",
      machine_serial_no: "",
      engine_no: "",
      regn_no: "",
      installed_running: "",
      installed_asset_whether_functional_or_not: "",
      hour_meter_reading: "",
      class_make_of_asset: "",
      year_of_mfg: "",
      invoice_purchase_order_no: "",
      pro_owner_address: "",
      insurer_policy_no: "",
      insurance_validity_insured_value: "",
      insurance_having_lien_of_bank: "",
      total_crane_weight_capacity: "",
      material_usefulness: "",
      colour: "",
      observation: "",
      status_of_machine: "",
      visit_done_by: "",
      place: "",
      date_time: "",
      surveyor: "V.K. ASSOCIATES",
      license_no: "SLA-60827",
      surveyor_location: "MUMBAI, MAHARASHTRA",
    });

    // Reset flexible fields
    setFlexibleFields([]);

    // Reset chassis print file
    setChasisPrintFile(null);

    // Clear the cleared fields tracking when form resets
    clearedFieldsRef.current.clear();
  }, [id]);

  // Get current date in DD-MM-YYYY format
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

  // Function to get license number based on surveyor name
  const getLicenseNumber = useCallback((surveyorName) => {
    switch (surveyorName) {
      case "V.K. ASSOCIATES":
        return "SLA-60827";
      case "VALUETECH SOLUTIONS":
        return "CAT-VII-A-6019";
      case "VISHAL D. KOTHARI":
        return "SLA-60827";
      default:
        return "";
    }
  }, []);

  // Function to get reference number code based on surveyor name
  const getRefNoCode = useCallback((surveyorName) => {
    if (!surveyorName) return "";

    const name = surveyorName.toUpperCase();
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

  // Function to parse currency value
  const parseCurrency = useCallback((value) => {
    if (!value || typeof value !== "string") return 0;
    return parseFloat(value.replace(/,/g, "")) || 0;
  }, []);

  // Function to convert number to words (Indian format)
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
        &gt; AVR Report
      </>
    );
  }, [id, order, setTitle]);

  // Form state
  const [reportFormData, setReportFormData] = useState({
    report_type: "report_avr",
    ref_no_year: new Date().getFullYear().toString(),
    ref_no_bank: "",
    ref_no_code: "VKM",
    ref_no_month: `SFW-${getCurrentMonthAbbreviation()}-`, // Default: SFW-(CURRENT_MONTH)
    ref_no_id: "",
    lan_no: "",
    report_date: getCurrentDate(),
    bank_name: "",
    branch_name: "",
    state_name: "",
    model_number: "",
    officer_name: "",
    officer_designation: "",
    inspected_item: "",
    inspected_date: "",
    inspection_address: "",
    customer_name: "",
    address_as_per_kyc: "",
    machinery_locations: "",
    lan_city_no: "",
    date_of_disbursement: "",
    date_of_invoice_delivery_no: "",
    invoice_price: "",
    invoice_price_in_word: "",
    loan_amount: "",
    loan_amount_in_word: "",
    lien_of_bank: "",
    model_name: "",
    chassis_no: "",
    machine_serial_no: "",
    engine_no: "",
    regn_no: "",
    installed_running: "",
    installed_asset_whether_functional_or_not: "",
    hour_meter_reading: "",
    class_make_of_asset: "",
    year_of_mfg: "",
    invoice_purchase_order_no: "",
    pro_owner_address: "",
    insurer_policy_no: "",
    insurance_validity_insured_value: "",
    insurance_having_lien_of_bank: "",
    total_crane_weight_capacity: "",
    material_usefulness: "",
    colour: "",
    observation: "",
    status_of_machine: "",
    visit_done_by: "",
    place: "",
    date_time: "",
    surveyor: "V.K. ASSOCIATES",
    license_no: "SLA-60827",
    surveyor_location: "MUMBAI, MAHARASHTRA",
  });

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // File state for chassis print
  const [chasisPrintFile, setChasisPrintFile] = useState(null);
  const [chasisPrintPreviewUrl, setChasisPrintPreviewUrl] = useState("");

  // Track fields that were explicitly cleared by the user (date and currency fields)
  const clearedFieldsRef = useRef(new Set());

  // Dirty tracking refs — auto-save on navigation
  const isDirtyRef = useRef(false);
  const initialFormDataRef = useRef(null);
  const initialFlexibleFieldsRef = useRef(null);
  // Ref to store the last intercepted navigation target
  const pendingNavRef = useRef(null);

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      setReportFormData((prev) => ({
        ...prev,
        ref_no_bank: order?.bank_initial || "",
        bank_name: order?.bank_name || "",
        branch_name: order?.branch_name || "",
        state_name: order?.state_name || "",
        // ALWAYS use surveyor from order's valuer_name (never from report or previous state)
        surveyor: order?.valuer_name || "",
        license_no: order?.valuer_name
          ? getLicenseNumber(order.valuer_name)
          : "",
        ref_no_code: order?.valuer_name ? getRefNoCode(order.valuer_name) : "",
      }));
    }
  }, [order, getLicenseNumber, getRefNoCode]);

  // Populate form data from fetched AVR report (if available)
  useEffect(() => {
    const report = currentReport?.report;
    if (!report) {
      // Ensure ref_no_month has a default value if it's empty or null
      setReportFormData((prev) => {
        if (!prev.ref_no_month || prev.ref_no_month.trim() === "") {
          const months = [
            "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
            "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
          ];
          const currentMonth = new Date().getMonth();
          return {
            ...prev,
            ref_no_month: `SFW-${months[currentMonth]}-`,
          };
        }
        return prev;
      });
      return; // Gracefully do nothing when data is null
    }

    // Validate that the report belongs to the current order
    if (currentReport?.order_id && currentReport.order_id !== parseInt(id)) {
      console.warn(
        `Report data for order ${currentReport.order_id} does not match current order ${id}. Ignoring report data.`
      );
      return;
    }

    // Clear the cleared fields tracking when loading report data
    clearedFieldsRef.current.clear();

    setReportFormData((prev) => {
      const updated = { ...prev };

      // More robust field population - try to set all relevant fields
      Object.entries(report).forEach(([key, value]) => {
        // Skip system fields and valuer-related fields (those come from order only)
        if (
          key.startsWith("created_") ||
          key.startsWith("updated_") ||
          key === "id" ||
          key === "order_id" ||
          key === "flexible_fields" ||
          key === "surveyor" ||
          key === "license_no" ||
          key === "ref_no_code"
        ) {
          return;
        }

        // Convert null to empty string
        const fieldValue = value !== null ? value : "";

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

      // Ensure ref_no_month has a default value if it's empty or null
      if (!updated.ref_no_month || updated.ref_no_month.trim() === "") {
        const months = [
          "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
        ];
        const currentMonth = new Date().getMonth();
        updated.ref_no_month = `SFW-${months[currentMonth]}-`;
      }

      // Auto-generate invoice_price_in_word if invoice_price exists but invoice_price_in_word doesn't
      if (updated.invoice_price && (!updated.invoice_price_in_word || updated.invoice_price_in_word.trim() === "")) {
        const amount = parseCurrency(updated.invoice_price);
        if (amount > 0) {
          updated.invoice_price_in_word = convertNumberToWordsIndian(amount);
        }
      }

      // Auto-generate loan_amount_in_word if loan_amount exists but loan_amount_in_word doesn't
      if (updated.loan_amount && (!updated.loan_amount_in_word || updated.loan_amount_in_word.trim() === "")) {
        const amount = parseCurrency(updated.loan_amount);
        if (amount > 0) {
          updated.loan_amount_in_word = convertNumberToWordsIndian(amount);
        }
      }

      return updated;
    });

    if (Array.isArray(report.flexible_fields)) {
      setFlexibleFields(report.flexible_fields);
    }
  }, [currentReport, id, parseCurrency, convertNumberToWordsIndian]);

  // Track when the initial report fetch completes
  useEffect(() => {
    // Step 1: Mark that loading has started when reportLoading becomes true
    if (reportLoading && !reportLoadingStartedRef.current) {
      reportLoadingStartedRef.current = true;
    }

    // Step 2: Mark completed only after loading started AND becomes false
    if (!reportLoading && reportLoadingStartedRef.current && !reportFetchCompleted) {
      const timer = setTimeout(() => {
        setReportFetchCompleted(true);
      }, 300);
      return () => clearTimeout(timer);
    }

    // Fallback: if loading state never detected after 1.5s, assume completed
    if (!reportLoadingStartedRef.current && !reportFetchCompleted) {
      const fallbackTimer = setTimeout(() => {
        if (!reportFetchCompleted) {
          reportLoadingStartedRef.current = true;
          setReportFetchCompleted(true);
        }
      }, 1500);
      return () => clearTimeout(fallbackTimer);
    }
  }, [reportLoading, reportFetchCompleted]);

  // Capture a clean snapshot the first time initial loading finishes.
  // Any change after this point is considered "dirty".
  useEffect(() => {
    if (!reportLoading && initialFormDataRef.current === null && reportFetchCompleted) {
      initialFormDataRef.current = reportFormData;
      initialFlexibleFieldsRef.current = flexibleFields;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportLoading, reportFetchCompleted]);

  const handleFormChange = (e) => {
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

    setReportFormData((prev) => {
      let updated = {
        ...prev,
        [name]: value,
      };

      // Handle currency formatting and auto-convert to words for invoice_price
      if (name === "invoice_price") {
        // Format as currency (Indian number format)
        const formattedValue = handleCurrencyFormatting(value);
        updated[name] = formattedValue;

        // Auto-convert to words
        if (!formattedValue || formattedValue.trim() === "") {
          updated.invoice_price_in_word = "";
        } else {
          const amount = parseCurrency(formattedValue);
          updated.invoice_price_in_word = amount > 0
            ? convertNumberToWordsIndian(amount)
            : "";
        }
      }

      // Handle currency formatting and auto-convert to words for loan_amount
      if (name === "loan_amount") {
        // Format as currency (Indian number format)
        const formattedValue = handleCurrencyFormatting(value);
        updated[name] = formattedValue;

        // Auto-convert to words
        if (!formattedValue || formattedValue.trim() === "") {
          updated.loan_amount_in_word = "";
        } else {
          const amount = parseCurrency(formattedValue);
          updated.loan_amount_in_word = amount > 0
            ? convertNumberToWordsIndian(amount)
            : "";
        }
      }

      return updated;
    });
  };

  // Handle SingleSearchSelect changes
  const handleSelectChange = (name, value) => {
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

      // Auto-update license_no when surveyor changes
      if (name === "surveyor") {
        updated.license_no = getLicenseNumber(value);
      }

      return updated;
    });
  };

  // Handle file change for chassis print
  const handleFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setChasisPrintFile(file);
  }, []);

  // Resolve chassis print image URL
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

  // Handle preview URL for chassis print
  useEffect(() => {
    let objectUrl = "";

    if (chasisPrintFile instanceof File) {
      objectUrl = URL.createObjectURL(chasisPrintFile);
      setChasisPrintPreviewUrl(objectUrl);
    } else {
      const existingValue = reportFormData?.chassis_no_pencil_impression;
      if (
        existingValue &&
        existingValue !== null &&
        existingValue !== undefined
      ) {
        const resolved = resolveChassisImageUrl(existingValue);
        setChasisPrintPreviewUrl(resolved);
      } else {
        setChasisPrintPreviewUrl("");
      }
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    chasisPrintFile,
    reportFormData?.chassis_no_pencil_impression,
    resolveChassisImageUrl,
  ]);

  // Handle date input formatting (DD-MM-YYYY)
  const handleDateChange = (e) => {
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
  };

  // Handle flexible field changes
  const handleFlexibleFieldChange = (fieldId, fieldType, value) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    setFlexibleFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, [fieldType]: value } : field
      )
    );
  };

  // Add flexible fields (Add One - 2 fields only)
  const addFlexibleFields = (sectionName) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    // Calculate the next order by counting total fields in this section
    let nextOrder = 1;
    flexibleFields
      .filter((f) => f.section_name === sectionName)
      .forEach((field) => {
        nextOrder += 1; // Add One contributes 1 field
      });

    const fieldId = `${sectionName}_${Date.now()}`;

    const newField = {
      id: fieldId,
      section_name: sectionName,
      col_span: 1, // Only Add One (2 fields)
      field_label: "",
      field_value: "",
      field_order: nextOrder, // This will be the order for the first field
    };

    setFlexibleFields((prev) => [...prev, newField]);
  };

  // Remove flexible field
  const removeFlexibleField = (fieldId) => {
    if (initialFormDataRef.current !== null) isDirtyRef.current = true;
    setFlexibleFields((prev) => prev.filter((field) => field.id !== fieldId));
  };

  // Validate flexible fields
  const validateFlexibleFields = () => {
    const errors = [];

    flexibleFields.forEach((field, index) => {
      if (!field.field_label.trim() || !field.field_value.trim()) {
        errors.push(
          `Flexible field ${index + 1}: Label and Value are required`
        );
      }
    });

    return errors;
  };

  // Handle form submission for report generation
  const handleReportSubmit = (e) => {
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

    // Create FormData for multipart/form-data submission
    const formData = new FormData();
    
    // Add report type selection (Rough/Production)
    formData.append("report_type_selection", reportTypeSelection);

    // Add all form fields to FormData - simple logic: if value exists send it, if null/empty send null
    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      // Simple logic: if value exists, send it; if null/empty, send null
      // Note: Textarea values (with line breaks, spaces, formatting) are preserved as-is
      if (value !== null && value !== undefined && value !== "") {
        formData.append(key, String(value)); // Preserve all formatting including line breaks
      } else {
        formData.append(key, ""); // Send empty string for null/empty values
      }
    });

    /* // Debug: Log the form data being sent
    console.log("Form Data being sent:", reportFormData);
    console.log("Flexible Fields being sent:", flexibleFields);

    // Debug: Log FormData contents
    console.log("FormData contents:");
    for (let [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    } */

    // Add chassis print file if selected
    if (chasisPrintFile) {
      formData.append("chassis_no_pencil_impression", chasisPrintFile);
    }

    // Add flexible fields to FormData with proper sequential ordering
    let formDataIndex = 0;
    flexibleFields.forEach((field) => {
      // Add field (only Add One functionality)
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
    });

    /*  // Debug: Log final FormData contents after flexible fields
    console.log("Final FormData contents after flexible fields:");
    for (let [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    } */

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
  };

  const buildSavePayload = useCallback(() => {
    const reportData = {};

    // All form fields
    Object.keys(reportFormData).forEach((key) => {
      const value = reportFormData[key];
      reportData[key] = (value !== null && value !== undefined && value !== "")
        ? String(value)
        : null;
    });

    // Include chassis print file if available
    if (chasisPrintFile) {
      reportData["chassis_no_pencil_impression"] = chasisPrintFile;
    }

    // Flexible fields
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

    return reportData;
  }, [reportFormData, flexibleFields, chasisPrintFile]);

  // Handle save report data
  const handleSaveReport = () => {
    // Create report data object with only non-empty fields
    const reportData = buildSavePayload();

    // Only proceed if there's actual data to save
    if (Object.keys(reportData).length === 0) {
      toast.warning(
        "No data to save. Please fill in some fields before saving."
      );
      return;
    }

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
  };

  // In-app navigation blocker — works with BrowserRouter (no data router needed).
  // Intercepts pushState (Link clicks) and popstate (browser back/forward).
  // Saves silently then navigates. 100% reliable for in-app navigation.
  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history);

    window.history.pushState = function (state, title, url) {
      if (!isDirtyRef.current) {
        return originalPushState(state, title, url);
      }

      pendingNavRef.current = { type: "push", state, title, url };

      const saveAndNavigate = async () => {
        try {
          const payload = buildSavePayload();
          const result = await dispatch(
            saveOrderReport({ orderId: id, reportData: payload })
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
            window.dispatchEvent(
              new PopStateEvent("popstate", { state: pendingNavRef.current.state })
            );
            pendingNavRef.current = null;
          }
        }
      };

      saveAndNavigate();
    };

    const handlePopState = async (e) => {
      if (!isDirtyRef.current) return;

      originalPushState(window.history.state, "", window.location.href);

      try {
        const payload = buildSavePayload();
        const result = await dispatch(
          saveOrderReport({ orderId: id, reportData: payload })
        );
        if (result.meta.requestStatus === "fulfilled") {
          isDirtyRef.current = false;
          initialFormDataRef.current = reportFormData;
          initialFlexibleFieldsRef.current = flexibleFields;
        }
      } catch (_) {
        // toast already shown by thunk
      } finally {
        window.history.go(-1);
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
  const renderFlexibleFields = (sectionName) => {
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

        {/* Add One: 2 fields (1 heading, 1 value) */}
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
      </div>
    ));
  };

  return (
    <section className="order-details-wrapper">
      <div className="row">
        {/* AVR Report Form Section */}
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div className="order-report-container">
            <div className="d-flex justify-content-between align-items-center">
              <h2>AVR Report</h2>
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
            <form className="body-form-box" onSubmit={handleReportSubmit}>
              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
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
                        value={reportFormData.ref_no_bank}
                        onChange={handleFormChange}
                        readOnly
                      />
                      <span className="ref-no-slash">/</span>
                      <input
                        type="text"
                        className="form-field"
                        name="ref_no_code"
                        value={reportFormData.ref_no_code}
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
              </div>

              <div className="row">
                <div className="col-md-8">
                  <div className="form-group">
                    <label>
                      LAN no. <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="lan_no"
                      value={reportFormData.lan_no}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="report_date"
                      value={reportFormData.report_date}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>Post Disbursement Asset Verification Report</h4>
                  <hr />
                  <div className="form-group">
                    <label>
                      Bank Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="bank_name"
                      value={reportFormData.bank_name}
                      onChange={handleFormChange}
                      required
                      readOnly
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Branch Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="branch_name"
                      value={reportFormData.branch_name}
                      onChange={handleFormChange}
                      required
                      readOnly
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      State Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="state_name"
                      value={reportFormData.state_name}
                      onChange={handleFormChange}
                      required
                      readOnly
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Model Number <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="model_number"
                      value={reportFormData.model_number}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Officer Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="officer_name"
                      value={reportFormData.officer_name}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Officer Designation <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="officer_designation"
                      value={reportFormData.officer_designation}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Inspected Item <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "Machine", label: "Machine" },
                        { value: "Asset", label: "Asset" },
                      ]}
                      name="inspected_item"
                      value={reportFormData.inspected_item}
                      onChange={(value) =>
                        handleSelectChange("inspected_item", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Inspected Date <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="inspected_date"
                      value={reportFormData.inspected_date}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Inspection Address <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="inspection_address"
                      value={reportFormData.inspection_address}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h5>Case Details</h5>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Customer Name<span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="customer_name"
                      value={reportFormData.customer_name}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Address - as per KYC{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <WysiwygTextarea
                      className="form-field"
                      name="address_as_per_kyc"
                      value={reportFormData.address_as_per_kyc}
                      onChange={handleFormChange}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Machinery Locations <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="machinery_locations"
                      value={reportFormData.machinery_locations}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      L.A.N City # <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="lan_city_no"
                      value={reportFormData.lan_city_no}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Date of Disbursement
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="date_of_disbursement"
                      value={reportFormData.date_of_disbursement}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Date of Invoice / Delivery No.{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="date_of_invoice_delivery_no"
                      value={reportFormData.date_of_invoice_delivery_no}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h5>Inspection Report</h5>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Invoice Price <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="invoice_price"
                      value={reportFormData.invoice_price}
                      onChange={handleFormChange}
                      rows={2}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Invoice Price In Words
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="invoice_price_in_word"
                      value={reportFormData.invoice_price_in_word}
                      onChange={handleFormChange}
                      readOnly
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Loan amount
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="loan_amount"
                      value={reportFormData.loan_amount}
                      onChange={handleFormChange}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Loan Amount In Words
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="loan_amount_in_word"
                      value={reportFormData.loan_amount_in_word}
                      onChange={handleFormChange}
                      readOnly
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Lien of Bank <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "YES", label: "YES" },
                        { value: "NO", label: "NO" },
                      ]}
                      name="lien_of_bank"
                      value={reportFormData.lien_of_bank}
                      onChange={(value) =>
                        handleSelectChange("lien_of_bank", value)
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h5>Asset details</h5>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Asset # Chassis No. # Serial No. # Engine No.# Regn. No.
                    </label>
                    <div className="ref-no-input">
                      <div>
                        <label>Model Name</label>
                        <input
                          type="text"
                          className="form-field"
                          name="model_name"
                          value={reportFormData.model_name}
                          onChange={handleFormChange}
                          style={{ textAlign: "left" }}
                        />
                      </div>
                      <div>
                        <label>Chassis No.</label>
                        <input
                          type="text"
                          className="form-field"
                          name="chassis_no"
                          value={reportFormData.chassis_no}
                          onChange={handleFormChange}
                          placeholder="Enter Chassis No."
                          style={{ textAlign: "left" }}
                        />
                      </div>
                      <div>
                        <label>Machine Serial No.</label>
                        <input
                          type="text"
                          className="form-field"
                          name="machine_serial_no"
                          value={reportFormData.machine_serial_no}
                          onChange={handleFormChange}
                          placeholder="Enter Machine Serial No."
                          style={{ textAlign: "left" }}
                        />
                      </div>
                      <div>
                        <label>Engine No.</label>
                        <input
                          type="text"
                          className="form-field"
                          name="engine_no"
                          value={reportFormData.engine_no}
                          onChange={handleFormChange}
                          placeholder="Enter Engine No."
                          style={{ textAlign: "left" }}
                        />
                      </div>
                      <div>
                        <label>Regn. No.</label>
                        <input
                          type="text"
                          className="form-field"
                          name="regn_no"
                          value={reportFormData.regn_no}
                          onChange={handleFormChange}
                          placeholder="Enter Regn. No."
                          style={{ textAlign: "left" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h5>Installation Details </h5>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Installed & Running <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="installed_running"
                      value={reportFormData.installed_running}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Installed Asset Whether Functional or Not{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="installed_asset_whether_functional_or_not"
                      value={
                        reportFormData.installed_asset_whether_functional_or_not
                      }
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>PARTICULARS OF THE ASSET</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Class & Make of Asset{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="class_make_of_asset"
                      value={reportFormData.class_make_of_asset}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Year of Mfg. <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="year_of_mfg"
                      value={reportFormData.year_of_mfg}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Invoice No./Purchase Order No.</label>
                    <input
                      type="text"
                      className="form-field"
                      name="invoice_purchase_order_no"
                      value={reportFormData.invoice_purchase_order_no}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Pro.Owner & Address <span className="text-danger">*</span>
                    </label>
                    <WysiwygTextarea
                      className="form-field"
                      name="pro_owner_address"
                      value={reportFormData.pro_owner_address}
                      onChange={handleFormChange}
                      rows={2}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Insurer / Policy no</label>
                    <input
                      type="text"
                      className="form-field"
                      name="insurer_policy_no"
                      value={reportFormData.insurer_policy_no}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Insurance Validity / Insured Value</label>
                    <input
                      type="text"
                      className="form-field"
                      name="insurance_validity_insured_value"
                      value={reportFormData.insurance_validity_insured_value}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Insurance Having Lien of CSB Bank Ltd.</label>
                    <input
                      type="text"
                      className="form-field"
                      name="insurance_having_lien_of_bank"
                      value={reportFormData.insurance_having_lien_of_bank}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Total Crane Weight & capacity</label>
                    <input
                      type="text"
                      className="form-field"
                      name="total_crane_weight_capacity"
                      value={reportFormData.total_crane_weight_capacity}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Material Usefulness <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "One Time", label: "One Time" },
                        { value: "Multiple Times", label: "Multiple Times" },
                      ]}
                      name="material_usefulness"
                      value={reportFormData.material_usefulness}
                      onChange={(value) =>
                        handleSelectChange("material_usefulness", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Hour Meter Reading
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="hour_meter_reading"
                      value={reportFormData.hour_meter_reading}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Colour <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="colour"
                      value={reportFormData.colour}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>PRESENT PARTICULARS OF THE MACHINE</h4>
                  <hr />
                </div>
              </div>

              {/* Flexible Fields Section */}
              <div className="row">
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields(
                            "PRESENT_PARTICULARS_OF_THE_MACHINE"
                          )
                        }
                      >
                        Add One Set
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("PRESENT_PARTICULARS_OF_THE_MACHINE")}
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>OBSERVATION</h4>
                  <hr />
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="observation"
                      value={reportFormData.observation}
                      onChange={handleFormChange}
                      rows={5}
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>STATUS OF MACHINE :</h4>
                  <hr />
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value:
                            "Fully Working Condition & Very Good Functioning",
                          label:
                            "Fully Working Condition & Very Good Functioning",
                        },
                        {
                          value: "Not Working Condition",
                          label: "Not Working Condition",
                        },
                        {
                          value: "Stacked condition",
                          label: "Stacked condition",
                        },
                      ]}
                      name="status_of_machine"
                      value={reportFormData.status_of_machine}
                      onChange={(value) =>
                        handleSelectChange("status_of_machine", value)
                      }
                      required
                    />
                  </div>
                </div>
                <p>
                  I assure You Reliable and Confidential Reporting Services.
                </p>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Visit Done By <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="visit_done_by"
                      value={reportFormData.visit_done_by}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Place <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="place"
                      value={reportFormData.place}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Date & Time <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="date_time"
                      value={reportFormData.date_time}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-md-12">
                  <h4>Surveyor, Valuer & Loss Assessor</h4>
                  <hr />
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Surveyor <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="surveyor"
                      value={reportFormData.surveyor}
                      readOnly
                      placeholder="Set from order attributes"
                      required
                      style={{
                        backgroundColor: "#f5f5f5",
                        cursor: "not-allowed",
                      }}
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      License No. <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="license_no"
                      value={reportFormData.license_no}
                      onChange={handleFormChange}
                      readOnly
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Surveyor Location <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="surveyor_location"
                      value={reportFormData.surveyor_location}
                      onChange={handleFormChange}
                      required
                      readOnly
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label htmlFor="chassis_no_pencil_impression">
                      Chassis Print (Image)
                    </label>
                    <input
                      type="file"
                      className="form-field"
                      id="chassis_no_pencil_impression"
                      name="chassis_no_pencil_impression"
                      onChange={handleFileChange}
                      accept="image/*"
                    />
                    {chasisPrintPreviewUrl && (
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
                          src={chasisPrintPreviewUrl}
                          alt="Chassis print preview"
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
                <div className="col-md-12">
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
                        ? "Generating AVR Report..."
                        : "Generate AVR Report"}
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

export default AVRReport;
