/**
 * Helper function to render HTML content from field values
 * Preserves HTML tags and converts line breaks to <br> tags
 * This is used by both generateMarineReportHTML and generateFlexibleFieldsForSection
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
 * Marine Report Template
 * This template generates HTML for Marine reports
 *
 * @param {Object} formData - Form data for the report
 * @param {Object} extraData - Extra data (bank info, categories, etc.)
 * @param {string} bgImageBase64 - Background image as base64
 * @param {string|null} stampImageBase64 - Optional stamp image (base64)
 * @returns {string} HTML content
 */
function generateMarineReportHTML(
  formData,
  extraData,
  bgImageBase64,
  stampImageBase64,
  reportTypeSelection
) {
  // Helper function to get value safely
  const getValue = (field) => field || "";

  // Helper function to convert number to word (e.g., 1 -> ONE, 2 -> TWO)
  const numberToWord = (num) => {
    const ones = [
      "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
      "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
      "SEVENTEEN", "EIGHTEEN", "NINETEEN"
    ];
    const tens = [
      "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"
    ];

    if (num === 0) return "ZERO";
    if (num < 20) return ones[num];
    if (num < 100) {
      const ten = Math.floor(num / 10);
      const one = num % 10;
      return one === 0 ? tens[ten] : `${tens[ten]} ${ones[one]}`;
    }
    if (num < 1000) {
      const hundred = Math.floor(num / 100);
      const remainder = num % 100;
      return remainder === 0 
        ? `${ones[hundred]} HUNDRED` 
        : `${ones[hundred]} HUNDRED ${numberToWord(remainder)}`;
    }
    // For numbers 1000+, return the number as-is (or extend this logic)
    return num.toString();
  };

  // Helper function to format number as "2 (TWO)"
  const formatNumberWithWord = (numValue) => {
    if (!numValue && numValue !== 0) return "";
    const num = parseInt(numValue);
    if (isNaN(num)) return numValue; // Return original if not a number
    const word = numberToWord(num);
    return `${num} (${word})`;
  };

  // Helper function to format date from DD-MM-YYYY to "Aug 24, 2024" format
  const formatDateToMonthDayYear = (dateValue) => {
    if (!dateValue) return "";
    
    try {
      // Check if date is in DD-MM-YYYY format
      const ddmmyyyyPattern = /^(\d{2})-(\d{2})-(\d{4})$/;
      const match = dateValue.match(ddmmyyyyPattern);
      
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JavaScript months are 0-indexed
        const year = parseInt(match[3], 10);
        
        const date = new Date(year, month, day);
        if (isNaN(date.getTime())) return dateValue; // Return original if invalid date
        
        const monthNames = [
          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        
        return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
      }
      
      // If not DD-MM-YYYY format, try parsing as standard date
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return dateValue; // Return original if invalid date
      
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      
      return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } catch (error) {
      return dateValue; // Return original if parsing fails
    }
  };

  // Helper function to format date as "00TH .MONTH NAME. YEAR" (e.g., "15TH .JANUARY. 2024")
  const formatDateWithOrdinal = (dateValue) => {
    if (!dateValue) return "";
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return dateValue; // Return original if invalid date
      
      const day = date.getDate();
      const monthNames = [
        "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
        "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
      ];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      
      // Get ordinal suffix (ST, ND, RD, TH)
      let suffix = "TH";
      if (day === 1 || day === 21 || day === 31) {
        suffix = "ST";
      } else if (day === 2 || day === 22) {
        suffix = "ND";
      } else if (day === 3 || day === 23) {
        suffix = "RD";
      }
      
      // Format: "00TH .MONTH NAME. YEAR"
      const dayStr = day.toString().padStart(2, "0");
      return `${dayStr}${suffix} .${month}. ${year}`;
    } catch (error) {
      return dateValue; // Return original if parsing fails
    }
  };

  // Helper function to get the correct official/IMO/Regd number based on imo_official_regd_no
  const getOfficialOrImoRegdNo = () => {
    const imoOfficialRegdNo = getValue(formData.imo_official_regd_no).toUpperCase();
    if (imoOfficialRegdNo.includes("IMO NO") || imoOfficialRegdNo.includes("REGD. NO") || imoOfficialRegdNo.includes("REGD NO")) {
      return {
        label: getValue(formData.imo_official_regd_no),
        value: getValue(formData.imo_or_regd_no)
      };
    } else if (imoOfficialRegdNo.includes("OFFICIAL NO")) {
      return {
        label: "OFFICIAL NO.",
        value: getValue(formData.official_no)
      };
    }
    // Default fallback
    return {
      label: "OFFICIAL NO.",
      value: getValue(formData.official_no)
    };
  };

  // Helper to generate table rows for main particulars
  const generateTableRow = (
    label,
    value,
    labelWidth = "40%",
    valueWidth = "50%"
  ) => {
    // Check if value is empty/null/undefined - if so, hide the row
    if (!value || value === "null" || value === "undefined" || (typeof value === "string" && value.trim() === "")) {
      return "";
    }
    // Render field value with HTML support
    const renderedValue = renderFieldValue(value);
    return `
            <tr>
                <td width="${labelWidth}" class="text-uppercase">${label}</td>
                <td width="10%" style="text-align: center;">:</td>
                <td width="${valueWidth}">${renderedValue}</td>
            </tr>
        `;
  };

  // Helper to format value with unit only if value exists
  const formatValueWithUnit = (value, unit) => {
    const val = getValue(value);
    if (!val || val === "null" || val === "undefined") return "";
    return val + " " + unit;
  };

  // ============================================
  // DYNAMIC COUNTER SYSTEM
  // ============================================
  // Counters track sections that are actually rendered (have data)
  let mainCounter = 0;           // For main-counter sections (1.0, 2.0, 3.0...)
  let currentMainCounter = 0;     // Current main section number for sub-counters
  let subCounterMap = {};         // Map to track sub-counter per main section: {1: 0, 3: 0, ...}
  let subCounterSuffixMap = {};   // Map to track suffix letters (A, B, C...) for sub-counters: {1: {6: 'A'}, ...}

  // Helper to get next main-counter value (only increments if section has data)
  const getNextMainCounter = () => {
    mainCounter++;
    currentMainCounter = mainCounter;
    // Initialize sub-counter for this main section
    if (!subCounterMap[mainCounter]) {
      subCounterMap[mainCounter] = 0;
      subCounterSuffixMap[mainCounter] = {};
    }
    return `${mainCounter}.0`;
  };

  // Helper to get next sub-counter value for current main section
  const getNextSubCounter = () => {
    if (!subCounterMap[currentMainCounter]) {
      subCounterMap[currentMainCounter] = 0;
      subCounterSuffixMap[currentMainCounter] = {};
    }
    subCounterMap[currentMainCounter]++;
    return `${currentMainCounter}.${subCounterMap[currentMainCounter]}`;
  };

  // Helper to get sub-counter with suffix (A, B, C...) for the current sub-counter number
  const getSubCounterWithSuffix = (suffix = 'A') => {
    if (!subCounterMap[currentMainCounter]) {
      subCounterMap[currentMainCounter] = 0;
      subCounterSuffixMap[currentMainCounter] = {};
    }
    const currentSubNum = subCounterMap[currentMainCounter];
    // Track which suffix we're using for this sub-counter number
    if (!subCounterSuffixMap[currentMainCounter][currentSubNum]) {
      subCounterSuffixMap[currentMainCounter][currentSubNum] = suffix;
    } else {
      // If suffix already exists, get next available suffix
      const existingSuffix = subCounterSuffixMap[currentMainCounter][currentSubNum];
      const nextSuffix = String.fromCharCode(existingSuffix.charCodeAt(0) + 1);
      subCounterSuffixMap[currentMainCounter][currentSubNum] = nextSuffix;
      return `${currentMainCounter}.${currentSubNum} ${nextSuffix}.`;
    }
    return `${currentMainCounter}.${currentSubNum} ${suffix}.`;
  };

  // Helper to check if a section has data (used before incrementing counters)
  const sectionHasData = (content) => {
    if (!content) return false;
    const trimmed = typeof content === 'string' ? content.trim() : '';
    return trimmed !== '' && trimmed !== 'null' && trimmed !== 'undefined';
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marine Report Template</title>
    <style>
        body {
            font-family: sans-serif;
            padding: 0px;
            margin: 0px;    
            box-sizing: border-box;
        }

        /* Prevent text breaking */
        p,
        div,
        span,
        td,
        th {
            orphans: 3;
            widows: 3;
        }

        /* Prevent breaking in the middle of words */
        * {
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        /* A4 Page Container */
        .page {
            width: 210mm;
            height: 297mm;
            margin: 0 auto 20px auto;
            padding: 50mm 50px 58px 50px;
            background: white url('${
              bgImageBase64 || ""
            }') no-repeat center center;
            background-size: contain;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            position: relative;
            page-break-after: always;
            overflow: hidden;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }

        .page::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('${bgImageBase64 || ""}') no-repeat center center;
            background-size: contain;
            z-index: 0;
            opacity: 1;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }

        .page-content {
            position: relative;
            height: calc(297mm - 50mm - 58px - 20px);
            z-index: 1;
            background: transparent;
            overflow: hidden;
        }

        /* Stamp Overlay - appears on all pages */
        .stamp-overlay {
            position: absolute;
            z-index: 5;
            pointer-events: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }

        /* First page stamp - bottom left corner of vessel image (half on image, half outside) */
        .first-page .stamp-overlay {
            left: 80px;
            top: 640px;
            width: 180px;
            height: 180px;
            opacity: 1;
        }

        /* Subsequent pages stamp - right bottom corner (above footer) */
        .subsequent-page .stamp-overlay {
            right: 40px;
            bottom: 30px;
            width: 120px;
            height: 120px;
            opacity: 1;
             z-index: 10000;
        }

        .stamp-overlay img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        /* Last page declaration section */
        .last-page-declaration {
            margin-top: 30px;
            margin-bottom: 20px;
            position: relative;
            z-index: 2;
        }

        .last-page-declaration .declaration-text {
            text-align: left;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 0;
            text-transform: uppercase;
        }

        /* .last-page-declaration .stamp-signature {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 20px;
        }
 */
        .last-page-declaration .stamp-signature .left-stamp {
            width: 150px;
            height: 150px;
            opacity: 1;
        }

        .last-page-declaration .stamp-signature .left-stamp img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .last-page-declaration .stamp-signature .right-text {
            text-align: left;
            font-size: 13px;
            font-weight: bold;
            line-height: 1.5;
        }

        /* First Page Specific Styles */
        .first-page {
            border: 1px solid #ddd;
        }

        .first-page .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 2px solid #000;
            position: relative;
            z-index: 2;
            background: rgba(255, 255, 255, 0.95);
            padding: 15px;
            margin: 0 0 30px 0;
        }

        .first-page .header h1 {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .first-page .header .subtitle {
            font-size: 14px;
            color: #666;
        }

        .first-page .report-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(249, 249, 249, 0.95);
            border: 1px solid #ddd;
            position: relative;
            z-index: 2;
        }

        .first-page .report-info .info-item {
            flex: 1;
        }

        .first-page .report-info .info-label {
            font-weight: bold;
            font-size: 11px;
            color: #555;
            margin-bottom: 5px;
        }

        .first-page .report-info .info-value {
            font-size: 12px;
        }

        /* Report Hero Page - MUST always stay on first page and occupy entire page */
        .report-hero-page {
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: always;
            break-after: always;
            position: relative;
            z-index: 2;
            margin-bottom: 0;
            display: grid;
            grid-template-rows: 1fr auto; /* top fills remaining, bottom stays content height */
            row-gap: 0;
            /* Fill available space to occupy entire first page */
            min-height: calc(297mm - 50mm - 58px - 20px);
            height: calc(297mm - 50mm - 58px - 20px);
            overflow: hidden; /* prevent spill if content exceeds */
        }

        /* report-hero-page-second: occupies only its content height */
        .report-hero-page-second {
            border: 3px solid black;
            margin-bottom: 5px;
        }

        /* report-hero-page-first: occupies rest of the space */
        .report-hero-page-first {
            border: 4px solid black;
            margin-bottom: 5px;
            padding: 30px 60px;
            display: flex;
            flex-direction: column;
            min-height: 0; /* allow shrink inside grid */
        }

        /* Subsequent Pages */
        /* .subsequent-page uses same padding as .page class (50mm top) */

        .subsequent-page .page-header {
            border-bottom: 1px solid #ccc;
            padding-bottom: 10px;
            margin-bottom: 20px;
            font-size: 10px;
            color: #666;
        }

        h1 {
            font-size: 18px;
            text-transform: uppercase;
        }

        h2 {
            font-size: 16px;
            text-transform: uppercase;
        }

        h3 {
            font-size: 14px;
        }

        h4,
        h5,
        h6 {
            font-size: 13px;
        }

        /* Paragraphs */
        p {
            font-size: 14px;
            line-height: 1.2;
            margin-bottom: 10px;
            orphans: 2;
            widows: 2;
            position: relative;
            z-index: 2;
        }

        /* For short paragraphs, try to keep them together */
        p:has(+ p) {
            page-break-after: avoid;
        }

        /* Images */
        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 15px 0;
            page-break-inside: avoid;
            break-inside: avoid;
            position: relative;
            z-index: 2;
        }

        /* Tables - Allow breaking across pages */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            page-break-inside: auto;
            break-inside: auto;
        }

        table th,
        table td {
            padding: 8px;
            text-align: left;
            page-break-inside: avoid;
            break-inside: avoid;
            font-size: 14px;
            line-height: 1.2;
        }

        /* Border table class for strong black borders */
        table.border-table,
        table.border-table th,
        table.border-table td {
            border: 1px solid #000 !important;
        }

        /* Nested tables */
        table table {
            margin: 0;
            border-collapse: collapse;
        }

        table td table {
            width: 100%;
        }

        table td table td {
            padding: 4px;
            font-size: 13px;
        }

        /* Table rows can break between pages but stay together individually */
        table tr {
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: auto;
            page-break-before: auto;
        }

        table thead {
            display: table-header-group;
        }

        table tbody {
            display: table-row-group;
        }

        table tfoot {
            display: table-footer-group;
        }

        /* Footer */
        .footer {
            position: absolute;
            bottom: 25px;
            left: 50px;
            right: 50px;
            border-top: 1px solid #e0e0e0;
            padding-top: 8px;
            font-size: 10px;
            z-index: 11;
            background: rgba(255, 255, 255, 0.9);
            padding: 8px 10px;
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

        .footer .page-number .separator {
            color: #000;
        }

        .footer .page-number .label {
            color: #999;
            font-weight: normal;
        }

        /* Print Styles */
        @media print {
            body {
                background: white;
            }

            .page {
                margin: 0;
                box-shadow: none;
                page-break-after: always;
                padding: 50mm 50px 58px 50px;
                background: white url('${
                  bgImageBase64 || ""
                }') no-repeat center center;
                background-size: contain;
                height: 297mm;
                width: 210mm;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
            }

            .page::before {
                display: block;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .page:last-child {
                page-break-after: auto;
            }

            /* Ensure stamp prints on all pages */
            .stamp-overlay {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }

            .first-page .stamp-overlay {
                left: 80px;
                top: 640px;
                opacity: 1;
            }

            .subsequent-page .stamp-overlay {
                right: 50px;
                bottom: 30px;
                opacity: 1;
                z-index: 10000;
            }

            .last-page-declaration {
                page-break-inside: avoid;
            }

            .last-page-declaration .stamp-signature .left-stamp {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .footer {
                left: 50px;
                right: 50px;
                bottom: 25px;
                background: rgba(255, 255, 255, 0.95);
                z-index: 11;
            }

            /* Ensure no content is cut in print */
            h1,
            h2,
            h3,
            h4,
            h5,
            h6 {
                page-break-inside: avoid;
                break-inside: avoid;
                page-break-after: avoid;
            }

            table {
                page-break-inside: auto;
                break-inside: auto;
            }

            table tr {
                page-break-inside: avoid;
                break-inside: avoid;
                page-break-after: auto;
                page-break-before: auto;
            }

            p {
                page-break-inside: avoid;
                break-inside: avoid;
            }

            /* Report Hero Page - MUST always stay on first page in print and occupy entire page */
            .report-hero-page {
                page-break-inside: avoid;
                break-inside: avoid;
                page-break-after: always;
                break-after: always;
                display: flex;
                flex-direction: column;
                min-height: calc(297mm - 50mm - 58px - 20px);
                height: calc(297mm - 50mm - 58px - 20px);
            }

            .report-hero-page-second {
                flex-shrink: 0;
                flex-grow: 0;
            }

            .report-hero-page-first {
                flex-grow: 1;
            }

            @page {
                size: A4;
                margin: 0;
            }

            /* Force backgrounds and images to print */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }
        }

        /* Utility Classes */
        .text-center {
            text-align: center;
        }

        .text-right {
            text-align: right;
        }

        .mb-10 {
            margin-bottom: 10px;
        }

        .mb-20 {
            margin-bottom: 20px;
        }

        .mt-20 {
            margin-top: 20px;
        }

        .bold {
            font-weight: bold;
        }

        .underline {
            text-decoration: underline;
        }


        .text-uppercase {
            text-transform: uppercase;
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
    <!-- ============================================
         INSTRUCTIONS FOR HTML CONTENT:
         ============================================
         Copy ALL HTML content from marine_report_template.html
         Starting from the opening <body> tag to just before the closing </body> tag
         Paste it here, replacing this comment block
         ============================================
         The HTML should include:
         - PDF controls button (if any)
         - First page div with class "page first-page"
         - Report hero page content
         - All main content sections
         - All tables and headings
         - Footer div
         - BUT NOT the <script> tags (those go in the next section)
         ============================================
         IMPORTANT: Keep the structure exactly as in the HTML file
         We will replace dynamic data in the next step
         ============================================
    -->
    
    <!-- PLACEHOLDER: Paste HTML body content from marine_report_template.html here -->
    <!-- Copy from <body> opening tag content to just before </body> closing tag -->
    <!-- Do NOT include the <script> tags - those go in the section below -->
    
      <!-- First Page -->
    <div class="page first-page" data-page="1">
        <!-- Stamp Overlay on First Page -->
        ${
          stampImageBase64
            ? `<div class="stamp-overlay">
            <img src="${stampImageBase64}" alt="Stamp">
        </div>`
            : ""
        }
        <div class="page-content">
            <div class="report-hero-page">
                <div class="report-hero-page-first">
                    <h2
                        style="text-align: center;font-size: 25px;font-weight: bold;text-transform: uppercase;text-decoration: underline;margin-bottom: 15px;">
                        ${getValue(
                          formData.report_title_type || formData.report_title
                        )}</h2>
                    <p
                        style="text-align: center;font-size: 25px;text-decoration: underline;line-height: 1.2;margin-bottom: 15px;">
                        ${getValue(formData.report_title)}
                        <br>
                        "<b>
                            ${getValue(formData.name_of_the_vessel)}
                        </b>"
                        <br>
                        "Official No. "<b>${getValue(formData.official_no)}</b>"
                        <br>
                        ${getValue(formData.imo_or_regd_type)} "<b>${getValue(
    formData.imo_or_regd_no
  )}</b>"
                    </p>
                    <div style="width: 100%;height: 350px; max-height: 350px;margin-bottom: 20px;">
                        ${
                          formData.vessel_photo_preview || formData.vessel_photo
                            ? `<img src="${
                                formData.vessel_photo_preview ||
                                formData.vessel_photo
                              }" alt="Marine Vessel"
                            style="width: 100%;height: 100%;max-height: 100%;object-fit: contain;">`
                            : ""
                        }
                    </div>
                    <div style="min-width: 300px;max-width: 300px;margin: 0 auto;border: 1px solid black;padding: 10px;">
                        <p style="font-size: 14px;line-height: 1.2;text-align: center;margin-bottom: 0;">
                            On request of
                            <br>
                            <b style="font-size: 16px;">
                                ${getValue(formData.client_city_state_name)}
                            </b>
                        </p>
                    </div>
                </div>
                <div class="report-hero-page-second">
                ${
                  (() => {
                    const raw = (getValue(formData.execute_above) || "").trim();
                    const lower = raw.toLowerCase();
                    const letter =
                      lower === "desktop valuation"
                        ? `To execute above desktop valuation by marine valuer Valuetech Solutions (Viraj Kothari) with Licence No. CAT-VII-A-6019, CAT-XIII-A-6020 has been taken the task of desktop valuation for Marine Vessel - ${getValue(formData.name_of_the_vessel)} on the basis of desktop assessment, class certification, engine overhauling report & status survey report provided by client shared in soft copy. Also completed the study of entire vessel documents that was previously located ${getValue(formData.inspection_location_front_page)}, on ${getValue(formData.inspection_date_front_page)} information received from client. Above report has been furnished under his guidance & expertise only, kindly note that above valuation consists of their attestation as per international valuation standard. Above report has sign & stamp as required in the format.`
                        : lower === "physical survey & inspection"
                        ? `To execute above physical survey & inspection valuation by valuer Valuetech Solutions (Viraj Kothari with Licence No. CAT-VII-A-6019, CAT-XIII-A-6020 has been taken the task of survey & inspection valuation for Marine Vessel - ${getValue(formData.name_of_the_vessel)} on the basis of physical survey & inspection, class reports, certification, engine overhauling report, status survey report provided by client and information shared in soft copy. Also completed the study of entire vessel located at ${getValue(formData.inspection_location_front_page)}, on ${getValue(formData.inspection_date_front_page)}. Above report has been furnished under his guidance & his expertise only, which kindly note that above valuation also consist their attestation as per international valuation standard. Above report has sign & stamp as required in the format.`
                        : lower === "condition valuation"
                        ? `To execute above condition valuation by valuer Valuetech Solutions (Viraj Kothari with Licence No. CAT-VII-A-6019, CAT-XIII-A-6020 has been taken the task of survey & inspection condition valuation for Marine Vessel - ${getValue(formData.name_of_the_vessel)} on the basis of physical survey & inspection, class reports, certification, engine overhauling report, status survey report provided by client and information shared in soft copy. Also completed the study of entire vessel located at ${getValue(formData.inspection_location_front_page)}, on ${getValue(formData.inspection_date_front_page)}. Above report has been furnished under his guidance & his expertise only, which kindly note that above conditional valuation also consist their attestation as per international valuation standard. Above report has sign & stamp as required in the format.`
                        : lower === "marine vessel verification (avr)"
                        ? `To execute above marine asset verification by valuer Valuetech Solutions (Viraj Kothari with Licence No. CAT-VII-A-6019, CAT-XIII-A-6020 has been taken the task of survey & inspection asset verification for Marine Vessel - ${getValue(formData.name_of_the_vessel)} on the basis of physical survey & inspection, class reports, certification, engine overhauling report, status survey report provided by client and information shared in soft copy. Also completed the study of entire vessel located at ${getValue(formData.inspection_location_front_page)}, on ${getValue(formData.inspection_date_front_page)}. Above report has been furnished under his guidance & his expertise only, which kindly note that above conditional valuation also consist their attestation as per international valuation standard. Above report has sign & stamp as required in the format.`
                        : "";                    
                    return `
                    <p style="font-size: 13px;line-height: 1.2;text-align: center;margin-bottom: 0;margin-top: 0;">
                        ${letter}
                    </p>`;
                  })()
                }
                </div>
            </div>

            <!-- Main Content Area - Use direct HTML elements -->
            <p style="display: flex;gap: 10px;align-items: center;justify-content: space-between;">
                <span>REF. NO.${getValue(formData.ref_no_year)}/${getValue(
    formData.ref_no_bank
  )}/${getValue(formData.state_initial)}/${getValue(formData.ref_no_code)}/${getValue(formData.ref_no_month)}${getValue(formData.ref_no_id)}</span>
                <span><span style="text-transform: uppercase;">${getValue(formData.report_date_heading)}:</span> ${getValue(formData.report_date)}</span>
            </p>

            <h4
                style="text-align: center;font-size: 16px;font-weight: bold;text-transform: uppercase;text-decoration: underline;margin-bottom: 15px;">
                 VALUATION SURVEY REPORT FOR ${getValue(
                   formData.purpose_of_valuation
                 )} OF
                ${getValue(formData.type_or_description_of_vessel)} 
                "${getValue(formData.name_of_the_vessel)}", OFFICIAL NO. : 
                ${getValue(formData.official_no)}</h4>

                ${
                  (() => {
                    const raw = (getValue(formData.execute_above) || "").trim();
                    const lower = raw.toLowerCase();
                    const letter =
                      lower === "desktop valuation"
                        ? `This is to certify that we, the undersigned surveyors did desktop valuation through desktop assessment through documents study, at the request of ${getValue(formData.client_name_with_full_address)}., for the “${getValue(formData.name_of_the_vessel)}” Official No.: ${getValue(formData.official_no)}, whilst she was previously in deep water at ${getValue(formData.inspection_location_front_page)} during day light hours for the purpose of desktop assessment to ascertain her estimated assumption Condition and determine desktop valuation for financial purpose / financial usage, to be hypothecated from ${getValue(formData.bank_name)}${formData.branch_name ? ", " + formData.branch_name : ""}${formData.state_name ? ", " + formData.state_name : ""}.`
                        : lower === "physical survey & inspection"
                        ? `This is to certify that we, the undersigned surveyors did survey & inspection valuation through physical survey & inspection as well as documents study, at the request of ${getValue(formData.client_name_with_full_address)}, for the “${getValue(formData.name_of_the_vessel)}” Official No.: ${getValue(formData.official_no)}, whilst she is currently in deep water at ${getValue(formData.inspection_location_front_page)} during day light hours for the purpose of affecting a general inspection to ascertain her present Physical Condition and determine valuation for financial purpose / financial usage, to be hypothecate from ${getValue(formData.bank_name)}${formData.branch_name ? ", " + formData.branch_name : ""}${formData.state_name ? ", " + formData.state_name : ""}.`
                        : lower === "condition valuation"
                        ? `This is to certify that we, the undersigned surveyors did condition valuation through physical survey & inspection as well as documents study, at the request of ${getValue(formData.client_name_with_full_address)}., for the “${getValue(formData.name_of_the_vessel)}” Official No.: ${getValue(formData.official_no)}, whilst she is currently in deep water at ${getValue(formData.inspection_location_front_page)} during day light hours for the purpose of affecting a general inspection to ascertain her present Physical Condition and determine valuation for financial purpose / financial usage, to be hypothecate from ${getValue(formData.bank_name)}${formData.branch_name ? ", " + formData.branch_name : ""}${formData.state_name ? ", " + formData.state_name : ""}.`
                        : lower === "marine vessel verification (avr)"
                        ? `This is to certify that we, the undersigned surveyors did marine asset verification through physical survey & inspection as well as documents study, at the request of ${getValue(formData.client_name_with_full_address)}., for the “${getValue(formData.name_of_the_vessel)}” Official No.: ${getValue(formData.official_no)}, whilst she is currently in deep water at Vadinar Port, Vadinar, Gujarat during day light hours for the purpose of affecting a general inspection to ascertain & verify her present Physical Condition and determine valuation for financial purpose / financial usage, to be hypothecate from ${getValue(formData.bank_name)}${formData.branch_name ? ", " + formData.branch_name : ""}${formData.state_name ? ", " + formData.state_name : ""}.`
                        : "";                     
                    return `
                    <p style="font-size: 14px;line-height: 1.2;text-align: justify;">
                        ${letter}
                    </p>`;
                  })()
                }

            <p style="font-size: 14px;line-height: 1.2;">
                We now report as follows:
            </p>

            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Registered Or Proposed Owner", formData.registered_or_proposed_owner),
                generateTableRow("Registered Or Proposed Owner Address", formData.registered_or_proposed_owner_address),
                generateTableRow("Purpose Of Valuation", formData.purpose_of_valuation),
                (() => {
                  const bankName = getValue(formData.bank_name);
                  const branchName = getValue(formData.branch_name);
                  const stateName = getValue(formData.state_name);
                  const fullValue = bankName + 
                    (branchName ? ", " + branchName : "") + 
                    (stateName ? ", " + stateName : "");
                  return generateTableRow("Financial Institution", fullValue);
                })(),
                (() => {
                  const date = getValue(formData.inspection_date_front_page);
                  const location = getValue(formData.inspection_location_front_page);
                  const fullValue = date + (location ? ", " + location : "");
                  return generateTableRow("Date & Current Location", fullValue);
                })(),
                generateTableRow("Marine Vessel Name", formData.name_of_the_vessel || formData.marine_vessel_name),
                generateTableRow("Type or Description of Vessel", formData.type_or_description_of_vessel),
                generateTableRow("Official Number / MMSI No.", formData.mmsi_no),
                generateTableRow("International Maritime Number", formData.imo_or_regd_no),
                generateTableRow("Class Notation", formData.class_notation),
                generateTableRow("Call Sign / Class Notation Machinery", formData.call_sign_class_notation_machinery),
                generateTableRow("Current Registry Port", formData.current_registry_port),
                generateTableRow("Classification Of Registry", formData.classification_of_registry),
                generateTableRow("Present Flag", formData.present_flag),
                generateTableRow("Port Of Registry", formData.port_of_registry),
                generateTableRow("No Of Registry / Registration No.", formData.no_of_registry_registration_no),
                generateTableRow("Date Of Registry", formatDateWithOrdinal(formData.date_of_registry)),
                generateTableRow("Registered Under", formData.registered_under),
                (() => {
                  const year = getValue(formData.year_of_built);
                  const yearWords = getValue(formData.year_of_built_inwords);
                  const fullValue = year && yearWords ? year + " (" + yearWords + ")" : year || yearWords;
                  return generateTableRow("Year Of Built", fullValue);
                })(),
                generateTableRow("Place Of Built", formData.place_of_built),
                generateTableRow("Vessel Built By", formData.vessel_built_by),
                generateTableRow("Type Of Propelled", formData.type_of_propelled),
                generateTableRow("Length Of Vessel", formatValueWithUnit(formData.length_of_vessel, "METRES")),
                generateTableRow("LOA - Length Overall", formatValueWithUnit(formData.loa_length_overall, "METRES")),
                generateTableRow("LBP - Length By Perpendicular", formatValueWithUnit(formData.lbp_length_by_perpendicular, "METRES")),
                generateTableRow("Breadth Of Vessel", formatValueWithUnit(formData.breadth_of_vessel, "METRES")),
                generateTableRow("Depth Of Vessel", formatValueWithUnit(formData.depth_of_vessel, "METRES")),
                generateTableRow("Draught Of Vessel", formatValueWithUnit(formData.draught_of_vessel, "METRES")),
                generateTableRow("Summer Draft Of Vessel", formatValueWithUnit(formData.summer_draft_of_vessel, "METRES")),
                generateTableRow("Length Of Stroke", formatValueWithUnit(formData.length_of_stroke, "MILIMETRES")),
                generateTableRow("Ballast Water Capacity", formatValueWithUnit(formData.ballast_water_capacity, "m3 (CUBIC METRES)")),
                generateTableRow("Light Ship", formatValueWithUnit(formData.light_ship, "TONNES")),
                generateTableRow("Propeller", formData.propeller),
                generateTableRow("Gross Registered Tonnage (GRT)", formatValueWithUnit(formData.gross_registered_tonnage_grt, "TONNES")),
                generateTableRow("Net Registered Tonnage (NRT)", formatValueWithUnit(formData.net_registered_tonnage_nrt, "TONNES")),
                generateTableRow("Deadweight Tonnage (DWT)", formatValueWithUnit(formData.deadweight_tonnage_dwt, "TONNES")),
                generateTableRow("Free Board", formatValueWithUnit(formData.free_board, "MILIMETRES")),
                generateTableRow("Operating Speed / Max Speed", formatValueWithUnit(formData.operating_speed_max_speed, "KNOTS")),
                generateTableRow("Regd. Accommodation", formatValueWithUnit(formData.regd_accommodation, "PERSONS")),
                generateTableRow("Bollard Pull (Sustained)", formatValueWithUnit(formData.bollard_pull_sustained, "MT (METRIC TON)")),
                generateTableRow("Type Of Propulsion", formData.type_of_propulsion),
                generateTableRow("No. Of Decks", formatNumberWithWord(formData.no_of_decks)),
                generateTableRow("No. Of Masts", formatNumberWithWord(formData.no_of_masts)),
                generateTableRow("No. Of Bulkheads", formatNumberWithWord(formData.no_of_bulkheads)),
                generateTableRow("Rigged / Not Rigged", formData.rigged_not_rigged),
                generateTableRow("Stem Type", formData.stem_type),
                generateTableRow("Stern Type", formData.stern_type),
                generateTableRow("Built Type", formData.built_type),
                generateTableRow("Material Of Construction", formData.material_of_construction)
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading, paragraph, and table
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. PARTICULARS OF THE VESSEL:</h2>
            <p>
                - As noted from the Certificate of Registry of the vessel dated 
                ${getValue(formData.registry_vessel_date)} issued at 
                ${getValue(formData.registry_vessel_location)} Port,
                Official No: ${getValue(formData.official_no)}
            </p>
            <table>
                ${tableRows}
            </table>
              `;
            })()}

            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Registered owner", formData.registered_owner),
                generateTableRow("Technical operator", formData.technical_operator),
                generateTableRow("Commercial operator", formData.commercial_operator),
                generateTableRow("Disponent owner", formData.disponent_owner)
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. OWNERSHIP AND OPERATION:</h2>
            <table>
                ${tableRows}
            </table>
              `;
            })()}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "CERTIFICATIONS_OF_THE_VESSEL",
              getNextMainCounter,
              null,
              formData
            )}

            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Institution Name", formData.institution_name_insurance_policy),
                generateTableRow("Certificate No.", formData.certificate_no_insurance_policy),
                generateTableRow("Date Of Issue", formData.date_of_issue_insurance_policy),
                generateTableRow("P & I Clause", formData.p_i_clause_insurance_policy),
                generateTableRow("Co - Assured", formData.co_assured_insurance_policy),
                generateTableRow(
                  "Period of P & I Policy",
                  formData.start_period_of_p_i_policy_insurance_policy &&
                    formData.end_period_of_p_i_policy_insurance_policy
                    ? `FROM ${getValue(
                        formData.start_period_of_p_i_policy_insurance_policy
                      )} TO MIDNIGHT OF ${getValue(
                        formData.end_period_of_p_i_policy_insurance_policy
                      )}`
                    : ""
                ),
                generateTableRow(
                  "Insured Value",
                  formData.insured_value_insurance_policy
                    ? `${getValue(formData.insured_value_insurance_policy)} ANY CURRENCY VALUE /- (${getValue(formData.insured_value_in_words_insurance_policy)})`
                    : ""
                )
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. PROTECTION & INDEMNITY POLICY :</h2>
            <table>
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Institution Name", formData.institution_name_damage_policy),
                generateTableRow("Certificate Type", formData.certificate_type_damage_policy),
                generateTableRow("Type of Security", formData.type_of_security_damage_policy),
                generateTableRow("Insurer/Guarantor Name & Address", formData.insurer_guarantor_name_address_damage_policy),
                generateTableRow("Policy No.", formData.policy_ref_no_damage_policy),
                generateTableRow("Date Of Issue", formData.date_of_issue_damage_policy),
                generateTableRow(
                  "Period of Damage Policy",
                  formData.start_period_of_damage_policy &&
                    formData.end_period_of_damage_policy
                    ? `NOON (GMT) FROM ${getValue(
                        formData.start_period_of_damage_policy
                      )} TO MIDNIGHT OF ${getValue(formData.end_period_of_damage_policy)}`
                    : ""
                )
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. INSURANCE FOR BUNKER OIL POLLUTION DAMAGE POLICY :</h2>
            <table>
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Insurance Company Name", formData.insurance_company_name_war_risk_policy),
                generateTableRow("Policy No.", formData.policy_no_war_risk_policy),
                generateTableRow(
                  "Period of Insurance",
                  formData.start_period_of_war_risk_policy &&
                    formData.end_period_of_war_risk_policy
                    ? `FROM ${getValue(
                        formData.start_period_of_war_risk_policy
                      )} TO MIDNIGHT OF ${getValue(formData.end_period_of_war_risk_policy)}`
                    : ""
                ),
                generateTableRow(
                  "Insured Value",
                  formData.insured_value_war_risk_policy
                    ? `${getValue(formData.insured_value_war_risk_policy)}/- (${getValue(formData.insured_value_in_words_war_risk_policy)})`
                    : ""
                )
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. WAR RISK INSURANCE POLICY :</h2>
            <table>
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Insurance Company Name", formData.insurance_company_name_hull_machinery_policy),
                generateTableRow("Policy No.", formData.policy_no_hull_machinery_policy),
                generateTableRow(
                  "Period of Insurance",
                  formData.start_period_of_hull_machinery_policy &&
                    formData.end_period_of_hull_machinery_policy
                    ? `FROM ${getValue(
                        formData.start_period_of_hull_machinery_policy
                      )} TO MIDNIGHT OF ${getValue(
                        formData.end_period_of_hull_machinery_policy
                      )}`
                    : ""
                ),
                generateTableRow(
                  "Insured Value",
                  formData.insured_value_hull_machinery_policy
                    ? `${getValue(formData.insured_value_hull_machinery_policy)} ANY CURRENCY VALUE /- (${getValue(formData.insured_value_in_words_hull_machinery_policy)})`
                    : ""
                )
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. HULL & MACHINERY INSURANCE POLICY :</h2>
            <table>
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Generate all table rows first
              const tableRows = [
                generateTableRow("Trading Limit", formData.trading_limit),
                generateTableRow("Collision Bulkhead", formData.collision_bulkhead),
                generateTableRow("Vessel Bottom Type", formData.vessel_bottom_type),
                generateTableRow("Ex Name / Flag", formData.ex_name_flag),
                generateTableRow("Previous Registry", formData.previous_registry),
                generateTableRow("Keel to Masthead (KTM)", formData.keel_to_masthead_ktm),
                generateTableRow(
                  "Manifold - Bow To Center Manifold (BCM) /Stern To Center Manifold (SCM)",
                  formData.manifold_bcm_scm
                )
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. OTHER DETAILS :</h2>
            <table>
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper function to generate a table row only if value exists
              const generateClassificationRow = (label, value, colspan = 2) => {
                if (!value || value === "null" || value === "undefined" || (typeof value === "string" && value.trim() === "")) {
                  return "";
                }
                const labelWidth = colspan === 2 ? "40%" : "40%";
                const valueWidth = colspan === 2 ? "50%" : "25%";
                const valueColspan = colspan === 2 ? 'colspan="2"' : "";
                return `
                <tr>
                    <td width="${labelWidth}" class="text-uppercase">${label}</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="${valueWidth}" style="text-align: center;" ${valueColspan}>${getValue(value)}</td>
                    ${colspan === 1 ? '<td width="25%" style="text-align: center;"></td>' : ''}
                </tr>
                `;
              };

              // Helper function to generate a row with two date values
              const generateClassificationDateRow = (label, startValue, endValue) => {
                const startFormatted = formatDateToMonthDayYear(startValue);
                const endFormatted = formatDateToMonthDayYear(endValue);
                if ((!startFormatted || startFormatted.trim() === "") && (!endFormatted || endFormatted.trim() === "")) {
                  return "";
                }
                return `
                <tr>
                    <td width="40%" class="text-uppercase">${label}</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${startFormatted}</td>
                    <td width="25%" style="text-align: center;">${endFormatted}</td>
                </tr>
                `;
              };

              // Generate all table rows
              const tableRows = [
                generateClassificationRow("Classification society", formData.classification_society),
                generateClassificationRow("Is the vessel subject to any conditions of class, class extensions, outstanding memorandums or class recommendations? If yes, give details:", formData.is_vessel_subject_to_any_conditions),
                generateClassificationRow("If classification society changed, name of previous and date of change", formData.if_classification_society_changed_name),
                generateClassificationRow("Does the vessel have ice class? If yes, state what level", formData.does_the_vessel_have_ice_class),
                generateClassificationRow("Date/place of last dry−dock", formData.date_place_of_last_dry_dock),
                generateClassificationDateRow(
                  "Date next dry dock due/next annual survey due",
                  formData.start_date_next_dry_dock_due_next_annual_survey_due,
                  formData.end_date_next_dry_dock_due_next_annual_survey_due
                ),
                generateClassificationDateRow(
                  "Date of last special survey/next special survey due",
                  formData.start_date_of_last_special_survey_next_special_survey_due,
                  formData.end_date_of_last_special_survey_next_special_survey_due
                ),
                generateClassificationRow("If ship has Condition Assessment Program (CAP), what is the latest overall rating", formData.if_ship_has_condition_assessment)
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. CLASSIFICATION :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              if (!getValue(formData.hull_design)) {
                return "";
              }
              const subCounterValue = getNextSubCounter();
              return `
                    <h2><span class="sub-counter">${subCounterValue}</span>. HULL DESIGN :</h2>
                    <p>
                        ${getValue(formData.hull_design)}
                    </p>
              `;
            })()}
            ${(() => {
              if (!getValue(formData.present_condition_1) && !getValue(formData.present_condition_2) && !getValue(formData.present_condition_3)) {
                return "";
              }
              // Get sub-counter with "A" suffix (same number as HULL DESIGN but with suffix)
              // HULL DESIGN already incremented the counter, so we use the current value with suffix
              const subCounterWithSuffix = getSubCounterWithSuffix('A');
              return `
                    <h2><span class="sub-counter-with-list">${subCounterWithSuffix}</span>. Present Condition :</h2>
                    ${
                    formData.present_condition_1
                        ? `<p>1. ${getValue(formData.present_condition_1)}</p>`
                        : ""
                    }
                    ${
                    formData.present_condition_2
                        ? `<p>2. ${getValue(formData.present_condition_2)}</p>`
                        : ""
                    }
                    ${
                    formData.present_condition_3
                        ? `<p>3. ${getValue(formData.present_condition_3)}</p>`
                        : ""
                    }
              `;
            })()}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "DECK_EQUIPMENT_SPECIAL_FEATURES",
              getNextMainCounter,
              null
            )}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "TANK_STORAGE_CAPACITIES",
              getNextMainCounter,
              null
            )}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "ADDITIONAL_SAFETY_FIRE_FIGHTING_EQUIPMENT",
              getNextMainCounter,
              null
            )}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "COMMUNICATION_NAVIGATIONAL_EQUIPMENT",
              getNextMainCounter,
              null
            )}

            ${(() => {
              // First, get the main counter for MACHINERIES section
              const mainCounterValue = getNextMainCounter();
              
              // Check if MACHINERIES section has any content (use sub-counter for sub-sections)
              const mainEnginesContent = generateFlexibleFieldsForSection(
                formData.flexible_fields || [],
                "MAIN_ENGINES",
                null, // Don't use main counter
                null,
                getNextSubCounter // Use sub-counter instead
              );
              const auxiliaryContent = generateFlexibleFieldsForSection(
                formData.flexible_fields || [],
                "AUXILIARY_MACHINERIES_GENERATORS",
                null, // Don't use main counter
                null,
                getNextSubCounter // Use sub-counter instead
              );
              
              // If no content, don't show the section
              if (!mainEnginesContent && !auxiliaryContent) {
                // Rollback the main counter since section won't be shown
                mainCounter--;
                currentMainCounter = mainCounter;
                return "";
              }
              
              const heading = `<h2><span class="main-counter">${mainCounterValue}</span>. MACHINERIES :</h2>`;
              
              // Only show condition if MAIN_ENGINES flexible fields have content
              const conditionContent = (mainEnginesContent && mainEnginesContent.trim() !== "")
                ? `<p><b>Condition: </b>Engine found in working condition as per the survey and inspection onsite of the vessel.</p>`
                : "";
              
              return heading + mainEnginesContent + conditionContent;
            })()}
            ${(() => {
              // Generate flexible fields for AUXILIARY_MACHINERIES_GENERATORS (sub-section of MACHINERIES)
              const auxiliaryMachinerieGeneratorsContent = generateFlexibleFieldsForSection(
                formData.flexible_fields || [],
                "AUXILIARY_MACHINERIES_GENERATORS",
                null, // Don't use main counter
                null,
                getNextSubCounter // Use sub-counter instead
              );
              
              // Only show condition if AUXILIARY_MACHINERIES_GENERATORS flexible fields have content
              const conditionContent = (auxiliaryMachinerieGeneratorsContent && auxiliaryMachinerieGeneratorsContent.trim() !== "") && formData.auxiliary_machinerie_other_auxiliary_machinerie_condition
                ? `<p><b>Condition: </b>Aux Harbour generators found in working condition as per the ${getValue(formData.auxiliary_machinerie_other_auxiliary_machinerie_condition)}</p>`
                : "";
              
              return auxiliaryMachinerieGeneratorsContent + conditionContent;
            })()}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "AUXILIARY_MACHINERIES_HARBOUR_GENERATORS",
              null, // Don't use main counter
              null,
              getNextSubCounter // Use sub-counter instead
            )}

            ${(() => {
              if (!getValue(formData.steering_details)) {
                return "";
              }
              const mainCounterValue = getNextMainCounter();
              return `
                    <h2><span class="main-counter">${mainCounterValue}</span>. STEERING :</h2>
                    <p>
                        ${getValue(formData.steering_details)}
                    </p>
              `;
            })()}

            ${(() => {
              // Generate flexible fields for PROPELLER_ASD_VESSEL (standalone main section, not sub of MACHINERIES)
              const propellerContent = generateFlexibleFieldsForSection(
                formData.flexible_fields || [],
                "PROPELLER_ASD_VESSEL",
                getNextMainCounter,
                null,
                null
              );
              
              // Only show condition if PROPELLER_ASD_VESSEL flexible fields have content
              const conditionContent = (propellerContent && propellerContent.trim() !== "") && formData.propeller_asd_vessel_condition
                ? `<p><b>Condition: </b>${getValue(
                    formData.propeller_asd_vessel_condition
                  )}</p>`
                : "";
              
              return propellerContent + conditionContent;
            })()}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "MASTER_OR_CAPTAIN_OF_THE_VESSEL",
              getNextMainCounter,
              null
            )}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit = "METRES") => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.keel_to_masthead_ktm_dimensions)
                ? `<tr>
                    <td width="40%" class="text-uppercase">Keel to masthead (KTM)/ Keel to masthead (KTM) in collapsed condition, if applicable</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td colspan="4" style="text-align: center;">${formatWithUnit(formData.keel_to_masthead_ktm_dimensions)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.distance_bridge_front_to_center_of_manifold_dimensions)
                ? `<tr>
                    <td width="40%" class="text-uppercase">Distance bridge front to center of manifold</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td colspan="4" style="text-align: center;">${formatWithUnit(formData.distance_bridge_front_to_center_of_manifold_dimensions)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.bow_to_center_manifold_bcm_dimensions) || hasValue(formData.stern_to_center_manifold_scm_dimensions)
                ? `<tr>
                    <td width="40%" class="text-uppercase">Bow to center manifold (BCM)/Stern to center manifold (SCM)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.bow_to_center_manifold_bcm_dimensions)}</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.stern_to_center_manifold_scm_dimensions)}</td>
                </tr>`
                : "";

              // Check if any parallel body data exists
              const hasParallelBodyData = 
                hasValue(formData.forward_to_mid_point_manifold_lightship_dimensions) ||
                hasValue(formData.forward_to_mid_point_manifold_normal_ballast_dimensions) ||
                hasValue(formData.forward_to_mid_point_manifold_summer_dwt_dimensions) ||
                hasValue(formData.aft_to_mid_point_manifold_lightship_dimensions) ||
                hasValue(formData.aft_to_mid_point_manifold_normal_ballast_dimensions) ||
                hasValue(formData.aft_to_mid_point_manifold_summer_dwt_dimensions) ||
                hasValue(formData.parallel_body_length_lightship_dimensions) ||
                hasValue(formData.parallel_body_length_normal_ballast_dimensions) ||
                hasValue(formData.parallel_body_length_summer_dwt_dimensions);

              // Parallel body header row - only show if data exists
              const parallelBodyHeader = hasParallelBodyData
                ? `<tr>
                    <td width="40%" class="text-uppercase">Parallel body distances</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td style="text-align: center;">LIGHTSHIP</td>
                    <td style="text-align: center;">BALLAST</td>
                    <td style="text-align: center;">SUMMER DWT</td>
                </tr>`
                : "";

              // Parallel body data rows
              const row4 = hasValue(formData.forward_to_mid_point_manifold_lightship_dimensions) ||
                           hasValue(formData.forward_to_mid_point_manifold_normal_ballast_dimensions) ||
                           hasValue(formData.forward_to_mid_point_manifold_summer_dwt_dimensions)
                ? `<tr>
                    <td width="40%" class="text-uppercase">Forward to mid−point manifold</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td style="text-align: center;">${formatWithUnit(formData.forward_to_mid_point_manifold_lightship_dimensions)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.forward_to_mid_point_manifold_normal_ballast_dimensions)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.forward_to_mid_point_manifold_summer_dwt_dimensions)}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.aft_to_mid_point_manifold_lightship_dimensions) ||
                           hasValue(formData.aft_to_mid_point_manifold_normal_ballast_dimensions) ||
                           hasValue(formData.aft_to_mid_point_manifold_summer_dwt_dimensions)
                ? `<tr>
                    <td width="40%" class="text-uppercase">Aft to mid−point manifold</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td style="text-align: center;">${formatWithUnit(formData.aft_to_mid_point_manifold_lightship_dimensions)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.aft_to_mid_point_manifold_normal_ballast_dimensions)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.aft_to_mid_point_manifold_summer_dwt_dimensions)}</td>
                </tr>`
                : "";

              const row6 = hasValue(formData.parallel_body_length_lightship_dimensions) ||
                           hasValue(formData.parallel_body_length_normal_ballast_dimensions) ||
                           hasValue(formData.parallel_body_length_summer_dwt_dimensions)
                ? `<tr>
                    <td width="40%" class="text-uppercase">Parallel body length</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td style="text-align: center;">${formatWithUnit(formData.parallel_body_length_lightship_dimensions)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.parallel_body_length_normal_ballast_dimensions)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.parallel_body_length_summer_dwt_dimensions)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3 + parallelBodyHeader + row4 + row5 + row6;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. DIMENSIONS :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Helper to generate loadline row
              const generateLoadlineRow = (label, freeboard, draft, deadweight, displacement) => {
                const hasAnyValue = hasValue(freeboard) || hasValue(draft) || hasValue(deadweight) || hasValue(displacement);
                if (!hasAnyValue) return "";
                
                return `<tr>
                    <td width="35%" class="text-uppercase">${label}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(freeboard, "METRES")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(draft, "METRES")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(deadweight, "METRIC TONNES")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(displacement, "METRIC TONNES")}</td>
                </tr>`;
              };

              // Generate table header
              const tableHeader = `<tr>
                    <th width="35%" class="text-uppercase">LOADLINE</th>
                    <th width="5%" style="text-align: center;">:</th>
                    <th width="15%" style="text-align: center;">FREEBOARD</th>
                    <th width="15%" style="text-align: center;">DRAFT</th>
                    <th width="15%" style="text-align: center;">DEADWEIGHT</th>
                    <th width="15%" style="text-align: center;">DISPLACEMENT</th>
                </tr>`;

              // Generate loadline rows
              const row1 = generateLoadlineRow(
                "Summer",
                formData.summer_Freeboard_dimensions,
                formData.summer_Draft_dimensions,
                formData.summer_Deadweight_dimensions,
                formData.summer_Displacement_dimensions
              );
              
              const row2 = generateLoadlineRow(
                "Winter",
                formData.winter_Freeboard_dimensions,
                formData.winter_Draft_dimensions,
                formData.winter_Deadweight_dimensions,
                formData.winter_Displacement_dimensions
              );
              
              const row3 = generateLoadlineRow(
                "Tropical",
                formData.tropical_Freeboard_dimensions,
                formData.tropical_Draft_dimensions,
                formData.tropical_Deadweight_dimensions,
                formData.tropical_Displacement_dimensions
              );
              
              const row4 = generateLoadlineRow(
                "Lightship",
                formData.lightship_Freeboard_dimensions,
                formData.lightship_Draft_dimensions,
                formData.lightship_Deadweight_dimensions,
                formData.lightship_Displacement_dimensions
              );
              
              const row5 = generateLoadlineRow(
                "Normal Ballast Condition",
                formData.normal_ballast_condition_Freeboard_dimensions,
                formData.normal_ballast_condition_Draft_dimensions,
                formData.normal_ballast_condition_Deadweight_dimensions,
                formData.normal_ballast_condition_Displacement_dimensions
              );
              
              const row6 = generateLoadlineRow(
                "Segregated Ballast Condition",
                formData.segregated_ballast_condition_Freeboard_dimensions,
                formData.segregated_ballast_condition_Draft_dimensions,
                formData.segregated_ballast_condition_Deadweight_dimensions,
                formData.segregated_ballast_condition_Displacement_dimensions
              );

              // FWA/TPC row
              const row7 = (hasValue(formData.fwa_tpc_at_summer_draft_Freeboard_dimensions) || 
                           hasValue(formData.fwa_tpc_at_summer_draft_Draft_dimensions))
                ? `<tr>
                    <td class="text-uppercase">FWA/TPC at summer draft</td>
                    <td style="text-align: center;">:</td>
                    <th colspan="2" style="text-align: center;">${formatWithUnit(formData.fwa_tpc_at_summer_draft_Freeboard_dimensions, "MILLIMETRES")}</th>
                    <th colspan="2" style="text-align: center;">${formatWithUnit(formData.fwa_tpc_at_summer_draft_Draft_dimensions, "MILLIMETRES")}</th>
                </tr>`
                : "";

              // Other single-value rows
              const row8 = hasValue(formData.does_vessel_have_multiple_sdwt)
                ? `<tr>
                    <td class="text-uppercase">Does vessel have multiple SDWT? If yes, please provide all assigned loadlines:</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="4" style="text-align: center;">${getValue(formData.does_vessel_have_multiple_sdwt)}</td>
                </tr>`
                : "";

              const row9 = hasValue(formData.constant_excluding_fresh_water)
                ? `<tr>
                    <td class="text-uppercase">Constant (excluding fresh water)</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="4" style="text-align: center;">${formatWithUnit(formData.constant_excluding_fresh_water, "METRIC TONNES")}</td>
                </tr>`
                : "";

              const row10 = hasValue(formData.company_guidelines_for_under_keel_clearance_ukc)
                ? `<tr>
                    <td class="text-uppercase">What is the company guidelines for Under Keel Clearance (UKC) for this vessel?</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="4" style="text-align: center;">${getValue(formData.company_guidelines_for_under_keel_clearance_ukc)}</td>
                </tr>`
                : "";

              // Check if any mast height data exists
              const hasMastHeightData = 
                hasValue(formData.full_mast_summer_deadweight_dimensions) ||
                hasValue(formData.collapsed_mast_summer_deadweight_dimensions) ||
                hasValue(formData.full_mast_normal_ballast_dimensions) ||
                hasValue(formData.collapsed_mast_normal_ballast_dimensions) ||
                hasValue(formData.full_mast_lightship_dimensions) ||
                hasValue(formData.collapsed_mast_lightship_dimensions);

              // Mast height header row - only show if data exists
              const mastHeightHeader = hasMastHeightData
                ? `<tr>
                    <td class="text-uppercase">What is the max height of mast above waterline (air draft)</td>
                    <td style="text-align: center;">:</td>
                    <th colspan="2" style="text-align: center;">Full Mast</th>
                    <th colspan="2" style="text-align: center;">Collapsed Mast</th>
                </tr>`
                : "";

              // Mast height data rows
              const row11 = hasValue(formData.full_mast_summer_deadweight_dimensions) ||
                           hasValue(formData.collapsed_mast_summer_deadweight_dimensions)
                ? `<tr>
                    <td class="text-uppercase">Summer deadweight</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.full_mast_summer_deadweight_dimensions, "METRES")}</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.collapsed_mast_summer_deadweight_dimensions, "METRES")}</td>
                </tr>`
                : "";

              const row12 = hasValue(formData.full_mast_normal_ballast_dimensions) ||
                           hasValue(formData.collapsed_mast_normal_ballast_dimensions)
                ? `<tr>
                    <td class="text-uppercase">Normal ballast</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.full_mast_normal_ballast_dimensions, "METRES")}</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.collapsed_mast_normal_ballast_dimensions, "METRES")}</td>
                </tr>`
                : "";

              const row13 = hasValue(formData.full_mast_lightship_dimensions) ||
                           hasValue(formData.collapsed_mast_lightship_dimensions)
                ? `<tr>
                    <td class="text-uppercase">Lightship</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.full_mast_lightship_dimensions, "METRES")}</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.collapsed_mast_lightship_dimensions, "METRES")}</td>
                </tr>`
                : "";

              // Combine all rows (only include header if there are data rows)
              const hasLoadlineData = row1 || row2 || row3 || row4 || row5 || row6;
              const tableRows = (hasLoadlineData ? tableHeader : "") + 
                               row1 + row2 + row3 + row4 + row5 + row6 + 
                               row7 + row8 + row9 + row10 + 
                               mastHeightHeader + row11 + row12 + row13;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. LOADLINE INFORMATION :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.itopf_member)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Owner warrant that vessel is member of ITOPF and will remain so for the entire duration of this</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.itopf_member)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.ocimf_member)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Does vessel have in place a Drug and Alcohol Policy complying with OCIMF guidelines for Control of Drugs</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.ocimf_member)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. DOCUMENTATION :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to generate a table row only if value exists
              const generateCrewRow = (label, value) => {
                if (!hasValue(value)) return "";
                return `<tr>
                    <td width="45%" class="text-uppercase">${label}</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(value)}</td>
                </tr>`;
              };

              // Generate all table rows
              const tableRows = [
                generateCrewRow("Nationality of Master / Name", formData.nationality_of_master_name),
                generateCrewRow("Number and nationality of Officers", formData.number_and_nationality_of_officers),
                generateCrewRow("Number and nationality of Crew", formData.number_and_nationality_of_crew),
                generateCrewRow("What is the common working language onboard", formData.common_working_language_onboard),
                generateCrewRow("Do officers speak and understand English?", formData.do_officers_speak_and_understand_english),
                generateCrewRow("If Officers/ratings employed by a manning agency − Full style", formData.if_officers_ratings_employed_by_a_manning_agency_full_style)
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. CREW :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.is_the_vessel_operated_under_a_quality_management_system)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is the vessel operated under a Quality Management System? If Yes, what type of system? (ISO9001 or IMO Resolution A.741(18) as amended)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.is_the_vessel_operated_under_a_quality_management_system)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.can_the_ship_comply_with_the_ics_helicopter_guidelines)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Can the ship comply with the ICS Helicopter Guidelines?</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.can_the_ship_comply_with_the_ics_helicopter_guidelines)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. SAFETY/HELICOPTER :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "ACCESSORIES",
              getNextMainCounter,
              null
            )}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to generate a coating row only if at least one value exists
              const generateCoatingRow = (label, coated, type, toWhatExtent, anodes) => {
                const hasAnyValue = hasValue(coated) || hasValue(type) || hasValue(toWhatExtent) || hasValue(anodes);
                if (!hasAnyValue) return "";
                
                return `<tr>
                    <td width="35%" class="text-uppercase">${label}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(coated)}</td>
                    <td width="15%" style="text-align: center;">${getValue(type)}</td>
                    <td width="15%" style="text-align: center;">${getValue(toWhatExtent)}</td>
                    <td width="15%" style="text-align: center;">${getValue(anodes)}</td>
                </tr>`;
              };

              // Generate table header
              const tableHeader = `<tr>
                    <th width="35%" class="text-uppercase">TANK COATING</th>
                    <th width="5%" style="text-align: center;">:</th>
                    <th width="15%" style="text-align: center;">COATED</th>
                    <th width="15%" style="text-align: center;">TYPE</th>
                    <th width="15%" style="text-align: center;">TO WHAT EXTENT </th>
                    <th width="15%" style="text-align: center;">ANODES</th>
                </tr>`;

              // Generate all table rows
              const row1 = generateCoatingRow(
                "Cargo tanks",
                formData.coated_cargo_tanks,
                formData.type_of_cargo_tanks,
                formData.to_what_extent_cargo_tanks,
                formData.anode_cargo_tanks
              );
              
              const row2 = generateCoatingRow(
                "Ballast tanks",
                formData.coated_ballast_tanks,
                formData.type_of_ballast_tanks,
                formData.to_what_extent_ballast_tanks,
                formData.anode_ballast_tanks
              );
              
              const row3 = generateCoatingRow(
                "Slop tanks",
                formData.coated_slop_tanks,
                formData.type_of_slop_tanks,
                formData.to_what_extent_slop_tanks,
                formData.anode_slop_tanks
              );

              // Combine all rows (only include header if there are data rows)
              const hasData = row1 || row2 || row3;
              const tableRows = (hasData ? tableHeader : "") + row1 + row2 + row3;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. COATING/ANODES :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to generate a ballast row only if at least one value exists
              const generateBallastRow = (label, number, type, capacity, atWhatHead) => {
                const hasAnyValue = hasValue(number) || hasValue(type) || hasValue(capacity) || hasValue(atWhatHead);
                if (!hasAnyValue) return "";
                
                return `<tr>
                    <td width="35%" class="text-uppercase">${label}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(number)}</td>
                    <td width="15%" style="text-align: center;">${getValue(type)}</td>
                    <td width="15%" style="text-align: center;">${getValue(capacity)}</td>
                    <td width="15%" style="text-align: center;">${getValue(atWhatHead)}</td>
                </tr>`;
              };

              // Generate table header
              const tableHeader = `<tr>
                    <th width="35%" class="text-uppercase">Pumps</th>
                    <th width="5%" style="text-align: center;">:</th>
                    <th width="15%" style="text-align: center;">No.</th>
                    <th width="15%" style="text-align: center;">Type</th>
                    <th width="15%" style="text-align: center;">Capacity </th>
                    <th width="15%" style="text-align: center;">At What Head (sg=1.0)</th>
                </tr>`;

              // Generate all table rows
              const row1 = generateBallastRow(
                "Ballast Pumps",
                formData.number_of_ballast_pumps,
                formData.type_of_ballast_pumps,
                formData.capacity_of_ballast_pumps,
                formData.at_what_head_ballast_pumps
              );
              
              const row2 = generateBallastRow(
                "Ballast Eductors",
                formData.number_of_ballast_eductors,
                formData.type_of_ballast_eductors,
                formData.capacity_of_ballast_eductors,
                formData.at_what_head_ballast_eductors
              );

              // Combine all rows (only include header if there are data rows)
              const hasData = row1 || row2;
              const tableRows = (hasData ? tableHeader : "") + row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. BALLAST :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              if (!getValue(formData.is_vessel_fitted_with_centerline_bulkhead_in_all_cargo_tanks)) {
                return "";
              }
              const subCounterValue = getNextSubCounter();
              return `
                <h2><span class="sub-counter">${subCounterValue}</span>. CARGO :</h2>
                <table class="border-table">
                    <tr>
                        <td width="35%" class="text-uppercase">Is vessel fitted with centerline bulkhead in all cargo tanks?
                            If Yes, solid or perforated:</td>
                        <td width="5%" style="text-align: center;">:</td>
                        <td width="15%" style="text-align: center;">${getValue(
                          formData.is_vessel_fitted_with_centerline_bulkhead_in_all_cargo_tanks
                        )}</td>
                    </tr>
                </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = (hasValue(formData.number_of_cargo_tanks_and_total_cubic_capacity_98) || 
                           hasValue(formData.total_cubic_capacity_98))
                ? `<tr>
                    <td width="45%" class="text-uppercase">Number of cargo tanks and total cubic capacity (98%)</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.number_of_cargo_tanks_and_total_cubic_capacity_98)}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.total_cubic_capacity_98, "CUBIC METRES")}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.capacity_of_each_natural_segregation_with_double_valve)
                ? `<tr>
                    <td class="text-uppercase">Capacity (max% per company policy: 98%, 97%, 96% or 95%) of each natural segregation with double valve (specify tanks)</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${getValue(formData.capacity_of_each_natural_segregation_with_double_valve)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.imo_class)
                ? `<tr>
                    <td class="text-uppercase">IMO class (Oil/Chemical Ship Type 1, 2 or 3)</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.imo_class, "CUBIC METRES")}</td>
                </tr>`
                : "";

              const row4 = (hasValue(formData.number_of_slop_tanks_and_total_cubic_capacity_98) || 
                           hasValue(formData.total_cubic_capacity_98_slop_tanks))
                ? `<tr>
                    <td class="text-uppercase">Number of slop tanks and total cubic capacity (98%)</td>
                    <td style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.number_of_slop_tanks_and_total_cubic_capacity_98)}</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.total_cubic_capacity_98_slop_tanks)}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.specify_segregations_double_valve)
                ? `<tr>
                    <td class="text-uppercase">Specify segregations which slops tanks belong to and their capacity with double valve</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${getValue(formData.specify_segregations_double_valve)}</td>
                </tr>`
                : "";

              const row6 = hasValue(formData.residual_retention_oil_tank_capacity_98)
                ? `<tr>
                    <td class="text-uppercase">Residual/retention oil tank(s) capacity (98%), if applicable</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${formatWithUnit(formData.residual_retention_oil_tank_capacity_98, "CUBIC METRES")}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3 + row4 + row5 + row6;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. Cargo Tank Capacities :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = (hasValue(formData.total_sbt_capacity_and_percentage_of_sdwt_vessel_can_maintain) || 
                           hasValue(formData.percentage_of_sdwt_vessel_can_maintain))
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is total SBT capacity and percentage of SDWT vessel can maintain?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.total_sbt_capacity_and_percentage_of_sdwt_vessel_can_maintain, "CUBIC METRES")}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.percentage_of_sdwt_vessel_can_maintain, "%")}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2)
                ? `<tr>
                    <td class="text-uppercase">Does vessel meet the requirements of MARPOL Annex I Reg 18.2:</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${getValue(formData.does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. SBT VESSEL :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.how_many_grades_products_can_vessel_load_discharge_with_double)
                ? `<tr>
                    <td width="45%" class="text-uppercase">How many grades/products can vessel load/discharge with double valve segregation</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.how_many_grades_products_can_vessel_load_discharge_with_double)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.type_of_cargo_containment)
                ? `<tr>
                    <td class="text-uppercase">State type of cargo containment (integral, independent, gravity or pressure tanks)</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${getValue(formData.type_of_cargo_containment)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.with_vecs_capacity)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Are there any cargo tank filling restrictions? If yes, specify number of slack tanks, max s.g., ullage restrictions etc.</td>
                    <td style="text-align: center;">:</td>
                    <td colspan="2" style="text-align: center;">${getValue(formData.with_vecs_capacity)}</td>
                </tr>`
                : "";

              // Check if any VECS data exists
              const hasVECSData = 
                hasValue(formData.with_vecs_capacity) ||
                hasValue(formData.without_vecs_capacity) ||
                hasValue(formData.loaded_simultaneously_through_all_manifolds_with_vecs_capacity) ||
                hasValue(formData.loaded_simultaneously_through_all_manifolds_without_vecs);

              // VECS header row - only show if data exists
              const vecsHeader = hasVECSData
                ? `<tr>
                    <td class="text-uppercase">Max loading rate for homogenous cargo</td>
                    <td style="text-align: center;">:</td>
                    <th style="text-align: center;">With VECS</th>
                    <th style="text-align: center;">Without VECS</th>
                </tr>`
                : "";

              // VECS data rows
              const row4 = hasValue(formData.with_vecs_capacity) || hasValue(formData.without_vecs_capacity)
                ? `<tr>
                    <td class="text-uppercase">Loaded per manifold connection</td>
                    <td style="text-align: center;">:</td>
                    <td style="text-align: center;">${formatWithUnit(formData.with_vecs_capacity, "CUBIC METRES/HOUR")}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.without_vecs_capacity, "CUBIC METRES/HOUR")}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.loaded_simultaneously_through_all_manifolds_with_vecs_capacity) ||
                           hasValue(formData.loaded_simultaneously_through_all_manifolds_without_vecs)
                ? `<tr>
                    <td class="text-uppercase">Loaded simultaneously through all manifolds</td>
                    <td style="text-align: center;">:</td>
                    <td style="text-align: center;">${formatWithUnit(formData.loaded_simultaneously_through_all_manifolds_with_vecs_capacity, "CUBIC METRES/HOUR")}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.loaded_simultaneously_through_all_manifolds_without_vecs, "CUBIC METRES/HOUR")}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3 + vecsHeader + row4 + row5;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. Cargo Handling and Pumping Systems :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.is_ship_fitted_with_a_cargo_control_room_ccr)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is ship fitted with a Cargo Control Room (CCR)?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.is_ship_fitted_with_a_cargo_control_room_ccr)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.can_tank_innage_ullage_be_read_from_the_ccr)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Can tank innage/ullage be read from the CCR?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.can_tank_innage_ullage_be_read_from_the_ccr)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. CARGO CONTROL ROOM :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to generate a table row only if value exists
              const generateGaugingRow = (label, value) => {
                if (!hasValue(value)) return "";
                return `<tr>
                    <td width="45%" class="text-uppercase">${label}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(value)}</td>
                </tr>`;
              };

              // Generate all table rows
              const tableRows = [
                generateGaugingRow("Is gauging system certified and calibrated? If no, specify which ones are not calibrated", formData.is_gauging_system_certified_and_calibrated),
                generateGaugingRow("What type of fixed closed tank gauging system is fitted", formData.type_of_fixed_closed_tank_gauging_system_fitted),
                generateGaugingRow("Are high level alarms fitted to the cargo tanks? If Yes, indicate whether to all tanks or partial", formData.are_high_level_alarms_fitted_to_the_cargo_tanks),
                generateGaugingRow("Number of portable gauging units (example− MMC) on board", formData.number_of_portable_gauging_units_on_board)
              ].join("");

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. GAUGING & SAMPLING :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.is_a_vapour_emission_control_system_vecs_fitted)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is a Vapour Emission Control System (VECS) fitted?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.is_a_vapour_emission_control_system_vecs_fitted)}</td>
                </tr>`
                : "";

              const row2 = (hasValue(formData.number_of_vecs_manifolds_per_side) || 
                           hasValue(formData.size_of_vecs_manifolds_per_side))
                ? `<tr>
                    <td class="text-uppercase">Number/size of VECS manifolds (per side):</td>
                    <td style="text-align: center;">:</td>
                    <td style="text-align: center;">${getValue(formData.number_of_vecs_manifolds_per_side)}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.size_of_vecs_manifolds_per_side, "Millimeters")}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.number_of_vecs_reducers_per_side)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Number/size/type of VECS reducers:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.number_of_vecs_reducers_per_side)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. Vapor Emission Control System (VECS) :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              if (getValue(formData.is_a_vapour_emission_control_system_vecs_fitted) !== "Yes") {
                return "";
              }
              const subCounterValue = getNextSubCounter();
              return `
                <h2><span class="sub-counter">${subCounterValue}</span>. VENTING :</h2>
                <table class="border-table">
                    <tr>
                        <td width="45%" class="text-uppercase">State what type of venting system is fitted:</td>
                        <td width="5%" style="text-align: center;">:</td>
                        <td width="45%" style="text-align: center;">${getValue(
                          formData.state_what_type_of_venting_system_is_fitted
                        )}</td>
                    </tr>
                </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.total_number_of_cargo_manifold_connections_on_each_side)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Total number/size of cargo manifold connections on each side:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.total_number_of_cargo_manifold_connections_on_each_side, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.what_type_of_valves_are_fitted_at_manifold)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What type of valves are fitted at manifold:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.what_type_of_valves_are_fitted_at_manifold)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.what_is_the_material_rating_of_the_manifold)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is the material/rating of the manifold:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.what_is_the_material_rating_of_the_manifold)}</td>
                </tr>`
                : "";

              const row4 = hasValue(formData.does_vessel_comply)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Does vessel comply with the latest edition of the OCIMF 'Recommendations for Oil Tanker Manifolds and Associated Equipment?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.does_vessel_comply)}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.distance_between_cargo_manifold_centers)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Distance between cargo manifold centers:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.distance_between_cargo_manifold_centers, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row6 = hasValue(formData.distance_ships_rail_to_manifold)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Distance ships rail to manifold</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.distance_ships_rail_to_manifold, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row7 = hasValue(formData.distance_manifold_to_ships_side)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Distance manifold to ships side</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.distance_manifold_to_ships_side, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row8 = hasValue(formData.distance_top_of_rail_to_center_of_manifold)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Top of rail to center of manifold</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.distance_top_of_rail_to_center_of_manifold, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row9 = hasValue(formData.distance_main_deck_to_center_of_manifold)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Distance main deck to center of manifold</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.distance_main_deck_to_center_of_manifold, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row10 = hasValue(formData.distance_spill_tank_grating_to_center_of_manifold)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Spill tank grating to center of manifold</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${formatWithUnit(formData.distance_spill_tank_grating_to_center_of_manifold, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row11 = (hasValue(formData.manifold_height_above_the_waterline_in_normal_ballast_at_sdwt) || 
                             hasValue(formData.manifold_height_above_the_waterline_in_lightship_condition))
                ? `<tr>
                    <td class="text-uppercase">Manifold height above the waterline in normal ballast/at SDWT condition</td>
                    <td style="text-align: center;">:</td>
                    <td style="text-align: center;">${formatWithUnit(formData.manifold_height_above_the_waterline_in_normal_ballast_at_sdwt, "METERS")}</td>
                    <td style="text-align: center;">${formatWithUnit(formData.manifold_height_above_the_waterline_in_lightship_condition, "METERS")}</td>
                </tr>`
                : "";

              const row12 = hasValue(formData.number_of_reducers_per_side)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Number/size / type of reducers:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.number_of_reducers_per_side)}</td>
                </tr>`
                : "";

              const row13 = hasValue(formData.is_vessel_fitted_with_a_stern_manifold_if_yes_state_size)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is vessel fitted with a stern manifold? If yes, state size</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td colspan="2" width="45%" style="text-align: center;">${getValue(formData.is_vessel_fitted_with_a_stern_manifold_if_yes_state_size)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3 + row4 + row5 + row6 + row7 + row8 + row9 + row10 + row11 + row12 + row13;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. CARGO MANIFOLDS & REDUCERS :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = (hasValue(formData.type_of_cargo_tanks_heating) || 
                           hasValue(formData.coiled_cargo_tanks_heating) || 
                           hasValue(formData.material_of_cargo_tanks_heating))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Cargo Tanks</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.type_of_cargo_tanks_heating)}</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.coiled_cargo_tanks_heating)}</td>
                    <td colspan="2" width="30%" style="text-align: center;">${getValue(formData.material_of_cargo_tanks_heating)}</td>
                </tr>`
                : "";

              const row2 = (hasValue(formData.type_of_slop_tanks_heating) || 
                           hasValue(formData.coiled_slop_tanks_heating) || 
                           hasValue(formData.material_of_slop_tanks_heating))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Slop Tanks</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.type_of_slop_tanks_heating)}</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.coiled_slop_tanks_heating)}</td>
                    <td colspan="2" width="30%" style="text-align: center;">${getValue(formData.material_of_slop_tanks_heating)}</td>
                </tr>`
                : "";

              const row3 = (hasValue(formData.maximum_temperature_cargo_can_be_loaded_maintained_1) || 
                           hasValue(formData.maximum_temperature_cargo_can_be_loaded_maintained_2))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Maximum temperature cargo can be loaded/mainstained</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="30%" colspan="2" style="text-align: center;">${getValue(formData.maximum_temperature_cargo_can_be_loaded_maintained_1)}</td>
                    <td width="30%" style="text-align: center;">${getValue(formData.maximum_temperature_cargo_can_be_loaded_maintained_2)}</td>
                </tr>`
                : "";

              // Combine all data rows
              const dataRows = row1 + row2 + row3;

              // Check if any data rows were generated (non-empty)
              if (!dataRows || dataRows.trim() === "") {
                return ""; // Hide entire section if no data rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading, header row, and data rows
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. HEATING :</h2>
            <table class="border-table">
                <tr>
                    <td width="35%" class="text-uppercase">Cargo/slop tanks fitted with a cargo heating system?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <th width="15%" style="text-align: center;">TYPE</th>
                    <th width="15%" style="text-align: center;">COILED</th>
                    <th colspan="2" width="30%" style="text-align: center;">MATERIAL</th>
                </tr>
                ${dataRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.is_an_inert_gas_system_igs_fitted_operational)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is an Inert Gas System (IGS) fitted/operational?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.is_an_inert_gas_system_igs_fitted_operational)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.is_igs_supplied_by_flue_gas_inert_gas_ig_generator)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is IGS supplied by flue gas, inert gas (IG) generator and/or nitrogen</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.is_igs_supplied_by_flue_gas_inert_gas_ig_generator)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.if_nitrogen_generator_specify)
                ? `<tr>
                    <td width="45%" class="text-uppercase">If nitrogen generator, specify the applicable flow rate for each of the designed purity modes</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.if_nitrogen_generator_specify)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. INERT GAS & CRUDE OIL WASHING :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate first row conditionally
              const row1 = hasValue(formData.how_many_cargo_pumps_can_be_run_simultaneously_at_full_capacity)
                ? `<tr>
                    <td width="35%" class="text-uppercase">How many cargo pumps can be run simultaneously at full capacity</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <th width="60%" colspan="4" style="text-align: center;">${getValue(formData.how_many_cargo_pumps_can_be_run_simultaneously_at_full_capacity)}</th>
                </tr>`
                : "";

              // Generate pump data rows conditionally
              const cargoPumpsRow = (hasValue(formData.sr_no_of_cargo_pumps) || 
                                     hasValue(formData.type_of_cargo_pumps) || 
                                     hasValue(formData.capacity_of_cargo_pumps) || 
                                     hasValue(formData.at_what_head_cargo_pumps))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Cargo Pumps</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.sr_no_of_cargo_pumps)}</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.type_of_cargo_pumps)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_cargo_pumps, "CUBIC METRES/HOUR")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.at_what_head_cargo_pumps, "METERS")}</td>
                </tr>`
                : "";

              const cargoEductorsRow = (hasValue(formData.sr_no_of_cargo_eductors) || 
                                        hasValue(formData.type_of_cargo_eductors) || 
                                        hasValue(formData.capacity_of_cargo_eductors) || 
                                        hasValue(formData.at_what_head_cargo_eductors))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Cargo Eductors</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.sr_no_of_cargo_eductors)}</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.type_of_cargo_eductors)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_cargo_eductors, "CUBIC METRES/HOUR")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.at_what_head_cargo_eductors, "METERS")}</td>
                </tr>`
                : "";

              const strippingRow = (hasValue(formData.sr_no_of_stripping) || 
                                  hasValue(formData.type_of_stripping) || 
                                  hasValue(formData.capacity_of_stripping) || 
                                  hasValue(formData.at_what_head_stripping))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Stripping</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.sr_no_of_stripping)}</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.type_of_stripping)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_stripping, "CUBIC METRES/HOUR")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.at_what_head_stripping, "METERS")}</td>
                </tr>`
                : "";

              // Check if any pump data rows exist (to show header row)
              const hasPumpDataRows = cargoPumpsRow || cargoEductorsRow || strippingRow;
              const headerRow = hasPumpDataRows
                ? `<tr>
                    <td width="35%" class="text-uppercase">PUMPS</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <th width="15%" style="text-align: center;">SR No</th>
                    <th width="15%" style="text-align: center;">TYPE</th>
                    <th width="15%" style="text-align: center;">CAPACITY</th>
                    <th width="15%" style="text-align: center;">At What Head (sg=1.0)</th>
                </tr>`
                : "";

              // Generate last row conditionally
              const lastRow = hasValue(formData.is_at_least_one_emergency_portable_cargo_pump_provided)
                ? `<tr>
                    <td width="35%" class="text-uppercase">Is at least one emergency portable cargo pump provided?</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="60%" colspan="4" style="text-align: center;">${getValue(formData.is_at_least_one_emergency_portable_cargo_pump_provided)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + headerRow + cargoPumpsRow + cargoEductorsRow + strippingRow + lastRow;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. CARGO PUMPS :</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Helper to generate a row for wires/ropes/lines tables
              const generateWireRow = (location, no, diameter, material, length, breaking) => {
                if (!hasValue(no) && !hasValue(diameter) && !hasValue(material) && !hasValue(length) && !hasValue(breaking)) {
                  return "";
                }
                return `<tr>
                    <td width="25%" class="text-uppercase">${location}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="10%" style="text-align: center;">${getValue(no)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(diameter, "MILLIMETERS")}</td>
                    <td width="15%" style="text-align: center;">${getValue(material)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(length, "METERS")}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(breaking, "METRIC TONNES")}</td>
                </tr>`;
              };

              // Helper to generate a table for wires/ropes/lines
              const generateWireTable = (headerTitle, rows) => {
                if (!rows || rows.trim() === "") return "";
                return `<table class="border-table">
                <tr>
                    <th width="25%" class="text-uppercase">${headerTitle}</th>
                    <th width="5%" style="text-align: center;">:</th>
                    <th width="10%" style="text-align: center;">NO</th>
                    <th width="15%" style="text-align: center;">DIAMETER</th>
                    <th width="15%" style="text-align: center;">MATERIAL</th>
                    <th width="15%" style="text-align: center;">LENGTH</th>
                    <th width="15%" style="text-align: center;">BREAKING</th>
                </tr>
                ${rows}
            </table>`;
              };

              // Generate WIRES (ON DRUMS) table
              const wiresRows = [
                generateWireRow("Forecastle", formData.no_of_forecastle, formData.diameter_of_forecastle, formData.material_of_forecastle, formData.length_of_forecastle, formData.breaking_of_forecastle),
                generateWireRow("Main deck fwd", formData.no_of_main_deck_fwd, formData.diameter_of_main_deck_fwd, formData.material_of_main_deck_fwd, formData.length_of_main_deck_fwd, formData.breaking_of_main_deck_fwd),
                generateWireRow("Main deck aft", formData.no_of_main_deck_aft, formData.diameter_of_main_deck_aft, formData.material_of_main_deck_aft, formData.length_of_main_deck_aft, formData.breaking_of_main_deck_aft),
                generateWireRow("Poop deck", formData.no_of_poop_deck, formData.diameter_of_poop_deck, formData.material_of_poop_deck, formData.length_of_poop_deck, formData.breaking_of_poop_deck)
              ].join("");
              const wiresTable = generateWireTable("WIRES ( ON DRUMS)", wiresRows);

              // Generate WIRES TAILS table
              const wiresTailsRows = [
                generateWireRow("Forecastle", formData.no_of_forecastle_tails, formData.diameter_of_forecastle_tails, formData.material_of_forecastle_tails, formData.length_of_forecastle_tails, formData.breaking_of_forecastle_tails),
                generateWireRow("Main deck fwd", formData.no_of_main_deck_fwd_tails, formData.diameter_of_main_deck_fwd_tails, formData.material_of_main_deck_fwd_tails, formData.length_of_main_deck_fwd_tails, formData.breaking_of_main_deck_fwd_tails),
                generateWireRow("Main deck aft", formData.no_of_main_deck_aft_tails, formData.diameter_of_main_deck_aft_tails, formData.material_of_main_deck_aft_tails, formData.length_of_main_deck_aft_tails, formData.breaking_of_main_deck_aft_tails),
                generateWireRow("Poop deck", formData.no_of_poop_deck_tails, formData.diameter_of_poop_deck_tails, formData.material_of_poop_deck_tails, formData.length_of_poop_deck_tails, formData.breaking_of_poop_deck_tails)
              ].join("");
              const wiresTailsTable = generateWireTable("WIRES TAILS", wiresTailsRows);

              // Generate ROPES (ON DRUMS) table
              const ropesRows = [
                generateWireRow("Forecastle", formData.no_of_forecastle_ropes, formData.diameter_of_forecastle_ropes, formData.material_of_forecastle_ropes, formData.length_of_forecastle_ropes, formData.breaking_of_forecastle_ropes),
                generateWireRow("Main deck fwd", formData.no_of_main_deck_fwd_ropes, formData.diameter_of_main_deck_fwd_ropes, formData.material_of_main_deck_fwd_ropes, formData.length_of_main_deck_fwd_ropes, formData.breaking_of_main_deck_fwd_ropes),
                generateWireRow("Main deck aft", formData.no_of_main_deck_aft_ropes, formData.diameter_of_main_deck_aft_ropes, formData.material_of_main_deck_aft_ropes, formData.length_of_main_deck_aft_ropes, formData.breaking_of_main_deck_aft_ropes),
                generateWireRow("Poop deck", formData.no_of_poop_deck_ropes, formData.diameter_of_poop_deck_ropes, formData.material_of_poop_deck_ropes, formData.length_of_poop_deck_ropes, formData.breaking_of_poop_deck_ropes)
              ].join("");
              const ropesTable = generateWireTable("ROPES (ON DRUMS)", ropesRows);

              // Generate OTHER LINES table
              const otherLinesRows = [
                generateWireRow("Forecastle", formData.no_of_forecastle_other_lines, formData.diameter_of_forecastle_other_lines, formData.material_of_forecastle_other_lines, formData.length_of_forecastle_other_lines, formData.breaking_of_forecastle_other_lines),
                generateWireRow("Main deck fwd", formData.no_of_main_deck_fwd_other_lines, formData.diameter_of_main_deck_fwd_other_lines, formData.material_of_main_deck_fwd_other_lines, formData.length_of_main_deck_fwd_other_lines, formData.breaking_of_main_deck_fwd_other_lines),
                generateWireRow("Main deck aft", formData.no_of_main_deck_aft_other_lines, formData.diameter_of_main_deck_aft_other_lines, formData.material_of_main_deck_aft_other_lines, formData.length_of_main_deck_aft_other_lines, formData.breaking_of_main_deck_aft_other_lines),
                generateWireRow("Poop deck", formData.no_of_poop_deck_other_lines, formData.diameter_of_poop_deck_other_lines, formData.material_of_poop_deck_other_lines, formData.length_of_poop_deck_other_lines, formData.breaking_of_poop_deck_other_lines)
              ].join("");
              const otherLinesTable = generateWireTable("OTHER LINES", otherLinesRows);

              // Helper to generate a row for winches table
              const generateWinchRow = (location, no, drums, power, brakeCapacity, brakeType) => {
                if (!hasValue(no) && !hasValue(drums) && !hasValue(power) && !hasValue(brakeCapacity) && !hasValue(brakeType)) {
                  return "";
                }
                return `<tr>
                    <td width="25%" class="text-uppercase">${location}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="10%" style="text-align: center;">${getValue(no)}</td>
                    <td width="15%" style="text-align: center;">${getValue(drums)}</td>
                    <td width="15%" style="text-align: center;">${getValue(power)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(brakeCapacity, "METRIC TONNES")}</td>
                    <td width="15%" style="text-align: center;">${getValue(brakeType)}</td>
                </tr>`;
              };

              // Generate WINCHES table
              const winchesRows = [
                generateWinchRow("Forecastle", formData.no_of_forecastle_winches, formData.no_of_drums_of_forecastle_winches, formData.motive_power_of_forecastle_winches, formData.brake_capacity_of_forecastle_winches, formData.type_of_brake_of_forecastle_winches),
                generateWinchRow("Main deck fwd", formData.no_of_main_deck_fwd_winches, formData.no_of_drums_of_main_deck_fwd_winches, formData.motive_power_of_main_deck_fwd_winches, formData.brake_capacity_of_main_deck_fwd_winches, formData.type_of_brake_of_main_deck_fwd_winches),
                generateWinchRow("Main deck aft", formData.no_of_main_deck_aft_winches, formData.no_of_drums_of_main_deck_aft_winches, formData.motive_power_of_main_deck_aft_winches, formData.brake_capacity_of_main_deck_aft_winches, formData.type_of_brake_of_main_deck_aft_winches),
                generateWinchRow("Poop deck", formData.no_of_poop_deck_winches, formData.no_of_drums_of_poop_deck_winches, formData.motive_power_of_poop_deck_winches, formData.brake_capacity_of_poop_deck_winches, formData.type_of_brake_of_poop_deck_winches)
              ].join("");
              const winchesTable = winchesRows ? `<table class="border-table">
                <tr>
                    <th width="25%" class="text-uppercase">WINCHES</th>
                    <th width="5%" style="text-align: center;">:</th>
                    <th width="10%" style="text-align: center;">NO</th>
                    <th width="15%" style="text-align: center;">No. DRUMS</th>
                    <th width="15%" style="text-align: center;">MOTIVE POWER</th>
                    <th width="15%" style="text-align: center;">BRAKE CAPACITY</th>
                    <th width="15%" style="text-align: center;">TYPE OF BRAKE</th>
                </tr>
                ${winchesRows}
            </table>` : "";

              // Helper to generate a row for bitts table
              const generateBittRow = (location, no, swlBitts, noChocks, swlChocks) => {
                if (!hasValue(no) && !hasValue(swlBitts) && !hasValue(noChocks) && !hasValue(swlChocks)) {
                  return "";
                }
                return `<tr>
                    <td width="40%" class="text-uppercase">${location}</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="10%" style="text-align: center;">${getValue(no)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(swlBitts, "METRIC TONNES")}</td>
                    <td width="15%" style="text-align: center;">${getValue(noChocks)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(swlChocks, "METRIC TONNES")}</td>
                </tr>`;
              };

              // Generate BITTS, CLOSED CHOKS/FAIRLEADS table
              const bittsRows = [
                generateBittRow("Forecastle", formData.no_of_forecastle_bitts, formData.swl_bitts_of_forecastle_bitts, formData.no_of_closed_chocks_of_forecastle_bitts, formData.swl_closed_chocks_of_forecastle_bitts),
                generateBittRow("Main deck fwd", formData.no_of_main_deck_fwd_bitts, formData.swl_bitts_of_main_deck_fwd_bitts, formData.no_of_closed_chocks_of_main_deck_fwd_bitts, formData.swl_closed_chocks_of_main_deck_fwd_bitts),
                generateBittRow("Main deck aft", formData.no_of_main_deck_aft_bitts, formData.swl_bitts_of_main_deck_aft_bitts, formData.no_of_closed_chocks_of_main_deck_aft_bitts, formData.swl_closed_chocks_of_main_deck_aft_bitts),
                generateBittRow("Poop deck", formData.no_of_poop_deck_bitts, formData.swl_bitts_of_poop_deck_bitts, formData.no_of_closed_chocks_of_poop_deck_bitts, formData.swl_closed_chocks_of_poop_deck_bitts)
              ].join("");
              const bittsTable = bittsRows ? `<table class="border-table">
                <tr>
                    <th width="40%" class="text-uppercase">BITTS, CLOSED CHOKS/FAIRLEADS</th>
                    <th width="5%" style="text-align: center;">:</th>
                    <th width="10%" style="text-align: center;">No</th>
                    <th width="15%" style="text-align: center;">SWL Bitts</th>
                    <th width="15%" style="text-align: center;">No. Closed Chocks</th>
                    <th width="15%" style="text-align: center;">SWL Closed Chocks</th>
                </tr>
                ${bittsRows}
            </table>` : "";

              // Combine all tables
              const allTables = wiresTable + wiresTailsTable + ropesTable + otherLinesTable + winchesTable + bittsTable;

              // Check if any table was generated (non-empty)
              if (!allTables || allTables.trim() === "") {
                return ""; // Hide entire section if no tables
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and all tables
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. MOORING</h2>
            ${allTables}
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.number_of_shackles_on_port_starboard_cable)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Number of shackles on port/starboard cable</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="50%" colspan="2" style="text-align: center;">${getValue(formData.number_of_shackles_on_port_starboard_cable)}</td>
                </tr>`
                : "";

              const row2 = (hasValue(formData.type_of_emergency_towing_system_forward_type) || 
                           hasValue(formData.type_of_emergency_towing_system_forward_swl))
                ? `<tr>
                    <td width="45%" class="text-uppercase">Type/SWL of Emergency Towing system forward:</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.type_of_emergency_towing_system_forward_type)}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.type_of_emergency_towing_system_forward_swl, "METRIC TONNES")}</td>
                </tr>`
                : "";

              const row3 = (hasValue(formData.type_of_emergency_towing_system_aft_type) || 
                           hasValue(formData.type_of_emergency_towing_system_aft_swl))
                ? `<tr>
                    <td width="45%" class="text-uppercase">Type/SWL of Emergency Towing system aft</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.type_of_emergency_towing_system_aft_type)}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.type_of_emergency_towing_system_aft_swl, "METRIC TONNES")}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. ANCHORS/EMERGENCY TOWING SYSTEM</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = (hasValue(formData.type_of_escort_tug_type) || 
                           hasValue(formData.type_of_escort_tug_swl))
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is size/SWL of closed chock and/or fairleads of enclosed type on stern</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.type_of_escort_tug_type, "MILLIMETERS")}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.type_of_escort_tug_swl, "METRIC TONNES")}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.swl_of_bollard_on_poop_deck_suitable_for_escort_tug)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is SWL of bollard on poop deck suitable for escort tug</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="50%" colspan="2" style="text-align: center;">${formatWithUnit(formData.swl_of_bollard_on_poop_deck_suitable_for_escort_tug, "METRIC TONNES")}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. ESCORT TUG</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.derrick_crane_description)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Derrick/Crane description (Number, SWL and location)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.derrick_crane_description)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.accommodation_ladder_direction)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Accommodation ladder direction</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.accommodation_ladder_direction)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.does_vessel_have_a_portable_gangway)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Does vessel have a portable gangway? If yes, state length</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${formatWithUnit(formData.does_vessel_have_a_portable_gangway, "METERS")}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Return the entire section with heading and table
              return `
            <h2><span class="masubin-counter">10.7</span>. LIFTING EQUIPMENT/ GANGWAY</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.does_vessel_meet_the_recommendations)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Does the vessel meet the recommendations in the latest edition of OCIMF 8Recommendations for Equipment Employed in the Bow Mooring of Conventional Tankers at Single Point Moorings (SPM)?</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.does_vessel_meet_the_recommendations)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.how_many_chain_stoppers)
                ? `<tr>
                    <td width="45%" class="text-uppercase">If fitted, how many chain stoppers:</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.how_many_chain_stoppers)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.state_type_swl_of_chain_stopper_s)
                ? `<tr>
                    <td width="45%" class="text-uppercase">State type/SWL of chain stopper(s):</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${formatWithUnit(formData.state_type_swl_of_chain_stopper_s, "METRIC TONNES")}</td>
                </tr>`
                : "";

              const row4 = hasValue(formData.maximum_size_chain_diameter_the_bow_stopper_s_can_handle)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is the maximum size chain diameter the bow stopper(s) can handle:</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${formatWithUnit(formData.maximum_size_chain_diameter_the_bow_stopper_s_can_handle, "MILLIMETERS")}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.distance_between_the_bow_fairlead_and_chain_stopper_bracket)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Distance between the bow fairlead and chain stopper/bracket:</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${formatWithUnit(formData.distance_between_the_bow_fairlead_and_chain_stopper_bracket, "METERS")}</td>
                </tr>`
                : "";

              const row6 = hasValue(formData.is_bow_chock_and_or_fairlead)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is bow chock and/or fairlead of enclosed type of OCIMF recommended size (600mm x 450mm)? If not, give details of size:</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.is_bow_chock_and_or_fairlead)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3 + row4 + row5 + row6;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. SINGLE POINT MOORING (SPM) EQUIPMENT</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = (hasValue(formData.ballast_speed_maximum) || 
                           hasValue(formData.ballast_speed_minimum))
                ? `<tr>
                    <td width="45%" class="text-uppercase">Ballast speed</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.ballast_speed_maximum, "KNOTS (WSNP)")}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.ballast_speed_minimum, "KNOTS (WSNP)")}</td>
                </tr>`
                : "";

              const row2 = (hasValue(formData.laden_speed_maximum) || 
                           hasValue(formData.laden_speed_minimum))
                ? `<tr>
                    <td width="45%" class="text-uppercase">Laden speed</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.laden_speed_maximum, "KNOTS (WSNP)")}</td>
                    <td width="25%" style="text-align: center;">${formatWithUnit(formData.laden_speed_minimum, "KNOTS (WSNP)")}</td>
                </tr>`
                : "";

              const row3 = (hasValue(formData.what_type_of_fuel_is_used_maximum) || 
                           hasValue(formData.what_type_of_fuel_is_used_economic))
                ? `<tr>
                    <td width="45%" class="text-uppercase">What type of fuel is used for main propulsion/generating plant</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.what_type_of_fuel_is_used_maximum)}</td>
                    <td width="25%" style="text-align: center;">${getValue(formData.what_type_of_fuel_is_used_economic)}</td>
                </tr>`
                : "";

              const row4 = hasValue(formData.type_of_bunker_tanks)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Type/Capacity of bunker tanks</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="50%" colspan="2" style="text-align: center;">${formatWithUnit(formData.type_of_bunker_tanks, "CUBIC METRES")}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.is_vessel_fitted_with_fixed)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Is vessel fitted with fixed or controllable pitch propeller(s)</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="50%" colspan="2" style="text-align: center;">${getValue(formData.is_vessel_fitted_with_fixed)}</td>
                </tr>`
                : "";

              // Combine all data rows
              const dataRows = row1 + row2 + row3 + row4 + row5;

              // Check if any data rows were generated (non-empty)
              if (!dataRows || dataRows.trim() === "") {
                return ""; // Hide entire section if no data rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading, header row, and data rows
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. PROPULSION</h2>
            <table class="border-table">
                <tr>
                    <td width="45%" class="text-uppercase">Speed</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="25%" style="text-align: center;">Maximum</td>
                    <td width="25%" style="text-align: center;">Economical</td>
                </tr>
                ${dataRows}
            </table>
              `;
            })()}

            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = (hasValue(formData.no_of_main_engine) || 
                           hasValue(formData.capacity_of_main_engine) || 
                           hasValue(formData.make_type_of_main_engine))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Main engine</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.no_of_main_engine)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_main_engine, "KILOWATTS")}</td>
                    <td width="30%" colspan="2" style="text-align: center;">${getValue(formData.make_type_of_main_engine)}</td>
                </tr>`
                : "";

              const row2 = (hasValue(formData.no_of_aux_engine) || 
                           hasValue(formData.capacity_of_aux_engine) || 
                           hasValue(formData.make_type_of_aux_engine))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Aux engine</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.no_of_aux_engine)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_aux_engine, "KILOWATTS")}</td>
                    <td width="30%" colspan="2" style="text-align: center;">${getValue(formData.make_type_of_aux_engine)}</td>
                </tr>`
                : "";

              const row3 = (hasValue(formData.no_of_power_packs) || 
                           hasValue(formData.capacity_of_power_packs) || 
                           hasValue(formData.make_type_of_power_packs))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Power packs</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.no_of_power_packs)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_power_packs, "CUBIC METRES/HOUR")}</td>
                    <td width="30%" colspan="2" style="text-align: center;">${getValue(formData.make_type_of_power_packs)}</td>
                </tr>`
                : "";

              const row4 = (hasValue(formData.no_of_boilers) || 
                           hasValue(formData.capacity_of_boilers) || 
                           hasValue(formData.make_type_of_boilers))
                ? `<tr>
                    <td width="35%" class="text-uppercase">Boilers</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <td width="15%" style="text-align: center;">${getValue(formData.no_of_boilers)}</td>
                    <td width="15%" style="text-align: center;">${formatWithUnit(formData.capacity_of_boilers, "METRIC TONNES/HOUR")}</td>
                    <td width="30%" colspan="2" style="text-align: center;">${getValue(formData.make_type_of_boilers)}</td>
                </tr>`
                : "";

              // Combine all data rows
              const dataRows = row1 + row2 + row3 + row4;

              // Check if any data rows were generated (non-empty)
              if (!dataRows || dataRows.trim() === "") {
                return ""; // Hide entire section if no data rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading, header row, and data rows
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. ENGINE EQUIPMENTS</h2>
            <table class="border-table">
                <tr>
                    <td width="35%" class="text-uppercase">ENGINES</td>
                    <td width="5%" style="text-align: center;">:</td>
                    <th width="15%" style="text-align: center;">NO</th>
                    <th width="15%" style="text-align: center;">CAPACITY</th>
                    <th width="30%" colspan="2" style="text-align: center;">MAKE/TYPE</th>
                </tr>
                ${dataRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.what_is_brake_horse_power_of_bow_thruster)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is brake horse power of bow thruster (if fitted)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.what_is_brake_horse_power_of_bow_thruster)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.what_is_brake_horse_power_of_stern_thruster)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is brake horse power of stern thruster (if fitted)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.what_is_brake_horse_power_of_stern_thruster)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. BOW/STERN THRUSTER</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.main_engine_imo_nox_emission_standard)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Main engine IMO NOx emission standard</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.main_engine_imo_nox_emission_standard)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.energy_efficiency_design_index_eedi_rating_number)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Energy Efficiency Design Index (EEDI) rating number</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.energy_efficiency_design_index_eedi_rating_number)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. EMISSIONS</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Helper to format value with unit
              const formatWithUnit = (val, unit) => {
                if (!hasValue(val)) return "";
                return `${getValue(val)} ${unit}`;
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.does_vessel_comply_with_recommendations_contained_in_ocimf)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Does vessel comply with recommendations contained in OCIMF/ICS Ship To Ship</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.does_vessel_comply_with_recommendations_contained_in_ocimf)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.what_is_maximum_outreach_of_cranes_derricks_outboard)
                ? `<tr>
                    <td width="45%" class="text-uppercase">What is maximum outreach of cranes/derricks outboard of the ship's side</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${formatWithUnit(formData.what_is_maximum_outreach_of_cranes_derricks_outboard, "METERS")}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.date_place_of_last_sts_operation)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Date/place of last STS operation</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.date_place_of_last_sts_operation)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this sub section
              const subCounterValue = getNextSubCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="sub-counter">${subCounterValue}</span>. SHIP TO SHIP TRANSFER</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}
            ${(() => {
              // Helper to check if value exists
              const hasValue = (val) => {
                return val && val !== "null" && val !== "undefined" && (typeof val !== "string" || val.trim() !== "");
              };

              // Generate rows conditionally
              const row1 = hasValue(formData.last_three_cargoes_charterers_voyages)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Last three cargoes/charterers/voyages (Last/2nd Last/3rd Last)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.last_three_cargoes_charterers_voyages)}</td>
                </tr>`
                : "";

              const row2 = hasValue(formData.has_vessel_been_involved_in_a_pollution)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Has vessel been involved in a pollution, grounding, serious casualty, unscheduled repair or collision incident during the past 12 months? If yes, provide details</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.has_vessel_been_involved_in_a_pollution)}</td>
                </tr>`
                : "";

              const row3 = hasValue(formData.date_and_place_of_last_port_state_control_inspection)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Date and place of last Port State Control inspection</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.date_and_place_of_last_port_state_control_inspection)}</td>
                </tr>`
                : "";

              const row4 = hasValue(formData.any_outstanding_deficiencies_as_reported_by_any_port_state)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Any outstanding deficiencies as reported by any Port State Control? If yes, provide details</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.any_outstanding_deficiencies_as_reported_by_any_port_state)}</td>
                </tr>`
                : "";

              const row5 = hasValue(formData.recent_oil_company_inspections_screenings)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Recent Oil company inspections/screenings (To the best of owners knowledge)</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.recent_oil_company_inspections_screenings)}</td>
                </tr>`
                : "";

              const row6 = hasValue(formData.date_place_of_last_sire_inspection)
                ? `<tr>
                    <td width="45%" class="text-uppercase">Date/Place of last SIRE inspection</td>
                    <td width="10%" style="text-align: center;">:</td>
                    <td width="45%" style="text-align: center;">${getValue(formData.date_place_of_last_sire_inspection)}</td>
                </tr>`
                : "";

              // Combine all rows
              const tableRows = row1 + row2 + row3 + row4 + row5 + row6;

              // Check if any rows were generated (non-empty)
              if (!tableRows || tableRows.trim() === "") {
                return ""; // Hide entire section if no rows
              }

              // Get dynamic counter for this main section
              const mainCounterValue = getNextMainCounter();

              // Return the entire section with heading and table
              return `
            <h2><span class="main-counter">${mainCounterValue}</span>. RECENT OPERATIONAL HISTORY</h2>
            <table class="border-table">
                ${tableRows}
            </table>
              `;
            })()}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "HEADING_DESCRIPTION_IMAGE",
              getNextMainCounter,
              null
            )}

            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "EQUIPMENT_MAKE_MODEL",
              getNextMainCounter,
              null
            )}
            
            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "HEADING_DESCRIPTION_IMAGE_2",
              getNextMainCounter,
              null
            )}
            
            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "EQUIPMENT_MAKE_MODEL_2",
              getNextMainCounter,
              null
            )}
            
            ${generateFlexibleFieldsForSection(
              formData.flexible_fields || [],
              "HEADING_DESCRIPTION_IMAGE_3",
              getNextMainCounter,
              null
            )}

            <h2>DISCLAIMER</h2>
            <p>${getValue(formData.disclaimer)}</p>

            <!-- Last Page Declaration -->
            <div class="last-page-declaration">
                <div class="declaration-text">ISSUED WITHOUT PREJUDICE</div>
                <div class="stamp-signature">
                    <div class="left-stamp">
                        ${
                          stampImageBase64
                            ? `<img src="${stampImageBase64}" alt="Stamp">`
                            : ""
                        }
                    </div>
                    <div class="right-text">
                        <div>VALUETECH SOLUTIONS,</div>
                        <div>MUMBAI SURVEYOR</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="footer">
            <div class="page-number">
                <span class="number" data-page-num="1">1</span>
                <span class="separator">|</span>
                <span class="label">Page</span>
            </div>
        </div>
    </div>

    <!-- ============================================
         INSTRUCTIONS FOR JAVASCRIPT:
         ============================================
         Copy ALL JavaScript from marine_report_template.html
         Starting from the opening <script> tag to the closing </script> tag
         Paste it here, replacing this comment block
         ============================================
         The JavaScript should include:
         - autoPaginate() function
         - generatePDF() function
         - updatePageCount() function
         - All event listeners
         - All other JavaScript code from the HTML file
         ============================================
    -->
    
     <script>
         // Auto-pagination system
        function autoPaginate() {
            // Step 1: Collect all content elements from all pages
            const allPages = document.querySelectorAll('.page');
            const allContentElements = [];

            allPages.forEach(page => {
                const pageContent = page.querySelector('.page-content');
                if (pageContent) {
                    const heroPage = pageContent.querySelector('.report-hero-page');
                    const reportInfo = pageContent.querySelector('.report-info');

                    if (heroPage) {
                        allContentElements.push(heroPage);
                    }
                    if (reportInfo) {
                        allContentElements.push(reportInfo);
                    }

                    // Get all other content elements
                    const contentElements = Array.from(pageContent.children).filter(el => {
                        return el.tagName && (
                            el.tagName.match(/^H[1-6]$/) ||
                            el.tagName === 'P' ||
                            el.tagName === 'TABLE' ||
                            el.tagName === 'IMG' ||
                            el.tagName === 'DIV'
                        );
                    });

                    contentElements.forEach(el => {
                        if (el !== heroPage && el !== reportInfo) {
                            if (el.tagName === 'TABLE') {
                                let rows = [];
                                if (el.querySelector('tbody')) {
                                    rows = Array.from(el.querySelector('tbody').children).filter(child => child.tagName === 'TR');
                                } else {
                                    rows = Array.from(el.children).filter(child => child.tagName === 'TR');
                                }

                                if (rows.length > 0) {
                                    const tableClassName = el.className;
                                    const tableWidth = el.getAttribute('width') || el.style.width;
                                    
                                    // Store the first row to use as width reference for continuation tables
                                    // This preserves the exact column structure without modification
                                    let firstRowReference = null;
                                    if (rows.length > 0) {
                                        firstRowReference = rows[0].cloneNode(true);
                                    }

                                    rows.forEach((row, index) => {
                                        row._isTableRow = true;
                                        row._tableIndex = allContentElements.length;
                                        row._rowIndex = index;
                                        row._tableClassName = tableClassName;
                                        row._tableWidth = tableWidth;
                                        // Store first row reference for continuation tables
                                        if (firstRowReference) {
                                            row._tableFirstRowReference = firstRowReference.cloneNode(true);
                                        }
                                        allContentElements.push(row);
                                    });
                                } else {
                                    allContentElements.push(el);
                                }
                            } else {
                                allContentElements.push(el);
                            }
                        }
                    });
                }
            });

            if (allContentElements.length === 0) return;

            // Step 2: Clear all pages except the first one
            const firstPage = allPages[0];
            if (!firstPage) return;

            for (let i = 1; i < allPages.length; i++) {
                allPages[i].remove();
            }

            // Step 3: Get first page content
            let currentPage = firstPage;
            let currentPageContent = currentPage.querySelector('.page-content');
            if (!currentPageContent) return;

            const pageContentHeight = currentPageContent.offsetHeight;
            const heroPage = currentPageContent.querySelector('.report-hero-page');
            const reportInfo = currentPageContent.querySelector('.report-info');

            currentPageContent.innerHTML = '';
            let currentPageNum = 1;

            // Add hero page first
            if (heroPage) {
                currentPageContent.appendChild(heroPage);
                const secondPage = createNewPage(2);
                currentPage.insertAdjacentElement('afterend', secondPage);
                currentPage = secondPage;
                currentPageContent = currentPage.querySelector('.page-content');
                currentPageNum = 2;
            }

            // Step 4: Add content with smart heading-content grouping
            let currentTable = null;
            let lastHeading = null;  // Track the last heading added

            for (let i = 0; i < allContentElements.length; i++) {
                const element = allContentElements[i];

                if (element === heroPage) continue;

                // Check if this is a heading
                const isHeading = element.tagName && element.tagName.match(/^H[1-6]$/);

                // If this is a heading, we need to ensure it stays with its content
                if (isHeading) {
                    lastHeading = element;
                    
                    // Look ahead to see if there's immediate content (table rows or paragraph)
                    let nextElement = i + 1 < allContentElements.length ? allContentElements[i + 1] : null;
                    
                    // Temporarily add heading to check if heading + some content fits
                    currentTable = null;  // Reset table when we hit a heading
                    currentPageContent.appendChild(element);
                    void currentPageContent.offsetHeight;
                    
                    // Check if just the heading already overflows
                    if (currentPageContent.scrollHeight > pageContentHeight) {
                        // Heading alone doesn't fit, move to new page
                        element.remove();
                        currentPageNum++;
                        const newPage = createNewPage(currentPageNum);
                        currentPage.insertAdjacentElement('afterend', newPage);
                        currentPage = newPage;
                        currentPageContent = currentPage.querySelector('.page-content');
                        currentPageContent.appendChild(element);
                        void currentPageContent.offsetHeight;
                        continue;
                    }
                    
                    // Heading fits, now check if we can fit at least one content element
                    if (nextElement) {
                        // Create a test container to measure heading + content
                        const testContainer = document.createElement('div');
                        testContainer.style.visibility = 'hidden';
                        testContainer.style.position = 'absolute';
                        testContainer.appendChild(element.cloneNode(true));
                        
                        if (nextElement._isTableRow) {
                            // For table rows, try to fit heading + first row
                            const testTable = document.createElement('table');
                            testTable.style.width = nextElement._tableWidth || '100%';
                            testTable.style.borderCollapse = 'collapse';
                            testTable.style.margin = '15px 0';
                            if (nextElement._tableClassName) {
                                testTable.className = nextElement._tableClassName;
                            }
                            const tbody = document.createElement('tbody');
                            tbody.appendChild(nextElement.cloneNode(true));
                            testTable.appendChild(tbody);
                            testContainer.appendChild(testTable);
                        } else if (nextElement.tagName === 'P') {
                            // For paragraph elements, clone and append
                            testContainer.appendChild(nextElement.cloneNode(true));
                        } else {
                            // For other elements, clone and append
                            testContainer.appendChild(nextElement.cloneNode(true));
                        }
                        
                        currentPageContent.appendChild(testContainer);
                        void currentPageContent.offsetHeight;
                        const testHeight = currentPageContent.scrollHeight;
                        testContainer.remove();
                        
                        // If heading + first content doesn't fit, move heading to new page
                        if (testHeight > pageContentHeight) {
                            element.remove();
                            currentPageNum++;
                            const newPage = createNewPage(currentPageNum);
                            currentPage.insertAdjacentElement('afterend', newPage);
                            currentPage = newPage;
                            currentPageContent = currentPage.querySelector('.page-content');
                            currentPageContent.appendChild(element);
                            void currentPageContent.offsetHeight;
                        }
                    }
                    
                    continue;
                }

                // Handle table rows
                if (element._isTableRow) {
                    if (!currentTable || element._rowIndex === 0) {
                        currentTable = document.createElement('table');
                        currentTable.style.width = element._tableWidth || '100%';
                        currentTable.style.borderCollapse = 'collapse';
                        currentTable.style.margin = '15px 0';
                        if (element._tableClassName) {
                            currentTable.className = element._tableClassName;
                        }
                        const tbody = document.createElement('tbody');
                        
                        // Add invisible first row to preserve column widths naturally
                        if (element._tableFirstRowReference && element._rowIndex !== 0) {
                            const hiddenRow = element._tableFirstRowReference.cloneNode(true);
                            hiddenRow.style.visibility = 'collapse'; // collapse instead of hidden to preserve widths
                            hiddenRow.style.lineHeight = '0';
                            hiddenRow.style.height = '0';
                            // Empty the cell contents but keep the structure
                            const cells = hiddenRow.querySelectorAll('td, th');
                            cells.forEach(cell => {
                                cell.innerHTML = '&nbsp;';
                                cell.style.padding = '0';
                                cell.style.border = 'none';
                            });
                            tbody.appendChild(hiddenRow);
                        }
                        
                        currentTable.appendChild(tbody);
                        currentPageContent.appendChild(currentTable);
                    }

                    currentTable.querySelector('tbody').appendChild(element);
                } else {
                    currentTable = null;
                    currentPageContent.appendChild(element);
                }

                void currentPageContent.offsetHeight;

                // Check for overflow
                if (currentPageContent.scrollHeight > pageContentHeight) {
                    if (element._isTableRow) {
                        // Row doesn't fit, move to new page
                        element.remove();
                        currentPageNum++;
                        const newPage = createNewPage(currentPageNum);
                        currentPage.insertAdjacentElement('afterend', newPage);
                        currentPage = newPage;
                        currentPageContent = currentPage.querySelector('.page-content');

                        currentTable = document.createElement('table');
                        currentTable.style.width = element._tableWidth || '100%';
                        currentTable.style.borderCollapse = 'collapse';
                        currentTable.style.margin = '15px 0';
                        if (element._tableClassName) {
                            currentTable.className = element._tableClassName;
                        }
                        const tbody = document.createElement('tbody');
                        
                        // Add invisible first row to preserve column widths in continuation table
                        if (element._tableFirstRowReference) {
                            const hiddenRow = element._tableFirstRowReference.cloneNode(true);
                            hiddenRow.style.visibility = 'collapse'; // collapse to preserve widths
                            hiddenRow.style.lineHeight = '0';
                            hiddenRow.style.height = '0';
                            // Empty the cell contents but keep the structure
                            const cells = hiddenRow.querySelectorAll('td, th');
                            cells.forEach(cell => {
                                cell.innerHTML = '&nbsp;';
                                cell.style.padding = '0';
                                cell.style.border = 'none';
                            });
                            tbody.appendChild(hiddenRow);
                        }
                        
                        currentTable.appendChild(tbody);
                        currentPageContent.appendChild(currentTable);
                        currentTable.querySelector('tbody').appendChild(element);
                    } else {
                        element.remove();
                        currentTable = null;

                        const contentOnCurrentPage = Array.from(currentPageContent.children);
                        if (contentOnCurrentPage.length === 0) {
                            currentPageContent.appendChild(element);
                            currentPageNum++;
                            const newPage = createNewPage(currentPageNum);
                            currentPage.insertAdjacentElement('afterend', newPage);
                            currentPage = newPage;
                            currentPageContent = currentPage.querySelector('.page-content');
                        } else {
                            currentPageNum++;
                            const newPage = createNewPage(currentPageNum);
                            currentPage.insertAdjacentElement('afterend', newPage);
                            currentPage = newPage;
                            currentPageContent = currentPage.querySelector('.page-content');
                            currentPageContent.appendChild(element);
                        }
                    }
                }
            }

            updatePageNumbers();
        }

        function createNewPage(pageNum) {
            const newPage = document.createElement('div');
            newPage.className = 'page subsequent-page';
            newPage.setAttribute('data-page', pageNum);

            // Add stamp overlay to subsequent pages
            ${
              stampImageBase64
                ? `const stampOverlay = document.createElement('div');
            stampOverlay.className = 'stamp-overlay';
            stampOverlay.innerHTML = '<img src="${stampImageBase64}" alt="Stamp">';
            newPage.appendChild(stampOverlay);`
                : "// No stamp image available"
            }

            const pageContent = document.createElement('div');
            pageContent.className = 'page-content';

            const footer = document.createElement('div');
            footer.className = 'footer';
            footer.innerHTML = '<div class="page-number">' +
                '<span class="number" data-page-num="' + pageNum + '">' + pageNum + '</span>' +
                '<span class="separator">|</span>' +
                '<span class="label">Page</span>' +
                '</div>';

            newPage.appendChild(pageContent);
            newPage.appendChild(footer);

            return newPage;
        }

        function updatePageNumbers() {
            const pages = document.querySelectorAll('.page');
            pages.forEach((page, index) => {
                const pageNum = index + 1;
                const numberSpan = page.querySelector('.footer .number');
                if (numberSpan) {
                    numberSpan.textContent = pageNum;
                    numberSpan.setAttribute('data-page-num', pageNum);
                }
            });
            
            // Remove stamp from last page if it has the declaration section
            if (pages.length > 0) {
                const lastPage = pages[pages.length - 1];
                const hasDeclaration = lastPage.querySelector('.last-page-declaration');
                if (hasDeclaration) {
                    const stampOverlay = lastPage.querySelector('.stamp-overlay');
                    if (stampOverlay) {
                        stampOverlay.remove();
                    }
                }
            }
        }

        function mmToPx(mm) {
            return mm * 3.779527559; // 1mm = 3.779527559px at 96 DPI
        }

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', function () {
            // Wait for content to render
            setTimeout(() => {
                // console.log('Starting auto-pagination...');
                autoPaginate();
                // console.log('Pagination complete. Total pages:', document.querySelectorAll('.page').length);
                // Auto-check status
                checkPaginationStatus();
            }, 100);
        });

        // Re-paginate on window resize
        let resizeTimeout;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                autoPaginate();
            }, 250);
        });

        // Example: Function to add data dynamically
        function populateReportData(data) {
            if (data.refNo) document.getElementById('ref-no').textContent = data.refNo;
            if (data.reportDate) document.getElementById('report-date').textContent = data.reportDate;
            if (data.orderNumber) document.getElementById('order-number').textContent = data.orderNumber;
            if (data.assetType) {
                const assetTypeElements = document.querySelectorAll('#asset-type');
                assetTypeElements.forEach(el => el.textContent = data.assetType);
            }
            if (data.manufactureYear) {
                const yearElements = document.querySelectorAll('#manufacture-year');
                yearElements.forEach(el => el.textContent = data.manufactureYear);
            }
            if (data.model) {
                const modelElements = document.querySelectorAll('#model');
                modelElements.forEach(el => el.textContent = data.model);
            }
            // Re-paginate after data update
            setTimeout(() => autoPaginate(), 100);
        }


        // You can also add a function to check pagination status
        function checkPaginationStatus() {
            const pages = document.querySelectorAll('.page');
            // console.log('\\n=== PAGINATION STATUS ===');
            // console.log('Total Pages: ' + pages.length);
            pages.forEach(function(page, index) {
                const pageNum = index + 1;
                const content = page.querySelector('.page-content');
                const childrenCount = content.children.length;
                // console.log('\\nPage ' + pageNum + ':', {
                //     children: childrenCount,
                //     scrollHeight: content.scrollHeight + 'px',
                //     offsetHeight: content.offsetHeight + 'px',
                //     hasOverflow: content.scrollHeight > content.offsetHeight,
                //     elements: Array.from(content.children).map(function(el) { return el.tagName; }).join(', ')
                // });
            });
            // console.log('========================\\n');
        }
    </script>
