import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
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
  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  // Clear report data when component mounts or order changes
  useEffect(() => {
    // Clear any existing report data first
    dispatch(clearCurrentReport());
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

  // Reset form data when component mounts or order ID changes
  useEffect(() => {
    // Get current date in DD-MM-YYYY format
    const getCurrentDate = () => {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Reset form data to initial state when order changes
    setReportFormData({
      // Report type and reference details
      report_type: "report_ce",
      ref_no_year: new Date().getFullYear().toString(), // Current year (2025)
      ref_no_bank: "",
      state_name: "", // Default to first option
      ref_no_code: "", // Default to first option
      ref_no_id: "",
      rev_report_date: getCurrentDate(), // Default to today's date

      valuer_name: "V.K. ASSOCIATES", // Default to first option
      license_no: "SLA-60827",
      valuer_contact: "99209-88549", // Fixed read-only value

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

      engine_no_detail: "",
      crane_chassis_no: "",
      body_type: "",
      crane_model_code: "",

      hours_meter_reading: "",
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
      gross_machine_weight: "",

      // FIX BUT FLEX
      fix_but_flex_heading_1: "",
      fix_but_flex_value_1: "",
      fix_but_flex_heading_2: "",
      fix_but_flex_value_2: "",
      fix_but_flex_heading_3: "",
      fix_but_flex_value_3: "",

      fix_but_flex_title_1: "",
      fix_but_flex_title_2: "",
      fix_but_flex_title_3: "",
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
    ref_no_id: "",
    rev_report_date: getCurrentDate(), // Default to today's date

    valuer_name: "V.K. ASSOCIATES", // Default to first option
    license_no: "SLA-60827",
    valuer_contact: "99209-88549", // Fixed read-only value

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
    invoice_no_date: "",
    invoice_no: "",
    invoice_date: "",
    hyp_with: "",
    hyp_from_date: "",

    // COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION
    // asset_classification: handled directly from order data
    no_of_cylinder: "",

    engine_condition: "",
    chassis_condition: "",
    body_condition: "",
    cabin_condition: "",
    electrical_condition: "",
    gear_transmission: "",

    battery_available: "YES / TWO", // Fixed read-only value
    gross_machine_weight: "",

    // FIX BUT FLEX
    fix_but_flex_heading_1: "",
    fix_but_flex_value_1: "",
    fix_but_flex_heading_2: "",
    fix_but_flex_value_2: "",
    fix_but_flex_heading_3: "",
    fix_but_flex_value_3: "",

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
    bill_of_entry: "",
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

    fair_market_value: "",
    amount_in_words: "",
    no_of_photograph: "",
    no_of_collage: "",

    valuer_comments_remarks: "",
    declaration: "",
  });

  // File state for chassis impression
  const [chassisImpressionFile, setChassisImpressionFile] = useState(null);

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      setReportFormData((prev) => ({
        ...prev,
        ref_no_bank: order?.bank_initial || "",
        state_name: prev.state_name || "MUM",
        ref_no_code: order?.valuer_name ? getRefNoCode(order.valuer_name) : "",
        initiated_by:
          order?.officer_name && order?.bank_name
            ? `${order.officer_name}, ${order.bank_name}`
            : "",
        model:
          order?.sub_category_name && order?.child_category_name
            ? `${order.sub_category_name}, ${order.child_category_name}`
            : "",
        hyp_with: order?.bank_name || "",
        // ALWAYS use valuer_name from order (never from report or previous state)
        valuer_name: order?.valuer_name || "",
        license_no: order?.valuer_name
          ? getLicenseNumber(order.valuer_name)
          : "",
      }));
    }
  }, [order, getLicenseNumber, getRefNoCode]);

  // Populate form data from fetched CE report (if available)
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
          // Parse "12 Dated 12" format
          const parts = fieldValue.split(" Dated ");
          if (parts.length === 2) {
            updated.invoice_no = parts[0].trim();
            updated.invoice_date = parts[1].trim();
          } else {
            // If format doesn't match, put everything in invoice_no
            updated.invoice_no = fieldValue;
            updated.invoice_date = "";
          }
          return;
        }

        // Try to set the field (both existing and dynamic fields)
        updated[key] = fieldValue;
      });

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
  }, [currentReport, id]);

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/orders" className="text-blue-600 hover:underline">
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

  // Handle form input changes
  const handleFormChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setReportFormData((prev) => {
        let updated = {
          ...prev,
          [name]: value,
        };

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
    ]
  );

  // Handle SingleSearchSelect changes
  const handleSelectChange = useCallback(
    (name, value) => {
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

  // Handle file input changes
  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    setChassisImpressionFile(file);
  }, []);

  // Handle date input formatting (DD-MM-YYYY)
  const handleDateChange = useCallback((e) => {
    const { name, value } = e.target;
    if (!value || typeof value !== "string") return;
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
    if (!value || typeof value !== "string") return;

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

      // Create FormData for multipart/form-data submission
      const formData = new FormData();

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

      // Add all form fields to FormData
      Object.keys(reportFormData).forEach((key) => {
        let value = reportFormData[key];

        // Skip individual invoice fields and invoice_no_date - we'll add invoice_no_date separately
        if (
          key === "invoice_no" ||
          key === "invoice_date" ||
          key === "invoice_no_date"
        ) {
          return;
        }

        // Special handling for asset_classification - use order data
        if (key === "asset_classification") {
          value = order?.child_category_name || "";
        }

        // Clear asset_make if new_asset_make has value
        if (key === "asset_make" && reportFormData.new_asset_make) {
          return; // Skip adding asset_make to payload if new_asset_make exists
        }

        // Special handling for amount_in_words - compute from fair_market_value
        if (key === "amount_in_words") {
          const fmv = reportFormData.fair_market_value;
          console.log("🔍 CEReport Generate - fair_market_value raw:", fmv);
          const amount = parseCurrency(fmv);
          console.log("🔍 CEReport Generate - parsed amount:", amount);
          value = amount > 0 ? convertNumberToWordsIndian(amount) : "";
          console.log(
            "🔍 CEReport Generate - amount_in_words computed:",
            value
          );
          // Force include even if empty
          formData.append(key, value);
          return; // Skip the normal flow for this field
        }

        // Special handling for no_of_tyres - compute from tyre numbers
        if (key === "no_of_tyres") {
          const front = parseInt(reportFormData.front_tyre_no) || 0;
          const middle = parseInt(reportFormData.middle_tyre_no) || 0;
          const rear = parseInt(reportFormData.rear_tyre_no) || 0;
          const total = front + middle + rear;
          const word = numberToWords(total);
          value = `${total} (${word})`;
          console.log("🔍 CEReport Generate - no_of_tyres computed:", value);
        }

        if (value !== null && value !== "") {
          formData.append(key, value);
        }
      });

      // Add the combined invoice data
      if (combinedInvoiceData) {
        formData.append("invoice_no_date", combinedInvoiceData);
      }

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
          field.field_value
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
            field.field_value_2
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

    // Create report data object with only non-empty fields
    const reportData = {};

    // Add report form data - only include fields with actual values
    Object.keys(reportFormData).forEach((key) => {
      const value = reportFormData[key];

      // Always include important read-only fields even if empty
      const alwaysIncludeFields = [
        "license_no",
        "valuer_contact",
        "amount_in_words",
        "no_of_tyres",
        "depreciation_value",
      ];

      if (alwaysIncludeFields.includes(key)) {
        // Always include these fields, even if empty
        let defaultValue = value || "";
        // Use computed amountInWords value if this is amount_in_words field
        if (key === "amount_in_words") {
          // Compute amount in words from fair_market_value
          const fmv = reportFormData.fair_market_value;
          console.log("🔍 CEReport Save - fair_market_value raw:", fmv);
          const amount = parseCurrency(fmv);
          console.log("🔍 CEReport Save - parsed amount:", amount);
          defaultValue = amount > 0 ? convertNumberToWordsIndian(amount) : "";
          console.log(
            "🔍 CEReport Save - amount_in_words - Computed value:",
            defaultValue
          );
          // Force include even if empty
          reportData[key] = defaultValue;
          return; // Skip the normal flow for this field
        }
        // Use computed no_of_tyres value if this is no_of_tyres field
        if (key === "no_of_tyres") {
          const front = parseInt(reportFormData.front_tyre_no) || 0;
          const middle = parseInt(reportFormData.middle_tyre_no) || 0;
          const rear = parseInt(reportFormData.rear_tyre_no) || 0;
          const total = front + middle + rear;
          const word = numberToWords(total);
          defaultValue = `${total} (${word})`;
          console.log(
            "🔍 CEReport Save - no_of_tyres - Computed value:",
            defaultValue
          );
        }
        reportData[key] = defaultValue;
      } else {
        // Only include fields that have meaningful values (not null, undefined, or empty string)
        if (value !== null && value !== undefined && value !== "") {
          reportData[key] = value;
        }
      }
    });

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
          field.field_value;
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
            field.field_value_2;
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

    console.log("📤 CEReport - Sending to backend - reportData:", reportData);
    console.log(
      "📤 CEReport - amount_in_words in payload:",
      reportData.amount_in_words
    );

    // Debug log for payload
    console.log("🔍 CEReport Save - Final reportData:", reportData);
    console.log(
      "🔍 CEReport Save - amount_in_words in payload:",
      reportData.amount_in_words
    );
    console.log(
      "🔍 CEReport Save - fair_market_value:",
      reportFormData.fair_market_value
    );

    // Dispatch save action with JSON data
    dispatch(
      saveOrderReport({
        orderId: id,
        reportData: reportData,
      })
    );
  }, [
    reportFormData,
    flexibleFields,
    validateFlexibleFields,
    chassisImpressionFile,
    dispatch,
    id,
    parseCurrency,
    convertNumberToWordsIndian,
    numberToWords,
  ]);

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
                  <textarea
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
                    rows="2"
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
                  <textarea
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
                    rows="2"
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
                  <textarea
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
                    rows="2"
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
          <div className="order-report-container">
            <h2>CE Report</h2>
            <form onSubmit={handleReportSubmit} className="body-form-box">
              <div className="row">
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
                        readOnly
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
                    <label htmlFor="rev_report_date">
                      Rev-Report Date <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="rev_report_date"
                      name="rev_report_date"
                      value={reportFormData.rev_report_date}
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
                    <textarea
                      className="form-field"
                      id="initiated_by"
                      name="initiated_by"
                      value={
                        order?.officer_name && order?.bank_name
                          ? `${order.officer_name}, ${order.bank_name}`
                          : ""
                      }
                      onChange={handleFormChange}
                      rows="2"
                      readOnly
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
                    <textarea
                      className="form-field"
                      id="place_of_inspection"
                      name="place_of_inspection"
                      value={reportFormData.place_of_inspection}
                      onChange={handleFormChange}
                      rows="2"
                      required
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      id="registered_owner_address"
                      name="registered_owner_address"
                      value={reportFormData.registered_owner_address}
                      onChange={handleFormChange}
                      rows="2"
                      required
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
                    <textarea
                      className="form-field"
                      id="proposed_owner_address"
                      name="proposed_owner_address"
                      value={reportFormData.proposed_owner_address}
                      onChange={handleFormChange}
                      rows="2"
                      placeholder="456 Corporate Avenue, Mumbai"
                      required
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
                <div className="col-md-4">
                  <div className="form-group">
                    <label htmlFor="registration_no">
                      Registration No <span class="text-danger">*</span>
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
                      Registration Date <span class="text-danger">*</span>
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
                      Registered Location <span class="text-danger">*</span>
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
                        required
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
                      value={
                        order?.sub_category_name && order?.child_category_name
                          ? `${order.sub_category_name} - ${order.child_category_name}`
                          : ""
                      }
                      readOnly
                      placeholder="Auto-populated from order data"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="engine_no_detail">
                      Engine No./ Detail <span class="text-danger">*</span>
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
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="crane_chassis_no">
                      Crane Chassis No <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="crane_chassis_no"
                      name="crane_chassis_no"
                      value={reportFormData.crane_chassis_no}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                </div>
                <div className="col-md-3">
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
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="crane_model_code">
                      Crane Model Code <span class="text-danger">*</span>
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
                      Hyp With <span class="text-danger">*</span>
                    </label>
                    <textarea
                      className="form-field"
                      id="hyp_with"
                      name="hyp_with"
                      value={reportFormData.hyp_with}
                      onChange={handleFormChange}
                      rows="2"
                      required
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
                      value={order?.child_category_name || ""}
                      readOnly
                      placeholder="Auto-populated from order data"
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
                      readOnly
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="gross_machine_weight">
                      Gross Machine Weight <span class="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="gross_machine_weight"
                      name="gross_machine_weight"
                      value={reportFormData.gross_machine_weight}
                      onChange={handleFormChange}
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
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="bill_of_entry">
                      Bill Of Entry <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY", label: "COPY" },
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
                      Proforma Invoice Verified{" "}
                      <span class="text-danger">*</span>
                    </label>
                    <SingleSearchSelect
                      options={[
                        { value: "COPY", label: "COPY" },
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
                    <input
                      type="text"
                      className="form-field"
                      id="bill_of_lading"
                      name="bill_of_lading"
                      value={reportFormData.bill_of_lading}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="col-md-3">
                  <div className="form-group">
                    <label htmlFor="chartered_engineer_certificate">
                      Chartered Engineer Certificate
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="chartered_engineer_certificate"
                      name="chartered_engineer_certificate"
                      value={reportFormData.chartered_engineer_certificate}
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
                    <label htmlFor="insurance_valid_date">
                      Insurance Val. Date
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      id="insurance_valid_date"
                      name="insurance_valid_date"
                      value={reportFormData.insurance_valid_date}
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
                      Insurance Verified <span class="text-danger">*</span>
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
                    <textarea
                      className="form-field"
                      id="valuer_comments_remarks"
                      name="valuer_comments_remarks"
                      value={reportFormData.valuer_comments_remarks}
                      onChange={handleFormChange}
                      rows="2"
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

              <div className="row">
                <div className="col-md-12">
                  <div className="form-group">
                    <label htmlFor="declaration">
                      Declaration <span class="text-danger">*</span>
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
                    {chassisImpressionFile && (
                      <small className="text-muted">
                        Selected: {chassisImpressionFile.name}
                      </small>
                    )}
                  </div>
                </div>
              </div>

              {/* Generate and Save Report Buttons */}
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
                        : "Generate CE Report"}
                    </button>
                    <button
                      type="button"
                      className="btn save-report"
                      onClick={handleSaveReport}
                      disabled={saving}
                      style={{ marginRight: "10px" }}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CEReport;
