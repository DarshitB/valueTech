/**
 * Machinery Report Template
 * This template generates HTML for Machinery reports
 *
 * @param {Object} formData - Form data for the report
 * @param {Object} extraData - Extra data (bank info, categories, etc.)
 * @param {string} bgImageBase64 - Background image as base64
 * @returns {string} HTML content
 */
function generateMachineryReportHTML(formData, extraData, bgImageBase64) {
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
            text-align: center;
            font-size: 9.3px;
            text-transform: uppercase;
            width: 16.66%;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <div class="content-wrapper">
        <table>
        <tr>
            <th colspan="6">VALUATION REPORT FOR ${extraData.cat} / ${
    extraData.subCat
  }</th>
        </tr>
        <tr>
            <th colspan="6">GENERAL DETAILS OF THE ${extraData.cat} / ${
    extraData.subCat
  }</th>
        </tr>
        <tr>
            <td style="width: 20%;">REF NO.</td>
            <td colspan="2">${formData.ref_no_year}/${formData.ref_no_bank}/${
    formData.state_name
  }/${formData.ref_no_code}/${formData.ref_no_id}</td>
            <td>REPORT DATE:</td>
            <td colspan="2">${formData.report_date}</td>
        </tr>
        <tr>
            <td>VALUER NAME:</td>
            <td colspan="2">${formData.valuer_name}</td>
            <td>LICENCE NO:</td>
            <td colspan="2">${formData.license_no}</td>
        </tr>
        <tr>
            <td>VALUER CONTACT:</td>
            <td colspan="5">${formData.valuer_contact}</td>
        </tr>
        <tr>
            <td>VALUATION PURPOSE:</td>
            <td colspan="2">${formData.valuation_purpose}</td>
            <td>INITIATED BY:</td>
            <td colspan="2">${formData.initiated_by}</td>
        </tr>
        <tr>
            <td>DATE OF INSPECTION:</td>
            <td colspan="2">${formData.date_of_inspection}</td>
            <td>PLACE OF INSPECTION:</td>
            <td colspan="2">${formData.place_of_inspection}</td>
        </tr>
        <tr>
            <td>REGISTERED OWNER NAME:</td>
            <th colspan="5">${formData.registered_owner_name}</th>
        </tr>
        <tr>
            <td>ADDRESS:</td>
            <td colspan="5">${formData.registered_owner_address}</td>
        </tr>
        <tr>
            <td>PROPOSED OWNER NAME:</td>
            <th colspan="5">${formData.proposed_owner_name}</th>
        </tr>
        <tr>
            <td>ADDRESS:</td>
            <td colspan="5">${formData.proposed_owner_address}</td>
        </tr>
        <tr>
            <th colspan="6">INSPECTED EQUIPMENT DETAILS OF ${extraData.cat} / ${
    extraData.subCat
  }</th>
        </tr>
        <tr>
            <td>REGISTRATION NO:</td>
            <td colspan="2">${
              formData.registration_no
                ? formData.registration_no
                : "NOT APPLICABLE"
            }</td>
            <td>REGISTRATION DATE:</td>
            <td colspan="2">${formData.registration_date === "00-00-0000" ? "NA" : formData.registration_date}</td>
        </tr>
        <tr>
            <td>LOCATION OF MACHINERY:</td>
            <td colspan="5">${formData.location_of_machinery}</td>
        </tr>
        <tr>
            <td>OWNER SERIAL NO:</td>
            <td colspan="2">${formData.owner_serial_no}</td>
            <td>MANUFACTURE YEAR:</td>
            <td colspan="2">${formData.manufacture_year}</td>
        </tr>
        <tr>
            <td>ASSET MAKE & SUPPLIER:</td>
            <td colspan="2">${formData.asset_make}</td>
            <td>MODEL:</td>
            <td colspan="2">${formData.model}</td>
        </tr>
        <tr>
            <td rowspan="2">CONTROL SYSTEM:</td>
            <td colspan="2" rowspan="2">${formData.control_system}</td>
            <td>MACHINE SERIAL NO:</td>
            <td colspan="2">${formData.machine_serial_no}</td>
        </tr>
        <tr>
            <td>LAF ID:</td>
            <td colspan="2">${formData.laf_id}</td>
        </tr>
        <tr>
            <td>APPLICATION / USAGE:</td>
            <td colspan="2">${formData.application_usage}</td>
            <td>INVOICE NO. & DATE:</td>
            <td colspan="2">
                ${
                  formData.invoice_no_date
                    ? formData.invoice_no_date
                    : "NOT AVAILABLE"
                }
            </td>
        </tr>
        <tr>
            <td>HYP WITH:</td>
            <td colspan="2">${formData.hyp_with}</td>
            <td>MACHINE TYPE:</td>
            <td colspan="2">
                ${
                  formData.machine_type
                    ? formData.machine_type
                    : "NOT AVAILABLE"
                }
            </td>
        </tr>
        ${generateAdditionalRows(formData, "inspected")}
        ${generateFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "INSPECTED_EQUIPMENT_DETAILS"
        )}
        <tr>
            <th colspan="6">COMMENTS ON EQUIPMENT AT THE TIME OF INSPECTION ${
              extraData.cat
            } / ${extraData.subCat}</th>
        </tr>
        <tr>
            <td>ASSET CLASSIFICATION:</td>
            <td colspan="5">${extraData.subCat}</td>
        </tr>
        <tr>
            <td>MACHINE TECHNOLOGY:</td>
            <td colspan="2">${formData.machine_technology}</td>
            <td>MACHINE CONDITION:</td>
            <td colspan="2">${formData.machine_condition}</td>
        </tr>
        <tr>
            <td>ELECTRICAL CONDITION:</td>
            <td colspan="2">${formData.electrical_condition}</td>
            <td>MECHANICAL CONDITION:</td>
            <td colspan="2">${formData.mechanical_condition}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_1}:</td>
            <td colspan="2">${formData.fix_but_flex_value_1}</td>
            <td>${formData.fix_but_flex_heading_2}:</td>
            <td colspan="2">${formData.fix_but_flex_value_2}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_3}:</td>
            <td colspan="2">${formData.fix_but_flex_value_3}</td>
            <td>${formData.fix_but_flex_heading_4}:</td>
            <td colspan="2">${formData.fix_but_flex_value_4}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_5}:</td>
            <td colspan="2">
              <table style="margin: 0;border-collapse: collapse;width: 100%;">
                  <tr>
                      <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                        formData.fix_but_flex_value_5
                      }</td>
                      <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                        formData.fix_but_flex_heading_6
                      }</td>
                      <td style="border-top: 0px;border-bottom: 0px;border-left:0px;border-right:0px;">${
                        formData.fix_but_flex_value_6
                      }</td>
                  </tr>
              </table>
            </td>
            <td>${formData.fix_but_flex_heading_7}:</td>
            <td colspan="2">${formData.fix_but_flex_value_7}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_8}:</td>
            <td colspan="2">
              <table style="margin: 0;border-collapse: collapse;width: 100%;">
                  <tr>
                      <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                        formData.fix_but_flex_value_8
                      }</td>
                      <td colspan="2" style="border-top: 0px;border-bottom: 0px;border-left:0px;border-right:0px;">${
                        formData.fix_but_flex_heading_9
                      }</td>
                  </tr>
              </table>
            </td>
            <td>
              <table style="margin: 0;border-collapse: collapse;width: 100%;">
                  <tr>
                      <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                        formData.fix_but_flex_value_9
                      }</td>
                      <td style="border-top: 0px;border-bottom: 0px;border-left:0px; border-right:0px;">${
                        formData.fix_but_flex_heading_10
                      }</td>
                  </tr>
              </table>
            </td>
            <td colspan="2">${formData.fix_but_flex_value_10}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_11}:</td>
            <td colspan="2">${formData.fix_but_flex_value_11}</td>
            <td>${formData.fix_but_flex_heading_12}:</td>
            <td colspan="2">${formData.fix_but_flex_value_12}</td>
        </tr>

        <tr>
            <td>MACHINE COLOUR:</td>
            <td colspan="2">${formData.machine_colour}</td>
            <td>COLOR CONDITION:</td>
            <td colspan="2">${formData.color_condition}</td>
        </tr>
        ${generateAdditionalRows(formData, "comments")}
        ${generateFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "COMMENTS_ON_EQUIPMENT_AT_THE_TIME_OF_INSPECTION"
        )}
        <tr>
            <th>DAMAGES IF ANY:</th>
            <td colspan="5">
                ${
                  formData.damages_if_any
                    ? formData.damages_if_any
                    : "NOT VISIBLE"
                }
            </td>
        </tr>
        <tr>
            <th colspan="6">INSURANCE DETAILS OF THE ${extraData.cat} / ${
    extraData.subCat
  }</th>
        </tr>
        <tr>
            <td>RC BOOK VERIFIED:</td>
            <td>${formData.rc_book_verified}</td>
            <td>TAX INVOICE COPY:</td>
            <td>${formData.tax_invoice_copy}</td>
            <td>${
              formData.tax_upto_title
                ? formData.tax_upto_title
                : "NOT AVAILABLE"
            }:</td>
            <td>
                ${
                  formData.tax_upto
                    ? formData.tax_upto === "00-00-0000"
                      ? "LTT"
                      : formData.tax_upto
                    : "NOT AVAILABLE"
                }
            </td>
        </tr>
        <tr>
            <td>PERMIT UPTO:</td>
            <td>
                ${
                  formData.permit_upto
                    ? formData.permit_upto === "00-00-0000"
                      ? "LTT"
                      : formData.permit_upto
                    : "NOT AVAILABLE"
                }
            </td>
            <td>PERMIT TYPE:</td>
            <td>
                ${formData.permit_type ? formData.permit_type : "NOT AVAILABLE"}
            </td>
            <td>${
              formData.fitness_upto_title
                ? formData.fitness_upto_title
                : "NOT AVAILABLE"
            }:</td>
            <td>
                ${
                  formData.fitness_upto
                    ? formData.fitness_upto
                    : "NOT AVAILABLE"
                }
            </td>
        </tr>
        <tr>
            <td>INSURANCE CO.Name:</td>
            <td colspan="2">
                ${
                  formData.insurance_co_name
                    ? formData.insurance_co_name
                    : "NOT AVAILABLE"
                }
            </td>
            <td>POLICY NO:</td>
            <td colspan="2">
                ${formData.policy_no ? formData.policy_no : "NOT AVAILABLE"}
            </td>
        </tr>
        <tr>
            <td rowspan="2">INSURANCE VAL. DATE:</td>
            <td rowspan="2" colspan="2">
                ${
                  extraData.insurance_valid_date
                    ? extraData.insurance_valid_date
                    : "NOT AVAILABLE"
                }
            </td>
            <td>INSURED VALUE:</td>
            <td colspan="2">
                RS. ${
                  formData.insured_value
                    ? formData.insured_value
                    : "NOT AVAILABLE"
                }
            </td>
        </tr>
        <tr>
            <td>INS VERIFIED:</td>
            <td colspan="2">${formData.insurance_verified}</td>
        </tr>
        <tr>
            <th colspan="6">OVER ALL FEED BACK OF THE ${extraData.cat} / ${
    extraData.subCat
  }</th>
        </tr>
        <tr>
            <td>TAX INVOICE COST:</td>
            <td colspan="2">Rs. ${formData.tax_invoice_cost}</td>
            <td>DEPRECIATION % & VALUE:</td>
            <td>${formData.depreciation}%</td>
            <td>Rs. ${formData.depreciation_value}</td>
        </tr>
        <tr>
            <td>APPRAISER VALUE:</td>
            <td colspan="2">Rs. ${formData.appraiser_value}</td>
            <td>FAIR MARKET VALUE:</td>
            <th colspan="2">Rs. ${formData.fair_market_value}</th>
        </tr>
        <tr>
            <td>NO OF PHOTOGRAPH:</td>
            <td colspan="3">${formData.no_of_photograph} PHOTOS</td>
            <th rowspan="2" colspan="2">AMOUNT IN WORDS :- ${
              formData.amount_in_words
            }</th>
        </tr>
        <tr>
            <td>NO OF COLLAGE:</td>
            <td colspan="3">${formData.no_of_collage} COLLAGE</td>
        </tr>
        <tr>
            <td>VALUER COMMENTS/REMARKS:</td>
            <td colspan="5">${formData.valuer_comments_remarks}</td>
        </tr>
        <tr>
            <td>DECLARATION:</td>
            <td colspan="5">
                ${formData.declaration}
            </td>
        </tr>
        <tr>
            <td>DISCLAIMER:</td>
            <td colspan="5">${formData.disclaimer}</td>
        </tr>
        ${generateFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "OVER_ALL_FEED_BACK_OF_THE_INSPECTED"
        )}
        <tr>
            <td colspan="6" style="height: 48px;">SIGNATURE WITH SEAL & STAMP</td>
        </tr>
    </table>
    </div>
