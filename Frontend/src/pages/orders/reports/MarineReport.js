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
  fetchOrderMedia,
} from "../../../redux/reducers/orderReducer";
import {
  fetchOrderReport,
  generateOrderReport,
  saveOrderReport,
  clearCurrentReport,
} from "../../../redux/reducers/orderReportReducer";
import { usePageTitle } from "../../../context/PageTitleContext";
import SingleSearchSelect from "../../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import { selectPermissions } from "../../../redux/selectors/authSelectors";
import { hasPermission } from "../../../utils/permissionUtils";
import "../order.scss";
import { DeleteIcon, CloseIcon } from "../../../components/icons";

// WYSIWYG Textarea Component - preserves HTML formatting
const WysiwygTextarea = ({ value, onChange, placeholder, rows = 4, className = "", name }) => {
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
    const text = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, text);
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
        contentEditable
        suppressContentEditableWarning={true}
        onInput={handleInput}
        onPaste={handlePaste}
        className={`form-field wysiwyg-textarea ${className}`}
        data-placeholder={placeholder}
      />
    </>
  );
};

function MarineReport() {
  const { id } = useParams();
  const dispatch = useDispatch();

  // Select order data from Redux store
  const order = useSelector((state) => state.orders.selected);
  const media = useSelector((state) => state.orders.media);
  const mediaLoading = useSelector((state) => state.orders.mediaLoading);
  const orderLoading = useSelector((state) => state.orders.loading);

  // Select order report data from Redux store
  const {
    currentReport,
    loading: reportLoading,
    generating,
    saving,
  } = useSelector((state) => state.orderReports);

  // Combined loading state - show loading when fetching order or report data
  const isLoadingData = orderLoading || reportLoading;
  const allowedPermissions = useSelector(selectPermissions);
  const canEditRefNoId = hasPermission(allowedPermissions, "edit_report_ref_no_id");

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

  // Form state
  const [reportFormData, setReportFormData] = useState({
    report_type: "report_marine",
    report_title_type: "VALUATION REPORT",
    report_title: "Offshore Supply Vessel",
    ref_no_year: new Date().getFullYear().toString(),
    ref_no_bank: "",
    ref_no_code: "VKM",
    ref_no_month: `SFW-${getCurrentMonthAbbreviation()}-`, // Default: SFW-(CURRENT_MONTH)
    ref_no_id: "",
    lan_no: "",
    report_date: getCurrentDate(),
    report_date_heading: "Report Date",
    bank_name: "",
    branch_name: "",
    state_name: "MUM",
    state_initial: "MUM",
    imo_or_regd_type: "IMO NO.",
    imo_official_regd_no: "IMO No",
    execute_above: "Desktop Valuation",
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
    lien_of_bank: "",
    chassis_no: "",
    machine_serial_no: "",
    engine_no: "",
    regn_no: "",
    installed_running: "",
    installed_asset_whether_functional_or_not: "",
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
    valuer_name: "V.K. ASSOCIATES",
    license_no: "SLA-60827",
    surveyor_location: "MUMBAI, MAHARASHTRA",
    vessel_photo: "",
    vessel_photo_preview: "",
    vessel_photo_id: null,
    certifications_vessel_note: "",
    disclaimer: "",
  });

  // Set initial disclaimer on mount
  useEffect(() => {
    if (reportFormData.execute_above && (!reportFormData.disclaimer || reportFormData.disclaimer.trim() === "")) {
      const initialDisclaimer = generateDisclaimer(reportFormData.execute_above, reportFormData);
      if (initialDisclaimer) {
        setReportFormData((prev) => ({
          ...prev,
          disclaimer: initialDisclaimer,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // State for image selection modal (fieldId => boolean)
  const [imageModalOpen, setImageModalOpen] = useState({});

  // Track fields that were explicitly cleared by the user (date and currency fields)
  const clearedFieldsRef = useRef(new Set());
  // Refs to track previous generated "in words" values to detect user edits
  const prevInsurancePolicyWordsRef = useRef("");
  const prevWarRiskPolicyWordsRef = useRef("");
  const prevHullMachineryPolicyWordsRef = useRef("");

  // Function to generate disclaimer based on execute_above value
  const generateDisclaimer = useCallback((executeAbove, formData) => {
    const clientName = formData.client_name_with_full_address || "";
    const bankName = formData.bank_name || "";
    const stateName = formData.state_name || "";
    const officerName = formData.officer_name || "";

    let template = "";

    switch (executeAbove) {
      case "Desktop Valuation":
        template = `This desktop valuation report is generated by the M/s Valuetech Solutions at the sole request of client ${clientName} for Financial Purpose of ${bankName}, ${stateName} & its officer ${officerName} based at Mumbai (Business finance Loan/ Synergy finance division). This desktop report is addressed & is to be used solely by the said financial institution / Major Bank ${bankName}, ${stateName} Division only. No other financial institutes / Major Bank would be entitled to use the above report other than ${bankName}. We have derived this desktop valuation report without any bias or prejudice on scientific value calculation basis of construction of similar type brand-new vessel of above category. Subsequent, report is issued without prejudice, reserving the right to alter/amend any unintentional error/omission, if any.`;
        break;
      case "Physical Survey & Inspection":
        template = `This survey & inspection valuation report is generated by the M/s Valuetech Solutions at the sole request of client ${clientName} for Financial Purpose of ${bankName}, ${stateName} & its officer ${officerName} based at Mumbai (Business finance Loan/ Synergy finance division). This valuation report is addressed & is to be used solely by the said financial institution / Major Bank M/s ${bankName}, ${stateName} Division only. No other financial institutes / Major Bank would be entitled to use the above report other than ${bankName}. We have derived this valuation report without any bias or prejudice on scientific value calculation basis of construction of similar type brand-new vessel of above category. Subsequent, report is issued without prejudice, reserving the right to alter/amend any unintentional error/omission, if any.`;
        break;
      case "Condition Valuation":
        template = `This condition valuation report is generated by the M/s Valuetech Solutions at the sole request of client ${clientName} for Financial Purpose of ${bankName}, ${stateName} & its officer ${officerName} based at Mumbai (Business finance Loan/ Synergy finance division). This conditional report is addressed & is to be used solely by the said financial institution / Major Bank M/s ${bankName}, ${stateName} Division only. No other financial institutes / Major Bank would be entitled to use the above report other than ${bankName}. We have derived this condition valuation report without any bias or prejudice on scientific value calculation basis of construction of similar type brand-new vessel of above category. Subsequent, report is issued without prejudice, reserving the right to alter/amend any unintentional error/omission, if any.`;
        break;
      case "Marine Vessel Verification (AVR)":
        template = `This asset verification report is generated by the M/s Valuetech Solutions at the sole request of client ${clientName} for Financial Purpose of ${bankName}, ${stateName} & its officer ${officerName} based at Mumbai (Business finance Loan/ Synergy finance division). This AVR report is addressed & is to be used solely by the said financial institution / Major Bank M/s ${bankName}, ${stateName} Division only. No other financial institutes / Major Bank would be entitled to use the above report other than ${bankName}. We have derived this verification report without any bias or prejudice on scientific value calculation basis of construction of similar type brand-new vessel of above category. Subsequent, report is issued without prejudice, reserving the right to alter/amend any unintentional error/omission, if any.`;
        break;
      default:
        return "";
    }

    return template;
  }, []);

  // Helper function to check if disclaimer is auto-generated (matches any of the 4 patterns)
  const isAutoGeneratedDisclaimer = useCallback((disclaimer) => {
    if (!disclaimer || disclaimer.trim() === "") return true; // Empty is considered auto-generated

    const disclaimerUpper = disclaimer.toUpperCase();

    // Check if it matches any of the 4 auto-generated patterns
    const patterns = [
      "DESKTOP VALUATION REPORT",
      "SURVEY & INSPECTION VALUATION REPORT",
      "CONDITION VALUATION REPORT",
      "ASSET VERIFICATION REPORT"
    ];

    // If disclaimer contains any of these key phrases, it's auto-generated
    return patterns.some(pattern => disclaimerUpper.includes(pattern));
  }, []);

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
    const initialFormData = {
      report_type: "report_marine",
      report_title_type: "VALUATION REPORT",
      report_title: "Offshore Supply Vessel",
      ref_no_year: new Date().getFullYear().toString(),
      ref_no_bank: "",
      ref_no_code: "VKM",
      ref_no_month: `SFW-${getCurrentMonthAbbreviationLocal()}-`, // Default: SFW-(CURRENT_MONTH)
      ref_no_id: "",
      lan_no: "",
      report_date: getCurrentDateLocal(),
      report_date_heading: "Report Date",
      bank_name: "",
      branch_name: "",
      state_name: "MUM",
      state_initial: "MUM",
      imo_or_regd_type: "IMO NO.",
      imo_official_regd_no: "IMO No",
      execute_above: "Desktop Valuation",
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
      lien_of_bank: "",
      chassis_no: "",
      machine_serial_no: "",
      engine_no: "",
      regn_no: "",
      installed_running: "",
      installed_asset_whether_functional_or_not: "",
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
      valuer_name: "V.K. ASSOCIATES",
      license_no: "SLA-60827",
      surveyor_location: "MUMBAI, MAHARASHTRA",
      vessel_photo: "",
      vessel_photo_preview: "",
      vessel_photo_id: null,
      disclaimer: "",
    };

    // Generate initial disclaimer based on default execute_above value
    const executeAbove = initialFormData.execute_above;
    if (executeAbove) {
      const initialDisclaimer = generateDisclaimer(executeAbove, initialFormData);
      if (initialDisclaimer) {
        initialFormData.disclaimer = initialDisclaimer;
      }
    }

    setReportFormData(initialFormData);

    // Reset flexible fields
    setFlexibleFields([]);

    // Clear the cleared fields tracking when form resets
    clearedFieldsRef.current.clear();
  }, [id, getCurrentDate, generateDisclaimer]);

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      setReportFormData((prev) => {
        const updated = {
          ...prev,
          ref_no_bank: order?.bank_initial || "",
          bank_name: order?.bank_name || "",
          branch_name: order?.branch_name || "",
          state_name: order?.state_name || prev.state_name || "MUM",
          // Preserve default values for SingleSearchSelect fields if not already set
          report_title_type: prev.report_title_type || "VALUATION REPORT",
          report_title: prev.report_title || "Offshore Supply Vessel",
          state_initial: prev.state_initial || "MUM",
          imo_or_regd_type: prev.imo_or_regd_type || "IMO NO.",
          imo_official_regd_no: prev.imo_official_regd_no || "IMO No",
          // Preserve execute_above default if not already set
          execute_above: prev.execute_above || "Desktop Valuation",
          // ALWAYS use valuer_name from order's valuer_name (never from report or previous state)
          valuer_name: order?.valuer_name || "",
          license_no: order?.valuer_name
            ? getLicenseNumber(order.valuer_name)
            : "",
          ref_no_code: order?.valuer_name ? getRefNoCode(order.valuer_name) : "",
        };

        return updated;
      });
    }
  }, [order, getLicenseNumber, getRefNoCode]);

  // Populate form data from fetched Marine report (if available)
  useEffect(() => {
    const report = currentReport?.report;
    if (!report) return; // Gracefully do nothing when data is null

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
          key === "valuer_name" ||
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

      // Ensure report_title_type has a default value if missing
      if (!updated.report_title_type) {
        updated.report_title_type = "VALUATION REPORT";
      }

      // Ensure report_title has a default value if missing
      if (!updated.report_title) {
        updated.report_title = "Offshore Supply Vessel";
      }

      // Ensure state_initial has a default value if missing
      if (!updated.state_initial) {
        updated.state_initial = "MUM";
      }

      // Ensure imo_or_regd_type has a default value if missing
      if (!updated.imo_or_regd_type) {
        updated.imo_or_regd_type = "IMO NO.";
      }

      // Ensure imo_official_regd_no has a default value if missing
      if (!updated.imo_official_regd_no) {
        updated.imo_official_regd_no = "IMO No";
      }

      // Ensure how_many_grades_products_can_vessel_load_discharge_with_double is initialized
      // This field might not be in the API response or might be null, so ensure it's always initialized
      if (updated.how_many_grades_products_can_vessel_load_discharge_with_double === undefined ||
        updated.how_many_grades_products_can_vessel_load_discharge_with_double === null) {
        updated.how_many_grades_products_can_vessel_load_discharge_with_double = "";
      }

      // Regenerate vessel photo preview if vessel_photo exists
      if (report.vessel_photo && !updated.vessel_photo_preview) {
        const baseUrl =
          process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
        try {
          const parsed = JSON.parse(report.vessel_photo);
          if (parsed.path) {
            updated.vessel_photo_preview = `${baseUrl}/${parsed.path}`;
          } else if (parsed.link) {
            updated.vessel_photo_preview = parsed.link;
          } else {
            updated.vessel_photo_preview = report.vessel_photo;
          }
        } catch (error) {
          if (report.vessel_photo.startsWith("/")) {
            updated.vessel_photo_preview = `${baseUrl}${report.vessel_photo}`;
          } else {
            updated.vessel_photo_preview = report.vessel_photo;
          }
        }
      }

      return updated;
    });

    if (Array.isArray(report.flexible_fields)) {
      // Process flexible fields to regenerate image previews from generic field_3 (image path)
      const baseUrl =
        process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
      const processedFields = report.flexible_fields.map((field) => {
        // If field has image path (field_3) but no image_preview, regenerate preview from path
        if (field.field_3 && !field.image_preview) {
          let imageUrl = "";
          try {
            const parsed = JSON.parse(field.field_3);
            if (parsed.path) {
              imageUrl = `${baseUrl}/${parsed.path}`;
            } else if (parsed.link) {
              imageUrl = parsed.link;
            } else {
              imageUrl = field.field_3;
            }
          } catch (error) {
            if (field.field_3.startsWith("/")) {
              imageUrl = `${baseUrl}${field.field_3}`;
            } else {
              imageUrl = field.field_3;
            }
          }
          return {
            ...field,
            image_preview: imageUrl,
          };
        }
        return field;
      });
      setFlexibleFields(processedFields);
    }
  }, [currentReport, id]);

  // Auto-update disclaimer when execute_above or related fields change
  useEffect(() => {
    const executeAbove = reportFormData.execute_above;
    if (!executeAbove) return;

    const currentDisclaimer = reportFormData.disclaimer || "";

    // Always update if disclaimer is auto-generated (empty or matches any pattern)
    // This ensures disclaimer updates even after report is saved
    if (isAutoGeneratedDisclaimer(currentDisclaimer)) {
      const newDisclaimer = generateDisclaimer(executeAbove, reportFormData);
      if (newDisclaimer && newDisclaimer !== currentDisclaimer) {
        setReportFormData((prev) => ({
          ...prev,
          disclaimer: newDisclaimer,
        }));
      }
    }
  }, [
    reportFormData.execute_above,
    reportFormData.client_name_with_full_address,
    reportFormData.bank_name,
    reportFormData.state_name,
    reportFormData.officer_name,
    generateDisclaimer,
    isAutoGeneratedDisclaimer,
  ]);

  // Helper function to format currency in Indian format
  const formatIndianCurrency = useCallback((value) => {
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

  // Helper function to get amount in words for any currency field
  const getAmountInWords = useCallback(
    (value) => {
      const amount = parseCurrency(value);
      return amount > 0 ? convertNumberToWordsIndian(amount) : "";
    },
    [parseCurrency, convertNumberToWordsIndian]
  );

  // Handle currency input formatting (Indian number format)
  const handleCurrencyChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      // Allow empty strings to clear the field
      if (!value || value.trim() === "") {
        // Track that this field was explicitly cleared
        clearedFieldsRef.current.add(name);
        setReportFormData((prev) => {
          const updated = {
            ...prev,
            [name]: "",
          };

          // Auto-update corresponding "in words" field to empty
          // Handle special field name mappings for insurance policy fields
          let wordsFieldName;
          if (name === "insured_value_insurance_policy") {
            wordsFieldName = "insured_value_in_words_insurance_policy";
          } else if (name === "insured_value_war_risk_policy") {
            wordsFieldName = "insured_value_in_words_war_risk_policy";
          } else if (name === "insured_value_hull_machinery_policy") {
            wordsFieldName = "insured_value_in_words_hull_machinery_policy";
          } else {
            // Default: append _in_words for other fields
            wordsFieldName = `${name}_in_words`;
          }

          updated[wordsFieldName] = "";

          return updated;
        });
        return;
      }

      // If field gets a value, remove it from cleared fields tracking
      clearedFieldsRef.current.delete(name);

      const formattedValue = formatIndianCurrency(value);

      // Update form data with formatted value
      setReportFormData((prev) => {
        const updated = {
          ...prev,
          [name]: formattedValue,
        };

        // Auto-update corresponding "in words" field
        // Handle special field name mappings for insurance policy fields
        let wordsFieldName;
        if (name === "insured_value_insurance_policy") {
          wordsFieldName = "insured_value_in_words_insurance_policy";
        } else if (name === "insured_value_war_risk_policy") {
          wordsFieldName = "insured_value_in_words_war_risk_policy";
        } else if (name === "insured_value_hull_machinery_policy") {
          wordsFieldName = "insured_value_in_words_hull_machinery_policy";
        } else {
          // Default: append _in_words for other fields
          wordsFieldName = `${name}_in_words`;
        }

        const amountInWords = getAmountInWords(formattedValue);
        updated[wordsFieldName] = amountInWords;

        return updated;
      });
    },
    [formatIndianCurrency, getAmountInWords]
  );

  // Handle form input changes with optional uppercase conversion for specific fields
  const handleFormChange = useCallback((e) => {
    const { name, value } = e.target;

    // Track cleared fields - if field had a value and is now empty, mark it as cleared
    if (!value || (typeof value === "string" && value.trim() === "")) {
      // Field is being cleared - track it
      clearedFieldsRef.current.add(name);
    } else {
      // Field has a value - remove from cleared fields tracking
      clearedFieldsRef.current.delete(name);
    }

    // Fields that should be converted to uppercase
    const uppercaseFields = [
      "name_of_the_vessel",
      "customer_name",
      "client_city_state_name",
      "inspection_location_front_page",
      "registered_or_proposed_owner",
      "marine_vessel_name",
      "type_or_description_of_vessel",
      "classification_of_registry",
      "present_flag",
      "port_of_registry",
      "registered_under",
      "ex_name_flag",
      "previous_registry",
      "classification_society",
      "technical_operator",
      "commercial_operator",
      "registered_owner",
      "disponent_owner",
    ];

    const finalValue = uppercaseFields.includes(name)
      ? value.toUpperCase()
      : value;

    setReportFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
  }, []);

  // Use memoized amount in words for each currency field
  const insurancePolicyAmountInWords = useMemo(
    () => getAmountInWords(reportFormData.insured_value_insurance_policy),
    [getAmountInWords, reportFormData.insured_value_insurance_policy]
  );
  const warRiskPolicyAmountInWords = useMemo(
    () => getAmountInWords(reportFormData.insured_value_war_risk_policy),
    [getAmountInWords, reportFormData.insured_value_war_risk_policy]
  );
  const hullMachineryPolicyAmountInWords = useMemo(
    () => getAmountInWords(reportFormData.insured_value_hull_machinery_policy),
    [getAmountInWords, reportFormData.insured_value_hull_machinery_policy]
  );

  // Sync memoized "in words" values to reportFormData to ensure they're saved
  // This ensures the values are always in sync, especially when loading from API or when currency values change programmatically
  // Only auto-updates if field is empty or matches previous generated value (preserves user edits)
  useEffect(() => {
    setReportFormData((prev) => {
      const updated = { ...prev };
      let hasChanges = false;

      // Update insured_value_in_words_insurance_policy only if:
      // 1. Field is empty, OR
      // 2. Field matches previous generated value (user hasn't manually edited)
      const currentInsuranceWords = updated.insured_value_in_words_insurance_policy || "";
      const shouldUpdateInsurance =
        currentInsuranceWords === "" ||
        currentInsuranceWords === prevInsurancePolicyWordsRef.current;

      if (shouldUpdateInsurance && currentInsuranceWords !== insurancePolicyAmountInWords) {
        updated.insured_value_in_words_insurance_policy = insurancePolicyAmountInWords;
        hasChanges = true;
      }
      // Always update ref to track current generated value (even if we don't update form field)
      prevInsurancePolicyWordsRef.current = insurancePolicyAmountInWords;

      // Update insured_value_in_words_war_risk_policy only if:
      // 1. Field is empty, OR
      // 2. Field matches previous generated value (user hasn't manually edited)
      const currentWarRiskWords = updated.insured_value_in_words_war_risk_policy || "";
      const shouldUpdateWarRisk =
        currentWarRiskWords === "" ||
        currentWarRiskWords === prevWarRiskPolicyWordsRef.current;

      if (shouldUpdateWarRisk && currentWarRiskWords !== warRiskPolicyAmountInWords) {
        updated.insured_value_in_words_war_risk_policy = warRiskPolicyAmountInWords;
        hasChanges = true;
      }
      // Always update ref to track current generated value (even if we don't update form field)
      prevWarRiskPolicyWordsRef.current = warRiskPolicyAmountInWords;

      // Update insured_value_in_words_hull_machinery_policy only if:
      // 1. Field is empty, OR
      // 2. Field matches previous generated value (user hasn't manually edited)
      const currentHullMachineryWords = updated.insured_value_in_words_hull_machinery_policy || "";
      const shouldUpdateHullMachinery =
        currentHullMachineryWords === "" ||
        currentHullMachineryWords === prevHullMachineryPolicyWordsRef.current;

      if (shouldUpdateHullMachinery && currentHullMachineryWords !== hullMachineryPolicyAmountInWords) {
        updated.insured_value_in_words_hull_machinery_policy = hullMachineryPolicyAmountInWords;
        hasChanges = true;
      }
      // Always update ref to track current generated value (even if we don't update form field)
      prevHullMachineryPolicyWordsRef.current = hullMachineryPolicyAmountInWords;

      // Only update if there are actual changes to avoid unnecessary re-renders
      return hasChanges ? updated : prev;
    });
  }, [insurancePolicyAmountInWords, warRiskPolicyAmountInWords, hullMachineryPolicyAmountInWords]);

  // Handle SingleSearchSelect changes
  const handleSelectChange = (name, value) => {
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

      // Auto-update disclaimer when execute_above changes (always update if auto-generated)
      if (name === "execute_above") {
        const currentDisclaimer = prev.disclaimer || "";
        // Always update if disclaimer is auto-generated
        if (isAutoGeneratedDisclaimer(currentDisclaimer) && value) {
          const newDisclaimer = generateDisclaimer(value, prev);
          updated.disclaimer = newDisclaimer;
        }
      }

      return updated;
    });
  };

  // Handle date input formatting (DD-MM-YYYY)
  const handleDateChange = (e) => {
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

  // Helper function to format dimension in Indian format (similar to currency but with 4 decimals)
  const formatDimension = useCallback((value) => {
    if (!value || typeof value !== "string") return "";

    // Remove everything except digits and one dot
    let inputVal = value.replace(/[^0-9.]/g, "");

    // Allow only one decimal
    const parts = inputVal.split(".");
    let integerPart = parts[0];
    let decimalPart = parts[1] ? parts[1].slice(0, 4) : ""; // limit to 4 decimal digits

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

  // Handle dimension input formatting (Indian number format with 4 decimals)
  const handleDimensionChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      const formattedValue = formatDimension(value);

      // Update form data with formatted value (always set, even if empty string)
      // This ensures the field exists in reportFormData and will be included in the payload
      setReportFormData((prev) => ({
        ...prev,
        [name]: formattedValue !== undefined && formattedValue !== null ? formattedValue : "",
      }));
    },
    [formatDimension]
  );

  // Handle flexible field changes
  const handleFlexibleFieldChange = (fieldId, fieldType, value) => {
    setFlexibleFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, [fieldType]: value } : field
      )
    );
  };

  // Parse media URL to get the actual image link (same as OrderImages)
  const getImageUrl = useCallback((mediaUrl) => {
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
    try {
      const parsed = JSON.parse(mediaUrl);
      if (parsed.path) {
        return `${baseUrl}/${parsed.path}`;
      }
      if (parsed.link) {
        return parsed.link;
      }
      return mediaUrl;
    } catch (error) {
      if (mediaUrl.startsWith("/")) {
        return `${baseUrl}${mediaUrl}`;
      }
      return mediaUrl;
    }
  }, []);

  // Check if media is an image
  const isImage = useCallback((mediaUrl) => {
    try {
      const parsed = JSON.parse(mediaUrl);
      const path = parsed.path || "";
      return path.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    } catch (error) {
      return mediaUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    }
  }, []);

  // Memoize approved images for performance (must be after isImage is defined)
  const approvedImages = useMemo(() => {
    return (
      media?.media?.filter(
        (item) => item.status === 1 && isImage(item.media_url)
      ) || []
    );
  }, [media?.media, isImage]);

  // Open image selection modal for a specific field
  const openImageModal = useCallback((fieldId) => {
    setImageModalOpen((prev) => ({ ...prev, [fieldId]: true }));
  }, []);

  // Close image selection modal for a specific field
  const closeImageModal = useCallback((fieldId) => {
    setImageModalOpen((prev) => ({ ...prev, [fieldId]: false }));
  }, []);

  // Handle image selection from API (stores image path and preview URL)
  const handleFlexibleFieldImageSelect = useCallback(
    (fieldId, mediaItem) => {
      const imageUrl = getImageUrl(mediaItem.media_url);
      setFlexibleFields((prev) =>
        prev.map((field) =>
          field.id === fieldId
            ? {
              ...field,
              image_file: null, // Clear file since we're using API path
              image_preview: imageUrl,
              field_3: mediaItem.media_url, // Store original path from API
              field_4: mediaItem.id, // Store media ID for reference
            }
            : field
        )
      );
      closeImageModal(fieldId);
    },
    [getImageUrl, closeImageModal]
  );

  // Handle vessel photo image selection
  const handleVesselPhotoSelect = useCallback(
    (mediaItem) => {
      const imageUrl = getImageUrl(mediaItem.media_url);
      setReportFormData((prev) => ({
        ...prev,
        vessel_photo: mediaItem.media_url, // Store original path from API
        vessel_photo_preview: imageUrl,
        vessel_photo_id: mediaItem.id, // Store media ID for reference
      }));
      closeImageModal("vessel_photo");
    },
    [getImageUrl, closeImageModal]
  );

  // Helper function to create flexible field base structure
  const createFlexibleFieldBase = (sectionName, nextOrder) => ({
    id: `${sectionName}_${Date.now()}`,
    section_name: sectionName,
    col_span: 1,
    field_order: nextOrder,
  });

  // Add flexible fields (default: Add One - 2 fields; plus custom types)
  const addFlexibleFields = (sectionName) => {
    // Calculate the next order by counting total fields in this section
    const nextOrder =
      flexibleFields.filter((f) => f.section_name === sectionName).length + 1;

    let newField;

    // Handle HEADING_DESCRIPTION_IMAGE variants (all have same structure)
    if (
      sectionName === "HEADING_DESCRIPTION_IMAGE" ||
      sectionName === "HEADING_DESCRIPTION_IMAGE_2" ||
      sectionName === "HEADING_DESCRIPTION_IMAGE_3"
    ) {
      newField = {
        ...createFlexibleFieldBase(sectionName, nextOrder),
        // field_1: heading, field_2: description, field_3: image_path, field_4: image_id
        field_1: "",
        field_2: "",
        field_3: "",
        field_4: null,
        image_file: null,
        image_preview: "",
      };
    }
    // Handle EQUIPMENT_MAKE_MODEL variants (all have same structure)
    else if (
      sectionName === "EQUIPMENT_MAKE_MODEL" ||
      sectionName === "EQUIPMENT_MAKE_MODEL_2"
    ) {
      newField = {
        ...createFlexibleFieldBase(sectionName, nextOrder),
        // field_1: name_of_equipment, field_2: make, field_3: model
        field_1: "",
        field_2: "",
        field_3: "",
      };
    }
    // Handle CERTIFICATIONS_OF_THE_VESSEL
    else if (sectionName === "CERTIFICATIONS_OF_THE_VESSEL") {
      newField = {
        ...createFlexibleFieldBase(sectionName, nextOrder),
        // field_1: certificates, field_2: issued, field_3: last_annual, field_4: last_intermediate, field_5: expires
        field_1: "",
        field_2: "",
        field_3: "",
        field_4: "",
        field_5: "",
      };
    }
    // Handle DECK_EQUIPMENT_SPECIAL_FEATURES
    else if (sectionName === "DECK_EQUIPMENT_SPECIAL_FEATURES") {
      newField = {
        ...createFlexibleFieldBase(sectionName, nextOrder),
        // field_1: particulars, field_2: specifications
        field_1: "",
        field_2: "",
      };
    }
    // Default: Standard flexible field (Add One)
    else {
      // Generic Add One: two inputs mapped to field_1 and field_2
      newField = {
        ...createFlexibleFieldBase(sectionName, nextOrder),
        field_1: "",
        field_2: "",
      };
    }

    setFlexibleFields((prev) => [...prev, newField]);
  };

  // Remove flexible field
  const removeFlexibleField = (fieldId) => {
    setFlexibleFields((prev) => prev.filter((field) => field.id !== fieldId));
  };

  // Validate flexible fields
  const validateFlexibleFields = () => {
    const errors = [];

    flexibleFields.forEach((field, index) => {
      // Validation: for all sections, check field_1 exists; for two-column generic sections, also field_2
      if (
        !field.field_1 ||
        (field.section_name === "DECK_EQUIPMENT_SPECIAL_FEATURES" &&
          !field.field_2)
      ) {
        errors.push(`Flexible field ${index + 1}: Required fields are missing`);
      }
    });

    return errors;
  };

  // Render flexible fields for a section
  const renderFlexibleFields = (sectionName) => {
    const sectionFields = flexibleFields.filter(
      (field) => field.section_name === sectionName
    );

    if (
      sectionName === "EQUIPMENT_MAKE_MODEL" ||
      sectionName === "EQUIPMENT_MAKE_MODEL_2"
    ) {
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

          <div className="col-md-6">
            <div className="form-group">
              <label>
                NAME OF EQUIPMENT <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_1 || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(field.id, "field_1", e.target.value)
                }
                placeholder="Enter Name of Equipment"
                required
              />
            </div>
          </div>

          <div className="col-md-3">
            <div className="form-group">
              <label>MAKE</label>
              <input
                type="text"
                className="form-field"
                value={field.field_2 || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(field.id, "field_2", e.target.value)
                }
                placeholder="Enter Make"
              />
            </div>
          </div>

          <div className="col-md-3">
            <div className="form-group">
              <label>MODEL</label>
              <input
                type="text"
                className="form-field"
                value={field.field_3 || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(field.id, "field_3", e.target.value)
                }
                placeholder="Enter Model"
              />
            </div>
          </div>
        </div>
      ));
    }

    if (
      sectionName === "HEADING_DESCRIPTION_IMAGE" ||
      sectionName === "HEADING_DESCRIPTION_IMAGE_2" ||
      sectionName === "HEADING_DESCRIPTION_IMAGE_3"
    ) {
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

          <div className="col-md-12">
            <div className="form-group">
              <label>
                Heading <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_1 || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(field.id, "field_1", e.target.value)
                }
                placeholder="Enter heading"
              />
            </div>
          </div>

          <div className="col-md-12">
            <div className="form-group">
              <label>Description</label>
              <WysiwygTextarea
                className="form-field"
                rows={4}
                value={field.field_2 || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(field.id, "field_2", e.target.value)
                }
                placeholder="Enter description"
              />
            </div>
          </div>

          <div className="col-md-12">
            <div className="form-group">
              <label>Image</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={() => openImageModal(field.id)}
                  style={{ marginBottom: "8px" }}
                >
                  Select Image
                </button>
                {field.image_preview ? (
                  <div
                    style={{ position: "relative", display: "inline-block" }}
                  >
                    <img
                      src={field.image_preview}
                      alt="preview"
                      style={{
                        maxWidth: "150px",
                        height: "auto",
                        borderRadius: 4,
                        border: "1px solid #ddd",
                        display: "block",
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const fieldIdToRemove = field.id;
                        setFlexibleFields((prev) =>
                          prev.map((f) =>
                            f.id === fieldIdToRemove
                              ? {
                                ...f,
                                image_preview: "",
                                field_3: "",
                                field_4: null,
                              }
                              : f
                          )
                        );
                      }}
                      style={{
                        position: "absolute",
                        top: "-8px",
                        right: "-8px",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        zIndex: 10,
                      }}
                      title="Remove image"
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                ) : null}
              </div>
              {/* Hidden input fields for image path to include in payload */}
              {field.field_3 && (
                <input
                  type="hidden"
                  name={`flexible_image_path_${field.id}`}
                  value={field.field_3}
                />
              )}
              {field.field_4 && (
                <input
                  type="hidden"
                  name={`flexible_image_id_${field.id}`}
                  value={field.field_4}
                />
              )}
            </div>
          </div>
        </div>
      ));
    }

    if (sectionName === "CERTIFICATIONS_OF_THE_VESSEL") {
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

          {/* 5 columns: 1st col-md-4, rest col-md-2 */}
          <div className="col-md-4">
            <div className="form-group">
              <label>
                Certificates <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_1 || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(field.id, "field_1", e.target.value)
                }
                placeholder="Enter certificate name"
                required
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Issued
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_2 || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  let numericValue = value.replace(/\D/g, "");
                  if (numericValue.length > 8)
                    numericValue = numericValue.substring(0, 8);

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
                      numericValue.substring(0, 2) +
                      "-" +
                      numericValue.substring(2);
                  } else {
                    formattedValue = numericValue;
                  }

                  handleFlexibleFieldChange(
                    field.id,
                    "field_2",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Last Annual
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_3 || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  let numericValue = value.replace(/\D/g, "");
                  if (numericValue.length > 8)
                    numericValue = numericValue.substring(0, 8);

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
                      numericValue.substring(0, 2) +
                      "-" +
                      numericValue.substring(2);
                  } else {
                    formattedValue = numericValue;
                  }

                  handleFlexibleFieldChange(
                    field.id,
                    "field_3",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Last Intermediate
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_4 || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  let numericValue = value.replace(/\D/g, "");
                  if (numericValue.length > 8)
                    numericValue = numericValue.substring(0, 8);

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
                      numericValue.substring(0, 2) +
                      "-" +
                      numericValue.substring(2);
                  } else {
                    formattedValue = numericValue;
                  }

                  handleFlexibleFieldChange(
                    field.id,
                    "field_4",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Expires
              </label>
              <input
                type="text"
                className="form-field"
                value={field.field_5 || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  let numericValue = value.replace(/\D/g, "");
                  if (numericValue.length > 8)
                    numericValue = numericValue.substring(0, 8);

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
                      numericValue.substring(0, 2) +
                      "-" +
                      numericValue.substring(2);
                  } else {
                    formattedValue = numericValue;
                  }

                  handleFlexibleFieldChange(
                    field.id,
                    "field_5",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
              />
            </div>
          </div>
        </div>
      ));
    }

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
        <div className="col-md-6">
          <div className="form-group">
            <label>
              Particulars <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-field"
              value={field.field_1}
              onChange={(e) =>
                handleFlexibleFieldChange(field.id, "field_1", e.target.value)
              }
              placeholder="Enter Particulars"
              required
            />
          </div>
        </div>
        <div className="col-md-6">
          <div className="form-group">
            <label>
              Specifications <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-field"
              value={field.field_2}
              onChange={(e) =>
                handleFlexibleFieldChange(field.id, "field_2", e.target.value)
              }
              placeholder="Enter Specifications"
              required
            />
          </div>
        </div>
      </div>
    ));
  };

  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  // State for report type selection (Rough/Production)
  const [reportTypeSelection, setReportTypeSelection] = useState("Rough");

  // Clear report data when component mounts or order changes
  useEffect(() => {
    dispatch(clearCurrentReport());
  }, [dispatch, id]);

  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      dispatch(fetchOrderMedia(id)); // Fetch media for image selection
      dispatch(
        fetchOrderReport({
          orderId: id,
          reportType: "report_marine",
          silent: true,
        })
      );
    }
  }, [dispatch, id]);

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
        &gt; Marine Report
      </>
    );
  }, [id, order, setTitle]);

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

    // Add ALL form fields to FormData - ensure every field is included to prevent data loss
    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      // Check if this field was explicitly cleared by the user
      // BUT: if field has a value now, send the value (user re-entered it)
      if (clearedFieldsRef.current.has(key) && (!value || value === "")) {
        // Field was cleared and is still empty - send as empty string (null)
        formData.append(key, "");
        return;
      }

      // Handle different value types properly:
      // - null/undefined -> empty string
      // - numbers (including 0) -> keep as is
      // - booleans (including false) -> keep as is
      // - strings -> keep as is (empty string is fine)
      if (value === null || value === undefined) {
        formData.append(key, "");
      } else if (typeof value === "number" || typeof value === "boolean") {
        formData.append(key, value.toString());
      } else {
        formData.append(key, value);
      }
    });

    // Ensure report_title_type is always included (mandatory field)
    if (!reportFormData.report_title_type) {
      formData.set("report_title_type", "VALUATION REPORT");
    }

    // Ensure SingleSearchSelect fields with defaults are always included
    if (!reportFormData.report_title) {
      formData.set("report_title", "Offshore Supply Vessel");
    }
    if (!reportFormData.state_initial) {
      formData.set("state_initial", "MUM");
    }
    if (!reportFormData.imo_or_regd_type) {
      formData.set("imo_or_regd_type", "IMO NO.");
    }
    if (!reportFormData.imo_official_regd_no) {
      formData.set("imo_official_regd_no", "IMO No");
    }
    // Always include report_date_heading in payload (even if user did not change it - use preselected default)
    formData.set("report_date_heading", reportFormData.report_date_heading || "Report Date");

    // Ensure how_many_grades_products_can_vessel_load_discharge_with_double is always included
    // This field might not exist in reportFormData if it was never interacted with
    // Check if the field exists in reportFormData, and if not, add it to FormData
    if (!reportFormData.hasOwnProperty("how_many_grades_products_can_vessel_load_discharge_with_double")) {
      formData.append("how_many_grades_products_can_vessel_load_discharge_with_double", "");
    }

    // Ensure disclaimer is always included in payload (even if null/empty/undefined)
    const disclaimerValue = reportFormData.disclaimer ?? "";
    formData.set("disclaimer", disclaimerValue);

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
      // Do not send field_label/field_value; generic inputs are standardized as field_1..N
      formData.append(
        `flexible_fields[${formDataIndex}][field_order]`,
        field.field_order
      );

      // Add custom media block fields using generic field_ keys
      if (
        field.section_name === "HEADING_DESCRIPTION_IMAGE" ||
        field.section_name === "HEADING_DESCRIPTION_IMAGE_2" ||
        field.section_name === "HEADING_DESCRIPTION_IMAGE_3"
      ) {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_3]`,
          field.field_3 || ""
        );
        if (field.field_4) {
          formData.append(
            `flexible_fields[${formDataIndex}][field_4]`,
            field.field_4
          );
        }
      }

      // Add equipment fields using generic field_ keys
      if (
        field.section_name === "EQUIPMENT_MAKE_MODEL" ||
        field.section_name === "EQUIPMENT_MAKE_MODEL_2"
      ) {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_3]`,
          field.field_3 || ""
        );
      }

      // Add certifications fields using generic field_ keys (1..5)
      if (field.section_name === "CERTIFICATIONS_OF_THE_VESSEL") {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_3]`,
          field.field_3 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_4]`,
          field.field_4 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_5]`,
          field.field_5 || ""
        );
      }

      // Add deck equipment fields using generic field_ keys
      if (field.section_name === "DECK_EQUIPMENT_SPECIAL_FEATURES") {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
      }

      // Add generic flexible fields (default sections: TANK_STORAGE_CAPACITIES, ADDITIONAL_SAFETY_FIRE_FIGHTING_EQUIPMENT,
      // COMMUNICATION_NAVIGATIONAL_EQUIPMENT, MAIN_ENGINES, AUXILIARY_MACHINERIES_GENERATORS,
      // AUXILIARY_MACHINERIES_HARBOUR_GENERATORS, PROPELLER_ASD_VESSEL, MASTER_OR_CAPTAIN_OF_THE_VESSEL, ACCESSORIES, etc.)
      // These use field_1 and field_2 structure
      if (
        field.section_name !== "HEADING_DESCRIPTION_IMAGE" &&
        field.section_name !== "HEADING_DESCRIPTION_IMAGE_2" &&
        field.section_name !== "HEADING_DESCRIPTION_IMAGE_3" &&
        field.section_name !== "EQUIPMENT_MAKE_MODEL" &&
        field.section_name !== "EQUIPMENT_MAKE_MODEL_2" &&
        field.section_name !== "CERTIFICATIONS_OF_THE_VESSEL" &&
        field.section_name !== "DECK_EQUIPMENT_SPECIAL_FEATURES"
      ) {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
      }

      formDataIndex++;
    });

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

  // Handle save report data
  const handleSaveReport = () => {
    // Create FormData for multipart/form-data submission (same as generate API)
    const formData = new FormData();

    // Add ALL form fields to FormData - ensure every field is included to prevent data loss
    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      // Check if this field was explicitly cleared by the user
      // BUT: if field has a value now, send the value (user re-entered it)
      if (clearedFieldsRef.current.has(key) && (!value || value === "")) {
        // Field was cleared and is still empty - send as empty string (null)
        formData.append(key, "");
        return;
      }

      // Handle different value types properly:
      // - null/undefined -> empty string
      // - numbers (including 0) -> keep as is
      // - booleans (including false) -> keep as is
      // - strings -> keep as is (empty string is fine)
      if (value === null || value === undefined) {
        formData.append(key, "");
      } else if (typeof value === "number" || typeof value === "boolean") {
        formData.append(key, value.toString());
      } else {
        formData.append(key, value);
      }
    });

    // Ensure report_title_type is always included (mandatory field)
    if (!reportFormData.report_title_type) {
      formData.set("report_title_type", "VALUATION REPORT");
    }

    // Ensure SingleSearchSelect fields with defaults are always included
    if (!reportFormData.report_title) {
      formData.set("report_title", "Offshore Supply Vessel");
    }
    if (!reportFormData.state_initial) {
      formData.set("state_initial", "MUM");
    }
    if (!reportFormData.imo_or_regd_type) {
      formData.set("imo_or_regd_type", "IMO NO.");
    }
    if (!reportFormData.imo_official_regd_no) {
      formData.set("imo_official_regd_no", "IMO No");
    }
    // Always include report_date_heading in payload (even if user did not change it - use preselected default)
    formData.set("report_date_heading", reportFormData.report_date_heading || "Report Date");

    // Ensure how_many_grades_products_can_vessel_load_discharge_with_double is always included
    // This field might not exist in reportFormData if it was never interacted with
    // Check if the field exists in reportFormData, and if not, add it to FormData
    if (!reportFormData.hasOwnProperty("how_many_grades_products_can_vessel_load_discharge_with_double")) {
      formData.append("how_many_grades_products_can_vessel_load_discharge_with_double", "");
    }

    // Ensure disclaimer is always included in payload (even if null/empty/undefined)
    const disclaimerValue = reportFormData.disclaimer ?? "";
    formData.set("disclaimer", disclaimerValue);

    // Add flexible fields to FormData with proper sequential ordering (same format as generate API)
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
      // Do not send field_label/field_value; generic inputs are standardized as field_1..N
      formData.append(
        `flexible_fields[${formDataIndex}][field_order]`,
        field.field_order
      );

      // Add custom media block fields using generic field_ keys
      if (
        field.section_name === "HEADING_DESCRIPTION_IMAGE" ||
        field.section_name === "HEADING_DESCRIPTION_IMAGE_2" ||
        field.section_name === "HEADING_DESCRIPTION_IMAGE_3"
      ) {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_3]`,
          field.field_3 || ""
        );
        if (field.field_4) {
          formData.append(
            `flexible_fields[${formDataIndex}][field_4]`,
            field.field_4
          );
        }
      }

      // Add equipment fields using generic field_ keys
      if (
        field.section_name === "EQUIPMENT_MAKE_MODEL" ||
        field.section_name === "EQUIPMENT_MAKE_MODEL_2"
      ) {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_3]`,
          field.field_3 || ""
        );
      }

      // Add certifications fields using generic field_ keys (1..5)
      if (field.section_name === "CERTIFICATIONS_OF_THE_VESSEL") {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_3]`,
          field.field_3 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_4]`,
          field.field_4 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_5]`,
          field.field_5 || ""
        );
      }

      // Add deck equipment fields using generic field_ keys
      if (field.section_name === "DECK_EQUIPMENT_SPECIAL_FEATURES") {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
      }

      // Add generic flexible fields (default sections: TANK_STORAGE_CAPACITIES, ADDITIONAL_SAFETY_FIRE_FIGHTING_EQUIPMENT,
      // COMMUNICATION_NAVIGATIONAL_EQUIPMENT, MAIN_ENGINES, AUXILIARY_MACHINERIES_GENERATORS,
      // AUXILIARY_MACHINERIES_HARBOUR_GENERATORS, PROPELLER_ASD_VESSEL, MASTER_OR_CAPTAIN_OF_THE_VESSEL, ACCESSORIES, etc.)
      // These use field_1 and field_2 structure
      if (
        field.section_name !== "HEADING_DESCRIPTION_IMAGE" &&
        field.section_name !== "HEADING_DESCRIPTION_IMAGE_2" &&
        field.section_name !== "HEADING_DESCRIPTION_IMAGE_3" &&
        field.section_name !== "EQUIPMENT_MAKE_MODEL" &&
        field.section_name !== "EQUIPMENT_MAKE_MODEL_2" &&
        field.section_name !== "CERTIFICATIONS_OF_THE_VESSEL" &&
        field.section_name !== "DECK_EQUIPMENT_SPECIAL_FEATURES"
      ) {
        formData.append(
          `flexible_fields[${formDataIndex}][field_1]`,
          field.field_1 || ""
        );
        formData.append(
          `flexible_fields[${formDataIndex}][field_2]`,
          field.field_2 || ""
        );
      }

      formDataIndex++;
    });

    // Dispatch save action with FormData payload (same as generate API)
    dispatch(
      saveOrderReport({
        orderId: id,
        reportData: formData,
      })
    );
  };

  return (
    <section className="order-details-wrapper">
      <div className="row">
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div className="order-report-container">
            <div className="d-flex justify-content-between align-items-center">
              <h2>Marine Report</h2>
              <Link to={`/orders/${id}/details/images`} className="btn btn-primary">View Images</Link>
            </div>
            <form
              className="body-form-box"
              onSubmit={handleReportSubmit}
              style={{ position: "relative" }}
            >
              {/* Loading Overlay - Shows when fetching order or report data */}
              {isLoadingData && (
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
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <div
                      style={{
                        marginTop: "1rem",
                        fontSize: "16px",
                        color: "#333",
                      }}
                    >
                      {orderLoading && reportLoading
                        ? "Loading Order and Report Data..."
                        : orderLoading
                          ? "Loading Order Data..."
                          : "Loading Marine Report Data..."}
                    </div>
                  </div>
                </div>
              )}
              <div className="row">
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Report Title Type <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "VALUATION REPORT",
                          label: "VALUATION REPORT",
                        },
                        {
                          value: "CONDITION VALUATION REPORT",
                          label: "CONDITION VALUATION REPORT",
                        },
                        {
                          value: "DESKTOP VALUATION REPORT",
                          label: "DESKTOP VALUATION REPORT",
                        },
                      ]}
                      value={
                        reportFormData.report_title_type || "VALUATION REPORT"
                      }
                      onChange={(value) =>
                        handleSelectChange("report_title_type", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Report Title <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Offshore Supply Vessel",
                          label: "Offshore Supply Vessel",
                        },
                        {
                          value: "Self-Propelled Barge",
                          label: "Self-Propelled Barge",
                        },
                        {
                          value: "Anchor Handling Tug (AHTS)",
                          label: "Anchor Handling Tug (AHTS)",
                        },
                        {
                          value: "Trailing Suction Hopper Dredger (TSHD)",
                          label: "Trailing Suction Hopper Dredger (TSHD)",
                        },
                        {
                          value: "Cutting Suction Dredger (CSD)",
                          label: "Cutting Suction Dredger (CSD)",
                        },
                        { value: "Dumb Barge (DB)", label: "Dumb Barge (DB)" },
                        { value: "Oil Tanker ", label: "Oil Tanker" },
                        { value: "Chemical Tanker", label: "Chemical Tanker" },
                      ]}
                      value={
                        reportFormData.report_title || "Offshore Supply Vessel"
                      }
                      onChange={(value) =>
                        handleSelectChange("report_title", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Name Of The Vessel <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="name_of_the_vessel"
                      value={reportFormData.name_of_the_vessel}
                      placeholder="Enter name of the vessel"
                      required
                      onChange={(e) => {
                        const name_of_the_vessel = e.target.value.toUpperCase();
                        setReportFormData({
                          ...reportFormData,
                          name_of_the_vessel,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Official No <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="official_no"
                      value={reportFormData.official_no}
                      onChange={handleFormChange}
                      placeholder="Enter Official No"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      IMO or Regd type <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "IMO NO.", label: "IMO NO." },
                        { value: "REGD. NO.", label: "REGD. NO." },
                      ]}
                      value={reportFormData.imo_or_regd_type || "IMO NO."}
                      onChange={(value) =>
                        handleSelectChange("imo_or_regd_type", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      IMO or Regd No <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="imo_or_regd_no"
                      value={reportFormData.imo_or_regd_no}
                      onChange={handleFormChange}
                      placeholder="132132"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>VESSEL PHOTO</label>
                    <div className="vessel-photo-container">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          className="btn"
                          onClick={() => openImageModal("vessel_photo")}
                          style={{ marginBottom: "8px" }}
                        >
                          Select Image
                        </button>
                        {reportFormData.vessel_photo_preview ? (
                          <div
                            style={{
                              position: "relative",
                              display: "inline-block",
                            }}
                          >
                            <img
                              src={reportFormData.vessel_photo_preview}
                              alt="Vessel photo preview"
                              style={{
                                maxWidth: "150px",
                                height: "auto",
                                borderRadius: 4,
                                border: "1px solid #ddd",
                                display: "block",
                              }}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReportFormData((prev) => ({
                                  ...prev,
                                  vessel_photo: "",
                                  vessel_photo_preview: "",
                                  vessel_photo_id: null,
                                }));
                              }}
                              style={{
                                position: "absolute",
                                top: "-8px",
                                right: "-8px",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                zIndex: 10,
                              }}
                              title="Remove image"
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {/* Hidden input field for vessel photo path to include in payload */}
                      {reportFormData.vessel_photo && (
                        <input
                          type="hidden"
                          name="vessel_photo"
                          value={reportFormData.vessel_photo}
                        />
                      )}
                      {reportFormData.vessel_photo_id && (
                        <input
                          type="hidden"
                          name="vessel_photo_id"
                          value={reportFormData.vessel_photo_id}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Client, City, State Name{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="client_city_state_name"
                      value={reportFormData.client_city_state_name}
                      onChange={handleFormChange}
                      placeholder="SAN MARINE (Sheikh Ahmed Alisha) KAKINADA"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      Execute Above <span className="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "Desktop Valuation", label: "Desktop Valuation" },
                        {
                          value: "Physical Survey & Inspection",
                          label: "Physical Survey & Inspection",
                        },
                        {
                          value: "Condition Valuation",
                          label: "Condition Valuation",
                        },
                        {
                          value: "Marine Vessel Verification (AVR)",
                          label: "Marine Vessel Verification (AVR)",
                        },
                      ]}
                      value={
                        reportFormData.execute_above || "Desktop Valuation"
                      }
                      onChange={(value) =>
                        handleSelectChange("execute_above", value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="valuer_name">
                      Valuer Name <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
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
                      name="license_no"
                      value={reportFormData.license_no}
                      onChange={handleFormChange}
                      readOnly
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Inspection Location</label>
                    <input
                      type="text"
                      className="form-field"
                      name="inspection_location_front_page"
                      value={reportFormData.inspection_location_front_page}
                      onChange={handleFormChange}
                      placeholder="Enter Inspection Location"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Inspection Date</label>
                    <input
                      type="text"
                      className="form-field"
                      name="inspection_date_front_page"
                      value={reportFormData.inspection_date_front_page}
                      onChange={handleFormChange}
                      placeholder="Enter Inspection Date"
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
                          {
                            value: "MUM",
                            label: "MUM",
                          },
                          {
                            value: "GUJ",
                            label: "GUJ",
                          },
                        ]}
                        value={reportFormData.state_initial || "MUM"}
                        onChange={(value) =>
                          handleSelectChange("state_initial", value)
                        }
                        required
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
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Client Name With Full Address </label>
                    <WysiwygTextarea
                      className="form-field"
                      name="client_name_with_full_address"
                      value={reportFormData.client_name_with_full_address || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Client Name With Full Address"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>IMO/Official/Regd. No. </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "IMO No",
                          label: "IMO No",
                        },
                        {
                          value: "Regd. No",
                          label: "Regd. No",
                        },
                        {
                          value: "Official No",
                          label: "Official No",
                        },
                      ]}
                      value={reportFormData.imo_official_regd_no || "IMO No"}
                      onChange={(value) =>
                        handleSelectChange("imo_official_regd_no", value)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Particulars of the Vessel */}
              <div className="row">
                <div className="col-md-12">
                  <h4>1.0. PARTICULARS OF THE VESSEL</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Registry vessel Date</label>
                    <input
                      type="text"
                      className="form-field"
                      name="registry_vessel_date"
                      value={reportFormData.registry_vessel_date}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Registry vessel Location </label>
                    <input
                      type="text"
                      className="form-field"
                      name="registry_vessel_location"
                      value={reportFormData.registry_vessel_location}
                      onChange={handleFormChange}
                      placeholder="Enter Registry Vessel Location"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Registered Or Proposed Owner</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="registered_or_proposed_owner"
                      value={reportFormData.registered_or_proposed_owner || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Registered Or Proposed Owner"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Registered Or Proposed Owner Address</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="registered_or_proposed_owner_address"
                      value={
                        reportFormData.registered_or_proposed_owner_address ||
                        ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Registered Or Proposed Owner Address"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Purpose Of Valuation </label>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "FINANCIAL VALUATION",
                          label: "FINANCIAL VALUATION",
                        },
                        {
                          value: "INSURANCE PURPOSE",
                          label: "INSURANCE PURPOSE",
                        },
                      ]}
                      value={
                        reportFormData.purpose_of_valuation ||
                        "FINANCIAL VALUATION"
                      }
                      onChange={(value) =>
                        handleSelectChange("purpose_of_valuation", value)
                      }
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Marine Vessel Name</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="marine_vessel_name"
                      value={reportFormData.marine_vessel_name}
                      onChange={handleFormChange}
                      placeholder="Enter Marine Vessel Name"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Type or Description of Vessel </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_or_description_of_vessel"
                      value={reportFormData.type_or_description_of_vessel}
                      onChange={handleFormChange}
                      placeholder="Enter Type or Description of Vessel"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Official Number / MMSI No.
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="mmsi_no"
                      value={reportFormData.mmsi_no}
                      onChange={handleFormChange}
                      placeholder="0000/000000000"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Class Notation <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="class_notation"
                      value={reportFormData.class_notation}
                      onChange={handleFormChange}
                      placeholder="Enter Class Notation"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Call Sign / Class Notation Machinery{" "}
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="call_sign_class_notation_machinery"
                      value={reportFormData.call_sign_class_notation_machinery}
                      onChange={handleFormChange}
                      placeholder="Enter Call Sign / Class Notation Machinery"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Current Registry Port
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="current_registry_port"
                      value={reportFormData.current_registry_port}
                      onChange={handleFormChange}
                      placeholder="Enter Current Registry Port"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Classification Of Registry
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="classification_of_registry"
                      value={reportFormData.classification_of_registry}
                      onChange={handleFormChange}
                      placeholder="Enter Classification Of Registry"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Present Flag
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="present_flag"
                      value={reportFormData.present_flag}
                      onChange={handleFormChange}
                      placeholder="Enter Present Flag"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Port Of Registry
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="port_of_registry"
                      value={reportFormData.port_of_registry}
                      onChange={handleFormChange}
                      placeholder="Enter Port Of Registry"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      No Of Registry / Registration No.
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_registry_registration_no"
                      value={reportFormData.no_of_registry_registration_no}
                      onChange={handleFormChange}
                      placeholder="Enter No Of Registry / Registration No."
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Date Of Registry
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="date_of_registry"
                      value={reportFormData.date_of_registry}
                      onChange={handleFormChange}
                      placeholder="Enter Date Of Registry"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Registered Under
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="registered_under"
                      value={reportFormData.registered_under}
                      onChange={handleFormChange}
                      placeholder="Enter Registered Under"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Year Of Built
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="year_of_built"
                          value={reportFormData.year_of_built}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only allow numbers
                            const sanitized = value.replace(/[^0-9]/g, "");
                            e.target.value = sanitized;
                            handleFormChange(e);
                          }}
                          placeholder="Enter Year Of Built"
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="year_of_built_inwords"
                          value={reportFormData.year_of_built_inwords}
                          onChange={handleFormChange}
                          placeholder="Enter Year Of Built In Words"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Place Of Built
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="place_of_built"
                      value={reportFormData.place_of_built}
                      onChange={handleFormChange}
                      placeholder="Enter Place Of Built"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Vessel Built By
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="vessel_built_by"
                      value={reportFormData.vessel_built_by}
                      onChange={handleFormChange}
                      placeholder="Enter Vessel Built By"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Type Of Propelled
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_propelled"
                      value={reportFormData.type_of_propelled}
                      onChange={handleFormChange}
                      placeholder="Enter Type Of Propelled"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Length Of Vessel <small>(in meters)</small>
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_vessel"
                      value={reportFormData.length_of_vessel}
                      onChange={handleDimensionChange}
                      placeholder="Enter Length Of Vessel"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      LOA - Length Overall <small>(in meters)</small>
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="loa_length_overall"
                      value={reportFormData.loa_length_overall}
                      onChange={handleDimensionChange}
                      placeholder="Enter LOA - Length Overall"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      LBP - Length By Perpendicular <small>(in meters)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="lbp_length_by_perpendicular"
                      value={reportFormData.lbp_length_by_perpendicular}
                      onChange={handleDimensionChange}
                      placeholder="Enter LBP - Length By Perpendicular"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Breadth Of Vessel <small>(in meters)</small>
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breadth_of_vessel"
                      value={reportFormData.breadth_of_vessel}
                      onChange={handleDimensionChange}
                      placeholder="Enter Breadth Of Vessel"
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Depth Of Vessel <small>(in meters)</small>
                      <span className="text-danger">*</span>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="depth_of_vessel"
                      value={reportFormData.depth_of_vessel}
                      onChange={handleDimensionChange}
                      placeholder="Enter Depth Of Vessel"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Draught Of Vessel <small>(in meters)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="draught_of_vessel"
                      value={reportFormData.draught_of_vessel}
                      onChange={handleDimensionChange}
                      placeholder="Enter Draught Of Vessel"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Summer Draft Of Vessel <small>(in meters)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="summer_draft_of_vessel"
                      value={reportFormData.summer_draft_of_vessel}
                      onChange={handleDimensionChange}
                      placeholder="Enter Summer Draft Of Vessel"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Length Of Stroke <small>(in millimeters)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_stroke"
                      value={reportFormData.length_of_stroke}
                      onChange={handleDimensionChange}
                      placeholder="Enter Length Of Stroke"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Ballast Water Capacity <small>(in cubic meters)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="ballast_water_capacity"
                      value={reportFormData.ballast_water_capacity}
                      onChange={handleDimensionChange}
                      placeholder="Enter Ballast Water Capacity"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Light Ship <small>(in tonnes)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="light_ship"
                      value={reportFormData.light_ship}
                      onChange={handleDimensionChange}
                      placeholder="Enter Light Ship"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Propeller</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="propeller"
                      value={reportFormData.propeller}
                      onChange={handleFormChange}
                      placeholder="Enter Propeller"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Gross Registered Tonnage (GRT) <small>(in tonnes)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="gross_registered_tonnage_grt"
                      value={reportFormData.gross_registered_tonnage_grt}
                      onChange={handleDimensionChange}
                      placeholder="Enter Gross Registered Tonnage (GRT)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Net Registered Tonnage (NRT) <small>(in tonnes)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="net_registered_tonnage_nrt"
                      value={reportFormData.net_registered_tonnage_nrt}
                      onChange={handleDimensionChange}
                      placeholder="Enter Net Registered Tonnage (NRT)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Deadweight Tonnage (DWT) <small>(in tonnes)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="deadweight_tonnage_dwt"
                      value={reportFormData.deadweight_tonnage_dwt}
                      onChange={handleDimensionChange}
                      placeholder="Enter Deadweight Tonnage (DWT)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Free Board <small>(in millimeters)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="free_board"
                      value={reportFormData.free_board}
                      onChange={handleDimensionChange}
                      placeholder="Enter Free Board"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Operating Speed / Max Speed</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="operating_speed_max_speed"
                      value={reportFormData.operating_speed_max_speed}
                      onChange={handleFormChange}
                      placeholder="00 KNOTS / 00 KNOTS"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Regd. Accommodation <small>(including captain)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="regd_accommodation"
                      value={reportFormData.regd_accommodation}
                      onChange={handleDimensionChange}
                      placeholder="00"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Bollard Pull (Sustained) <small>(in metric tons)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="bollard_pull_sustained"
                      value={reportFormData.bollard_pull_sustained}
                      onChange={handleDimensionChange}
                      placeholder="00"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Type Of Propulsion</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_propulsion"
                      value={reportFormData.type_of_propulsion}
                      onChange={handleFormChange}
                      placeholder="Enter Type Of Propulsion"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>No. Of Decks</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_decks"
                      value={reportFormData.no_of_decks}
                      onChange={handleDimensionChange}
                      placeholder="00"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>No. Of Masts</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_masts"
                      value={reportFormData.no_of_masts}
                      onChange={handleDimensionChange}
                      /* onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }} */
                      placeholder="00"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>No. Of Bulkheads</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_bulkheads"
                      value={reportFormData.no_of_bulkheads}
                      onChange={handleDimensionChange}
                      placeholder="00"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Rigged / Not Rigged</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "YES / NO - RIGGED",
                          label: "YES / NO - RIGGED",
                        },
                        { value: "NOT RIGGED", label: "NOT RIGGED" },
                      ]}
                      value={
                        reportFormData.rigged_not_rigged || "YES / NO - RIGGED"
                      }
                      onChange={(value) =>
                        handleSelectChange("rigged_not_rigged", value)
                      }
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Stem Type</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="stem_type"
                      value={reportFormData.stem_type}
                      onChange={handleFormChange}
                      placeholder="Enter Stem Type"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Stern Type</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="stern_type"
                      value={reportFormData.stern_type}
                      onChange={handleFormChange}
                      placeholder="Enter Stern Type"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Built Type</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="built_type"
                      value={reportFormData.built_type}
                      onChange={handleFormChange}
                      placeholder="Enter Built Type"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Material Of Construction</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_construction"
                      value={reportFormData.material_of_construction}
                      onChange={handleFormChange}
                      placeholder="Enter Material Of Construction"
                    />
                  </div>
                </div>
              </div>

              {/* Ownership and Operation */}
              <div className="row">
                <div className="col-md-12">
                  <h4>1.1. OWNERSHIP AND OPERATION:</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Registered owner</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="registered_owner"
                      value={reportFormData.registered_owner}
                      onChange={handleFormChange}
                      placeholder="Enter Registered Owner"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Technical operator</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="technical_operator"
                      value={reportFormData.technical_operator}
                      onChange={handleFormChange}
                      placeholder="Enter Technical Operator"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Commercial operator</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="commercial_operator"
                      value={reportFormData.commercial_operator}
                      onChange={handleFormChange}
                      placeholder="Enter Commercial Operator"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Disponent owner</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="disponent_owner"
                      value={reportFormData.disponent_owner}
                      onChange={handleFormChange}
                      placeholder="Enter Disponent Owner"
                    />
                  </div>
                </div>
              </div>

              {/* Certifications of the Vessel */}
              <div className="row">
                <div className="col-md-12">
                  <h4>2.0. CERTIFICATIONS OF THE VESSEL :</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label htmlFor="certifications_vessel_note">
                      Certifications Vessel Note
                    </label>
                    <WysiwygTextarea
                      className="form-field"
                      id="certifications_vessel_note"
                      name="certifications_vessel_note"
                      value={reportFormData.certifications_vessel_note}
                      onChange={handleFormChange}
                      placeholder="Enter certifications vessel note"
                      rows={4}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("CERTIFICATIONS_OF_THE_VESSEL")
                        }
                      >
                        Add Certificate Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("CERTIFICATIONS_OF_THE_VESSEL")}
                </div>
              </div>

              {/* Protection & Indemnity Policy */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.0. PROTECTION & INDEMNITY POLICY :</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Institution Name</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="institution_name_insurance_policy"
                      value={reportFormData.institution_name_insurance_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Institution Name"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Certificate No.</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="certificate_no_insurance_policy"
                      value={reportFormData.certificate_no_insurance_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Certificate No."
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date Of Issue</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="date_of_issue_insurance_policy"
                      value={reportFormData.date_of_issue_insurance_policy}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>P & I Clause</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="p_i_clause_insurance_policy"
                      value={reportFormData.p_i_clause_insurance_policy}
                      onChange={handleFormChange}
                      placeholder="Enter P & I Clause"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Co - Assured</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="co_assured_insurance_policy"
                      value={reportFormData.co_assured_insurance_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Co - Assured"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Period of P & I Policy</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="start_period_of_p_i_policy_insurance_policy"
                          value={
                            reportFormData.start_period_of_p_i_policy_insurance_policy
                          }
                          onChange={handleDateChange}
                          placeholder="Start date"
                          maxLength="10"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="end_period_of_p_i_policy_insurance_policy"
                          value={
                            reportFormData.end_period_of_p_i_policy_insurance_policy
                          }
                          onChange={handleDateChange}
                          placeholder="End date"
                          maxLength="10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Insured Value</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="insured_value_insurance_policy"
                          value={reportFormData.insured_value_insurance_policy}
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="insured_value_in_words_insurance_policy"
                          value={reportFormData.insured_value_in_words_insurance_policy || ""}
                          onChange={handleFormChange}
                          placeholder="Amount in Words"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insurance for Bunker Oil Pollution Damage Policy */}
              <div className="row">
                <div className="col-md-12">
                  <h4>
                    3.1. INSURANCE FOR BUNKER OIL POLLUTION DAMAGE POLICY :
                  </h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Institution Name</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="institution_name_damage_policy"
                      value={reportFormData.institution_name_damage_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Institution Name"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Certificate Type</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="certificate_type_damage_policy"
                      value={reportFormData.certificate_type_damage_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Certificate Type"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Type of Security</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_security_damage_policy"
                      value={reportFormData.type_of_security_damage_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Security"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Insurer / Guarantor Name & Address</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="insurer_guarantor_name_address_damage_policy"
                      value={
                        reportFormData.insurer_guarantor_name_address_damage_policy
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Insurer / Guarantor Name & Address"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Policy Ref. No.</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="policy_ref_no_damage_policy"
                      value={reportFormData.policy_ref_no_damage_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Policy Ref. No."
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date Of Issue</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="date_of_issue_damage_policy"
                      value={reportFormData.date_of_issue_damage_policy}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      maxLength="10"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Period of P & I Policy</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="start_period_of_damage_policy"
                          value={reportFormData.start_period_of_damage_policy}
                          onChange={handleDateChange}
                          placeholder="Start date"
                          maxLength="10"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="end_period_of_damage_policy"
                          value={reportFormData.end_period_of_damage_policy}
                          onChange={handleDateChange}
                          placeholder="End date"
                          maxLength="10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* War Risk Insurance Policy */}
              <div className="row">
                <div className="col-md-12">
                  <h4>2.3. WAR RISK INSURANCE POLICY :</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Insurance Company Name</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="insurance_company_name_war_risk_policy"
                      value={
                        reportFormData.insurance_company_name_war_risk_policy
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Insurance Company Name"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Policy No.</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="policy_no_war_risk_policy"
                      value={reportFormData.policy_no_war_risk_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Policy No."
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>Period of Insurance</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="start_period_of_war_risk_policy"
                          value={reportFormData.start_period_of_war_risk_policy}
                          onChange={handleDateChange}
                          placeholder="Start date"
                          maxLength="10"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="end_period_of_war_risk_policy"
                          value={reportFormData.end_period_of_war_risk_policy}
                          onChange={handleDateChange}
                          placeholder="End date"
                          maxLength="10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Insured Value</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="insured_value_war_risk_policy"
                          value={reportFormData.insured_value_war_risk_policy}
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="insured_value_in_words_war_risk_policy"
                          value={reportFormData.insured_value_in_words_war_risk_policy || ""}
                          onChange={handleFormChange}
                          placeholder="Amount in Words"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hull & Machinery Insurance Policy */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.1. HULL & MACHINERY INSURANCE POLICY :</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Insurance Company Name</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="insurance_company_name_hull_machinery_policy"
                      value={
                        reportFormData.insurance_company_name_hull_machinery_policy
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Insurance Company Name"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Policy No.</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="policy_no_hull_machinery_policy"
                      value={reportFormData.policy_no_hull_machinery_policy}
                      onChange={handleFormChange}
                      placeholder="Enter Policy No."
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Period of Insurance</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="start_period_of_hull_machinery_policy"
                          value={
                            reportFormData.start_period_of_hull_machinery_policy
                          }
                          onChange={handleDateChange}
                          placeholder="Start date"
                          maxLength="10"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="end_period_of_hull_machinery_policy"
                          value={
                            reportFormData.end_period_of_hull_machinery_policy
                          }
                          onChange={handleDateChange}
                          placeholder="End date"
                          maxLength="10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Insured Value</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="insured_value_hull_machinery_policy"
                          value={
                            reportFormData.insured_value_hull_machinery_policy
                          }
                          onChange={handleCurrencyChange}
                          placeholder="₹ 0.00"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="insured_value_in_words_hull_machinery_policy"
                          value={reportFormData.insured_value_in_words_hull_machinery_policy || ""}
                          onChange={handleFormChange}
                          placeholder="Amount in Words"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Other Details */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.2. OTHER DETAILS :</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Trading Limit</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="trading_limit"
                      value={reportFormData.trading_limit}
                      onChange={handleFormChange}
                      placeholder="Enter Trading Limit"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Collision Bulkhead</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="collision_bulkhead"
                      value={reportFormData.collision_bulkhead}
                      onChange={handleFormChange}
                      placeholder="Enter Collision Bulkhead"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Vessel Bottom Type</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="vessel_bottom_type"
                      value={reportFormData.vessel_bottom_type}
                      onChange={handleFormChange}
                      placeholder="Enter Vessel Bottom Type"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Ex. Name / Flag</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="ex_name_flag"
                      value={reportFormData.ex_name_flag}
                      onChange={handleFormChange}
                      placeholder="Enter Ex. Name / Flag"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Previous Registry</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="previous_registry"
                      value={reportFormData.previous_registry}
                      onChange={handleFormChange}
                      placeholder="Enter Previous Registry"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Keel To Masthead (KTM)</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="keel_to_masthead_ktm"
                      value={reportFormData.keel_to_masthead_ktm}
                      onChange={handleFormChange}
                      placeholder="Enter Keel To Masthead (KTM)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Manifold - Bow To Center Manifold (BCM) /Stern To Center
                      Manifold (SCM)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="manifold_bcm_scm"
                      value={reportFormData.manifold_bcm_scm}
                      onChange={handleFormChange}
                      placeholder="Enter Manifold - Bow To Center Manifold (BCM) /Stern To Center Manifold (SCM)"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>4.1 CLASSIFICATION</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Classification society</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="classification_society"
                      value={reportFormData.classification_society}
                      onChange={handleFormChange}
                      placeholder="Enter Classification Society"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is the vessel subject to any conditions of class, class
                      extensions, outstanding memorandums or class
                      recommendations? If yes, give details:
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="is_vessel_subject_to_any_conditions"
                      value={
                        reportFormData.is_vessel_subject_to_any_conditions || ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Is the vessel subject to any conditions of class, class extensions, outstanding memorandums or class recommendations? If yes, give details:"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      If classification society changed, name of previous and
                      date of change
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="if_classification_society_changed_name"
                      value={
                        reportFormData.if_classification_society_changed_name ||
                        ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter If classification society changed, name of previous and date of change:"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Does the vessel have ice class? If yes, state what level
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="does_the_vessel_have_ice_class"
                      value={
                        reportFormData.does_the_vessel_have_ice_class || ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Does the vessel have ice class? If yes, state what level:"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date/place of last dry−dock</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="date_place_of_last_dry_dock"
                      value={reportFormData.date_place_of_last_dry_dock || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Date/place of last dry−dock:"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date next dry dock due/next annual survey due</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="start_date_next_dry_dock_due_next_annual_survey_due"
                          value={
                            reportFormData.start_date_next_dry_dock_due_next_annual_survey_due
                          }
                          onChange={handleDateChange}
                          placeholder="Start date"
                          maxLength="10"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="end_date_next_dry_dock_due_next_annual_survey_due"
                          value={
                            reportFormData.end_date_next_dry_dock_due_next_annual_survey_due
                          }
                          onChange={handleDateChange}
                          placeholder="End date"
                          maxLength="10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Date of last special survey/next special survey due
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="start_date_of_last_special_survey_next_special_survey_due"
                          value={
                            reportFormData.start_date_of_last_special_survey_next_special_survey_due
                          }
                          onChange={handleDateChange}
                          placeholder="Start date"
                          maxLength="10"
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-field"
                          name="end_date_of_last_special_survey_next_special_survey_due"
                          value={
                            reportFormData.end_date_of_last_special_survey_next_special_survey_due
                          }
                          onChange={handleDateChange}
                          placeholder="End date"
                          maxLength="10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      If ship has Condition Assessment Program (CAP), what is
                      the latest overall rating
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="if_ship_has_condition_assessment"
                      value={
                        reportFormData.if_ship_has_condition_assessment || ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter If ship has Condition Assessment Program (CAP), what is the latest overall rating:"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Hull Design */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.3. HULL DESIGN :</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="hull_design"
                      value={reportFormData.hull_design || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Hull Design"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Present Condition */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.3. A. Present Condition:</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Present Condition 1</label>
                    <WysiwygTextarea
                      className="form-field"
                      name="present_condition_1"
                      value={reportFormData.present_condition_1 || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Present Condition 1"
                      rows={5}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Present Condition 2</label>
                    <WysiwygTextarea
                      className="form-field"
                      name="present_condition_2"
                      value={reportFormData.present_condition_2 || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Present Condition 2"
                      rows={5}
                    />
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Present Condition 3</label>
                    <WysiwygTextarea
                      className="form-field"
                      name="present_condition_3"
                      value={reportFormData.present_condition_3 || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Present Condition 3"
                      rows={5}
                    />
                  </div>
                </div>
              </div>

              {/* Deck Equipment/Special Features */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.4. DECK EQUIPMENT / SPECIAL FEATURES:</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("DECK_EQUIPMENT_SPECIAL_FEATURES")
                        }
                      >
                        Add Deck Equipment/Special Features Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("DECK_EQUIPMENT_SPECIAL_FEATURES")}
                </div>
              </div>

              {/* Tank Storage & Capacities */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.5. TANK STORAGE & CAPACITIES:</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("TANK_STORAGE_CAPACITIES")
                        }
                      >
                        Add Tank Storage & Capacities Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("TANK_STORAGE_CAPACITIES")}
                </div>
              </div>

              {/* Additional Safety & Fire Fighting Equipment */}
              <div className="row">
                <div className="col-md-12">
                  <h4>
                    3.6. ADDITIONAL SAFETY & FIRE FIGHTING EQUIPMENT (IF AVAILABLE)
                  </h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields(
                            "ADDITIONAL_SAFETY_FIRE_FIGHTING_EQUIPMENT"
                          )
                        }
                      >
                        Add Additional Safety & Fire Fighting Equipment Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields(
                    "ADDITIONAL_SAFETY_FIRE_FIGHTING_EQUIPMENT"
                  )}
                </div>
              </div>

              {/* Communication & Navigational Equipment */}
              <div className="row">
                <div className="col-md-12">
                  <h4>3.7. COMMUNICATION & NAVIGATIONAL EQUIPMENT :</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields(
                            "COMMUNICATION_NAVIGATIONAL_EQUIPMENT"
                          )
                        }
                      >
                        Add Communication & Navigational Equipment Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("COMMUNICATION_NAVIGATIONAL_EQUIPMENT")}
                </div>
              </div>

              {/* Main Engines */}
              <div className="row">
                <div className="col-md-12">
                  <h4>4.0. MACHINERIES -  4.A. MAIN ENGINES:</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => addFlexibleFields("MAIN_ENGINES")}
                      >
                        Add Main Engines Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("MAIN_ENGINES")}
                </div>
              </div>

              {/* Auxiliary Machinerie - Generators */}
              <div className="row">
                <div className="col-md-12">
                  <h4>4.1. AUXILIARY MACHINERIES - GENERATORS:</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("AUXILIARY_MACHINERIES_GENERATORS")
                        }
                      >
                        Add Auxiliary Machinerie - Generators Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("AUXILIARY_MACHINERIES_GENERATORS")}
                </div>
              </div>

              {/* Auxiliary Machinerie - Harbour Generators */}
              <div className="row">
                <div className="col-md-12">
                  <h4>
                    4.C. AUXILIARY MACHINERIES - HARBOUR GENERATORS (IF AVAILABLE)
                  </h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields(
                            "AUXILIARY_MACHINERIES_HARBOUR_GENERATORS"
                          )
                        }
                      >
                        Add Auxiliary Machinerie - Harbour Generators Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields(
                    "AUXILIARY_MACHINERIES_HARBOUR_GENERATORS"
                  )}
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label className="mt-3">
                      Auxiliary Machinerie - Other Auxiliary Machinerie
                      Condition
                    </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "survey and inspection onsite of the vessel",
                          label: "survey and inspection onsite of the vessel",
                        },
                        {
                          value:
                            "documents and previous reports provided by client",
                          label:
                            "documents and previous reports provided by client",
                        },
                      ]}
                      value={
                        reportFormData.auxiliary_machinerie_other_auxiliary_machinerie_condition ||
                        "survey and inspection onsite of the vessel"
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "auxiliary_machinerie_other_auxiliary_machinerie_condition",
                          value
                        )
                      }
                      placeholder="Select auxiliary machineries harbour generators Condition"
                    />
                  </div>
                </div>
              </div>

              {/* Steering */}
              <div className="row">
                <div className="col-md-12">
                  <h4>5.0. STEERING :</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="steering_details"
                      value={reportFormData.steering_details || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Details of Steering"
                      rows={5}
                    />
                  </div>
                </div>
              </div>

              {/* Propeller (ASD Vessel) */}
              <div className="row">
                <div className="col-md-12">
                  <h4>5.1. PROPELLER (ASD VESSEL) :</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("PROPELLER_ASD_VESSEL")
                        }
                      >
                        Add Propeller (ASD Vessel) Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("PROPELLER_ASD_VESSEL")}
                </div>
              </div>
              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label className="mt-3">
                      Propeller (ASD Vessel) Condition
                    </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "survey and inspection onsite of the vessel",
                          label: "survey and inspection onsite of the vessel",
                        },
                        {
                          value:
                            "documents and previous reports provided by client",
                          label:
                            "documents and previous reports provided by client",
                        },
                      ]}
                      value={
                        reportFormData.propeller_asd_vessel_condition ||
                        "survey and inspection onsite of the vessel"
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "propeller_asd_vessel_condition",
                          value
                        )
                      }
                      placeholder="Select Propeller (ASD Vessel) Condition"
                    />
                  </div>
                </div>
              </div>

              {/* Master or Captain of the Vessel */}
              <div className="row">
                <div className="col-md-12">
                  <h4>5.2. MASTER OR CAPTAIN OF THE VESSEL</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("MASTER_OR_CAPTAIN_OF_THE_VESSEL")
                        }
                      >
                        Add Master or Captain of the Vessel Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("MASTER_OR_CAPTAIN_OF_THE_VESSEL")}
                </div>
              </div>

              {/* Accessories */}
              <div className="row">
                <div className="col-md-12">
                  <h4>6.0. ACCESSORIES :</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => addFlexibleFields("ACCESSORIES")}
                      >
                        Add Accessories Details
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("ACCESSORIES")}
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>4.2. DIMENSIONS</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Keel to masthead (KTM)/ Keel to masthead (KTM) in
                      collapsed condition, if applicable{" "}
                      <small>(in Metres)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="keel_to_masthead_ktm_dimensions"
                      value={reportFormData.keel_to_masthead_ktm_dimensions}
                      onChange={handleDimensionChange}
                      placeholder="in Metres"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Distance bridge front to center of manifold{" "}
                      <small>(in Metres)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="distance_bridge_front_to_center_of_manifold_dimensions"
                      value={
                        reportFormData.distance_bridge_front_to_center_of_manifold_dimensions
                      }
                      onChange={handleDimensionChange}
                      placeholder="in Metres"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Bow to center manifold (BCM)/Stern to center manifold
                      (SCM) <small>(in Metres)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="bow_to_center_manifold_bcm_dimensions"
                          value={
                            reportFormData.bow_to_center_manifold_bcm_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="in Metres"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="stern_to_center_manifold_scm_dimensions"
                          value={
                            reportFormData.stern_to_center_manifold_scm_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="in Metres"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Forward to mid−point manifold <small>(in Metres)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="forward_to_mid_point_manifold_lightship_dimensions"
                          value={
                            reportFormData.forward_to_mid_point_manifold_lightship_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Lightship"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="forward_to_mid_point_manifold_normal_ballast_dimensions"
                          value={
                            reportFormData.forward_to_mid_point_manifold_normal_ballast_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Normal Ballast"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="forward_to_mid_point_manifold_summer_dwt_dimensions"
                          value={
                            reportFormData.forward_to_mid_point_manifold_summer_dwt_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Summer DWT"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Aft to mid−point manifold <small>(in Metres)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="aft_to_mid_point_manifold_lightship_dimensions"
                          value={
                            reportFormData.aft_to_mid_point_manifold_lightship_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Lightship"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="aft_to_mid_point_manifold_normal_ballast_dimensions"
                          value={
                            reportFormData.aft_to_mid_point_manifold_normal_ballast_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Normal Ballast"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="aft_to_mid_point_manifold_summer_dwt_dimensions"
                          value={
                            reportFormData.aft_to_mid_point_manifold_summer_dwt_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Summer DWT"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Parallel body length <small>(in Metres)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="parallel_body_length_lightship_dimensions"
                          value={
                            reportFormData.parallel_body_length_lightship_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Lightship"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="parallel_body_length_normal_ballast_dimensions"
                          value={
                            reportFormData.parallel_body_length_normal_ballast_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Normal Ballast"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="parallel_body_length_summer_dwt_dimensions"
                          value={
                            reportFormData.parallel_body_length_summer_dwt_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Summer DWT"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Loadline Information */}
              <div className="row">
                <div className="col-md-12">
                  <h4>4.3 LOADLINE INFORMATION</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Summer</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <label>
                          <small>(in Metres)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="summer_Freeboard_dimensions"
                          value={reportFormData.summer_Freeboard_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Freeboard"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label>
                          <small>(in Metres)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="summer_Draft_dimensions"
                          value={reportFormData.summer_Draft_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label>
                          <small>(in Metric Tonnes)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="summer_Deadweight_dimensions"
                          value={reportFormData.summer_Deadweight_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Deadweight"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <label>
                          <small>(in Metric Tonnes)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="summer_Displacement_dimensions"
                          value={reportFormData.summer_Displacement_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Winter</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="winter_Freeboard_dimensions"
                          value={reportFormData.winter_Freeboard_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Freeboard"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="winter_Draft_dimensions"
                          value={reportFormData.winter_Draft_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="winter_Deadweight_dimensions"
                          value={reportFormData.winter_Deadweight_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Deadweight"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="winter_Displacement_dimensions"
                          value={reportFormData.winter_Displacement_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Tropical</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="tropical_Freeboard_dimensions"
                          value={reportFormData.tropical_Freeboard_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Freeboard"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="tropical_Draft_dimensions"
                          value={reportFormData.tropical_Draft_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="tropical_Deadweight_dimensions"
                          value={reportFormData.tropical_Deadweight_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Deadweight"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="tropical_Displacement_dimensions"
                          value={
                            reportFormData.tropical_Displacement_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Lightship</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="lightship_Freeboard_dimensions"
                          value={reportFormData.lightship_Freeboard_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Freeboard"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="lightship_Draft_dimensions"
                          value={reportFormData.lightship_Draft_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="lightship_Deadweight_dimensions"
                          value={reportFormData.lightship_Deadweight_dimensions}
                          onChange={handleDimensionChange}
                          placeholder="Deadweight"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="lightship_Displacement_dimensions"
                          value={
                            reportFormData.lightship_Displacement_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Normal Ballast Condition</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="normal_ballast_condition_Freeboard_dimensions"
                          value={
                            reportFormData.normal_ballast_condition_Freeboard_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Freeboard"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="normal_ballast_condition_Draft_dimensions"
                          value={
                            reportFormData.normal_ballast_condition_Draft_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="normal_ballast_condition_Deadweight_dimensions"
                          value={
                            reportFormData.normal_ballast_condition_Deadweight_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Deadweight"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="normal_ballast_condition_Displacement_dimensions"
                          value={
                            reportFormData.normal_ballast_condition_Displacement_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Segregated Ballast Condition</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="segregated_ballast_condition_Freeboard_dimensions"
                          value={
                            reportFormData.segregated_ballast_condition_Freeboard_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Freeboard"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="segregated_ballast_condition_Draft_dimensions"
                          value={
                            reportFormData.segregated_ballast_condition_Draft_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="segregated_ballast_condition_Deadweight_dimensions"
                          value={
                            reportFormData.segregated_ballast_condition_Deadweight_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Deadweight"
                        />
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="segregated_ballast_condition_Displacement_dimensions"
                          value={
                            reportFormData.segregated_ballast_condition_Displacement_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>FWA/TPC at summer draft</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="fwa_tpc_at_summer_draft_Freeboard_dimensions"
                          value={
                            reportFormData.fwa_tpc_at_summer_draft_Freeboard_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Freeboard - Draft"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="fwa_tpc_at_summer_draft_Draft_dimensions"
                          value={
                            reportFormData.fwa_tpc_at_summer_draft_Draft_dimensions
                          }
                          onChange={handleDimensionChange}
                          placeholder="Deadweight - Displacement"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Does vessel have multiple SDWT? If yes, please provide all
                      assigned loadlines:
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={reportFormData.does_vessel_have_multiple_sdwt || ""}
                      onChange={(value) =>
                        handleSelectChange(
                          "does_vessel_have_multiple_sdwt",
                          value
                        )
                      }
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Constant (excluding fresh water){" "}
                      <small>(in Metric Tonnes)</small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="constant_excluding_fresh_water"
                      value={reportFormData.constant_excluding_fresh_water}
                      onChange={handleDimensionChange}
                      placeholder="Enter Constant (excluding fresh water)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is the company guidelines for Under Keel Clearance
                      (UKC) for this vessel?
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <WysiwygTextarea
                      className="form-field"
                      name="company_guidelines_for_under_keel_clearance_ukc"
                      value={
                        reportFormData.company_guidelines_for_under_keel_clearance_ukc ||
                        ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Company Guidelines for Under Keel Clearance (UKC)"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Summer deadweight{" "}
                      <small>
                        (What is the max height of mast above waterline (air
                        draft))
                      </small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          Full Mast <small>(in Meters)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="full_mast_summer_deadweight_dimensions"
                          value={
                            reportFormData.full_mast_summer_deadweight_dimensions
                          }
                          onChange={handleDimensionChange}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          Collapsed Mast <small>(in Meters)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="collapsed_mast_summer_deadweight_dimensions"
                          value={
                            reportFormData.collapsed_mast_summer_deadweight_dimensions
                          }
                          onChange={handleDimensionChange}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Normal ballast{" "}
                      <small>
                        (What is the max height of mast above waterline (air
                        draft))
                      </small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="full_mast_normal_ballast_dimensions"
                          value={
                            reportFormData.full_mast_normal_ballast_dimensions
                          }
                          onChange={handleDimensionChange}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="collapsed_mast_normal_ballast_dimensions"
                          value={
                            reportFormData.collapsed_mast_normal_ballast_dimensions
                          }
                          onChange={handleDimensionChange}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Lightship{" "}
                      <small>
                        (What is the max height of mast above waterline (air
                        draft))
                      </small>
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="full_mast_lightship_dimensions"
                          value={reportFormData.full_mast_lightship_dimensions}
                          onChange={handleDimensionChange}
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="collapsed_mast_lightship_dimensions"
                          value={
                            reportFormData.collapsed_mast_lightship_dimensions
                          }
                          onChange={handleDimensionChange}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DOCUMENTATION */}
              <div className="row">
                <div className="col-md-12">
                  <h4>6.0 DOCUMENTATION</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Owner warrant that vessel is member of ITOPF and will
                      remain so for the entire duration of this
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes / ITOPF Member",
                          label: "Yes / ITOPF Member",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={reportFormData.itopf_member || ""}
                      onChange={(value) =>
                        handleSelectChange("itopf_member", value)
                      }
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Does vessel have in place a Drug and Alcohol Policy
                      complying with OCIMF guidelines for Control of Drugs
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes / OCIMF Member",
                          label: "Yes / OCIMF Member",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={reportFormData.ocimf_member || ""}
                      onChange={(value) =>
                        handleSelectChange("ocimf_member", value)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* CREW */}
              <div className="row">
                <div className="col-md-12">
                  <h4>7.0 CREW</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Nationality of Master / Name</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="nationality_of_master_name"
                      value={reportFormData.nationality_of_master_name}
                      onChange={handleFormChange}
                      placeholder="Enter Nationality of Master / Name"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Number and nationality of Officers</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="number_and_nationality_of_officers"
                      value={reportFormData.number_and_nationality_of_officers}
                      onChange={handleFormChange}
                      placeholder="Enter Number and Nationality of Officers"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Number and nationality of Crew</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="number_and_nationality_of_crew"
                      value={reportFormData.number_and_nationality_of_crew}
                      onChange={handleFormChange}
                      placeholder="Enter Number and Nationality of Crew"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>What is the common working language onboard</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="common_working_language_onboard"
                      value={reportFormData.common_working_language_onboard}
                      onChange={handleFormChange}
                      placeholder="Enter Common Working Language Onboard"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Do officers speak and understand English?</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.do_officers_speak_and_understand_english || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "do_officers_speak_and_understand_english",
                          value
                        )
                      }
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      If Officers/ratings employed by a manning agency − Full
                      style
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="if_officers_ratings_employed_by_a_manning_agency_full_style"
                      value={
                        reportFormData.if_officers_ratings_employed_by_a_manning_agency_full_style
                      }
                      onChange={handleFormChange}
                      placeholder="Enter If Officers/ratings employed by a manning agency − Full style"
                    />
                  </div>
                </div>
              </div>

              {/* SAFETY/HELICOPTER */}
              <div className="row">
                <div className="col-md-12">
                  <h4>8.0 SAFETY/HELICOPTER</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is the vessel operated under a Quality Management System?
                      If Yes, what type of system? (ISO9001 or IMO Resolution
                      A.741(18) as amended)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.is_the_vessel_operated_under_a_quality_management_system || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "is_the_vessel_operated_under_a_quality_management_system",
                          value
                        )
                      }
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Can the ship comply with the ICS Helicopter Guidelines?
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.can_the_ship_comply_with_the_ics_helicopter_guidelines || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "can_the_ship_comply_with_the_ics_helicopter_guidelines",
                          value
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* VESSEL ACCESSORIES & CAPACITIES */}
              <div className="row">
                <div className="col-md-12">
                  <h4>9.0 VESSEL ACCESSORIES & CAPACITIES</h4>
                  <hr />
                </div>
                <div className="row ml-5 w-100">
                  <div className="col-md-12">
                    <h5>9.1 COATING/ANODES</h5>
                    <hr />
                  </div>
                  <div className="col-md-4">
                    <div className="form-group">
                      <label>Cargo tanks</label>
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>(COATED)</small>
                      </label>
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.coated_cargo_tanks || ""}
                        onChange={(value) =>
                          handleSelectChange("coated_cargo_tanks", value)
                        }
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>(TYPE)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_cargo_tanks"
                        value={reportFormData.type_of_cargo_tanks}
                        onChange={handleFormChange}
                        placeholder="Enter Type of Cargo Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>(TO WHAT EXTENT )</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="to_what_extent_cargo_tanks"
                        value={reportFormData.to_what_extent_cargo_tanks}
                        onChange={handleFormChange}
                        placeholder="Enter To What Extent Cargo Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>(ANODES)</small>
                      </label>
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.anode_cargo_tanks || ""}
                        onChange={(value) =>
                          handleSelectChange("anode_cargo_tanks", value)
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="form-group">
                      <label>Ballast tanks</label>
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.coated_ballast_tanks || ""}
                        onChange={(value) =>
                          handleSelectChange("coated_ballast_tanks", value)
                        }
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_ballast_tanks"
                        value={reportFormData.type_of_ballast_tanks}
                        onChange={handleFormChange}
                        placeholder="Enter Type of Cargo Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="to_what_extent_ballast_tanks"
                        value={reportFormData.to_what_extent_ballast_tanks}
                        onChange={handleFormChange}
                        placeholder="Enter To What Extent Ballast Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.anode_ballast_tanks || ""}
                        onChange={(value) =>
                          handleSelectChange("anode_ballast_tanks", value)
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="form-group">
                      <label>Slop tanks</label>
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.coated_slop_tanks || ""}
                        onChange={(value) =>
                          handleSelectChange("coated_slop_tanks", value)
                        }
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_slop_tanks"
                        value={reportFormData.type_of_slop_tanks}
                        onChange={handleFormChange}
                        placeholder="Enter Type of Cargo Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="to_what_extent_slop_tanks"
                        value={reportFormData.to_what_extent_slop_tanks}
                        onChange={handleFormChange}
                        placeholder="Enter To What Extent Slop Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.anode_slop_tanks || ""}
                        onChange={(value) =>
                          handleSelectChange("anode_slop_tanks", value)
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.2 BALLAST</h5>
                    <hr />
                  </div>

                  <div className="col-md-4">
                    <div className="form-group">
                      <label>Ballast Pumps</label>
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>No.</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="number_of_ballast_pumps"
                        value={reportFormData.number_of_ballast_pumps}
                        onChange={handleDimensionChange}
                        placeholder="Enter Number of Ballast Pumps"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>Type</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_ballast_pumps"
                        value={reportFormData.type_of_ballast_pumps}
                        onChange={handleFormChange}
                        placeholder="Enter Type of Ballast Pumps"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>Capacity (Cu.Metres/Hour)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="capacity_of_ballast_pumps"
                        value={reportFormData.capacity_of_ballast_pumps}
                        onChange={handleDimensionChange}
                        placeholder="Enter Capacity of Ballast Pumps"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <label>
                        <small>At What Head (sg=1.0) (Meters)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="at_what_head_ballast_pumps"
                        value={reportFormData.at_what_head_ballast_pumps}
                        onChange={handleDimensionChange}
                        placeholder="Enter At What Head Ballast Pumps"
                      />
                    </div>
                  </div>

                  <div className="col-md-4">
                    <div className="form-group">
                      <label>Ballast Eductors</label>
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="number_of_ballast_eductors"
                        value={reportFormData.number_of_ballast_eductors}
                        onChange={handleDimensionChange}
                        placeholder="Enter Number of Ballast Eductors"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_ballast_eductors"
                        value={reportFormData.type_of_ballast_eductors}
                        onChange={handleFormChange}
                        placeholder="Enter Type of Ballast Eductors"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="capacity_of_ballast_eductors"
                        value={reportFormData.capacity_of_ballast_eductors}
                        onChange={handleDimensionChange}
                        placeholder="Enter Capacity of Ballast Eductors"
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="at_what_head_ballast_eductors"
                        value={reportFormData.at_what_head_ballast_eductors}
                        onChange={handleDimensionChange}
                        placeholder="Enter At What Head Ballast Eductors"
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.3 CARGO</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Is vessel fitted with centerline bulkhead in all cargo
                        tanks? If Yes, solid or perforated:
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="is_vessel_fitted_with_centerline_bulkhead_in_all_cargo_tanks"
                        value={
                          reportFormData.is_vessel_fitted_with_centerline_bulkhead_in_all_cargo_tanks
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Is Vessel Fitted With Centerline Bulkhead In All Cargo Tanks"
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.4 Cargo Tank Capacities</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Number of cargo tanks and total cubic capacity (98%)
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="number_of_cargo_tanks_and_total_cubic_capacity_98"
                            value={
                              reportFormData.number_of_cargo_tanks_and_total_cubic_capacity_98
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Cargo Tank Capacity"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="total_cubic_capacity_98"
                            value={reportFormData.total_cubic_capacity_98}
                            onChange={handleDimensionChange}
                            placeholder="Enter Total Cubic Capacity 98 (in Cu. Metres)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Capacity (max% per company policy: 98%, 97%, 96% or 95%)
                        of each natural segregation with double valve (specify
                        tanks)
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="capacity_of_each_natural_segregation_with_double_valve"
                        value={
                          reportFormData.capacity_of_each_natural_segregation_with_double_valve
                        }
                        onChange={handleFormChange}
                        placeholder="Enter Capacity of Each Natural Segregation With Double Valve"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        IMO class (Oil/Chemical Ship Type 1, 2 or 3)
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="imo_class"
                        value={reportFormData.imo_class}
                        onChange={handleFormChange}
                        placeholder="Enter IMO Class"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Number of slop tanks and total cubic capacity (98%)
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="number_of_slop_tanks_and_total_cubic_capacity_98"
                            value={
                              reportFormData.number_of_slop_tanks_and_total_cubic_capacity_98
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Slop Tank Capacity"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="total_cubic_capacity_98_slop_tanks"
                            value={
                              reportFormData.total_cubic_capacity_98_slop_tanks
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Total Cubic Capacity 98 Slop Tanks (in Cu. Metres)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Specify segregations which slops tanks belong to and
                        their capacity with double valve
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="specify_segregations_double_valve"
                        value={reportFormData.specify_segregations_double_valve}
                        onChange={handleFormChange}
                        placeholder="Enter Specify Segregations Which Slops Tanks Belong To And Their Capacity With Double Valve"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Residual/retention oil tank(s) capacity (98%), if
                        applicable
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="residual_retention_oil_tank_capacity_98"
                        value={
                          reportFormData.residual_retention_oil_tank_capacity_98
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Residual/Retention Oil Tank Capacity 98 (in Cu. Metres)"
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.5 SBT VESSEL</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        What is total SBT capacity and percentage of SDWT vessel
                        can maintain?
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="total_sbt_capacity_and_percentage_of_sdwt_vessel_can_maintain"
                            value={
                              reportFormData.total_sbt_capacity_and_percentage_of_sdwt_vessel_can_maintain
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Total SBT Capacity And Percentage Of SDWT Vessel Can Maintain (in Cu. Metres)"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="percentage_of_sdwt_vessel_can_maintain"
                            value={
                              reportFormData.percentage_of_sdwt_vessel_can_maintain
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Percentage Of SDWT Vessel Can Maintain (in %)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Does vessel meet the requirements of MARPOL Annex I Reg
                        18.2:
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={
                          reportFormData.does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2 || ""
                        }
                        onChange={(value) =>
                          handleSelectChange(
                            "does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2",
                            value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.6 Cargo Handling and Pumping Systems</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        How many grades/products can vessel load/discharge with
                        double valve segregation
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="how_many_grades_products_can_vessel_load_discharge_with_double"
                        value={
                          reportFormData.how_many_grades_products_can_vessel_load_discharge_with_double || ""
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter How Many Grades/Products Can Vessel Load/Discharge With Double Valve Segregation"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        State type of cargo containment (integral, independent,
                        gravity or pressure tanks)
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_cargo_containment"
                        value={reportFormData.type_of_cargo_containment}
                        onChange={handleFormChange}
                        placeholder="Enter Type Of Cargo Containment"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Loaded per manifold connection</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <label>
                            <small>With VECS (in Cu.Metres/Hour)</small>
                          </label>
                          <input
                            type="text"
                            className="form-field"
                            name="with_vecs_capacity"
                            value={reportFormData.with_vecs_capacity}
                            onChange={handleDimensionChange}
                            placeholder="Enter With VECS Capacity (in Cu. Metres/Hour)"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <label>
                            <small>Without VECS (in Cu.Metres/Hour)</small>
                          </label>
                          <input
                            type="text"
                            className="form-field"
                            name="without_vecs_capacity"
                            value={reportFormData.without_vecs_capacity}
                            onChange={handleDimensionChange}
                            placeholder="Enter Without VECS Capacity (in Cu. Metres/Hour)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Loaded simultaneously through all manifolds</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="loaded_simultaneously_through_all_manifolds_with_vecs_capacity"
                            value={
                              reportFormData.loaded_simultaneously_through_all_manifolds_with_vecs_capacity
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Loaded Simultaneously Through All Manifolds With VECS Capacity (in Cu. Metres/Hour)"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="loaded_simultaneously_through_all_manifolds_without_vecs"
                            value={
                              reportFormData.loaded_simultaneously_through_all_manifolds_without_vecs
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Loaded Simultaneously Through All Manifolds Without VECS Capacity (in Cu. Metres/Hour)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.7 CARGO CONTROL ROOM</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Is ship fitted with a Cargo Control Room (CCR)?
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={
                          reportFormData.is_ship_fitted_with_a_cargo_control_room_ccr || ""
                        }
                        onChange={(value) =>
                          handleSelectChange(
                            "is_ship_fitted_with_a_cargo_control_room_ccr",
                            value
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Can tank innage/ullage be read from the CCR?
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={
                          reportFormData.can_tank_innage_ullage_be_read_from_the_ccr || ""
                        }
                        onChange={(value) =>
                          handleSelectChange(
                            "can_tank_innage_ullage_be_read_from_the_ccr",
                            value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.8 GAUGING & SAMPLING</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Is gauging system certified and calibrated? If no,
                        specify which ones are not calibrated
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={
                          reportFormData.is_gauging_system_certified_and_calibrated || ""
                        }
                        onChange={(value) =>
                          handleSelectChange(
                            "is_gauging_system_certified_and_calibrated",
                            value
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        What type of fixed closed tank gauging system is fitted
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="type_of_fixed_closed_tank_gauging_system_fitted"
                        value={
                          reportFormData.type_of_fixed_closed_tank_gauging_system_fitted
                        }
                        onChange={handleFormChange}
                        placeholder="Enter Type Of Fixed Closed Tank Gauging System Fitted"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Are high level alarms fitted to the cargo tanks? If Yes,
                        indicate whether to all tanks or partial
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="are_high_level_alarms_fitted_to_the_cargo_tanks"
                        value={
                          reportFormData.are_high_level_alarms_fitted_to_the_cargo_tanks
                        }
                        onChange={handleFormChange}
                        placeholder="Enter Are High Level Alarms Fitted To The Cargo Tanks"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Number of portable gauging units (example− MMC) on board
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="number_of_portable_gauging_units_on_board"
                        value={
                          reportFormData.number_of_portable_gauging_units_on_board
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Number Of Portable Gauging Units On Board"
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.9 Vapor Emission Control System (VECS)</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Is a Vapour Emission Control System (VECS) fitted?
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={
                          reportFormData.is_a_vapour_emission_control_system_vecs_fitted || ""
                        }
                        onChange={(value) =>
                          handleSelectChange(
                            "is_a_vapour_emission_control_system_vecs_fitted",
                            value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Number/size of VECS manifolds (per side):</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="number_of_vecs_manifolds_per_side"
                            value={
                              reportFormData.number_of_vecs_manifolds_per_side
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Number Of VES Manifolds Per Side"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="size_of_vecs_manifolds_per_side"
                            value={
                              reportFormData.size_of_vecs_manifolds_per_side
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Size Of VES Manifolds Per Side (in Millimetres)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Number/size/type of VECS reducers:</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="number_of_vecs_reducers_per_side"
                        value={reportFormData.number_of_vecs_reducers_per_side}
                        onChange={handleFormChange}
                        placeholder="Enter Number Of VES Reducers Per Side"
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.10 VENTING</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        State what type of venting system is fitted:
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="state_what_type_of_venting_system_is_fitted"
                        value={
                          reportFormData.state_what_type_of_venting_system_is_fitted
                        }
                        onChange={handleFormChange}
                        placeholder="Enter State What Type Of Venting System Is Fitted"
                      />
                    </div>
                  </div>

                  <div className="col-md-12">
                    <h5>9.11 CARGO MANIFOLDS & REDUCERS</h5>
                    <hr />
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Total number/size of cargo manifold connections on each
                        side:
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="total_number_of_cargo_manifold_connections_on_each_side"
                        value={
                          reportFormData.total_number_of_cargo_manifold_connections_on_each_side
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Total Number Of Cargo Manifold Connections On Each Side"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>What type of valves are fitted at manifold:</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="what_type_of_valves_are_fitted_at_manifold"
                        value={
                          reportFormData.what_type_of_valves_are_fitted_at_manifold
                        }
                        onChange={handleFormChange}
                        placeholder="Enter What Type Of Valves Are Fitted At Manifold"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        What is the material/rating of the manifold:
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="what_is_the_material_rating_of_the_manifold"
                        value={
                          reportFormData.what_is_the_material_rating_of_the_manifold
                        }
                        onChange={handleFormChange}
                        placeholder="Enter What Is The Material Rating Of The Manifold"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Does vessel comply with the latest edition of the OCIMF
                        'Recommendations for Oil Tanker Manifolds and Associated
                        Equipment?
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <SingleSearchSelect
                        options={[
                          {
                            value: "Yes",
                            label: "Yes",
                          },
                          {
                            value: "No",
                            label: "No",
                          },
                        ]}
                        value={reportFormData.does_vessel_comply || ""}
                        onChange={(value) =>
                          handleSelectChange("does_vessel_comply", value)
                        }
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Distance between cargo manifold centers:</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="distance_between_cargo_manifold_centers"
                        value={
                          reportFormData.distance_between_cargo_manifold_centers
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Distance Between Cargo Manifold Centers"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Distance ships rail to manifold</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="distance_ships_rail_to_manifold"
                        value={reportFormData.distance_ships_rail_to_manifold}
                        onChange={handleDimensionChange}
                        placeholder="Enter Distance Ships Rail To Manifold"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Distance manifold to ships side</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="distance_manifold_to_ships_side"
                        value={reportFormData.distance_manifold_to_ships_side}
                        onChange={handleDimensionChange}
                        placeholder="Enter Distance Manifold To Ships Side"
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Top of rail to center of manifold</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="distance_top_of_rail_to_center_of_manifold"
                        value={
                          reportFormData.distance_top_of_rail_to_center_of_manifold
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Distance Top Of Rail To Center Of Manifold"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Distance main deck to center of manifold</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="distance_main_deck_to_center_of_manifold"
                        value={
                          reportFormData.distance_main_deck_to_center_of_manifold
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Distance Main Deck To Center Of Manifold"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Spill tank grating to center of manifold</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        <small>(in Millimetres)</small>
                      </label>
                      <input
                        type="text"
                        className="form-field"
                        name="distance_spill_tank_grating_to_center_of_manifold"
                        value={
                          reportFormData.distance_spill_tank_grating_to_center_of_manifold
                        }
                        onChange={handleDimensionChange}
                        placeholder="Enter Distance Spill Tank Grating To Center Of Manifold"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Manifold height above the waterline in normal ballast/at
                        SDWT condition
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="manifold_height_above_the_waterline_in_normal_ballast_at_sdwt"
                            value={
                              reportFormData.manifold_height_above_the_waterline_in_normal_ballast_at_sdwt
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Manifold Height Above The Waterline In Normal Ballast At SDWT Condition (in Metres)"
                          />
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="form-group">
                          <input
                            type="text"
                            className="form-field"
                            name="manifold_height_above_the_waterline_in_lightship_condition"
                            value={
                              reportFormData.manifold_height_above_the_waterline_in_lightship_condition
                            }
                            onChange={handleDimensionChange}
                            placeholder="Enter Manifold Height Above The Waterline In Lightship Condition (in Metres)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>Number/size / type of reducers:</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="number_of_reducers_per_side"
                        value={reportFormData.number_of_reducers_per_side}
                        onChange={handleFormChange}
                        placeholder="Enter Number Of Reducers Per Side"
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="form-group">
                      <label>
                        Is vessel fitted with a stern manifold? If yes, state
                        size
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <input
                        type="text"
                        className="form-field"
                        name="is_vessel_fitted_with_a_stern_manifold_if_yes_state_size"
                        value={
                          reportFormData.is_vessel_fitted_with_a_stern_manifold_if_yes_state_size
                        }
                        onChange={handleFormChange}
                        placeholder="Enter Is Vessel Fitted With A Stern Manifold If Yes State Size"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/** 10.1 HEATING */}
              <div className="row">
                <div className="col-md-12">
                  <h4>10.1 HEATING</h4>
                  <hr />
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>Cargo Tanks</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_cargo_tanks_heating"
                      value={reportFormData.type_of_cargo_tanks_heating}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Cargo Tanks"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>COILED</small>
                    </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={reportFormData.coiled_cargo_tanks_heating || ""}
                      onChange={(value) =>
                        handleSelectChange("coiled_cargo_tanks_heating", value)
                      }
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      <small>MATERIAL</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_cargo_tanks_heating"
                      value={reportFormData.material_of_cargo_tanks_heating}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Cargo Tanks"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Slop Tanks</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_slop_tanks_heating"
                      value={reportFormData.type_of_slop_tanks_heating}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Slop Tanks"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>COILED</small>
                    </label>
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={reportFormData.coiled_slop_tanks_heating || ""}
                      onChange={(value) =>
                        handleSelectChange("coiled_slop_tanks_heating", value)
                      }
                    />
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>
                      <small>MATERIAL</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_slop_tanks_heating"
                      value={reportFormData.material_of_slop_tanks_heating}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Slop Tanks"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Maximum temperature cargo can be loaded/maintained
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="maximum_temperature_cargo_can_be_loaded_maintained_1"
                          value={
                            reportFormData.maximum_temperature_cargo_can_be_loaded_maintained_1
                          }
                          onChange={handleDimensionChange}
                          placeholder="Enter Maximum Temperature Cargo Can Be Loaded/Maintained (in Celsius)"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="maximum_temperature_cargo_can_be_loaded_maintained_2"
                          value={
                            reportFormData.maximum_temperature_cargo_can_be_loaded_maintained_2
                          }
                          onChange={handleDimensionChange}
                          placeholder="Enter Maximum Temperature Cargo Can Be Loaded/Maintained (in Celsius)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/** 10.2 INERT GAS & CRUDE OIL WASHING */}
              <div className="row">
                <div className="col-md-12">
                  <h4>10.2 INERT GAS & CRUDE OIL WASHING</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is an Inert Gas System (IGS) fitted/operational?
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="is_an_inert_gas_system_igs_fitted_operational"
                      value={
                        reportFormData.is_an_inert_gas_system_igs_fitted_operational
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Is An Inert Gas System (IGS) Fitted/Operational"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is IGS supplied by flue gas, inert gas (IG) generator
                      and/or nitrogen
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="is_igs_supplied_by_flue_gas_inert_gas_ig_generator"
                      value={
                        reportFormData.is_igs_supplied_by_flue_gas_inert_gas_ig_generator
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Is IGS Supplied By Flue Gas, Inert Gas (IG) Generator And/Or Nitrogen"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      If nitrogen generator, specify the applicable flow rate
                      for each of the designed purity modes
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="if_nitrogen_generator_specify"
                      value={reportFormData.if_nitrogen_generator_specify}
                      onChange={handleFormChange}
                      placeholder="Enter If Nitrogen Generator, Specify The Applicable Flow Rate For Each Of The Designed Purity Modes"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.3 CARGO PUMPS</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      How many cargo pumps can be run simultaneously at full
                      capacity
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="how_many_cargo_pumps_can_be_run_simultaneously_at_full_capacity"
                      value={
                        reportFormData.how_many_cargo_pumps_can_be_run_simultaneously_at_full_capacity
                      }
                      onChange={handleFormChange}
                      placeholder="Enter How Many Cargo Pumps Can Be Run Simultaneously At Full Capacity"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Cargo Pumps</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>SR No</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="sr_no_of_cargo_pumps"
                      value={reportFormData.sr_no_of_cargo_pumps}
                      onChange={handleFormChange}
                      placeholder="Enter SR No of Cargo Pumps"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_cargo_pumps"
                      value={reportFormData.type_of_cargo_pumps}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Cargo Pumps"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>CAPACITY (Cu.Metres/Hour)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_cargo_pumps"
                      value={reportFormData.capacity_of_cargo_pumps}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Slop Tanks"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>At What Head (sg=1.0) (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="at_what_head_cargo_pumps"
                      value={reportFormData.at_what_head_cargo_pumps}
                      onChange={handleFormChange}
                      placeholder="Enter At What Head Cargo Pumps"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Cargo Eductors</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>SR No</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="sr_no_of_cargo_eductors"
                      value={reportFormData.sr_no_of_cargo_eductors}
                      onChange={handleFormChange}
                      placeholder="Enter SR No of Cargo Eductors"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_cargo_eductors"
                      value={reportFormData.type_of_cargo_eductors}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Cargo Eductors"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>CAPACITY (Cu.Metres/Hour)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_cargo_eductors"
                      value={reportFormData.capacity_of_cargo_eductors}
                      onChange={handleFormChange}
                      placeholder="Enter Capacity of Cargo Eductors"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>At What Head (sg=1.0) (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="at_what_head_cargo_eductors"
                      value={reportFormData.at_what_head_cargo_eductors}
                      onChange={handleFormChange}
                      placeholder="Enter At What Head Cargo Eductors"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Stripping</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>SR No</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="sr_no_of_stripping"
                      value={reportFormData.sr_no_of_stripping}
                      onChange={handleFormChange}
                      placeholder="Enter SR No of Cargo Eductors"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_stripping"
                      value={reportFormData.type_of_stripping}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Stripping"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>CAPACITY (Cu.Metres/Hour)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_stripping"
                      value={reportFormData.capacity_of_stripping}
                      onChange={handleFormChange}
                      placeholder="Enter Capacity of Stripping"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>At What Head (sg=1.0) (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="at_what_head_stripping"
                      value={reportFormData.at_what_head_stripping}
                      onChange={handleFormChange}
                      placeholder="Enter At What Head Stripping"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is at least one emergency portable cargo pump provided?
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="is_at_least_one_emergency_portable_cargo_pump_provided"
                      value={
                        reportFormData.is_at_least_one_emergency_portable_cargo_pump_provided
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Is At Least One Emergency Portable Cargo Pump Provided"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.4 MOORING</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <h6>10.4.1 WIRES ( ON DRUMS)</h6>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>Forecastle</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <label>
                      <small>NO</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_forecastle"
                      value={reportFormData.no_of_forecastle}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>DIAMETER (in Millimetres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_forecastle"
                      value={reportFormData.diameter_of_forecastle}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Forecastle"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MATERIAL</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_forecastle"
                      value={reportFormData.material_of_forecastle}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Forecastle"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>LENGTH (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_forecastle"
                      value={reportFormData.length_of_forecastle}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Forecastle"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>BREAKING (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_forecastle"
                      value={reportFormData.breaking_of_forecastle}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Forecastle"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck fwd</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_fwd"
                      value={reportFormData.no_of_main_deck_fwd}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Fwd"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_fwd"
                      value={reportFormData.diameter_of_main_deck_fwd}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Fwd"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_fwd"
                      value={reportFormData.material_of_main_deck_fwd}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Fwd"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_fwd"
                      value={reportFormData.length_of_main_deck_fwd}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Fwd"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_fwd"
                      value={reportFormData.breaking_of_main_deck_fwd}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Fwd"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck aft</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_aft"
                      value={reportFormData.no_of_main_deck_aft}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Aft"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_aft"
                      value={reportFormData.diameter_of_main_deck_aft}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Aft"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_aft"
                      value={reportFormData.material_of_main_deck_aft}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Aft"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_aft"
                      value={reportFormData.length_of_main_deck_aft}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Aft"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_aft"
                      value={reportFormData.breaking_of_main_deck_aft}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Aft"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Poop deck</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_poop_deck"
                      value={reportFormData.no_of_poop_deck}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Poop Deck"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_poop_deck"
                      value={reportFormData.diameter_of_poop_deck}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Poop Deck"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_poop_deck"
                      value={reportFormData.material_of_poop_deck}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Poop Deck"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_poop_deck"
                      value={reportFormData.length_of_poop_deck}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Poop Deck"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_poop_deck"
                      value={reportFormData.breaking_of_poop_deck}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Poop Deck"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>10.4.2 WIRES TAILS</h6>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>Forecastle</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <label>
                      <small>NO</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_forecastle_tails"
                      value={reportFormData.no_of_forecastle_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>DIAMETER (in Millimetres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_forecastle_tails"
                      value={reportFormData.diameter_of_forecastle_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Forecastle Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MATERIAL</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_forecastle_tails"
                      value={reportFormData.material_of_forecastle_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Forecastle Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>LENGTH (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_forecastle_tails"
                      value={reportFormData.length_of_forecastle_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Forecastle Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>BREAKING (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_forecastle_tails"
                      value={reportFormData.breaking_of_forecastle_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Forecastle Tails"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck fwd</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_fwd_tails"
                      value={reportFormData.no_of_main_deck_fwd_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Fwd Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_fwd_tails"
                      value={reportFormData.diameter_of_main_deck_fwd_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Fwd Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_fwd_tails"
                      value={reportFormData.material_of_main_deck_fwd_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Fwd Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_fwd_tails"
                      value={reportFormData.length_of_main_deck_fwd_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Fwd Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_fwd_tails"
                      value={reportFormData.breaking_of_main_deck_fwd_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Fwd Tails"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck aft</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_aft_tails"
                      value={reportFormData.no_of_main_deck_aft_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Aft Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_aft_tails"
                      value={reportFormData.diameter_of_main_deck_aft_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Aft Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_aft_tails"
                      value={reportFormData.material_of_main_deck_aft_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Aft Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_aft_tails"
                      value={reportFormData.length_of_main_deck_aft_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Aft Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_aft_tails"
                      value={reportFormData.breaking_of_main_deck_aft_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Aft Tails"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Poop deck</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_poop_deck_tails"
                      value={reportFormData.no_of_poop_deck_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Poop Deck Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_poop_deck_tails"
                      value={reportFormData.diameter_of_poop_deck_tails}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Poop Deck Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_poop_deck_tails"
                      value={reportFormData.material_of_poop_deck_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Poop Deck Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_poop_deck_tails"
                      value={reportFormData.length_of_poop_deck_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Poop Deck Tails"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_poop_deck_tails"
                      value={reportFormData.breaking_of_poop_deck_tails}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Poop Deck Tails"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>10.4.3 ROPES (ON DRUMS)</h6>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>Forecastle</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <label>
                      <small>NO</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_forecastle_ropes"
                      value={reportFormData.no_of_forecastle_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>DIAMETER (in Millimetres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_forecastle_ropes"
                      value={reportFormData.diameter_of_forecastle_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Forecastle Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MATERIAL</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_forecastle_ropes"
                      value={reportFormData.material_of_forecastle_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Forecastle Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>LENGTH (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_forecastle_ropes"
                      value={reportFormData.length_of_forecastle_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Forecastle Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>BREAKING (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_forecastle_ropes"
                      value={reportFormData.breaking_of_forecastle_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Forecastle Ropes"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck fwd</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_fwd_ropes"
                      value={reportFormData.no_of_main_deck_fwd_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Fwd Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_fwd_ropes"
                      value={reportFormData.diameter_of_main_deck_fwd_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Fwd Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_fwd_ropes"
                      value={reportFormData.material_of_main_deck_fwd_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Fwd Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_fwd_ropes"
                      value={reportFormData.length_of_main_deck_fwd_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Fwd Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_fwd_ropes"
                      value={reportFormData.breaking_of_main_deck_fwd_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Fwd Ropes"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck aft</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_aft_ropes"
                      value={reportFormData.no_of_main_deck_aft_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Aft Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_aft_ropes"
                      value={reportFormData.diameter_of_main_deck_aft_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Aft Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_aft_ropes"
                      value={reportFormData.material_of_main_deck_aft_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Aft Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_aft_ropes"
                      value={reportFormData.length_of_main_deck_aft_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Aft Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_aft_ropes"
                      value={reportFormData.breaking_of_main_deck_aft_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Aft Ropes"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Poop deck</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_poop_deck_ropes"
                      value={reportFormData.no_of_poop_deck_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Poop Deck Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_poop_deck_ropes"
                      value={reportFormData.diameter_of_poop_deck_ropes}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Poop Deck Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_poop_deck_ropes"
                      value={reportFormData.material_of_poop_deck_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Poop Deck Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_poop_deck_ropes"
                      value={reportFormData.length_of_poop_deck_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Poop Deck Ropes"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_poop_deck_ropes"
                      value={reportFormData.breaking_of_poop_deck_ropes}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Poop Deck Ropes"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>10.4.4 OTHER LINES</h6>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>Forecastle</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <label>
                      <small>NO</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_forecastle_other_lines"
                      value={reportFormData.no_of_forecastle_other_lines}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>DIAMETER (in Millimetres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_forecastle_other_lines"
                      value={reportFormData.diameter_of_forecastle_other_lines}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Forecastle Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MATERIAL</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_forecastle_other_lines"
                      value={reportFormData.material_of_forecastle_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Forecastle Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>LENGTH (in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_forecastle_other_lines"
                      value={reportFormData.length_of_forecastle_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Forecastle Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>BREAKING (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_forecastle_other_lines"
                      value={reportFormData.breaking_of_forecastle_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Forecastle Other Lines"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck fwd</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_fwd_other_lines"
                      value={reportFormData.no_of_main_deck_fwd_other_lines}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Fwd Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_fwd_other_lines"
                      value={
                        reportFormData.diameter_of_main_deck_fwd_other_lines
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Fwd Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_fwd_other_lines"
                      value={
                        reportFormData.material_of_main_deck_fwd_other_lines
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Fwd Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_fwd_other_lines"
                      value={reportFormData.length_of_main_deck_fwd_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Fwd Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_fwd_other_lines"
                      value={
                        reportFormData.breaking_of_main_deck_fwd_other_lines
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Fwd Other Lines"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck aft</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_aft_other_lines"
                      value={reportFormData.no_of_main_deck_aft_other_lines}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Aft Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_main_deck_aft_other_lines"
                      value={
                        reportFormData.diameter_of_main_deck_aft_other_lines
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Main Deck Aft Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_main_deck_aft_other_lines"
                      value={
                        reportFormData.material_of_main_deck_aft_other_lines
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Material of Main Deck Aft Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_main_deck_aft_other_lines"
                      value={reportFormData.length_of_main_deck_aft_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Main Deck Aft Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_main_deck_aft_other_lines"
                      value={
                        reportFormData.breaking_of_main_deck_aft_other_lines
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Main Deck Aft Other Lines"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Poop deck</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_poop_deck_other_lines"
                      value={reportFormData.no_of_poop_deck_other_lines}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Poop Deck Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="diameter_of_poop_deck_other_lines"
                      value={reportFormData.diameter_of_poop_deck_other_lines}
                      onChange={handleDimensionChange}
                      placeholder="Enter Diameter of Poop Deck Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="material_of_poop_deck_other_lines"
                      value={reportFormData.material_of_poop_deck_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Material of Poop Deck Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="length_of_poop_deck_other_lines"
                      value={reportFormData.length_of_poop_deck_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Length of Poop Deck Other Lines"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="breaking_of_poop_deck_other_lines"
                      value={reportFormData.breaking_of_poop_deck_other_lines}
                      onChange={handleFormChange}
                      placeholder="Enter Breaking of Poop Deck Other Lines"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>10.4.5 WINCHES</h6>
                </div>
                <div className="col-md-3">
                  <div className="form-group">
                    <label>Forecastle</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <label>
                      <small>NO</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_forecastle_winches"
                      value={reportFormData.no_of_forecastle_winches}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>No. DRUMS</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_drums_of_forecastle_winches"
                      value={reportFormData.no_of_drums_of_forecastle_winches}
                      onChange={handleFormChange}
                      placeholder="Enter No of Drums"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MOTIVE POWER</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="motive_power_of_forecastle_winches"
                      value={reportFormData.motive_power_of_forecastle_winches}
                      onChange={handleFormChange}
                      placeholder="Enter Motive Power of Forecastle Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>BRAKE CAPACITY (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="brake_capacity_of_forecastle_winches"
                      value={
                        reportFormData.brake_capacity_of_forecastle_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Brake Capacity of Forecastle Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>TYPE OF BRAKE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_brake_of_forecastle_winches"
                      value={reportFormData.type_of_brake_of_forecastle_winches}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Brake of Forecastle Winches"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck fwd</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_fwd_winches"
                      value={reportFormData.no_of_main_deck_fwd_winches}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Drums"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_drums_of_main_deck_fwd_winches"
                      value={
                        reportFormData.no_of_drums_of_main_deck_fwd_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter No of Drums"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="motive_power_of_main_deck_fwd_winches"
                      value={
                        reportFormData.motive_power_of_main_deck_fwd_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Motive Power of Main Deck Fwd Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="brake_capacity_of_main_deck_fwd_winches"
                      value={
                        reportFormData.brake_capacity_of_main_deck_fwd_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Brake Capacity of Main Deck Fwd Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_brake_of_main_deck_fwd_winches"
                      value={
                        reportFormData.type_of_brake_of_main_deck_fwd_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Type of Brake of Main Deck Fwd Winches"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Main deck aft</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_aft_winches"
                      value={reportFormData.no_of_main_deck_aft_winches}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_drums_of_main_deck_aft_winches"
                      value={
                        reportFormData.no_of_drums_of_main_deck_aft_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter No of Drums of Main Deck Aft Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="motive_power_of_main_deck_aft_winches"
                      value={
                        reportFormData.motive_power_of_main_deck_aft_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Motive Power of Main Deck Aft Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="brake_capacity_of_main_deck_aft_winches"
                      value={
                        reportFormData.brake_capacity_of_main_deck_aft_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Brake Capacity of Main Deck Aft Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_brake_of_main_deck_aft_winches"
                      value={
                        reportFormData.type_of_brake_of_main_deck_aft_winches
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Type of Brake of Main Deck Aft Winches"
                    />
                  </div>
                </div>

                <div className="col-md-3">
                  <div className="form-group">
                    <label>Poop deck</label>
                  </div>
                </div>
                <div className="col-md-1">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_poop_deck_winches"
                      value={reportFormData.no_of_poop_deck_winches}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Poop Deck Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_drums_of_poop_deck_winches"
                      value={reportFormData.no_of_drums_of_poop_deck_winches}
                      onChange={handleFormChange}
                      placeholder="Enter No of Drums of Poop Deck Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="motive_power_of_poop_deck_winches"
                      value={reportFormData.motive_power_of_poop_deck_winches}
                      onChange={handleFormChange}
                      placeholder="Enter Motive Power of Poop Deck Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="brake_capacity_of_poop_deck_winches"
                      value={reportFormData.brake_capacity_of_poop_deck_winches}
                      onChange={handleFormChange}
                      placeholder="Enter Brake Capacity of Poop Deck Winches"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_brake_of_poop_deck_winches"
                      value={reportFormData.type_of_brake_of_poop_deck_winches}
                      onChange={handleFormChange}
                      placeholder="Enter Type of Brake of Poop Deck Winches"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>10.4.6 BITTS, CLOSED CHOKS/FAIRLEADS</h6>
                </div>
                <div className="col-md-4">
                  <div className="form-group">
                    <label>Forecastle</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>NO</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_forecastle_bitts"
                      value={reportFormData.no_of_forecastle_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>SWL Bitts (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="swl_bitts_of_forecastle_bitts"
                      value={reportFormData.swl_bitts_of_forecastle_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Bitts of Forecastle Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>No. Closed Chocks</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_closed_chocks_of_forecastle_bitts"
                      value={
                        reportFormData.no_of_closed_chocks_of_forecastle_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Closed Chocks of Forecastle Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>SWL Closed Chocks (in Metric Tons)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="swl_closed_chocks_of_forecastle_bitts"
                      value={
                        reportFormData.swl_closed_chocks_of_forecastle_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Closed Chocks of Forecastle Bitts"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Main deck fwd</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_fwd_bitts"
                      value={reportFormData.no_of_main_deck_fwd_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Forecastle Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_bitts_of_main_deck_fwd_bitts"
                      value={reportFormData.swl_bitts_of_main_deck_fwd_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Bitts of Main Deck Fwd Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_closed_chocks_of_main_deck_fwd_bitts"
                      value={
                        reportFormData.no_of_closed_chocks_of_main_deck_fwd_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Closed Chocks of Main Deck Fwd Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_closed_chocks_of_main_deck_fwd_bitts"
                      value={
                        reportFormData.swl_closed_chocks_of_main_deck_fwd_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Closed Chocks of Main Deck Fwd Bitts"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Main deck aft</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_deck_aft_bitts"
                      value={reportFormData.no_of_main_deck_aft_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Deck Aft Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_bitts_of_main_deck_aft_bitts"
                      value={reportFormData.swl_bitts_of_main_deck_aft_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Bitts of Main Deck Aft Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_closed_chocks_of_main_deck_aft_bitts"
                      value={
                        reportFormData.no_of_closed_chocks_of_main_deck_aft_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Closed Chocks of Main Deck Aft Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_closed_chocks_of_main_deck_aft_bitts"
                      value={
                        reportFormData.swl_closed_chocks_of_main_deck_aft_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Closed Chocks of Main Deck Aft Bitts"
                    />
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="form-group">
                    <label>Poop deck</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_poop_deck_bitts"
                      value={reportFormData.no_of_poop_deck_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Poop Deck Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_bitts_of_poop_deck_bitts"
                      value={reportFormData.swl_bitts_of_poop_deck_bitts}
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Bitts of Poop Deck Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_closed_chocks_of_poop_deck_bitts"
                      value={
                        reportFormData.no_of_closed_chocks_of_poop_deck_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Closed Chocks of Poop Deck Bitts"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_closed_chocks_of_poop_deck_bitts"
                      value={
                        reportFormData.swl_closed_chocks_of_poop_deck_bitts
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL Closed Chocks of Poop Deck Bitts"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.5 ANCHORS/EMERGENCY TOWING SYSTEM</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Number of shackles on port/starboard cable</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="number_of_shackles_on_port_starboard_cable"
                      value={
                        reportFormData.number_of_shackles_on_port_starboard_cable
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Number of Shackles on Port/Starboard Cable"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Type/SWL of Emergency Towing system forward:</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="type_of_emergency_towing_system_forward_type"
                          value={
                            reportFormData.type_of_emergency_towing_system_forward_type
                          }
                          onChange={handleFormChange}
                          placeholder="Enter Type of Emergency Towing System Forward Type"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="type_of_emergency_towing_system_forward_swl"
                          value={
                            reportFormData.type_of_emergency_towing_system_forward_swl
                          }
                          onChange={handleFormChange}
                          placeholder="Enter Type of Emergency Towing System Forward SWL (in Metric Tons)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Type/SWL of Emergency Towing system aft</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="type_of_emergency_towing_system_aft_type"
                          value={
                            reportFormData.type_of_emergency_towing_system_aft_type
                          }
                          onChange={handleFormChange}
                          placeholder="Enter Type of Emergency Towing System Aft Type"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="type_of_emergency_towing_system_aft_swl"
                          value={
                            reportFormData.type_of_emergency_towing_system_aft_swl
                          }
                          onChange={handleFormChange}
                          placeholder="Enter Type of Emergency Towing System Aft SWL (in Metric Tons)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.6 ESCORT TUG</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is size/SWL of closed chock and/or fairleads of
                      enclosed type on stern
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="type_of_escort_tug_type"
                          value={reportFormData.type_of_escort_tug_type}
                          onChange={handleDimensionChange}
                          placeholder="Enter Type of Escort Tug Type (in Milimeters)"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-field"
                          name="type_of_escort_tug_swl"
                          value={reportFormData.type_of_escort_tug_swl}
                          onChange={handleDimensionChange}
                          placeholder="Enter Type of Escort Tug SWL (in Metric Tons)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is SWL of bollard on poop deck suitable for escort
                      tug
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="swl_of_bollard_on_poop_deck_suitable_for_escort_tug"
                      value={
                        reportFormData.swl_of_bollard_on_poop_deck_suitable_for_escort_tug
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter SWL of Bollard on Poop Deck Suitable for Escort Tug (in Metric Tons)"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.7 LIFTING EQUIPMENT/ GANGWAY</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Derrick/Crane description (Number, SWL and location)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="derrick_crane_description"
                      value={reportFormData.derrick_crane_description}
                      onChange={handleFormChange}
                      placeholder="Enter Derrick/Crane Description (Number, SWL and Location)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Accommodation ladder direction</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="accommodation_ladder_direction"
                      value={reportFormData.accommodation_ladder_direction}
                      onChange={handleFormChange}
                      placeholder="Enter Accommodation Ladder Direction"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Does vessel have a portable gangway? If yes, state length
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="does_vessel_have_a_portable_gangway"
                      value={reportFormData.does_vessel_have_a_portable_gangway}
                      onChange={handleFormChange}
                      placeholder="Enter Does Vessel Have a Portable Gangway? If Yes, State Length"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.8 SINGLE POINT MOORING (SPM) EQUIPMENT</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Does the vessel meet the recommendations in the latest
                      edition of OCIMF 8Recommendations for Equipment Employed
                      in the Bow Mooring of Conventional Tankers at Single Point
                      Moorings (SPM)?
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.does_vessel_meet_the_recommendations || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "does_vessel_meet_the_recommendations",
                          value
                        )
                      }
                      placeholder="Enter Does Vessel Meet the Recommendations in the Latest Edition of OCIMF 8 Recommendations for Equipment Employed in the Bow Mooring of Conventional Tankers at Single Point Moorings (SPM)?"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>If fitted, how many chain stoppers:</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="how_many_chain_stoppers"
                      value={reportFormData.how_many_chain_stoppers}
                      onChange={handleDimensionChange}
                      placeholder="Enter How Many Chain Stoppers"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>State type/SWL of chain stopper(s):</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="state_type_swl_of_chain_stopper_s"
                      value={reportFormData.state_type_swl_of_chain_stopper_s}
                      onChange={handleFormChange}
                      placeholder="Enter State Type/SWL of Chain Stopper(s)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is the maximum size chain diameter the bow stopper(s)
                      can handle:
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      <small>(in Millimeters)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="maximum_size_chain_diameter_the_bow_stopper_s_can_handle"
                      value={
                        reportFormData.maximum_size_chain_diameter_the_bow_stopper_s_can_handle
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter Maximum Size Chain Diameter the Bow Stopper(s) Can Handle"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Distance between the bow fairlead and chain
                      stopper/bracket:
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      <small>(in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="distance_between_the_bow_fairlead_and_chain_stopper_bracket"
                      value={
                        reportFormData.distance_between_the_bow_fairlead_and_chain_stopper_bracket
                      }
                      onChange={handleDimensionChange}
                      placeholder="Enter Distance Between the Bow Fairlead and Chain Stopper/Bracket"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is bow chock and/or fairlead of enclosed type of OCIMF
                      recommended size (600mm x 450mm)? If not, give details of
                      size:
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.is_bow_chock_and_or_fairlead || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "is_bow_chock_and_or_fairlead",
                          value
                        )
                      }
                      placeholder="Enter Does Vessel Meet the Recommendations in the Latest Edition of OCIMF 8 Recommendations for Equipment Employed in the Bow Mooring of Conventional Tankers at Single Point Moorings (SPM)?"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>10.9 PROPULSION</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Ballast speed</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          <small>Maximum (in knots)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="ballast_speed_maximum"
                          value={reportFormData.ballast_speed_maximum}
                          onChange={handleDimensionChange}
                          placeholder="Enter Ballast Speed Maximum"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          <small>Economical (in knots)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="ballast_speed_minimum"
                          value={reportFormData.ballast_speed_minimum}
                          onChange={handleDimensionChange}
                          placeholder="Enter Ballast Speed Minimum"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Laden speed</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          <small>Maximum (in knots)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="laden_speed_maximum"
                          value={reportFormData.laden_speed_maximum}
                          onChange={handleDimensionChange}
                          placeholder="Enter Laden Speed Maximum"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          <small>Economical (in knots)</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="laden_speed_minimum"
                          value={reportFormData.laden_speed_minimum}
                          onChange={handleDimensionChange}
                          placeholder="Enter Laden Speed Minimum"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What type of fuel is used for main propulsion/generating
                      plant
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          <small>Maximum</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="what_type_of_fuel_is_used_maximum"
                          value={
                            reportFormData.what_type_of_fuel_is_used_maximum
                          }
                          onChange={handleFormChange}
                          placeholder="Enter What Type of Fuel is Used for Main Propulsion/Generating Plant"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>
                          <small>Economical</small>
                        </label>
                        <input
                          type="text"
                          className="form-field"
                          name="what_type_of_fuel_is_used_economic"
                          value={
                            reportFormData.what_type_of_fuel_is_used_economic
                          }
                          onChange={handleFormChange}
                          placeholder="Enter What Type of Fuel is Used for Main Propulsion/Generating Plant"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>Type/Capacity of bunker tanks</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="type_of_bunker_tanks"
                      value={reportFormData.type_of_bunker_tanks}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Is vessel fitted with fixed or controllable pitch
                      propeller(s)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="is_vessel_fitted_with_fixed"
                      value={reportFormData.is_vessel_fitted_with_fixed}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>11.0. ENGINE EQUIPMENTS</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <h6>11.1. ENGINES</h6>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Main engine</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>No</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_main_engine"
                      value={reportFormData.no_of_main_engine}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Main Engine"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>CAPACITY (in kW)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_main_engine"
                      value={reportFormData.capacity_of_main_engine}
                      onChange={handleDimensionChange}
                      placeholder="Enter Capacity (in kW)"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MAKE/TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="make_type_of_main_engine"
                      value={reportFormData.make_type_of_main_engine}
                      onChange={handleFormChange}
                      placeholder="Enter Make/Type of Main Engine"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>Aux engine</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>No</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_aux_engine"
                      value={reportFormData.no_of_aux_engine}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Aux Engine"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>CAPACITY (in kW)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_aux_engine"
                      value={reportFormData.capacity_of_aux_engine}
                      onChange={handleDimensionChange}
                      placeholder="Enter Capacity (in kW)"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <label>
                      <small>MAKE/TYPE</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="make_type_of_aux_engine"
                      value={reportFormData.make_type_of_aux_engine}
                      onChange={handleFormChange}
                      placeholder="Enter Make/Type of Aux Engine"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>Power packs</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_power_packs"
                      value={reportFormData.no_of_power_packs}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Power Packs"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_power_packs"
                      value={reportFormData.capacity_of_power_packs}
                      onChange={handleDimensionChange}
                      placeholder="Enter Capacity of Power Packs (in kW)"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="make_type_of_power_packs"
                      value={reportFormData.make_type_of_power_packs}
                      onChange={handleFormChange}
                      placeholder="Enter Make/Type of Power Packs"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>Boilers</label>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="no_of_boilers"
                      value={reportFormData.no_of_boilers}
                      onChange={handleDimensionChange}
                      placeholder="Enter No of Boilers"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="capacity_of_boilers"
                      value={reportFormData.capacity_of_boilers}
                      onChange={handleDimensionChange}
                      placeholder="Enter Capacity of Boilers (in kW)"
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="make_type_of_boilers"
                      value={reportFormData.make_type_of_boilers}
                      onChange={handleFormChange}
                      placeholder="Enter Make/Type of Boilers"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>11.2. BOW/STERN THRUSTER</h6>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is brake horse power of bow thruster (if fitted)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.what_is_brake_horse_power_of_bow_thruster || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "what_is_brake_horse_power_of_bow_thruster",
                          value
                        )
                      }
                      placeholder="Enter What is Brake Horse Power of Bow Thruster (if fitted)"
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is brake horse power of stern thruster (if fitted)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.what_is_brake_horse_power_of_stern_thruster || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "what_is_brake_horse_power_of_stern_thruster",
                          value
                        )
                      }
                      placeholder="Enter What is Brake Horse Power of Stern Thruster (if fitted)"
                    />
                  </div>
                </div>

                <div className="col-md-12">
                  <h6>11.3. EMISSIONS</h6>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Main engine IMO NOx emission standard</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="main_engine_imo_nox_emission_standard"
                      value={
                        reportFormData.main_engine_imo_nox_emission_standard
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Main Engine IMO NOx Emission Standard"
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Energy Efficiency Design Index (EEDI) rating number
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="energy_efficiency_design_index_eedi_rating_number"
                      value={
                        reportFormData.energy_efficiency_design_index_eedi_rating_number
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Energy Efficiency Design Index (EEDI) Rating Number"
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>11.0. SHIP TO SHIP TRANSFER</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Does vessel comply with recommendations contained in
                      OCIMF/ICS Ship To Ship
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <SingleSearchSelect
                      options={[
                        {
                          value: "Yes",
                          label: "Yes",
                        },
                        {
                          value: "No",
                          label: "No",
                        },
                      ]}
                      value={
                        reportFormData.does_vessel_comply_with_recommendations_contained_in_ocimf || ""
                      }
                      onChange={(value) =>
                        handleSelectChange(
                          "does_vessel_comply_with_recommendations_contained_in_ocimf",
                          value
                        )
                      }
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      What is maximum outreach of cranes/derricks outboard of
                      the ship's side
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      <small>(in Metres)</small>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="what_is_maximum_outreach_of_cranes_derricks_outboard"
                      value={
                        reportFormData.what_is_maximum_outreach_of_cranes_derricks_outboard
                      }
                      onChange={handleDimensionChange}
                    />
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date/place of last STS operation</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="date_place_of_last_sts_operation"
                      value={reportFormData.date_place_of_last_sts_operation}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>12.0. RECENT OPERATIONAL HISTORY</h4>
                  <hr />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Last three cargoes/charterers/voyages (Last/2nd Last/3rd
                      Last)
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="last_three_cargoes_charterers_voyages"
                      value={
                        reportFormData.last_three_cargoes_charterers_voyages
                      }
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Has vessel been involved in a pollution, grounding,
                      serious casualty, unscheduled repair or collision incident
                      during the past 12 months? If yes, provide details
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="has_vessel_been_involved_in_a_pollution"
                      value={
                        reportFormData.has_vessel_been_involved_in_a_pollution
                      }
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Date and place of last Port State Control inspection
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="date_and_place_of_last_port_state_control_inspection"
                      value={
                        reportFormData.date_and_place_of_last_port_state_control_inspection
                      }
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Any outstanding deficiencies as reported by any Port State
                      Control? If yes, provide details
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="any_outstanding_deficiencies_as_reported_by_any_port_state"
                      value={
                        reportFormData.any_outstanding_deficiencies_as_reported_by_any_port_state
                      }
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Recent Oil company inspections/screenings (To the best of
                      owners knowledge and
                    </label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="recent_oil_company_inspections_screenings"
                      value={
                        reportFormData.recent_oil_company_inspections_screenings
                      }
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date/Place of last SIRE inspection</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-field"
                      name="date_place_of_last_sire_inspection"
                      value={reportFormData.date_place_of_last_sire_inspection}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              {/* Custom Media Blocks: Heading + Description + Image */}
              <div className="row">
                <div className="col-md-12">
                  <h4>Custom Media Blocks</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("HEADING_DESCRIPTION_IMAGE")
                        }
                      >
                        Add Heading / Description / Image
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("HEADING_DESCRIPTION_IMAGE")}
                </div>
              </div>

              <div className="row">
                <div className="col-md-12">
                  <h4>19.0. NAVIGATION EQUIPMENT</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("EQUIPMENT_MAKE_MODEL")
                        }
                      >
                        Add Equipment (Name / Make / Model)
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("EQUIPMENT_MAKE_MODEL")}
                </div>
              </div>

              {/* Custom Media Blocks under Communication & Navigational Equipment */}
              <div className="row">
                <div className="col-md-12">
                  <h5>Custom Media Blocks</h5>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("HEADING_DESCRIPTION_IMAGE_2")
                        }
                      >
                        Add Heading / Description / Image
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("HEADING_DESCRIPTION_IMAGE_2")}
                </div>
              </div>

              {/* Equipment (separate set) under second media block */}
              <div className="row">
                <div className="col-md-12">
                  <h4>FRESH WATER GENERATOR</h4>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("EQUIPMENT_MAKE_MODEL_2")
                        }
                      >
                        Add Equipment (Name / Make / Model)
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("EQUIPMENT_MAKE_MODEL_2")}
                </div>
              </div>

              {/* Custom Media Blocks under Communication & Navigational Equipment */}
              <div className="row mb-4">
                <div className="col-md-12">
                  <h5>Custom Media Blocks</h5>
                  <hr />
                </div>
                <div className="col-md-12">
                  <div className="row">
                    <div className="col-md-12">
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          addFlexibleFields("HEADING_DESCRIPTION_IMAGE_3")
                        }
                      >
                        Add Heading / Description / Image
                      </button>
                    </div>
                  </div>
                  {renderFlexibleFields("HEADING_DESCRIPTION_IMAGE_3")}
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-md-12">
                  <h5>Disclaimer</h5>
                  <hr />
                </div>
                <div className="col-md-12">
                  <WysiwygTextarea
                    className="form-field"
                    id="disclaimer"
                    name="disclaimer"
                    value={reportFormData.disclaimer}
                    onChange={handleFormChange}
                    rows={8}
                  />
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
                        ? "Generating Marine Report..."
                        : "Generate Marine Report"}
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

      {/* Image Selection Modals - One per field */}
      {Object.entries(imageModalOpen)
        .filter(([_, isOpen]) => isOpen)
        .map(([fieldId, _]) => {
          return (
            <div
              key={fieldId}
              className="modal"
              style={{
                display: "block",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1050,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  closeImageModal(fieldId);
                }
              }}
            >
              <div
                className="modal-dialog modal-lg"
                style={{
                  maxWidth: "90%",
                  margin: "50px auto",
                  position: "relative",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      {fieldId === "vessel_photo"
                        ? "Select Vessel Photo"
                        : "Select Image"}
                    </h5>
                    <button
                      type="button"
                      className="close-button"
                      onClick={() => closeImageModal(fieldId)}
                      aria-label="Close"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  <div className="modal-body">
                    {mediaLoading ? (
                      <div className="text-center">
                        <div className="spinner-border" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    ) : approvedImages.length === 0 ? (
                      <div className="text-center text-muted">
                        <p>No approved images available.</p>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(150px, 1fr))",
                          gap: "15px",
                          maxHeight: "70vh",
                          overflowY: "auto",
                          padding: "10px",
                        }}
                      >
                        {approvedImages.map((imageItem) => {
                          const imageUrl = getImageUrl(imageItem.media_url);
                          return (
                            <div
                              key={imageItem.id}
                              style={{
                                border: "2px solid #ddd",
                                borderRadius: "8px",
                                overflow: "hidden",
                                cursor: "pointer",
                                transition: "all 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "#007bff";
                                e.currentTarget.style.transform = "scale(1.05)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "#ddd";
                                e.currentTarget.style.transform = "scale(1)";
                              }}
                              onClick={() => {
                                if (fieldId === "vessel_photo") {
                                  handleVesselPhotoSelect(imageItem);
                                } else {
                                  handleFlexibleFieldImageSelect(
                                    fieldId,
                                    imageItem
                                  );
                                }
                              }}
                            >
                              <img
                                src={imageUrl}
                                alt={`Image ${imageItem.id}`}
                                style={{
                                  width: "100%",
                                  height: "150px",
                                  objectFit: "cover",
                                }}
                                onError={(e) => {
                                  e.target.src =
                                    "https://via.placeholder.com/150x150?text=Image+Not+Found";
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
    </section>
  );
}

export default MarineReport;
