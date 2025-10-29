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
import { usePageTitle } from "../../../context/PageTitleContext";
import SingleSearchSelect from "../../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import "../order.scss";
import { DeleteIcon } from "../../../components/icons";

function MarineReport() {
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

  // Get current date in DD-MM-YYYY format
  const getCurrentDate = useCallback(() => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
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
    ref_no_year: new Date().getFullYear().toString(),
    ref_no_bank: "",
    ref_no_code: "VKM",
    ref_no_id: "",
    lan_no: "",
    report_date: getCurrentDate(),
    bank_name: "",
    branch_name: "",
    state_name: "MUM",
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
  });

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // Reset form data when component mounts or order ID changes
  useEffect(() => {
    // Reset form data to initial state when order changes
    setReportFormData({
      report_type: "report_marine",
      ref_no_year: new Date().getFullYear().toString(),
      ref_no_bank: "",
      ref_no_code: "VKM",
      ref_no_id: "",
      lan_no: "",
      report_date: getCurrentDate(),
      bank_name: "",
      branch_name: "",
      state_name: "MUM",
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
    });

    // Reset flexible fields
    setFlexibleFields([]);
  }, [id, getCurrentDate]);

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      setReportFormData((prev) => ({
        ...prev,
        ref_no_bank: order?.bank_initial || "",
        bank_name: order?.bank_name || "",
        branch_name: order?.branch_name || "",
        state_name: order?.state_name || "",
        // ALWAYS use valuer_name from order's valuer_name (never from report or previous state)
        valuer_name: order?.valuer_name || "",
        license_no: order?.valuer_name
          ? getLicenseNumber(order.valuer_name)
          : "",
        ref_no_code: order?.valuer_name ? getRefNoCode(order.valuer_name) : "",
      }));
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

    if (Array.isArray(report.flexible_fields)) {
      setFlexibleFields(report.flexible_fields);
    }
  }, [currentReport, id]);

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

  // Custom hook to create a memoized amount in words for a specific field
  const useAmountInWords = (fieldName) => {
    return useMemo(() => {
      return getAmountInWords(reportFormData[fieldName]);
    }, [fieldName, reportFormData[fieldName], getAmountInWords]);
  };

  // Handle currency input formatting (Indian number format)
  const handleCurrencyChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      const formattedValue = formatIndianCurrency(value);

      // Update form data with formatted value
      setReportFormData((prev) => ({
        ...prev,
        [name]: formattedValue,
      }));
    },
    [formatIndianCurrency]
  );

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setReportFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

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

  // Use memoized amount in words for each currency field
  const insurancePolicyAmountInWords = useAmountInWords(
    "insured_value_insurance_policy"
  );
  const warRiskPolicyAmountInWords = useAmountInWords(
    "insured_value_war_risk_policy"
  );
  const hullMachineryPolicyAmountInWords = useAmountInWords(
    "insured_value_hull_machinery_policy"
  );

  // Convert number to words
  const convertToWords = (number) => {
    const units = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
    ];
    const teens = [
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];
    const scales = ["", "Thousand", "Lakh", "Crore"];

    // Handle decimal numbers
    const parts = number.toString().split(".");
    const wholePart = parseInt(parts[0]);
    const decimalPart = parts[1] ? parseInt(parts[1]) : 0;

    function convertGroup(n) {
      if (n === 0) return "";
      else if (n <= 10) return units[n];
      else if (n <= 19) return teens[n - 11];
      else if (n <= 99) {
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return tens[ten] + (one > 0 ? " " + units[one] : "");
      }
      return (
        units[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 > 0 ? " " + convertGroup(n % 100) : "")
      );
    }

    function convertWholeNumber(n) {
      if (n === 0) return "Zero";

      let words = "";
      let scaleIndex = 0;

      while (n > 0) {
        const group = n % 1000;
        if (group > 0) {
          words = convertGroup(group) + " " + scales[scaleIndex] + " " + words;
        }
        n = Math.floor(n / 1000);
        scaleIndex++;
      }

      return words.trim();
    }

    let result = convertWholeNumber(wholePart);
    if (decimalPart > 0) {
      result += " Point " + convertWholeNumber(decimalPart);
    }
    return result + " Only";
  };

  // Handle SingleSearchSelect changes
  const handleSelectChange = (name, value) => {
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

  // Handle date input formatting (DD-MM-YYYY)
  const handleDateChange = (e) => {
    const { name, value } = e.target;
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

      // Update form data with formatted value
      setReportFormData((prev) => ({
        ...prev,
        [name]: formattedValue,
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

  // Add flexible fields (Add One - 2 fields only)
  const addFlexibleFields = (sectionName) => {
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

  // Render flexible fields for a section
  const renderFlexibleFields = (sectionName) => {
    const sectionFields = flexibleFields.filter(
      (field) => field.section_name === sectionName
    );

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
                value={field.certificates || ""}
                onChange={(e) =>
                  handleFlexibleFieldChange(
                    field.id,
                    "certificates",
                    e.target.value
                  )
                }
                placeholder="Enter certificate name"
                required
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Issued <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.issued || ""}
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

                  handleFlexibleFieldChange(field.id, "issued", formattedValue);
                }}
                placeholder="DD-MM-YYYY"
                required
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Last Annual <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.last_annual || ""}
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
                    "last_annual",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
                required
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Last Intermediate <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.last_intermediate || ""}
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
                    "last_intermediate",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
                required
              />
            </div>
          </div>
          <div className="col-md-2">
            <div className="form-group">
              <label>
                Expires <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-field"
                value={field.expires || ""}
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
                    "expires",
                    formattedValue
                  );
                }}
                placeholder="DD-MM-YYYY"
                required
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
              value={field.particulars}
              onChange={(e) =>
                handleFlexibleFieldChange(
                  field.id,
                  "particulars",
                  e.target.value
                )
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
              value={field.specifications}
              onChange={(e) =>
                handleFlexibleFieldChange(
                  field.id,
                  "specifications",
                  e.target.value
                )
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

  // Clear report data when component mounts or order changes
  useEffect(() => {
    dispatch(clearCurrentReport());
  }, [dispatch, id]);

  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
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

    // Add all form fields to FormData
    Object.keys(reportFormData).forEach((key) => {
      let value = reportFormData[key];

      // Always append the value, even if empty, to ensure all fields are in payload
      formData.append(key, value || "");
    });

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
        field.field_value
      );
      formData.append(
        `flexible_fields[${formDataIndex}][field_order]`,
        field.field_order
      );
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
    // Create report data object with only non-empty fields
    const reportData = {};

    // Add report form data - only include fields with actual values
    Object.keys(reportFormData).forEach((key) => {
      const value = reportFormData[key];

      // Always include important read-only fields even if empty
      const alwaysIncludeFields = []; // Marine report may not have many read-only fields

      if (alwaysIncludeFields.includes(key)) {
        // Always include these fields, even if empty
        reportData[key] = value || "";
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
      }
    });

    // Only proceed if there's actual data to save
    if (Object.keys(reportData).length === 0) {
      toast.warning(
        "No data to save. Please fill in some fields before saving."
      );
      return;
    }

    // Dispatch save action with JSON data
    dispatch(
      saveOrderReport({
        orderId: id,
        reportData: reportData,
      })
    );
  };

  return (
    <section className="order-details-wrapper">
      <div className="row">
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 mb-5">
          <div className="order-report-container">
            <h2>Marine Report</h2>
            <form className="body-form-box" onSubmit={handleReportSubmit}>
              <div className="row">
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      Report Type <span className="text-danger">*</span>
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
                      value={reportFormData.report_type || "VALUATION REPORT"}
                      onChange={(value) =>
                        handleSelectChange("report_type", value)
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
                        {
                          value: "survey & inspection",
                          label: "survey & inspection",
                        },
                        {
                          value: "condition survey",
                          label: "condition survey",
                        },
                        { value: "desktop", label: "desktop" },
                      ]}
                      value={
                        reportFormData.execute_above || "survey & inspection"
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
                      Report Date <span class="text-danger">*</span>
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
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Client Name With Full Address </label>
                    <textarea
                      className="form-field"
                      name="client_name_with_full_address"
                      value={reportFormData.client_name_with_full_address || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Client Name With Full Address"
                      rows="3"
                    ></textarea>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>IMO/Official/Regd. No. </label>
                    <input
                      type="text"
                      className="form-field"
                      name="imo_official_regd_no"
                      value={reportFormData.imo_official_regd_no}
                      onChange={handleFormChange}
                      placeholder="Enter IMO/Official/Regd. No."
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
                    <textarea
                      className="form-field"
                      name="registered_or_proposed_owner"
                      value={reportFormData.registered_or_proposed_owner || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Registered Or Proposed Owner"
                      rows="3"
                    ></textarea>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Registered Or Proposed Owner Address</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <textarea
                      className="form-field"
                      name="registered_or_proposed_owner_address"
                      value={
                        reportFormData.registered_or_proposed_owner_address ||
                        ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Registered Or Proposed Owner Address"
                      rows="3"
                    ></textarea>
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
                      required
                    />
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>
                      MMSI No. <span className="text-danger">*</span>
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
                      placeholder="Enter MMSI No."
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
                      placeholder="Enter LOA - Length Overall"
                      required
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        // Only allow numbers
                        const sanitized = value.replace(/[^0-9]/g, "");
                        e.target.value = sanitized;
                        handleFormChange(e);
                      }}
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
                          value={insurancePolicyAmountInWords}
                          readOnly
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
                    <textarea
                      className="form-field"
                      name="insurer_guarantor_name_address_damage_policy"
                      value={
                        reportFormData.insurer_guarantor_name_address_damage_policy
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Insurer / Guarantor Name & Address"
                      rows="3"
                    ></textarea>
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
                          value={warRiskPolicyAmountInWords}
                          readOnly
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
                          value={hullMachineryPolicyAmountInWords}
                          readOnly
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
                    <textarea
                      className="form-field"
                      name="is_vessel_subject_to_any_conditions"
                      value={
                        reportFormData.is_vessel_subject_to_any_conditions || ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Is the vessel subject to any conditions of class, class extensions, outstanding memorandums or class recommendations? If yes, give details:"
                      rows="3"
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      name="if_classification_society_changed_name"
                      value={
                        reportFormData.if_classification_society_changed_name ||
                        ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter If classification society changed, name of previous and date of change:"
                      rows="3"
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      name="does_the_vessel_have_ice_class"
                      value={
                        reportFormData.does_the_vessel_have_ice_class || ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Does the vessel have ice class? If yes, state what level:"
                      rows="3"
                    ></textarea>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label>Date/place of last dry−dock</label>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <textarea
                      className="form-field"
                      name="date_place_of_last_dry_dock"
                      value={reportFormData.date_place_of_last_dry_dock || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Date/place of last dry−dock:"
                      rows="3"
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      name="if_ship_has_condition_assessment"
                      value={
                        reportFormData.if_ship_has_condition_assessment || ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter If ship has Condition Assessment Program (CAP), what is the latest overall rating:"
                      rows="3"
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      name="hull_design"
                      value={reportFormData.hull_design || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Hull Design"
                      rows="3"
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      name="present_condition_1"
                      value={reportFormData.present_condition_1 || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Present Condition 1"
                      rows="5"
                    ></textarea>
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Present Condition 2</label>
                    <textarea
                      className="form-field"
                      name="present_condition_2"
                      value={reportFormData.present_condition_2 || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Present Condition 2"
                      rows="5"
                    ></textarea>
                  </div>
                </div>
                <div className="col-md-12">
                  <div className="form-group">
                    <label>Present Condition 3</label>
                    <textarea
                      className="form-field"
                      name="present_condition_3"
                      value={reportFormData.present_condition_3 || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Present Condition 3"
                      rows="5"
                    ></textarea>
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
                    <textarea
                      className="form-field"
                      name="steering_details"
                      value={reportFormData.steering_details || ""}
                      onChange={handleFormChange}
                      placeholder="Enter Details of Steering"
                      rows="5"
                    ></textarea>
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
                      placeholder="Enter Keel to masthead (KTM)/ Keel to masthead (KTM) in collapsed condition, if applicable"
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
                      placeholder="Enter Distance bridge front to center of manifold"
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
                          placeholder="Enter Bow to center manifold (BCM)"
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
                          placeholder="Enter Stern to center manifold (SCM)"
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
                      value={
                        reportFormData.does_vessel_have_multiple_sdwt || "Yes"
                      }
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
                    <textarea
                      className="form-field"
                      name="company_guidelines_for_under_keel_clearance_ukc"
                      value={
                        reportFormData.company_guidelines_for_under_keel_clearance_ukc ||
                        ""
                      }
                      onChange={handleFormChange}
                      placeholder="Enter Company Guidelines for Under Keel Clearance (UKC)"
                      rows="3"
                    ></textarea>
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
                      value={
                        reportFormData.itopf_member || "Yes / ITOPF Member"
                      }
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
                      value={
                        reportFormData.ocimf_member || "Yes / OCIMF Member"
                      }
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
                        reportFormData.do_officers_speak_and_understand_english ||
                        "Yes"
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
                        reportFormData.is_the_vessel_operated_under_a_quality_management_system ||
                        "Yes"
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
                        reportFormData.can_the_ship_comply_with_the_ics_helicopter_guidelines ||
                        "Yes"
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
                        value={reportFormData.coated_cargo_tanks || "Yes"}
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
                        value={reportFormData.anode_cargo_tanks || "Yes"}
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
                        value={reportFormData.coated_ballast_tanks || "Yes"}
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
                        value={reportFormData.to_what_extent_cargo_tanks}
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
                        value={reportFormData.anode_ballast_tanks || "Yes"}
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
                        value={reportFormData.coated_slop_tanks || "Yes"}
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
                        value={reportFormData.anode_slop_tanks || "Yes"}
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
                          reportFormData.does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2 ||
                          "Yes"
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
                        name="how_many_grades_products_can_vessel_load_discharge_with_double_valve_segregation"
                        value={
                          reportFormData.how_many_grades_products_can_vessel_load_discharge_with_double_valve_segregation
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
                            name="loaded_simultaneously_through_all_manifolds_without_vecs_capacity"
                            value={
                              reportFormData.loaded_simultaneously_through_all_manifolds_without_vecs_capacity
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
                          reportFormData.is_ship_fitted_with_a_cargo_control_room_ccr ||
                          "Yes"
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
                          reportFormData.can_tank_innage_ullage_be_read_from_the_ccr ||
                          "Yes"
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
                          reportFormData.is_gauging_system_certified_and_calibrated ||
                          "Yes"
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
                </div>
              </div>
              {/* Generate and Save Report Buttons */}
              <div className="row">
                <div className="col-md-12">
                  <div className="form-buttons">
                    <button
                      type="button"
                      className="submit-button"
                      disabled={generating}
                    >
                      {generating
                        ? "Generating Marine Report..."
                        : "Generate Marine Report"}
                    </button>
                    <button
                      type="button"
                      className="btn save-report"
                      /* onClick={handleSaveReport}
                      disabled={saving} */
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

export default MarineReport;
