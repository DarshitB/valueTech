/**
 * Helper function to render HTML content from field values
 * Preserves HTML tags and converts line breaks to <br> tags
 * This is used by CE report template and its helper functions
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

const isNotApplicable = (value) =>
  typeof value === "string" && value.trim().toLowerCase() === "not applicable";

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
function generateCEReportHTML(formData, extraData, bgImageBase64, stampImageBase64, reportTypeSelection) {
  const registrationNo = formData.registration_no;
  const registrationDateRaw = formData.registration_date;
  const registeredLocation = formData.registered_location;
  const showRegistrationSection = ![
    registrationNo,
    registrationDateRaw,
    registeredLocation,
  ].some(isNotApplicable);
  const registrationDateDisplay =
    registrationDateRaw === "00-00-0000" ? "NA" : registrationDateRaw;

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
            text-align: center;
            font-size: 9.3px;
            text-transform: uppercase;
            width: 16.66%;
            word-wrap: break-word;
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
        <table style="min-height: calc(100% - 225px);">
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
            <td style="text-transform: uppercase;">${formData.report_date_heading}:</td>
            <td colspan="2">${formData.rev_report_date}</td>
        </tr>
        </thead>
        <tbody>
        <tr>
            <td>VALUER NAME:</td>
            <td colspan="2">${formData.valuer_name}</td>
            <td>${formData.valuer_name === "VALUETECH SOLUTIONS" ? "Licence No." : "SLA NO:"}</td>
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
        ${
          showRegistrationSection
            ? `
        <tr>
            <td>REGISTRATION NO:</td>
            <td colspan="2">${registrationNo}</td>
            <td>REGISTRATION DATE:</td>
            <td colspan="2">${registrationDateDisplay}</td>
        </tr>
        <tr>
            <td>REGISTERED LOCATION:</td>
            <td colspan="5">${registeredLocation}</td>
        </tr>`
            : ""
        }
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
            <td>${formData.engine_no_heading || "ENGINE NO./ DETAIL:"}</td>
            <td colspan="2">${formData.engine_no_detail}</td>
            <td>${formData.chassis_no_heading || "CRANE CHASSIS NO:"}</td>
            <td colspan="2">${formData.crane_chassis_no}</td>
        </tr>
        <tr>
            <td>BODY TYPE:</td>
            <td colspan="2">${formData.body_type}</td>
            <td>FUEL TYPE:</td>
            <td colspan="2">${formData.crane_model_code || "N/A"}</td>
        </tr>
        <tr>
            <td>HOURS METER READING:</td>
            <td colspan="2">${formData.hours_meter_reading}</td>
            <td style="text-transform: uppercase;">${formData.invoice_no_heading || "INVOICE NO. & DATE:"}</td>
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
            <th colspan="6">${formData.comments_on_equipment_heading}</th>
        </tr>
        <tr>
            <td>ASSET CLASSIFICATION:</td>
            <td colspan="2">${formData.asset_classification}</td>
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
            <td>${formData.machine_weight_heading || "GROSS MACHINE WEIGHT:"}</td>
            <td colspan="2">${formData.gross_machine_weight}</td>
        </tr>
        ${
          formData.fix_but_flex_heading_1 &&
          formData.fix_but_flex_value_1 &&
          formData.fix_but_flex_heading_2 &&
          formData.fix_but_flex_value_2 &&
          formData.fix_but_flex_heading_3 &&
          formData.fix_but_flex_value_3
            ? `<tr>
            <td>${formData.fix_but_flex_heading_1}</td>
            <td>${formData.fix_but_flex_value_1}</td>
            <td>${formData.fix_but_flex_heading_2}</td>
            <td>${formData.fix_but_flex_value_2}</td>
            <td>${formData.fix_but_flex_heading_3}</td>
            <td>${formData.fix_but_flex_value_3}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_title_1 &&
          formData.fix_but_flex_title_2 &&
          formData.fix_but_flex_title_3
            ? `<tr>
            <td colspan="2">${formData.fix_but_flex_title_1}</td>
            <td colspan="2">${formData.fix_but_flex_title_2}</td>
            <td colspan="2">${formData.fix_but_flex_title_3}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_4 &&
          formData.fix_but_flex_value_4 &&
          formData.fix_but_flex_heading_5 &&
          formData.fix_but_flex_value_5 &&
          formData.fix_but_flex_heading_6 &&
          formData.fix_but_flex_value_6
            ? `<tr>
            <td>${formData.fix_but_flex_heading_4}</td>
            <td>${formData.fix_but_flex_value_4}</td>
            <td>${formData.fix_but_flex_heading_5}</td>
            <td>${formData.fix_but_flex_value_5}</td>
            <td>${formData.fix_but_flex_heading_6}</td>
            <td>${formData.fix_but_flex_value_6}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_7 &&
          formData.fix_but_flex_value_7 &&
          formData.fix_but_flex_heading_8 &&
          formData.fix_but_flex_value_8 &&
          formData.fix_but_flex_heading_9 &&
          formData.fix_but_flex_value_9
            ? `<tr>
            <td>${formData.fix_but_flex_heading_7}</td>
            <td>${formData.fix_but_flex_value_7}</td>
            <td>${formData.fix_but_flex_heading_8}</td>
            <td>${formData.fix_but_flex_value_8}</td>
            <td>${formData.fix_but_flex_heading_9}</td>
            <td>${formData.fix_but_flex_value_9}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_10 &&
          formData.fix_but_flex_value_10 &&
          formData.fix_but_flex_heading_11 &&
          formData.fix_but_flex_value_11 &&
          formData.fix_but_flex_heading_12 &&
          formData.fix_but_flex_value_12
            ? `<tr>
            <td>${formData.fix_but_flex_heading_10}</td>
            <td>${formData.fix_but_flex_value_10}</td>
            <td>${formData.fix_but_flex_heading_11}</td>
            <td>${formData.fix_but_flex_value_11}</td>
            <td>${formData.fix_but_flex_heading_12}</td>
            <td>${formData.fix_but_flex_value_12}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_top_heading_13 &&
          formData.fix_but_flex_heading_13 &&
          formData.fix_but_flex_value_13 &&
          formData.fix_but_flex_heading_14 &&
          formData.fix_but_flex_value_14 &&
          formData.fix_but_flex_heading_15 &&
          formData.fix_but_flex_value_15
            ? `<tr>
            <td>${formData.fix_but_flex_top_heading_13}</td>
            <td colspan="5" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_13}
                    </div>
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_13}
                    </div>
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_14}
                    </div>
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_14}
                    </div>
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_15}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_15}
                    </div>
                </div>
            </td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_16 &&
          formData.fix_but_flex_value_16 &&
          formData.fix_but_flex_heading_17 &&
          formData.fix_but_flex_value_17
            ? `<tr>
            <td>${formData.fix_but_flex_heading_16}</td>
            <td colspan="2">${formData.fix_but_flex_value_16}</td>
            <td>${formData.fix_but_flex_heading_17}</td>
            <td colspan="2">${formData.fix_but_flex_value_17}</td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_18 &&
          formData.fix_but_flex_value_18 &&
          formData.fix_but_flex_heading_19 &&
          formData.fix_but_flex_value_19 &&
          formData.fix_but_flex_heading_20 &&
          formData.fix_but_flex_value_20
            ? `<tr>
            <td>${formData.fix_but_flex_heading_18}</td>
            <td colspan="2" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_18}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_19}
                    </div>
                </div>
            </td>
            <td>${formData.fix_but_flex_value_19}</td>
            <td colspan="2" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_20}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_20}
                    </div>
                </div>
            </td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_21 &&
          formData.fix_but_flex_value_21 &&
          formData.fix_but_flex_heading_22 &&
          formData.fix_but_flex_value_22 &&
          formData.fix_but_flex_heading_23 &&
          formData.fix_but_flex_value_23
            ? `<tr>
            <td>${formData.fix_but_flex_heading_21}</td>
            <td colspan="2" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_21}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_22}
                    </div>
                </div>
            </td>
            <td>${formData.fix_but_flex_value_22}</td>
            <td colspan="2" style="padding: 0; margin: 0;">
                <div style="display: flex; width: 100%; height: 100%;">
                    <div style="flex: 1; border-right: 1px solid #000; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_heading_23}
                    </div>
                    <div style="flex: 1; padding: 1.5px; text-align: center; font-size: 9.3px; text-transform: uppercase;">
                        ${formData.fix_but_flex_value_23}
                    </div>
                </div>
            </td>
        </tr>`
            : ""
        }
        ${
          formData.fix_but_flex_heading_24 &&
          formData.fix_but_flex_value_24 &&
          formData.fix_but_flex_heading_25 &&
          formData.fix_but_flex_value_25
            ? `<tr>
            <td>${formData.fix_but_flex_heading_24}</td>
            <td colspan="2">${formData.fix_but_flex_value_24}</td>
            <td>${formData.fix_but_flex_heading_25}</td>
            <td colspan="2">${formData.fix_but_flex_value_25}</td>
        </tr>`
            : ""
        }
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
            <th colspan="6">${formData.rc_permit_tax_fitness_insurance_heading}</th>
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
            <th colspan="6">${formData.overall_feedback_heading}</th>
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
            <td>${formData.fair_market_value_heading || "FAIR MARKET VALUE:"}</td>
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
            <td colspan="5" style="text-transform: none;">THIS REPORT IS GENERATED BY THE ${formData.valuer_name} AT THE SOLE REQUEST OF ${ extraData.bank_name } WHOM, THIS VALUATION REPORT IS ADDRESSED AND IS TO BE USED SOLELY BY THE SAID PARTY FOR THE STATED PURPOSE ONLY. ${formData.valuer_name} WILL NOT BE HELD LIBLE FOR ANY LOSS OR LIABLITY SUSTAINED BY ANY PARTY RELYING ON THIS VALUATION REPORT. ${formData.valuer_name} HAS RELIED ON THE DATA PROVIDED BY THE CLIENT & HAS NOT VERIFIED GENIUNENESS THEREOFF. AS THERE IS NO STANDARD PRICE LIST FOR PRE-OWNED/USED MACHINERY / CRANE, THIS VALUATION INDICATED IN THE REPORT IS OUR PROFESSIONAL OPINION ONLY ON THE MARKET VALUE OF THE PRODUCT SHOWN IN COLLAGE OR IN DETAILS BASED ON STANDARD VALUATION METHODOLOGY & PROCEDURES CALCULATING FLUCTUATIONS & LIMITATIONS OF VALUATED PRODUCTS. ACUAL REALISATION MAY DIFFER FROM THE VALUATION INDICATED IN THE REPORT. ${formData.valuer_name} (SIGNATORY & EMPLOYEES WILL NOT BE HELD LIABLE FOR ANY DIRECT, INDIRECT CONSEQUENTIAL OR EXEMPLARY DAMEGES FOR ANY LOSS RESULTING FROM THE USE OF THIS REPORT. ${formData.valuer_name} IS NOT RESPONSIBLE FOR VERIFYING THE GENUINENESS OF THE PROVIDED DOCUMENTS. THE VALUATION OF ASSET IS PRIMARILY BASED ON THE CONDITION OF THE MACHINERY AT THE TIME OF INSPECTION & SURVEY. TO GIVE LOAN TO THE APPLICANT IS THE RESPONSIIBLITY OF THE FINANCE COMPANY/BANK. WE ARE NOT RESPONSIBLE OR CONCERNED FOR THE SAME.
            </td>
        </tr>
        <tr class="tyre-image-row">
            <td colspan="6" style="height: 58px; position: relative;">
                ${
                  formData.tyre_image_base64
                    ? `<img src="${formData.tyre_image_base64}" style="height: 70px; position: relative; z-index:1;" alt="">`
                    : ""
                }
            </td>
        </tr>
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
          <td colspan="${valueColSpan}">${renderFieldValue(field.field_value || "")}</td>
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
