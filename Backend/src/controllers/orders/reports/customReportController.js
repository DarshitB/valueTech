const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { v4: uuidv4 } = require("uuid");

// Import models and utilities
const Order = require("../../../models/orders/order");
const CustomReport = require("../../../models/orders/reports/customReport");
const orderMediaDocument = require("../../../models/orders/orderMediaDocument");
const { ensureDirectoryExists } = require("../../../utils/localFileHelper");

// Import custom error classes
const {
  NotFoundError,
  BadRequestError,
} = require("../../../utils/customErrors");

// Sanitize HTML to prevent XSS
const sanitizeHtml = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Convert JSON data to HTML
const convertJsonToHtml = (reportData) => {
  const { settings, pages } = reportData;
  
  // Validate required fields
  if (!settings || !pages) {
    throw new BadRequestError("Missing required fields: settings and pages");
  }

  const pageSize = settings.pageSize || 'A4';
  const margins = settings.margins || { top: 0.5, bottom: 0.9, left: 0.5, right: 0.5 };
  const background = settings.background || null;
  const footerText = settings.footerText || '';

  let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: ${pageSize};
            margin: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in;
        }
        
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            ${background ? `background: ${background};` : ''}
            line-height: 1.4;
        }
        
        .page {
            page-break-after: always;
            min-height: 100vh;
            position: relative;
            display: flex;
            flex-direction: column;
        }
        
        .page-content {
            flex: 1;
            padding-bottom: 60px; /* Space for footer */
        }
        
        .page:last-child {
            page-break-after: avoid;
        }
        
        .container {
            margin-bottom: 20px;
        }
        
        .single-container {
            width: 100%;
        }
        
        .double-container {
            display: table;
            width: 100%;
            table-layout: fixed;
        }
        
        .double-container .column {
            display: table-cell;
            width: 50%;
            padding-right: 10px;
            vertical-align: top;
        }
        
        .double-container .column:last-child {
            padding-right: 0;
            padding-left: 10px;
        }
        
        .block {
            margin-bottom: 10px;
        }
        
        p, h1, h2, h3, h4, h5, h6 {
            margin: 0 0 10px 0;
            white-space: pre-wrap;
        }
        
        ul {
            margin: 0 0 10px 0;
            padding-left: 20px;
        }
        
        li {
            margin-bottom: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
            page-break-inside: auto;
        }
        
        th, td {
            border: 1px solid #000;
            padding: 8px;
            text-align: left;
            vertical-align: top;
            page-break-inside: avoid;
        }
        
        th {
            background-color: #f5f5f5;
            font-weight: bold;
        }
        
        img {
            max-width: 100%;
            height: auto;
            page-break-inside: avoid;
        }
        
        .page-footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 20px;
            border-top: 1px solid #ccc;
            height: 50px;
            box-sizing: border-box;
        }
        
        .page-counter {
            background-color: black;
            width: 6px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: bold;
            min-width: 6px;
        }
        
        .footer-text {
            flex: 1;
            text-align: right;
            font-size: 10px;
            color: #666;
        }
        
        @media print {
            .page {
                page-break-after: always;
            }
            .page:last-child {
                page-break-after: avoid;
            }
        }
    </style>