</body>
</html>
  `;
}

/**
 * Generate HTML for flexible fields within a specific section for Marine reports
 * Marine reports use field_1, field_2, ..., field_10 instead of field_label/field_value
 *
 * @param {Array} flexibleFields - Array of flexible field objects
 * @param {string} sectionName - The section name to filter fields for
 * @param {Function} getNextMainCounter - Optional function to get next main-counter value
 * @param {Function} getNextSubCounter - Optional function to get next sub-counter value
 * @returns {string} HTML for flexible fields in the specified section
 */
function generateFlexibleFieldsForSection(flexibleFields, sectionName, getNextMainCounter = null, getNextSubCounter = null, formData = null) {
  if (!flexibleFields || flexibleFields.length === 0) {
    return "";
  }

  // Filter fields for the specific section
  const sectionFields = flexibleFields.filter(
    (field) => field.section_name === sectionName
  );

  if (sectionFields.length === 0) {
    // Debug: Log when section fields are not found
    if (flexibleFields.length > 0) {
      const availableSections = [
        ...new Set(flexibleFields.map((f) => f.section_name).filter(Boolean)),
      ];
      // console.log(
      //   `[Template] Section "${sectionName}" not found. Available sections:`,
      //   availableSections
      // );
    }
    return "";
  }

  // Sort by field_order
  sectionFields.sort((a, b) => {
    const orderA = a.field_order ? parseInt(a.field_order) : 0;
    const orderB = b.field_order ? parseInt(b.field_order) : 0;
    return orderA - orderB;
  });

  let html = "";

  // HEADING_DESCRIPTION_IMAGE sections - render as heading, description, image
  if (sectionName.includes("HEADING_DESCRIPTION_IMAGE")) {
    sectionFields.forEach((field) => {
      const heading = field.field_1 || "";
      const description = field.field_2 || "";
      const imageUrl = field.field_3 || "";
      const imageId = field.field_4 || "";

      if (heading || description || imageUrl) {
        const counterValue = getNextMainCounter ? getNextMainCounter() : (field.field_order || "");
        // Render heading with HTML support
        const renderedHeading = renderFieldValue(heading);
        html += `<h2><span class="main-counter">${counterValue}</span>. ${renderedHeading}</h2>`;
        if (description) {
          // Render description with HTML support
          const renderedDescription = renderFieldValue(description);
          html += `<p>${renderedDescription}</p>`;
        }
        if (imageUrl) {
          // Convert relative URLs to absolute if needed
          let fullImageUrl = imageUrl;
          if (imageUrl.startsWith("/") && !imageUrl.startsWith("http")) {
            const baseUrl = process.env.BASE_URL || "http://localhost:5000";
            fullImageUrl = `${baseUrl}${imageUrl}`;
          } else if (
            !imageUrl.startsWith("http") &&
            !imageUrl.startsWith("data:")
          ) {
            const baseUrl = process.env.BASE_URL || "http://localhost:5000";
            fullImageUrl = `${baseUrl}/${imageUrl}`;
          }
          html += `<img src="${fullImageUrl}" style="width: 100%; height: auto;" alt="${heading}">`;
        }
      }
    });
  }
  // EQUIPMENT_MAKE_MODEL sections - render as table with NAME, MAKE, MODEL columns
  else if (sectionName.includes("EQUIPMENT_MAKE_MODEL")) {
    // First, check if there's any data
    let hasData = false;
    const tableRows = [];
    
    sectionFields.forEach((field) => {
      const name = renderFieldValue(field.field_1 || "");
      const make = renderFieldValue(field.field_2 || "");
      const model = renderFieldValue(field.field_3 || "");

      if (name || make || model) {
        hasData = true;
        tableRows.push(`<tr>
            <td width="40%" class="text-uppercase">${name}</td>
            <td width="10%" style="text-align: center;">:</td>
            <td width="25%" style="text-align: center;">${make}</td>
            <td width="25%" style="text-align: center;">${model}</td>
        </tr>`);
      }
    });
    
    // Only generate HTML if there's data
    if (!hasData) {
      return "";
    }
    
    const firstField = sectionFields[0];
    const counterValue = getNextMainCounter ? getNextMainCounter() : (firstField.field_order || "");
    html += `<h2><span class="main-counter">${counterValue}</span>. ${sectionName.replace(/_/g, " ")}</h2>`;
    html += `<table class="border-table">`;
    html += `<tr>
                <th width="40%" class="text-uppercase">NAME OF EQUIPMENT</th>
                <th width="10%" style="text-align: center;">:</th>
                <th width="25%" style="text-align: center;">MAKE</th>
                <th width="25%" style="text-align: center;">MODEL</th>
            </tr>`;
    html += tableRows.join("");
    html += `</table>`;
  }
  // CERTIFICATIONS_OF_THE_VESSEL - special table format with 5 columns
  else if (sectionName === "CERTIFICATIONS_OF_THE_VESSEL") {
    // First, check if there's any data
    let hasData = false;
    const tableRows = [];
    
    sectionFields.forEach((field) => {
      // Use "-" for null or empty values
      const certName = renderFieldValue(field.field_1 || "") || "-";
      const issued = renderFieldValue(field.field_2 || "") || "-";
      const lastAnnual = renderFieldValue(field.field_3 || "") || "-";
      const lastIntermediate = renderFieldValue(field.field_4 || "") || "-";
      const expires = renderFieldValue(field.field_5 || "") || "-";

      // Always add the row if at least one field has a value (not just "-")
      if (field.field_1 || field.field_2 || field.field_3 || field.field_4 || field.field_5) {
        hasData = true;
        tableRows.push(`<tr>
            <td class="text-uppercase">${certName}</td>
            <td>${issued}</td>
            <td>${lastAnnual}</td>
            <td>${lastIntermediate}</td>
            <td>${expires}</td>
        </tr>`);
      }
    });
    
    // Only generate HTML if there's data
    if (!hasData) {
      return "";
    }
    
    const counterValue = getNextMainCounter ? getNextMainCounter() : "2.0";
    html += `<h2><span class="main-counter">${counterValue}</span>. CERTIFICATIONS OF THE VESSEL:</h2>`;
    
    // Add certifications vessel note if it exists in formData
    if (formData && formData.certifications_vessel_note) {
      const certNote = renderFieldValue(formData.certifications_vessel_note);
      html += `<p>Note: ${certNote}</p>`;
    }
    
    html += `<table class="border-table">`;
    html += `<tr>
                <th width="40%">CERTIFICATES</th>
                <th width="15%">ISSUED</th>
                <th width="15%">Last Annual</th>
                <th width="15%">Last Intermediate</th>
                <th width="15%">Expires</th>
            </tr>`;
    html += tableRows.join("");
    html += `</table>`;
  }
  // Other sections - render as generic table rows using field_1 through field_10
  else {
    // First, check if there's any data
    let hasData = false;
    const tableRows = [];
    
    sectionFields.forEach((field) => {
      // Collect all non-empty fields (field_1 through field_10)
      const fields = [];
      for (let i = 1; i <= 10; i++) {
        if (field[`field_${i}`]) {
          // Render field value with HTML support
          fields.push(renderFieldValue(field[`field_${i}`]));
        }
      }

      if (fields.length > 0) {
        hasData = true;
        tableRows.push(`<tr>${fields.map(fieldValue => `<td>${fieldValue}</td>`).join("")}</tr>`);
      }
    });
    
    // Only generate HTML if there's data
    if (!hasData) {
      return "";
    }
    
    // Determine counter class based on section type and provided counter functions
    // If getNextSubCounter is provided, use sub-counter (for sub-sections like MAIN_ENGINES under MACHINERIES)
    let counterClass;
    let counterValue;
    
    if (getNextSubCounter) {
      // Use sub-counter for sub-sections
      counterClass = "sub-counter";
      counterValue = getNextSubCounter();
    } else {
      // Use main-counter for all sections
      counterClass = "main-counter";
      counterValue = getNextMainCounter ? getNextMainCounter() : (sectionFields[0].field_order || "");
    }

    html += `<h2><span class="${counterClass}">${counterValue}</span>. ${sectionName.replace(/_/g, " ")}</h2>`;
    html += `<table class="border-table">`;
    html += tableRows.join("");
    html += `</table>`;
  }

  return html;
}

module.exports = {
  generateMarineReportHTML,
  generateFlexibleFieldsForSection,
};