</body>
</html>
  `;
}

/**
 * Generate additional rows for inspected or comments sections
 * @param {Object} formData - Form data
 * @param {string} type - 'inspected' or 'comments'
 * @returns {string} HTML for additional rows
 */
function generateAdditionalRows(formData, type) {
  let html = "";
  const prefix =
    type === "inspected"
      ? "additional_rows_inspected"
      : "additional_rows_comments";

  // First additional row
  if (formData[`${prefix}_headding_1`] || formData[`${prefix}_value_1`]) {
    html += `
    <tr>
        <td>${formData[`${prefix}_headding_1`] || ""}</td>
        <td colspan="5">${formData[`${prefix}_value_1`] || ""}</td>
    </tr>
    `;
  }

  // Second and third additional rows (combined)
  if (
    formData[`${prefix}_headding_2`] ||
    formData[`${prefix}_value_2`] ||
    formData[`${prefix}_headding_3`] ||
    formData[`${prefix}_value_3`]
  ) {
    html += `
    <tr>
        <td>${formData[`${prefix}_headding_2`] || ""}</td>
        <td colspan="2">${formData[`${prefix}_value_2`] || ""}</td>
        <td>${formData[`${prefix}_headding_3`] || ""}</td>
        <td colspan="2">${formData[`${prefix}_value_3`] || ""}</td>
    </tr>
    `;
  }

  return html;
}

/**
 * Generate HTML for flexible fields within a specific section
 * @param {Array} flexibleFields - Array of flexible field objects
 * @param {string} sectionName - The section name to filter fields for
 * @returns {string} HTML for flexible fields in the specified section
 */
function generateFlexibleFieldsForSection(flexibleFields, sectionName) {
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

  // Process fields row by row, ensuring total columns don't exceed 6
  let i = 0;
  while (i < sectionFields.length) {
    html += "<tr>";
    let currentRowColumns = 0;

    // Add fields to current row until we reach 6 columns or run out of fields
    while (i < sectionFields.length && currentRowColumns < 6) {
      const field = sectionFields[i];
      const colSpan = field.col_span ? parseInt(field.col_span) : 2;

      // Calculate how many columns this field will take
      let fieldColumns;
      let valueColSpan;

      if (colSpan === 1) {
        // col_span 1: label (1 col) + value (5 cols) = 6 total columns
        fieldColumns = 6;
        valueColSpan = 5;
      } else {
        // col_span 2: label (1 col) + value (2 cols) = 3 total columns
        fieldColumns = 3;
        valueColSpan = 2;
      }

      // Check if this field fits in the current row
      if (currentRowColumns + fieldColumns <= 6) {
        html += `
          <td style="font-weight: bold;">${field.field_label || ""}</td>
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
    if (currentRowColumns < 6) {
      const remainingColumns = 6 - currentRowColumns;
      html += `<td colspan="${remainingColumns}"></td>`;
    }

    html += "</tr>";
  }

  return html;
}

module.exports = {
  generateMachineryReportHTML,
};
