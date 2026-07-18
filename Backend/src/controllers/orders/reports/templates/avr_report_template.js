/**
 * Helper function to render HTML content from field values
 * Preserves HTML tags and converts line breaks to <br> tags
 * This is used by AVR report template
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
  stampImageBase64,
  reportTypeSelection
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
            display: none;
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
            text-align: left;
            font-size: 9.3px;
            text-transform: uppercase;
            width: 16.66%;
            word-wrap: break-word;
        }
        
       
        /* Blank row separator after heading on subsequent pages only */
        /* Hidden completely on screen/first page */
        thead .heading-separator-row {
            display: none;
        }
        
        @media print {
            /* In print mode, show the separator row (thead repeats on each page) */
            thead .heading-separator-row {
                display: table-row;
            }
            
            /* Hide on single-page reports (no continuation) */
            body.single-page thead .heading-separator-row {
                display: none !important;
            }
        }
        
        /* Alternative: Hide on screen view but show in print */
        @media screen {
            thead .heading-separator-row {
                display: none !important;
            }
        }
        
        ${reportTypeSelection === "Rough" ? `
        /* Watermark for Rough reports - appears on every page */
        .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.15);
            z-index: 9999;
            pointer-events: none;
            user-select: none;
            white-space: nowrap;
            font-family: Arial, sans-serif;
        }
        
        @media print {
            .watermark {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
            }
        }
        ` : ''}
    </style>
