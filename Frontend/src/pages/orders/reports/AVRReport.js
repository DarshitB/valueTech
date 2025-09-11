import React, { useEffect, useLayoutEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchOrderById } from "../../../redux/reducers/orderReducer";
import { generateOrderReport } from "../../../redux/reducers/orderReportReducer";
import { usePageTitle } from "../../../context/PageTitleContext";
import SingleSearchSelect from "../../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import "../order.scss";
import { DeleteIcon } from "../../../components/icons";

function AVRReport() {
  const { id } = useParams();
  const dispatch = useDispatch();
  // Select order data from Redux store
  const order = useSelector((state) => state.orders.selected);
  // Select order report data from Redux store
  const { generating } = useSelector((state) => state.orderReports);
  // Set page title using custom hook
  const { setTitle } = usePageTitle();
  /* console.log(order); */
  // Fetch order details when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
    }
  }, [dispatch, id]);

  // Get current date in DD-MM-YYYY format
  const getCurrentDate = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Function to get license number based on surveyor name
  const getLicenseNumber = (surveyorName) => {
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
  };

  // Function to parse currency value
  const parseCurrency = (value) => {
    return parseFloat(value.replace(/,/g, "")) || 0;
  };

  // Function to convert number to words (Indian format)
  const convertNumberToWordsIndian = (num) => {
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
  };

  // Function to format currency input (Indian number format)
  const handleCurrencyFormatting = (value) => {
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
  };

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
    surveyor: "V.K. ASSOCIATES",
    license_no: "SLA-60827",
    surveyor_location: "MUMBAI, MAHARASHTRA",
  });

  // State for flexible fields
  const [flexibleFields, setFlexibleFields] = useState([]);

  // Auto-populate form data when order data is available
  useEffect(() => {
    if (order) {
      setReportFormData((prev) => ({
        ...prev,
        ref_no_bank: order?.bank_initial || "",
        bank_name: order?.bank_name || "",
        branch_name: order?.branch_name || "",
        state_name: order?.state_name || "",
      }));
    }
  }, [order]);

  // Handle form input changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setReportFormData((prev) => {
      let updated = {
        ...prev,
        [name]: value,
      };

      // Handle currency formatting for currency fields
      /* if (name === "invoice_price") {
        updated[name] = handleCurrencyFormatting(value);
      } */

      return updated;
    });
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

    /* // Debug: Log the form data being sent
    console.log("Form Data being sent:", reportFormData);
    console.log("Flexible Fields being sent:", flexibleFields);

    // Debug: Log FormData contents
    console.log("FormData contents:");
    for (let [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    } */

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
            <h2>AVR Report</h2>
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
                        readOnly
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
                      <SingleSearchSelect
                        options={[
                          { value: "VKM", label: "VKM" },
                          { value: "VTS", label: "VTS" },
                        ]}
                        name="ref_no_code"
                        value={reportFormData.ref_no_code}
                        onChange={(value) =>
                          handleSelectChange("ref_no_code", value)
                        }
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
                      readOnly
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
                    <textarea
                      type="text"
                      className="form-field"
                      name="address_as_per_kyc"
                      value={reportFormData.address_as_per_kyc}
                      onChange={handleFormChange}
                      rows={2}
                      required
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
                      Date of Disbursement{" "}
                      <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-field"
                      name="date_of_disbursement"
                      value={reportFormData.date_of_disbursement}
                      onChange={handleDateChange}
                      placeholder="DD-MM-YYYY"
                      required
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
                <div className="col-md-12">
                  <div className="form-group">
                    <label>
                      Invoice Price <span className="text-danger">*</span>
                    </label>
                    <textarea
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
                        <label>Chassis No.</label>
                        <input
                          type="text"
                          className="form-field"
                          name="chassis_no"
                          value={reportFormData.chassis_no}
                          onChange={handleFormChange}
                          placeholder="Enter Chassis No."
                          style={{ textAlign: "left" }}
                          required
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
                          required
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
                          required
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
                          required
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
                    <textarea
                      type="text"
                      className="form-field"
                      name="pro_owner_address"
                      value={reportFormData.pro_owner_address}
                      onChange={handleFormChange}
                      rows={2}
                      required
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
                        className="btn btn-outline-primary"
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
                    <textarea
                      className="form-field"
                      name="observation"
                      value={reportFormData.observation}
                      onChange={handleFormChange}
                      rows={5}
                      required
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
                    <SingleSearchSelect
                      options={[
                        { value: "V.K. ASSOCIATES", label: "V.K. ASSOCIATES" },
                        {
                          value: "VALUETECH SOLUTIONS",
                          label: "VALUETECH SOLUTIONS",
                        },
                        {
                          value: "VISHAL D. KOTHARI",
                          label: "VISHAL D. KOTHARI",
                        },
                      ]}
                      name="surveyor"
                      value={reportFormData.surveyor}
                      onChange={(value) =>
                        handleSelectChange("surveyor", value)
                      }
                      required
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

              {/* Submit Button */}
              <div className="row">
                <div className="col-md-12">
                  <div className="form-buttons">
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={generating}
                    >
                      {generating
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
    </section>
  );
}

export default AVRReport;
