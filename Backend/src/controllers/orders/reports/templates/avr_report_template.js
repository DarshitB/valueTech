/**
 * AVR Report Template
 * This template generates HTML for Asset Verification Reports
 *
 * @param {Object} formData - Form data for the report
 * @param {Object} extraData - Extra data (bank info, categories, etc.)
 * @param {string} bgImageBase64 - Background image as base64
 * @param {string|null} stampImageBase64 - Optional stamp image (base64)
 * @returns {string} HTML content
 */
function generateAVRReportHTML(
  formData,
  extraData,
  bgImageBase64,
  stampImageBase64
) {
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        @page {
            margin: 0px;
            size: 8.5in 14in;
        }
        
        body {
            background-image: url('${bgImageBase64 || ""}');
            background-size: 100% 100%;
            background-repeat: no-repeat;
            background-position: top left;
            background-attachment: fixed;
            font-family: sans-serif;
            padding: 0px;
            margin: 0px;
            width: 8.5in;
            height: 14in;
            min-height: 14in;
            box-sizing: border-box;
        }
        
        .content-wrapper {
            padding: 30px 25px;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            position: relative;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 195px; /* adjust position */
            page-break-inside: avoid;
        }
        
        tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        /* Ensure background image appears on every page */
        @media print {
            body {
                background-image: url('${bgImageBase64 || ""}');
                background-size: 100% 100%;
                background-repeat: no-repeat;
                background-position: top left;
                background-attachment: fixed;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }

        th, td {
            border: 1px solid #000;
            padding: 1.5px;
            text-align: left;
            font-size: 9.3px;
            text-transform: uppercase;
            width: 16.66%;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <div class="content-wrapper">
        <table style="min-height: calc(100% - 300px);">
            <tr>
                <td colspan="3">Ref. No. ${formData.ref_no_year}/${
    formData.ref_no_bank
  }/${formData.ref_no_code}/${formData.ref_no_month}${formData.ref_no_id}</td>
            </tr>
            <tr>
                <th style="width: 10%;">LAN No.:-</th>
                <td>${formData.lan_no || ""}</td>
                <td style="width: 10%;"><b>Date :-</b> ${
                  formData.report_date || ""
                }</td>
            </tr>
            <tr>
                <td colspan="3">
                    <p style="margin: 0%;padding: 0%;text-align:center;font-weight:bold;text-decoration: underline;">
                        Post Disbursement Asset Verification Report</p>
                    <p style="margin: 0%;padding: 0%;">${
                      formData.bank_name || ""
                    }</p>
                    <p style="margin: 0%;padding: 0%;">${
                      formData.branch_name || ""
                    }, ${formData.state_name || ""}</p>
                    <p style="margin: 0%;padding: 0%;">Respected Sir / Madam,</p>
                    <p style="margin: 0 0 10px 0;padding: 0%;text-align:center;text-decoration: underline;">
                        SUB: VERIFICATION REPORT OF "${
                          formData.model_number || ""
                        }"</p>
                    <p style="margin: 0 0 10px 0;padding: 0%;text-align:center;text-decoration: underline;">
                        Kind Attention :- ${formData.officer_name || ""},${
    formData.officer_designation || ""
  }</p>
                    <p style="margin: 0 0 10px 0;padding: 0%;text-align:center;">
                        As Per Instruction Received From Bank, I Have Inspected The ${
                          formData.inspected_item || ""
                        } On The Date Of
                        "dated${formData.inspected_date || ""}" Lying At "${
    formData.inspection_address || ""
  }", I Have Report As Under.
                    </p>
                </td>
            </tr>
            <tr>
                <th colspan="3">Case Details –</th>
            </tr>
            <tr>
                <th style="width: 10%;">Customer Name</th>
                <td colspan="2">${formData.customer_name || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Address - as per KYC</th>
                <td colspan="2">${formData.address_as_per_kyc || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Machinery Locations</th>
                <td colspan="2">${formData.machinery_locations || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">L.A.N City #</th>
                <td colspan="2">${formData.lan_city_no || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Date of Disbursement</th>
                <td colspan="2">${formData.date_of_disbursement || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Date of Invoice / Delivery No.</th>
                <td colspan="2">${
                  formData.date_of_invoice_delivery_no || ""
                }</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">Invoice Details –</th>
            </tr>
            <tr>
                <th style="width: 10%;">Invoice Price</th>
                <td colspan="2">${formData.invoice_price || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Lien of ${
                  formData.bank_name || "Bank"
                }</th>
                <td colspan="2">${formData.lien_of_bank || ""}</td>
            </tr>
            <tr>
                <th colspan="3">Asset details –</th>
            </tr>
            <tr>
                <th style="width: 10%;">Asset # Chassis No. # Serial No. # Engine No.# Regn. No</th>
                <td colspan="2"># MODEL NAME # CHASSIS NO. ${
                  formData.chassis_no || "NOT AVAILABLE"
                } # MACHINE SERIAL NO.
                    ${
                      formData.machine_serial_no || "NOT AVAILABLE"
                    } / ENGINE NO ${
    formData.engine_no || "NOT AVAILABLE"
  } / REG NO. ${formData.regn_no || "NOT AVAILABLE"}</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">Installation Details –</th>
            </tr>
            <tr>
                <th style="width: 10%;">Installed & Running</th>
                <td colspan="2">At ${formData.installed_running || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Installed Asset Whether Functional or Not</th>
                <td colspan="2">Fully Functional AT ${
                  formData.installed_asset_whether_functional_or_not || ""
                }</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">PARTICULARS OF THE ASSET</th>
            </tr>
            <tr>
                <th style="width: 10%;">Class & Make of Asset</th>
                <td colspan="2">${formData.class_make_of_asset || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Year of Mfg.</th>
                <td colspan="2">${formData.year_of_mfg || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Invoice No./Purchase Order No.</th>
                <td colspan="2">${
                  formData.invoice_purchase_order_no || "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Pro.Owner & Address</th>
                <td colspan="2">${formData.pro_owner_address || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Insurer / Policy no</th>
                <td colspan="2">${
                  formData.insurer_policy_no || "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Insurance Validity / Insured Value</th>
                <td colspan="2">${
                  formData.insurance_validity_insured_value || "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Insurance Having Lien of ${
                  formData.bank_name || "Bank"
                }.</th>
                <td colspan="2">${
                  formData.insurance_having_lien_of_bank || "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Total Crane Weight & capacity</th>
                <td colspan="2">${
                  formData.total_crane_weight_capacity || "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Material Usefulness</th>
                <td colspan="2">${formData.material_usefulness || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Colour</th>
                <td colspan="2">${formData.colour || ""}</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">PRESENT PARTICULARS OF THE MACHINE</th>
            </tr>
            ${generateFlexibleFieldsForAVR(
              formData.flexible_fields || [],
              "PRESENT_PARTICULARS_OF_THE_MACHINE"
            )}
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">OBSERVATION</th>
            </tr>
            <tr>
                <td colspan="3">${formData.observation || ""}</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th style="width: 10%;">STATUS OF MACHINE : </th>
                <td colspan="2">${formData.status_of_machine || ""}</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">I assure You Reliable and Confidential Reporting Services.</th>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th style="width: 10%;">Visit Done By</th>
                <td colspan="2">${formData.visit_done_by || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Place</th>
                <td colspan="2">${formData.place || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Date & Time</th>
                <td colspan="2">${formData.date_time || ""}</td>
            </tr>
        </table>
        <table style="margin: 0%;width: 100%;">
            <tr>
                <td colspan="2" style="border:none;">&nbsp;</td>
                <th style="width: 10%;border:none;">Surveyor, Valuer & Loss Assessor</th>
            </tr>
            <tr>
                <td colspan="2" style="border:none;">&nbsp;</td>
                <th style="width: 10%;border:none;">${
                  formData.surveyor || ""
                }</th>
            </tr>
            <tr>
                <td colspan="2" style="border:none;">&nbsp;</td>
                <th style="width: 10%;border:none;">${formData.valuer_name === "VALUETECH SOLUTIONS" ? "Licence No." : "License No."}:- ${
                  formData.license_no || ""
                }</th>
            </tr>
            <tr>
                <td colspan="2" style="border:none;">&nbsp;</td>
                <th style="width: 10%;border:none;">${
                  formData.surveyor_location || ""
                }</th>
            </tr>
        </table>
        <div style="position: absolute; left:50%; bottom: 50px; transform:translateX(calc(-50% - 275px));  width: fit-content; height: fit-content;z-index:2;">
          ${
            stampImageBase64
              ? `<img src="${stampImageBase64}" alt="stamp" style=" height: 125px;  pointer-events:none;" />`
              : ""
          }
        </div>
    </div>
</body>
</html>
  `;
}

/**
 * Generate HTML for flexible fields within AVR report
 * @param {Array} flexibleFields - Array of flexible field objects
 * @param {string} sectionName - The section name to filter fields for
 * @returns {string} HTML for flexible fields in the specified section
 */
function generateFlexibleFieldsForAVR(flexibleFields, sectionName) {
  if (!flexibleFields || flexibleFields.length === 0) {
    return "";
  }

  // Filter fields for the specific section
  const sectionFields = flexibleFields.filter(
    (field) => field.section_name === sectionName
  );

  if (sectionFields.length === 0) {
    return "";
  }

  let html = "";

  // Process fields row by row, ensuring total columns don't exceed 3
  let i = 0;
  while (i < sectionFields.length) {
    html += "<tr>";
    let currentRowColumns = 0;

    // Add fields to current row until we reach 3 columns or run out of fields
    while (i < sectionFields.length && currentRowColumns < 3) {
      const field = sectionFields[i];
      const colSpan = field.col_span ? parseInt(field.col_span) : 1;

      // Calculate how many columns this field will take
      let fieldColumns;
      let valueColSpan;

      if (colSpan === 1) {
        // col_span 1: label (1 col) + value (2 cols) = 3 total columns
        fieldColumns = 3;
        valueColSpan = 2;
      } else {
        // col_span 2: label (1 col) + value (1 col) = 2 total columns
        fieldColumns = 2;
        valueColSpan = 1;
      }

      // Check if this field fits in the current row
      if (currentRowColumns + fieldColumns <= 3) {
        html += `
          <th style="width: 10%;">${field.field_label || ""}</th>
          <td colspan="${valueColSpan}">${field.field_value || ""}</td>
        `;
        currentRowColumns += fieldColumns;
        i++;
      } else {
        // Field doesn't fit, break to next row
        break;
      }
    }

    // Fill remaining columns in the row if needed
    if (currentRowColumns < 3) {
      const remainingColumns = 3 - currentRowColumns;
      html += `<td colspan="${remainingColumns}"></td>`;
    }

    html += "</tr>";
  }

  return html;
}

module.exports = {
  generateAVRReportHTML,
};