</head>
<body>
`;

  // Sort pages by numeric order
  const sortedPages = Object.keys(pages).sort((a, b) => parseInt(a) - parseInt(b));
  
  sortedPages.forEach((pageNum, index) => {
    const page = pages[pageNum];
    html += `<div class="page">`;
    html += `<div class="page-content">`;
    
    page.containers.forEach(container => {
      html += `<div class="container ${container.type}-container">`;
      
      if (container.type === 'single') {
        html += `<div class="single-container">`;
        container.blocks.forEach(block => {
          html += renderBlock(block);
        });
        html += `</div>`;
      } else if (container.type === 'double') {
        html += `<div class="double-container">`;
        
        if (container.left && container.left.length > 0) {
          html += `<div class="column">`;
          container.left.forEach(block => {
            html += renderBlock(block);
          });
          html += `</div>`;
        }
        
        if (container.right && container.right.length > 0) {
          html += `<div class="column">`;
          container.right.forEach(block => {
            html += renderBlock(block);
          });
          html += `</div>`;
        }
        
        html += `</div>`;
      }
      
      html += `</div>`;
    });
    
    html += `</div>`; // Close page-content
    
    // Add footer with page counter and footer text
    html += `<div class="page-footer">`;
    html += `<div class="page-counter">${index + 1}</div>`;
    html += `<div class="footer-text">${sanitizeHtml(footerText)}</div>`;
    html += `</div>`;
    
    html += `</div>`; // Close page
  });
  
  html += `</body></html>`;
  
  return html;
};

// Render individual blocks
const renderBlock = (block) => {
  const { type, text, data, style } = block;
  const sanitizedText = sanitizeHtml(text || '');
  
  let styleAttr = '';
  if (style) {
    const styles = [];
    if (style.fontSize) styles.push(`font-size: ${style.fontSize}`);
    if (style.fontWeight) styles.push(`font-weight: ${style.fontWeight}`);
    if (style.textAlign) styles.push(`text-align: ${style.textAlign}`);
    styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
  }
  
  switch (type) {
    case 'p':
      return `<div class="block"><p${styleAttr}>${sanitizedText}</p></div>`;
    
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `<div class="block"><${type}${styleAttr}>${sanitizedText}</${type}></div>`;
    
    case 'ul':
      if (data && Array.isArray(data)) {
        const listItems = data.map(item => `<li>${sanitizeHtml(item)}</li>`).join('');
        return `<div class="block"><ul${styleAttr}>${listItems}</ul></div>`;
      }
      return `<div class="block"><ul${styleAttr}><li>${sanitizedText}</li></ul></div>`;
    
    case 'table':
      if (data && data.headers && data.rows) {
        let tableHtml = `<div class="block"><table${styleAttr}>`;
        
        // Header row
        if (data.headers.length > 0) {
          tableHtml += '<thead><tr>';
          data.headers.forEach(header => {
            tableHtml += `<th>${sanitizeHtml(header)}</th>`;
          });
          tableHtml += '</tr></thead>';
        }
        
        // Data rows
        if (data.rows.length > 0) {
          tableHtml += '<tbody>';
          data.rows.forEach(row => {
            tableHtml += '<tr>';
            row.forEach(cell => {
              tableHtml += `<td>${sanitizeHtml(cell)}</td>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody>';
        }
        
        tableHtml += '</table></div>';
        return tableHtml;
      }
      return `<div class="block"><p${styleAttr}>${sanitizedText}</p></div>`;
    
    case 'image':
      if (data && typeof data === 'string') {
        // Handle base64 image data
        const base64Data = data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
        return `<div class="block"><img src="${base64Data}" alt="Image" /></div>`;
      }
      return `<div class="block"><p${styleAttr}>Image not found</p></div>`;
    
    default:
      return `<div class="block"><p${styleAttr}>${sanitizedText}</p></div>`;
  }
};

