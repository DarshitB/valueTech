/**
 * Helper function to render HTML content from field values
 * Preserves HTML tags and converts line breaks to <br> tags
 * This is used by Machinery report template and its helper functions
 */
const renderFieldValue = (value) => {
  if (!value) return "";
  // Convert string to string if it's not already
  const strValue = String(value);
  // Replace \r\n and \n with <br> tags for proper line breaks
  return strValue
    .replace(/\r\n/g, "<br>")
    .replace(/\n/g, "<br>")
    .replace(/\r/g, "<br>");
};

/**
 * Machinery Report Template
 * This template generates HTML for Machinery reports
 *
 * @param {Object} formData - Form data for the report
 * @param {Object} extraData - Extra data (bank info, categories, etc.)
 * @param {string} bgImageBase64 - Background image as base64
 * @param {string} stampImageBase64 - Stamp image as base64
 * @returns {string} HTML content
 */
function generateMachineryReportHTML(
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
         /* ============================================
           CONFIGURABLE BOTTOM SPACE - CHANGE HERE
           Same approach as top spacer (225px) - this repeats on every page
           ============================================ */
        :root {
            --bottom-space: 30px; /* Bottom space reserved - change this value to adjust */
        }
        
        @page {
            margin: 0px;
            size: 8.5in 14in;
            /* Initialize page counter - counter(page) is built-in */
        }
        
        body {
            font-family: sans-serif;
            padding: 0px;
            margin: 0px;
            box-sizing: border-box;
            width: 8.5in;
            background-image: url('${bgImageBase64 || ""}');
            background-size: 8.5in 14in;
            background-repeat: repeat-y;
            background-position: top left;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }
        .content-wrapper {
            padding: 30px 25px; /* Consistent padding: top 30px, sides 25px */
            /* Bottom space handled by tfoot spacer row (same approach as top spacer) */
            width: 100%;
            box-sizing: border-box;
            position: relative;
            background: transparent;
        }
        
        /* Footer for page numbers - positioned independently of content */
        body {
            position: relative;
            min-height: 14in;
        }
        
        .footer {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
        
        .footer .page-number {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .footer .page-number .number {
            font-weight: bold;
            color: #000;
        }
        
        /* Page numbers will be set via CSS counter in print media */
        .footer .page-number .number {
            /* Empty by default, will be populated by CSS counter in print */
        }
        
        .footer .page-number .separator {
            color: #000;
        }
        
        .footer .page-number .label {
            color: #999;
            font-weight: normal;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: -30px; /* Adjusted: 195px desired - 225px spacer = -30px offset */
            margin-bottom: 0; /* No bottom margin - bottom padding handled by wrapper */
        }
       
        /* Removed single-page stretching CSS to allow proper JS measurement */
        /* This was causing JS to think all content fits on one page */
body.single-page{
        height: 100%;
            min-height: 14in; /* Legal page height */
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        body.single-page .main-table {
            flex: 1;
            height: 100% !important;
            min-height: calc(100% - 225px);
            /* background-color: red;
            border-top: 5px solid green; */
        }

        body.single-page .content-wrapper {
            min-height: 14in; /* Legal page height */
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        thead {
            display: table-header-group;
        }
        
        /* Spacer row provides 225px spacing when thead repeats on new pages */
        /* On first page: table margin -30px + spacer 225px = 195px total */
        /* On new pages: spacer 225px = 225px total */
        thead .spacer-row {
            height: 225px; /* 225px spacing for new pages, also used on first page */
            border: none;
            visibility: hidden;
        }
        
        thead .spacer-row td {
            border: none;
            padding: 0;
            height: 225px;
            line-height: 225px;
        }
        
        tbody {
            display: table-row-group;
        }
        
        tfoot {
            display: table-footer-group;
        }
        
        /* Bottom spacer row provides reserved space at bottom (same approach as top spacer) */
        /* This spacer repeats on every page, ensuring bottom space is always reserved */
        tfoot .spacer-row {
            height: var(--bottom-space); /* Uses CSS variable - change in one place */
            border: none;
            visibility: hidden;
        }
        
        tfoot .spacer-row td {
            border: none;
            padding: 0;
            height: var(--bottom-space);
            line-height: var(--bottom-space);
        }
        
        /* Footer row with page number and continue text */
        tfoot .footer-row {
            height: 30px;
            border-top: 1px solid #e0e0e0;
        }
        
        tfoot .footer-row td {
            border: none;
            padding: 8px 10px;
            font-size: 10px;
            text-align: left;
            vertical-align: middle;
        }
        
        tfoot .footer-row .page-number {
            font-weight: bold;
            color: #000;
        }
        
        tfoot .footer-row .continue-text {
            text-align: right;
            color: #666;
        }
        
        /* Hide continue text on last page */
        body.last-page tfoot .footer-row .continue-text,
        table.last-page tfoot .footer-row .continue-text {
            display: none;
        }
        
        /* Hide footer completely on single-page reports */
        body.single-page tfoot .footer-row {
            display: none !important;
        }
        
        /* NO PAGE-BREAK CSS - All splitting is handled by JavaScript */
        /* JS will ensure rows stay together and split at proper boundaries */
        
        /* Ensure background image appears on every page */
        @media print {
            body {
                background-image: url('${bgImageBase64 || ""}');
                background-size: 8.5in 14in;
                background-repeat: repeat-y;
                background-position: top left;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
            }
            
            .content-wrapper {
                padding: 30px 25px; /* Consistent padding on all pages */
                /* Bottom space handled by tfoot spacer row (repeats on every page) */
            }
            
            /* Footer appears on each page - no page-break needed (JS handles splitting) */
            
            /* Page counter for footer */
            .footer .page-number .number::before {
                content: counter(page);
            }
            
            /* Ensure each page section has proper padding */
            @page {
                margin: 0;
                size: 8.5in 14in;
            }
            
            /* Page counter for footer - counter(page) is built-in for print media */
            .footer .page-number .number {
                display: inline-block;
            }
            
            /* Page counter - counter(page) is built-in for print media */
            /* Note: This may not work with Puppeteer, page numbers may need to be injected via JavaScript */
            .footer .page-number .number::before {
                content: counter(page);
                font-weight: bold;
                color: #000;
            }
            
            thead {
                display: table-header-group;
            }
            
            tbody {
                display: table-row-group;
            }
            
            tfoot {
                display: table-footer-group;
            }
            
            /* Footer styling in print */
            tfoot .footer-row {
                border-top: 1px solid #e0e0e0;
            }
            
            /* Page number styling - JavaScript will set the actual page number */
            tfoot .footer-row .page-number .page-number-value {
                display: inline-block;
                font-size: 10px;
                font-weight: bold;
            }
            
            /* Hide continue text on last page */
            body.last-page tfoot .footer-row .continue-text,
            table.last-page tfoot .footer-row .continue-text {
                display: none !important;
            }
            
            /* Hide footer completely on single-page reports */
            body.single-page tfoot .footer-row {
                display: none !important;
            }
            
            /* NO PAGE-BREAK CSS IN PRINT MODE - JavaScript handles all splitting */
            /* This ensures rows are never broken mid-way across pages */
            
            /* Force backgrounds and images to print */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
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
        <table class="main-table" style="min-height: calc(100% - 225px);">
        <thead>
        <tr class="spacer-row">
            <td colspan="6" style="height: 225px; border: none; padding: 0;"></td>
        </tr>
        <tr>
            <th colspan="6">${extraData.bank_name}</th>
        </tr>
        <tr>
            <th colspan="6">${formData.valueation_report_for_heading}</th>
        </tr>
        <tr class="general-details-row" data-first-page-only="true">
            <th colspan="6">${formData.general_details_heading}</th>
        </tr>
        <tr>
            <td style="width: 20%;">REF NO.</td>
            <td colspan="2">${formData.ref_no_year}/${formData.ref_no_bank}/${
    formData.state_name
  }/${formData.ref_no_code}/${formData.ref_no_month}${formData.ref_no_id}</td>
            <td>REPORT DATE:</td>
            <td colspan="2">${formData.report_date}</td>
        </tr>
        </thead>
        <tbody>
        <tr>
            <td>VALUER NAME:</td>
            <td colspan="2">${formData.valuer_name}</td>
            <td>${formData.valuer_name === "VALUETECH SOLUTIONS" ? "Licence No." : "LICENCE NO:"}</td>
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
            <td colspan="2">${renderFieldValue(formData.initiated_by)}</td>
        </tr>
        <tr>
            <td>DATE OF INSPECTION:</td>
            <td colspan="2">${formData.date_of_inspection}</td>
            <td>PLACE OF INSPECTION:</td>
            <td colspan="2">${renderFieldValue(formData.place_of_inspection)}</td>
        </tr>
        <tr>
            <td>REGISTERED OWNER NAME:</td>
            <th colspan="5">${formData.registered_owner_name}</th>
        </tr>
        <tr>
            <td>ADDRESS:</td>
            <td colspan="5">${renderFieldValue(formData.registered_owner_address)}</td>
        </tr>
        <tr>
            <td>PROPOSED OWNER NAME:</td>
            <th colspan="5">${formData.proposed_owner_name}</th>
        </tr>
        <tr data-proposed-owner-address="true">
            <td>ADDRESS:</td>
            <td colspan="5">${renderFieldValue(formData.proposed_owner_address)}</td>
        </tr>
        <tr>
            <th colspan="6">${formData.inspected_equipment_heading}</th>
        </tr>
        <tr>
            <td>REGISTRATION NO:</td>
            <td colspan="2">${
              formData.registration_no
                ? formData.registration_no
                : "NOT APPLICABLE"
            }</td>
            <td>REGISTRATION DATE:</td>
            <td colspan="2">${
              formData.registration_date === "00-00-0000"
                ? "NA"
                : formData.registration_date
            }</td>
        </tr>
        <tr>
            <td>LOCATION OF MACHINERY:</td>
            <td colspan="5">${renderFieldValue(formData.location_of_machinery)}</td>
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
            <td colspan="2">${renderFieldValue(formData.hyp_with)}</td>
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
            <th colspan="6">${formData.comments_on_equipment_heading}</th>
        </tr>
        <tr>
            <td>ASSET CLASSIFICATION:</td>
            <td colspan="2">${formData.asset_classification}</td>
            <td>MACHINE TECHNOLOGY:</td>
            <td colspan="2">${formData.machine_technology}</td>
        </tr>
        <tr>
            <td>CONTROL PANEL UNIT:</td>
            <td colspan="2">${formData.control_panel_unit}</td>
            <td>MACHINE CONDITION:</td>
            <td colspan="2">${formData.machine_condition}</td>
        </tr>
        <tr>
            <td>ELECTRICAL CONDITION:</td>
            <td colspan="2">${formData.electrical_condition}</td>
            <td>MECHANICAL CONDITION:</td>
            <td colspan="2">${formData.mechanical_condition}</td>
        </tr>
        ${
          formData.fix_but_flex_heading_1 &&
          formData.fix_but_flex_value_1 &&
          formData.fix_but_flex_heading_2 &&
          formData.fix_but_flex_value_2
            ? `<tr>
            <td>${formData.fix_but_flex_heading_1}:</td>
            <td colspan="2">${formData.fix_but_flex_value_1}</td>
            <td>${formData.fix_but_flex_heading_2}:</td>
            <td colspan="2">${formData.fix_but_flex_value_2}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_3 &&
          formData.fix_but_flex_value_3 &&
          formData.fix_but_flex_heading_4 &&
          formData.fix_but_flex_value_4
            ? `<tr>
            <td>${formData.fix_but_flex_heading_3}:</td>
            <td colspan="2">${formData.fix_but_flex_value_3}</td>
            <td>${formData.fix_but_flex_heading_4}:</td>
            <td colspan="2">${formData.fix_but_flex_value_4}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_5 &&
          formData.fix_but_flex_value_5 &&
          formData.fix_but_flex_heading_6 &&
          formData.fix_but_flex_value_6 &&
          formData.fix_but_flex_heading_7 &&
          formData.fix_but_flex_value_7
            ? `<tr>
            <td>${formData.fix_but_flex_heading_5}:</td>
            <td colspan="2" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_5}
                    </div>
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_6}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_6}
                    </div>
                </div>
            </td>
            <td>${formData.fix_but_flex_heading_7}:</td>
            <td colspan="2">${formData.fix_but_flex_value_7}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_8 &&
          formData.fix_but_flex_value_8 &&
          formData.fix_but_flex_heading_9 &&
          formData.fix_but_flex_value_9 &&
          formData.fix_but_flex_heading_10 &&
          formData.fix_but_flex_value_10
            ? `<tr>
            <td>${formData.fix_but_flex_heading_8}:</td>
            <td colspan="2" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_8}
                    </div>
                    <div style="flex: 2; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_9}
                    </div>
                </div>
            </td>
            <td style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_9}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_10}
                    </div>
                </div>
            </td>
            <td colspan="2">${formData.fix_but_flex_value_10}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_11 &&
          formData.fix_but_flex_value_11 &&
          formData.fix_but_flex_heading_12 &&
          formData.fix_but_flex_value_12
            ? `<tr>
            <td>${formData.fix_but_flex_heading_11}:</td>
            <td colspan="2">${renderFieldValue(formData.fix_but_flex_value_11)}</td>
            <td>${formData.fix_but_flex_heading_12}:</td>
            <td colspan="2">${formData.fix_but_flex_value_12}</td>
        </tr>`
            : ""
        }

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
            <th colspan="6">${formData.insurance_details_heading}</th>
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
            <th colspan="6">${formData.overall_feedback_heading}</th>
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
            <td colspan="5">${renderFieldValue(formData.valuer_comments_remarks)}</td>
        </tr>
        <tr>
            <td>DECLARATION:</td>
            <td colspan="5">
                ${renderFieldValue(formData.declaration)}
            </td>
        </tr>
        <tr>
            <td>DISCLAIMER:</td>
            <td colspan="5">${renderFieldValue(formData.disclaimer)}</td>
        </tr>
        ${generateFlexibleFieldsForSection(
          formData.flexible_fields || [],
          "OVER_ALL_FEED_BACK_OF_THE_INSPECTED"
        )}
        <tr class="signature-row">
            <td colspan="6" style="height: 48px; position: relative;">
                ${stampImageBase64 ? `<img src="${stampImageBase64}" alt="stamp" style="position:absolute; left:50%; bottom: -5px; transform:translateX(calc(-50% - 250px)); height: 125px; z-index:2; pointer-events:none;" />` : ""}
                SIGNATURE WITH SEAL & STAMP
            </td>
        </tr>
        </tbody>
        <tfoot>
            <tr class="footer-row">
                <td colspan="3" class="page-number">
                    <span class="page-number-value" data-page-number="">Page 1</span>
                </td>
                <td colspan="3" class="continue-text">
                    Continue to next page...
                </td>
            </tr>
            <tr class="spacer-row">
                <td colspan="6" style="height: var(--bottom-space); border: none; padding: 0;"></td>
            </tr>
        </tfoot>
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