</head>
<body>
    ${reportTypeSelection === "Rough" ? '<div class="watermark">Rough</div>' : ''}
    <div class="content-wrapper">
        <table class="main-table" style="min-height: calc(100% - 225px);">
        <thead>
        <tr class="spacer-row">
            <td colspan="3" style="height: 225px; border: none; padding: 0;"></td>
        </tr>
            <tr>
                <td colspan="3">Ref. No. ${formData.ref_no_year}/${formData.ref_no_bank}/${formData.ref_no_code}/${formData.ref_no_month}${formData.ref_no_id}</td>
            </tr>
            <tr>
                <th style="width: 10%;">LAN No.:-</th>
                <td>${formData.lan_no || ""}</td>
                <td style="width: 10%;"><b>Date :-</b> ${formData.report_date || ""}</td>
            </tr>
            <tr>
                <td colspan="3">
                    <p style="margin: 0%;padding: 0%;text-align:center;font-weight:bold;text-decoration: underline;">
                        Post Disbursement Asset Verification Report</p>
                    <p style="margin: 0%;padding: 0%;">${formData.bank_name || ""}</p>
                    <p style="margin: 0%;padding: 0%;">${formData.branch_name || ""}, ${formData.state_name || ""}</p>
                    <p style="margin: 0%;padding: 0%;">Respected Sir / Madam,</p>
                    <p style="margin: 0 0 10px 0;padding: 0%;text-align:center;text-decoration: underline;">
                        SUB: VERIFICATION REPORT OF "${formData.model_number || ""}"</p>
                    <p style="margin: 0 0 10px 0;padding: 0%;text-align:center;text-decoration: underline;">
                        Kind Attention :- ${formData.officer_name || ""},${formData.officer_designation || ""}</p>
                    <p style="margin: 0 0 10px 0;padding: 0%;text-align:center;">
                        As Per Instruction Received From Bank, I Have Inspected The ${formData.inspected_item || ""} On The Date Of
                        "dated${formData.inspected_date || ""}" Lying At "${formData.inspection_address || ""}", I Have Report As Under.
                    </p>
                </td>
            </tr>
            <tr class="heading-separator-row">
                <th colspan="3">&nbsp;</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <th colspan="3">Case Details –</th>
            </tr>
            <tr>
                <th style="width: 10%;">Customer Name</th>
                <td colspan="2">${formData.customer_name || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Address - as per KYC</th>
                <td colspan="2">${renderFieldValue(formData.address_as_per_kyc || "")}</td>
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
                <td colspan="2">${formData.date_of_disbursement || "Not Available"}</td>
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
                <th style="width: 10%;">Invoice Price${formData.loan_amount ? " / Loan Amount" : ""}</th>
                <td colspan="2">${
                  formData.invoice_price && formData.loan_amount
                    ? `${formData.invoice_price} (${formData.invoice_price_in_word}) / ${formData.loan_amount} (${formData.loan_amount_in_word})`
                    : formData.invoice_price
                    ? `${formData.invoice_price} (${formData.invoice_price_in_word})`
                    : "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Lien of ${
                  formData.bank_name || "Bank"
                }</th>
                <td colspan="2">${formData.lien_of_bank || ""}</td>
            </tr>
            <tr>
                <th colspan="3">&nbsp;</th>
            </tr>
            <tr>
                <th colspan="3">Asset details –</th>
            </tr>
            <tr>
                <th style="width: 10%;">Asset # Chassis No. # Serial No. # Engine No.# Regn. No</th>
                <td colspan="2"># ${formData.model_name || "NOT AVAILABLE"} # CHASSIS NO. ${
                  formData.chassis_no || "NOT AVAILABLE"
                } # MACHINE SERIAL NO.
                    ${
                      formData.machine_serial_no || "NOT AVAILABLE"
                    } / ENGINE NO. ${
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
                <td colspan="2"> ${formData.installed_running || ""}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Installed Asset Whether Functional or Not</th>
                <td colspan="2"> ${
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
                <th style="width: 10%;">Invoice No./Purchase Order No./Quotation No.</th>
                <td colspan="2">${
                  formData.invoice_purchase_order_no || "NOT AVAILABLE"
                }</td>
            </tr>
            <tr>
                <th style="width: 10%;">Pro.Owner & Address</th>
                <td colspan="2">${renderFieldValue(formData.pro_owner_address || "")}</td>
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
                <td colspan="2">${formData.material_usefulness || "NOT AVAILABLE"}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Hour Meter Reading</th>
                <td colspan="2">${formData.hour_meter_reading || "NOT AVAILABLE"}</td>
            </tr>
            <tr>
                <th style="width: 10%;">Colour</th>
                <td colspan="2">${formData.colour || "NOT AVAILABLE"}</td>
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
                <td colspan="3">${renderFieldValue(formData.observation || "")}</td>
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
            <tr>
                ${
                formData.tyre_image_base64
                      ? `
                      <td colspan="2" style="border:none; text-align:center; vertical-align:top; position: relative; height: 85px; padding-top: 5px;">
                        <img src="${formData.tyre_image_base64}" alt="Chassis Print" style="height: 85px; max-width: 100%; object-fit: contain;">
                         <div style="position: absolute; left: 10px; bottom: 0; width: fit-content; height: fit-content;z-index:2;">
                          ${
                            stampImageBase64
                              ? `<img src="${stampImageBase64}" alt="stamp" style=" height: 125px;  pointer-events:none;" />`
                              : ""
                          }
                        </div>
                      </td>
                      `
                      : `<td colspan="2" style="height: 85px;border:none; position: relative; padding-top: 5px;">&nbsp;
                       <div style="position: absolute; left: 5px; bottom: 0; width: fit-content; height: fit-content;z-index:2;">
                        ${
                          stampImageBase64
                            ? `<img src="${stampImageBase64}" alt="stamp" style=" height: 125px;  pointer-events:none;" />`
                            : ""
                        }
                      </div>
                      </td>`
                }
                <th style="width: 10%;border:none; padding-top: 5px;">
                  Surveyor, Valuer & Loss Assessor<br/><br/>
                  ${formData.surveyor || ""}<br/><br/>
                  ${formData.valuer_name === "VALUETECH SOLUTIONS" ? "Licence No." : "License No."}:- ${formData.license_no || ""}<br/><br/>
                  ${formData.surveyor_location || ""}
                </th>
            </tr>
        </tbody>
        <tfoot>
            <tr class="footer-row">
                <td colspan="2" class="page-number">
                    <span class="page-number-value" data-page-number="">Page 1</span>
                </td>
                <td class="continue-text">
                    Continue to next page...
                </td>
            </tr>
            <tr class="spacer-row">
                <td colspan="3" style="height: 10px; border: none; padding: 0;"></td>
            </tr>
        </tfoot>
    </table>
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