const customReportController = {
  // Generate custom report with PDF - handles everything in one call
  generateReportWithPDF: async (req, res, next) => {
    try {
      const { order_id, content } = req.body;

      if (!order_id || !content) {
        throw new BadRequestError("order_id and content are required");
      }

      // Validate order exists
      const order = await Order.findById(order_id, req.user);
      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Validate content structure
      if (!content.settings || !content.pages) {
        throw new BadRequestError("Content must have settings and pages");
      }

      // Step 1: Create custom report in database
      const reportData = {
        order_id,
        content,
        created_by: req.user.id,
      };

      const report = await CustomReport.create(reportData);
      res.locals.newRecordId = report.id;

      // Step 2: Generate report name with counter following the same pattern as other reports
      const reportName = await generateCustomReportFileName(order.id, order.order_number);
      
      // Step 3: Create directory structure following the same pattern as other reports
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = now.toLocaleString("en-US", { month: "short" });
      const orderNumber = order.order_number;
      
      const uploadDir = path.join(
        process.cwd(),
        "uploads",
        year,
        month,
        orderNumber,
        "reports"
      );
      await ensureDirectoryExists(uploadDir);
      
      const filePath = path.join(uploadDir, reportName);

      // Step 4: Convert JSON to HTML
      const html = convertJsonToHtml(report.content);

      // Step 5: Generate PDF using Puppeteer (following reportController pattern)
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || undefined;

      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();
      
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });
      
      // Set content with faster loading strategy
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: 10000, // 10 second timeout instead of default 30
      });

      // Define custom page sizes in inches
      const pageSizes = {
        'A4': { width: 8.27, height: 11.69 },
        'A3': { width: 11.69, height: 16.54 },
        'Legal': { width: 8.5, height: 14 },
        'Letter': { width: 8.5, height: 11 }
      };

      const requestedPageSize = report.content.settings.pageSize || 'A4';
      const pageSize = pageSizes[requestedPageSize] || pageSizes['A4'];

      try {
        const pdfBuffer = await page.pdf({
          width: `${pageSize.width}in`,
          height: `${pageSize.height}in`,
          margin: {
            top: `${(report.content.settings.margins?.top || 0.5)}in`,
            right: `${(report.content.settings.margins?.right || 0.5)}in`,
            bottom: `${(report.content.settings.margins?.bottom || 0.9)}in`,
            left: `${(report.content.settings.margins?.left || 0.5)}in`
          },
          printBackground: true,
          preferCSSPageSize: true
        });

        await browser.close();

        // Step 6: Save PDF to file
        fs.writeFileSync(filePath, pdfBuffer);

        // Step 7: Verify PDF was created
        if (!fs.existsSync(filePath)) {
          throw new Error("Failed to generate custom report PDF");
        }
      } catch (error) {
        await browser.close();
        console.error("Puppeteer error during custom report generation:", error);
        throw new Error(`Failed to generate PDF: ${error.message}`);
      }

      // Step 8: Save document record to database following the same pattern as other reports
      const documentData = {
        order_id: order.id,
        media_url: `/uploads/${year}/${month}/${orderNumber}/reports/${reportName}`,
        media_type: "pdf",
        document_type: "report",
        created_type: "generate",
        created_by: req.user.id,
        created_at: new Date(),
      };

      // Step 8: Save document record to database and get document ID
      const documentId = await orderMediaDocument.createDocument(documentData);

      // Step 9: Set document ID for activity logger (matching reportController pattern)
      res.locals.documentId = documentId;

      // Step 10: Get the complete report data for response
      const completeReport = await CustomReport.findById(report.id);

      // Step 11: Return success response matching other report controllers
      res.json({
        success: true,
        message: "Custom report generated successfully",
        data: {
          id: documentId,
          download_url: documentData.media_url,
          filename: reportName,
          local_path: filePath,
          report_id: report.id,
          report: completeReport,
          order_id: parseInt(order.id),
          report_type: "custom_report"
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

/**
 * Generate custom report file name with counter
 * @param {string} orderId - Order ID
 * @param {string} orderNumber - Order number
 * @returns {string} Report file name
 */
async function generateCustomReportFileName(orderId, orderNumber) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = now.toLocaleString("en-US", { month: "short" });

  const reportsDir = path.join(
    process.cwd(),
    "uploads",
    year,
    month,
    orderNumber,
    "reports"
  );

  // Ensure directory exists
  await ensureDirectoryExists(reportsDir);

  // Get existing custom report files
  let existingFiles = [];
  try {
    existingFiles = fs
      .readdirSync(reportsDir)
      .filter((file) => file.endsWith(".pdf") && file.includes("custom_report"))
      .map((file) => {
        const match = file.match(/custom_report_(\d+)\.pdf$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((num) => num > 0)
      .sort((a, b) => b - a); // Sort descending
  } catch (error) {
    // Directory doesn't exist or is empty, start with 1
    existingFiles = [];
  }

  // Get next report number
  const nextReportNumber = existingFiles.length > 0 ? existingFiles[0] + 1 : 1;

  return `custom_report_${nextReportNumber}.pdf`;
}

module.exports = customReportController;
