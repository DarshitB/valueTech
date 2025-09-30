/**
 * CE Report Template
 * This template generates HTML for Commercial Equipment reports
 *
 * @param {Object} formData - Form data for the report
 * @param {Object} extraData - Extra data (bank info, categories, etc.)
 * @param {string} bgImageBase64 - Background image as base64
 * @param {string|null} stampImageBase64 - Optional stamp overlay as base64
 * @returns {string} HTML content
 */
function generateCEReportHTML(formData, extraData, bgImageBase64, stampImageBase64) {
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
            <th colspan="6">${extraData.bank_name}</th>
        </tr>
        <tr>
            <th colspan="6">VALUATION REPORT FOR ${extraData.cat} / ${
    extraData.subCat
  }</th>
        </tr>
        <tr>
            <th colspan="6">GENERAL DETAILS OF THE INSPECTED ${
              extraData.cat
            } / ${extraData.subCat}</th>
        </tr>
        <tr>
            <td style="width: 20%;">REF NO.</td>
            <td colspan="2">${formData.ref_no_year}/${formData.ref_no_bank}/${
    formData.state_name
  }/${formData.ref_no_code}/${formData.ref_no_id}</td>
            <td>REV-REPORT DATE:</td>
            <td colspan="2">${formData.rev_report_date}</td>
        </tr>
        <tr>
            <td>VALUER NAME:</td>
            <td colspan="2">${formData.valuer_name}</td>
            <td>SLA NO:</td>
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
            <td colspan="2">${formData.registration_no}</td>
            <td>REGISTRATION DATE:</td>
            <td colspan="2">${formData.registration_date === "00-00-0000" ? "NA" : formData.registration_date}</td>
        </tr>
        <tr>
            <td>REGISTERED LOCATION:</td>
            <td colspan="5">${formData.registered_location}</td>
        </tr>
        <tr>
            <td>OWNER SERIAL NO:</td>
            <td colspan="2">${formData.owner_serial_no}</td>
            <td>MANUFACTURE YEAR:</td>
            <td colspan="2">${formData.manufacture_year}</td>
        </tr>
        <tr>
            <td>ASSET MAKE:</td>
            <td colspan="2">${formData.asset_make}</td>
            <td>MODEL:</td>
            <td colspan="2">${formData.model}</td>
        </tr>
        <tr>
            <td>ENGINE NO./ DETAIL:</td>
            <td colspan="2">${formData.engine_no_detail}</td>
            <td>CRANE CHASSIS NO:</td>
            <td colspan="2">${formData.crane_chassis_no}</td>
        </tr>
        <tr>
            <td>BODY TYPE:</td>
            <td colspan="2">${formData.body_type}</td>
            <td>CRANE MODEL CODE:</td>
            <td colspan="2">${formData.crane_model_code || "N/A"}</td>
        </tr>
        <tr>
            <td>HOURS METER READING:</td>
            <td colspan="2">${formData.hours_meter_reading}</td>
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
            <td>HYP FROM DATE:</td>
            <td colspan="2">
                ${
                  formData.hyp_from_date
                    ? formData.hyp_from_date
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
            <td colspan="2">${extraData.subCat}</td>
            <td>NO OF CYLINDER:</td>
            <td colspan="2">${formData.no_of_cylinder} CYLINDER</td>
        </tr>
        <tr>
            <td>ENGINE CONDITION:</td>
            <td colspan="2">${formData.engine_condition}</td>
            <td>CHASSIS CONDITION:</td>
            <td colspan="2">${formData.chassis_condition}</td>
        </tr>
        <tr>
            <td>BODY CONDITION:</td>
            <td colspan="2">${formData.body_condition}</td>
            <td>CABIN CONDITION:</td>
            <td colspan="2">${formData.cabin_condition}</td>
        </tr>
        <tr>
            <td>ELECTRICAL CONDITION:</td>
            <td colspan="2">${formData.electrical_condition}</td>
            <td>GEAR TRANSMISSION:</td>
            <td colspan="2">${formData.gear_transmission}</td>
        </tr>
        <tr>
            <td>BATTERY AVAILABLE-YES/NO:</td>
            <td colspan="2">${formData.battery_available}</td>
            <td>GROSS MACHINE WEIGHT:</td>
            <td colspan="2">${formData.gross_machine_weight}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_1}</td>
            <td>${formData.fix_but_flex_value_1}</td>
            <td>${formData.fix_but_flex_heading_2}</td>
            <td>${formData.fix_but_flex_value_2}</td>
            <td>${formData.fix_but_flex_heading_3}</td>
            <td>${formData.fix_but_flex_value_3}</td>
        </tr>
        <tr>
            <td colspan="2">${formData.fix_but_flex_title_1}</td>
            <td colspan="2">${formData.fix_but_flex_title_2}</td>
            <td colspan="2">${formData.fix_but_flex_title_3}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_4}</td>
            <td>${formData.fix_but_flex_value_4}</td>
            <td>${formData.fix_but_flex_heading_5}</td>
            <td>${formData.fix_but_flex_value_5}</td>
            <td>${formData.fix_but_flex_heading_6}</td>
            <td>${formData.fix_but_flex_value_6}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_7}</td>
            <td>${formData.fix_but_flex_value_7}</td>
            <td>${formData.fix_but_flex_heading_8}</td>
            <td>${formData.fix_but_flex_value_8}</td>
            <td>${formData.fix_but_flex_heading_9}</td>
            <td>${formData.fix_but_flex_value_9}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_10}</td>
            <td>${formData.fix_but_flex_value_10}</td>
            <td>${formData.fix_but_flex_heading_11}</td>
            <td>${formData.fix_but_flex_value_11}</td>
            <td>${formData.fix_but_flex_heading_12}</td>
            <td>${formData.fix_but_flex_value_12}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_top_heading_13}</td>
            <td colspan="5">
                <table style="margin: 0;border-collapse: collapse;width: 100%;">
                    <tr>
                          <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">
                          ${formData.fix_but_flex_heading_13}
                          </td>
                          <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">
                          ${formData.fix_but_flex_value_13}
                          </td>
                          <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">
                          ${formData.fix_but_flex_heading_14}
                          </td>
                          <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">
                          ${formData.fix_but_flex_value_14}
                          </td>
                          <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">
                          ${formData.fix_but_flex_heading_15}
                          </td>
                          <td style="border-top: 0px;border-bottom: 0px;border-left:0px;border-right:0px;">
                          ${formData.fix_but_flex_value_15}
                          </td>
                    </tr>
                </table>
            </td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_16}</td>
            <td colspan="2">${formData.fix_but_flex_value_16}</td>
            <td>${formData.fix_but_flex_heading_17}</td>
            <td colspan="2">${formData.fix_but_flex_value_17}</td>
        </tr>
        <tr>
            <td>${formData.fix_but_flex_heading_18}</td>
            <td colspan="2">
                <table style="margin: 0;border-collapse: collapse;width: 100%;">
                    <tr>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                          formData.fix_but_flex_value_18
                        }</td>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                          formData.fix_but_flex_heading_19
                        }</td>
                    </tr>
                </table>
            </td>
            <td>${formData.fix_but_flex_value_19}</td>
            <td colspan="2">
                <table style="margin: 0;border-collapse: collapse;width: 100%;">
                    <tr>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                          formData.fix_but_flex_heading_20
                        }</td>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;border-right:0px;">${
                          formData.fix_but_flex_value_20
                        }</td>
                    </tr>
                </table>
            </td>
        </tr>
         <tr>
            <td>${formData.fix_but_flex_heading_21}</td>
            <td colspan="2">
                <table style="margin: 0;border-collapse: collapse;width: 100%;">
                    <tr>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                          formData.fix_but_flex_value_21
                        }</td>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;border-right:0px;">${
                          formData.fix_but_flex_heading_22
                        }</td>
                    </tr>
                </table>
            </td>
            <td>${formData.fix_but_flex_value_22}</td>
            <td colspan="2">
                <table style="margin: 0;border-collapse: collapse;width: 100%;">
                    <tr>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;">${
                          formData.fix_but_flex_heading_23
                        }</td>
                        <td style="border-top: 0px;border-bottom: 0px;border-left:0px;border-right:0px;">${
                          formData.fix_but_flex_value_23
                        }</td>
                    </tr>
                </table>
            </td>
        </tr>
         <tr>
            <td>${formData.fix_but_flex_heading_24}</td>
            <td colspan="2">${formData.fix_but_flex_value_24}</td>
            <td>${formData.fix_but_flex_heading_25}</td>
            <td colspan="2">${formData.fix_but_flex_value_25}</td>
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
            <th colspan="6">RC, PERMIT, TAX, FITNESS & INSURANCE DETAILS OF ${
              extraData.cat
            } / ${extraData.subCat}</th>
        </tr>
        <tr>
            <td>BILL OF ENTRY:</td>
            <td>${formData.bill_of_entry}</td>
            <td>PROFORMA INVOICE VERIFIED:</td>
            <td>${formData.proforma_invoice_verified}</td>
            <td>TAX UPTO:</td>
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
            <td>BILL OF LADING:</td>
            <td>
                ${
                  formData.bill_of_lading
                    ? formData.bill_of_lading
                    : "NOT AVAILABLE"
                }
            </td>
            <td>CHARTED ENGINEER CERTIFICATE:</td>
            <td>
                ${
                  formData.chartered_engineer_certificate
                    ? formData.chartered_engineer_certificate
                    : "NOT AVAILABLE"
                }
            </td>
            <td>FITNESS UPTO:</td>
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
            <td rowspan="2" colspan="2">INSURANCE VAL. DATE:</td>
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
            <th colspan="6">OVER ALL FEED BACK OF THE INSPECTED ${
              extraData.cat
            } / ${extraData.subCat}</th>
        </tr>
        <tr>
            <td>INVOICE COST:</td>
            <td colspan="2">Rs. ${formData.invoice_cost}</td>
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
        ${generateFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "OVER_ALL_FEED_BACK_OF_THE_INSPECTED"
        )}
        <tr>
            <td>DECLARATION:</td>
            <td colspan="5" style="text-transform: none;">
                The aforesaid ${extraData.cat} / ${
    extraData.subCat
  } inspected by us & found in ${
    formData.declaration
  } on the date of my inspection.This Report issued for ${
    formData.valuation_purpose
  } of ${extraData.bank_name}, ${extraData.branch_name}, ${
    extraData.state_name
  } Only.
            </td>
        </tr>
        <tr>
            <td>DISCLAIMER:</td>
            <td colspan="5" style="text-transform: none;">THIS REPORT IS GENERATED BY THE ${formData.valuer_name} AT THE SOLE REQUEST OF ${
              extraData.bank_name
            } WHOM, THIS VALUATION REPORT IS ADDRESSED AND IS TO BE USED SOLELY BY THE SAID PARTY FOR THE STATED PURPOSE ONLY. VISHAL D. KOTHARI WILL NOT BE HELD LIBLE FOR ANY LOSS OR LIABLITY SUSTAINED BY ANY PARTY RELYING ON THIS VALUATION REPORT. VISHAL D. KOTHARI HAS RELIED ON THE DATA PROVIDED BY THE CLIENT & HAS NOT VERIFIED GENIUNENESS THEREOFF. AS THERE IS NO STANDARD PRICE LIST FOR PRE-OWNED/USED MACHINERY / CRANE, THIS VALUATION INDICATED IN THE REPORT IS OUR PROFESSIONAL OPINION ONLY ON THE MARKET VALUE OF THE PRODUCT SHOWN IN COLLAGE OR IN DETAILS BASED ON STANDARD VALUATION METHODOLOGY & PROCEDURES CALCULATING FLUCTUATIONS & LIMITATIONS OF VALUATED PRODUCTS. ACUAL REALISATION MAY DIFFER FROM THE VALUATION INDICATED IN THE REPORT. VISHAL D. KOTHARI (SIGNATORY & EMPLOYEES WILL NOT BE HELD LIABLE FOR ANY DIRECT, INDIRECT CONSEQUENTIAL OR EXEMPLARY DAMEGES FOR ANY LOSS RESULTING FROM THE USE OF THIS REPORT. VISHAL D. KOTHARI IS NOT RESPONSIBLE FOR VERIFYING THE GENUINENESS OF THE PROVIDED DOCUMENTS. THE VALUATION OF ASSET IS PRIMARILY BASED ON THE CONDITION OF THE MACHINERY AT THE TIME OF INSPECTION & SURVEY. TO GIVE LOAN TO THE APPLICANT IS THE RESPONSIIBLITY OF THE FINANCE COMPANY/BANK. WE ARE NOT RESPONSIBLE OR CONCERNED FOR THE SAME.
            </td>
        </tr>
        <tr>
            <td colspan="6" style="height: 58px; position: relative;">
                ${
                  formData.tyre_image_base64
                    ? `<img src="${formData.tyre_image_base64}" style="height: 70px; position: relative; z-index:1;" alt="">`
                    : ""
                }
            </td>
        </tr>
        <tr>
            <td colspan="6" style="height: 48px; position: relative;">
                ${stampImageBase64 ? `<img src="${stampImageBase64}" alt="stamp" style="position:absolute; left:50%; bottom: -15px; transform:translateX(calc(-50% - 170px)); height: 150px; z-index:2; pointer-events:none;" />` : ""}
                SIGNATURE WITH SEAL & STAMP
            </td>
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
  generateCEReportHTML,
};
