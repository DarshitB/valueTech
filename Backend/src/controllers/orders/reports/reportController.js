const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const multer = require("multer");

// Import models and utilities
const Order = require("../../../models/orders/order");
const CvReport = require("../../../models/orders/reports/cvReport");
const AvrReport = require("../../../models/orders/reports/avrReport");
const MachineryReport = require("../../../models/orders/reports/machineryReport");
const orderMediaDocument = require("../../../models/orders/orderMediaDocument");
const { ensureDirectoryExists } = require("../../../utils/localFileHelper");

// Import report templates
const cvReportTemplate = require("./templates/cv_report_template");
const avrReportTemplate = require("./templates/avr_report_template");
const machineryReportTemplate = require("./templates/machinery_report_template");

// Import custom error classes
const {
  NotFoundError,
  BadRequestError,
} = require("../../../utils/customErrors");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), "tmp_uploads");
    ensureDirectoryExists(uploadDir);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "chassis_" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(
        new BadRequestError(
          "Only image files are allowed for chassis impression"
        ),
        false
      );
    }
  },
});

/**
 * Generate Report PDF
 * POST /orders-reports/:order_id/generate
 */
exports.generateReport = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const { report_type: requestedReportType } = req.body;
    const { id: userId } = req.user;
    /* console.log("req.body", req.body); */
    // Get order details with relationships
    const order = await Order.findById(order_id, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Get form data from request body
    const formData = req.body;

    // Handle flexible_fields - convert object with numeric keys to array
    let flexibleFields = [];
    if (
      formData.flexible_fields &&
      typeof formData.flexible_fields === "object"
    ) {
      // Convert object with numeric keys to array
      flexibleFields = Object.keys(formData.flexible_fields)
        .map((key) => formData.flexible_fields[key])
        .filter((field) => field && typeof field === "object");
    }

    // Handle chassis impression image if uploaded
    let chassisImageBase64 = null;
    if (req.file) {
      const imagePath = req.file.path;
      const imageBuffer = fs.readFileSync(imagePath);
      const mimeType = req.file.mimetype;
      chassisImageBase64 = `data:${mimeType};base64,${imageBuffer.toString(
        "base64"
      )}`;

      // Clean up temporary file
      fs.unlinkSync(imagePath);
    }

    // Format insurance period if provided
    let formattedPeriod = null;
    if (formData.period_of_insurance) {
      const parts = formData.period_of_insurance.split(" - ");
      if (parts.length === 2) {
        const from = parts[0];
        const to = parts[1];
        formattedPeriod = `From ${from} Hrs To Midnight on ${to} Hrs`;
      }
    }

    // Prepare extra data for template
    const extraData = {
      bank_name: order.bank_name || "Bank Name",
      branch_name: order.branch_name || "Branch Name",
      state_name: order.state_name || "State Name",
      cat: order.category_name || "Category",
      subCat: order.sub_category_name || "Sub Category",
      formattedPeriod: formattedPeriod,
    };

    // Add chassis image to form data
    formData.tyre_image_base64 = chassisImageBase64;

    // Create upload directory structure: uploads/YYYY/MMM/orderNumber/reports/
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = now.toLocaleString("en-US", { month: "short" });
    const orderNumber = order.order_number;

    // Generate report name with counter
    const reportName = await generateReportFileName(order_id, orderNumber);

    const uploadDir = path.join(
      process.cwd(),
      "uploads",
      year,
      month,
      orderNumber,
      "reports"
    );
    ensureDirectoryExists(uploadDir);

    const filePath = path.join(uploadDir, reportName);

    // Generate PDF based on report type
    await generateReportPDF(requestedReportType, formData, extraData, filePath);

    // Verify PDF was created
    if (!fs.existsSync(filePath)) {
      throw new Error("Failed to generate report PDF");
    }

    // Prepare report data (exclude flexible_fields, report_type, and tyre_image_base64 from main report data)
    const {
      flexible_fields,
      report_type,
      tyre_image_base64,
      ...mainReportData
    } = formData;
    const reportData = {
      order_id: order.id,
      ...mainReportData,
      created_by: userId,
      created_at: new Date(),
    };

    // Add chassis_no_pencil_impression only for CV reports
    if (requestedReportType.toLowerCase() === "report_cv") {
      reportData.chassis_no_pencil_impression = chassisImageBase64
        ? reportName
        : null;
    }

    // Determine which report model to use based on report_type
    let ReportModel;
    switch (requestedReportType.toLowerCase()) {
      case "report_cv":
        ReportModel = CvReport;
        break;
      case "report_avr":
        ReportModel = AvrReport;
        break;
      case "report_machinery":
        ReportModel = MachineryReport;
        break;
      default:
        throw new BadRequestError(
          `Report type '${requestedReportType}' is not supported`
        );
    }

    // Update or create report based on type
    const existingReport = await ReportModel.findByOrderId(order_id);
    let report;
    if (existingReport) {
      report = await ReportModel.updateReport(
        existingReport.id,
        reportData,
        userId
      );
      // Delete existing flexible fields and add new ones
      await ReportModel.deleteFlexibleFieldsByReportId(report.id);
    } else {
      report = await ReportModel.createReport(reportData);
    }

    // Save flexible fields if any
    if (flexibleFields.length > 0) {
      for (const field of flexibleFields) {
        await ReportModel.createFlexibleField({
          report_id: report.id,
          section_name: field.section_name || null,
          col_span: field.col_span ? parseInt(field.col_span) : null,
          field_label: field.field_label || null,
          field_value: field.field_value || null,
          field_order: field.field_order ? parseInt(field.field_order) : null,
          created_by: userId,
          created_at: new Date(),
        });
      }
    }

    // Save document record to database
    const documentData = {
      order_id: order.id,
      media_url: `/uploads/${year}/${month}/${orderNumber}/reports/${reportName}`,
      media_type: "pdf",
      document_type: "report",
      created_type: "generate",
      created_by: userId,
      created_at: new Date(),
    };

    const documentId = await orderMediaDocument.createDocument(documentData);

    // Set document ID for activity logger
    res.locals.documentId = documentId;

    // Get the complete report data with flexible fields for response
    const completeReport = await ReportModel.findByOrderIdWithFlexibleFields(
      order_id
    );

    // Return success response with download URL and complete report data
    res.json({
      success: true,
      message: "Report generated successfully",
      data: {
        id: documentId,
        download_url: `/uploads/${year}/${month}/${orderNumber}/reports/${reportName}`,
        filename: reportName,
        local_path: filePath,
        report_id: report.id,
        report: completeReport,
        order_id: parseInt(order_id),
        report_type: requestedReportType,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Generate report file name with counter
 * @param {string} orderId - Order ID
 * @param {string} orderNumber - Order number
 * @returns {string} Report file name
 */
async function generateReportFileName(orderId, orderNumber) {
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
  ensureDirectoryExists(reportsDir);

  // Get existing report files
  let existingFiles = [];
  try {
    existingFiles = fs
      .readdirSync(reportsDir)
      .filter((file) => file.endsWith(".pdf") && file.includes("report"))
      .map((file) => {
        const match = file.match(/report_(\d+)\.pdf$/);
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

  return `report_${nextReportNumber}.pdf`;
}

/**
 * Generate PDF from HTML template using Puppeteer
 * @param {string} reportType - Type of report (report_cv, property_report, etc.)
 * @param {Object} formData - Form data for the report
 * @param {Object} extraData - Extra data for the template
 * @param {string} outputPath - Output path for PDF
 */
async function generateReportPDF(reportType, formData, extraData, outputPath) {
  // Determine background image based on valuer_name (CV) or surveyor (AVR)
  let bgImageFileName = "vkassociate_letter_head.png"; // Default image

  // Check for valuer_name (CV reports) or surveyor (AVR reports)
  const nameField = formData.valuer_name || formData.surveyor;
  
  if (nameField) {
    const name = nameField.toUpperCase().trim();
    
    if (name === "V.K. ASSOCIATES") {
      bgImageFileName = "vkassociate_letter_head.png";
    } else if (name === "VALUETECH SOLUTIONS") {
      bgImageFileName = "valuetech-solutions.png";
    } else if (name === "VISHAL D. KOTHARI") {
      bgImageFileName = "vishal-d-kothri.png";
    }
  }
  
  
  // Background image path
  const bgPath = path.join(process.cwd(), "public", "img", bgImageFileName);

  // Convert background image to base64 (optimized)
  let bgImageBase64 = null;
  try {
    if (fs.existsSync(bgPath)) {
      const imageBuffer = fs.readFileSync(bgPath);
      const mimeType = "image/png"; // Assuming PNG format
      bgImageBase64 = `data:${mimeType};base64,${imageBuffer.toString(
        "base64"
      )}`;
    } else {
      console.warn(`Background image not found: ${bgPath}`);
    }
  } catch (error) {
    console.warn("Could not load background image:", error.message);
    // Continue without background image rather than failing
  }
  /* console.log(formData); */
  // Generate HTML content based on report type
  const htmlContent = generateReportHTML(
    reportType,
    formData,
    extraData,
    bgImageBase64
  );

  // Launch Puppeteer with optimized settings
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || undefined;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();

    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });

    // Disable images and CSS for faster loading (optional - uncomment if needed)
    // await page.setRequestInterception(true);
    // page.on('request', (req) => {
    //   if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet') {
    //     req.abort();
    //   } else {
    //     req.continue();
    //   }
    // });

    const startTime = Date.now();

    // Set content with faster loading strategy
    await page.setContent(htmlContent, {
      waitUntil: "domcontentloaded",
      timeout: 10000, // 10 second timeout instead of 30
    });

    // Generate PDF with legal size dimensions (8.5" x 14")
    const pdfStartTime = Date.now();
    await page.pdf({
      path: outputPath,
      format: "Legal",
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
      width: "8.5in",
      height: "14in",
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
  } catch (error) {
    console.error("Puppeteer error during report generation:", error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * Generate HTML content for the report template
 * @param {string} reportType - Type of report
 * @param {Object} formData - Form data
 * @param {Object} extraData - Extra data
 * @param {string} bgImageBase64 - Background image as base64
 * @returns {string} HTML content
 */
function generateReportHTML(reportType, formData, extraData, bgImageBase64) {
  // Route to appropriate template based on report type
  switch (reportType.toLowerCase()) {
    case "report_cv":
      return cvReportTemplate.generateCVReportHTML(
        formData,
        extraData,
        bgImageBase64
      );

    case "report_avr":
      return avrReportTemplate.generateAVRReportHTML(
        formData,
        extraData,
        bgImageBase64
      );

    case "report_machinery":
      return machineryReportTemplate.generateMachineryReportHTML(
        formData,
        extraData,
        bgImageBase64
      );

    // Future report types can be added here
    // case 'property_report':
    //   return propertyReportTemplate.generatePropertyReportHTML(formData, extraData, bgImageBase64);

    default:
      throw new BadRequestError(`Report type '${reportType}' is not supported`);
  }
}

/**
 * Get report by order ID and report type
 * GET /orders/:order_id/report/:report_type
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.getReportByOrderAndType = async (req, res, next) => {
  try {
    const { order_id, report_type } = req.params;

    // Validate report_type parameter
    if (!report_type) {
      throw new BadRequestError("Report type is required");
    }

    // Check if order exists and user has access
    const order = await Order.findById(order_id, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    let report = null;

    // Handle different report types
    switch (report_type.toLowerCase()) {
      case "report_cv":
        // Get CV report with flexible fields
        report = await CvReport.findByOrderIdWithFlexibleFields(order_id);
        break;

      case "report_avr":
        // Get AVR report with flexible fields
        report = await AvrReport.findByOrderIdWithFlexibleFields(order_id);
        break;

      case "report_machinery":
        // Get Machinery report with flexible fields
        report = await MachineryReport.findByOrderIdWithFlexibleFields(order_id);
        break;

      default:
        throw new BadRequestError(
          `Report type '${report_type}' does not exist`
        );
    }

    // If no report found for this order and report type
    if (!report) {
      return res.status(404).json({
        success: false,
        message: `No ${report_type} found for this order`,
        data: null,
      });
    }

    // Return the report data
    res.status(200).json({
      success: true,
      message: `${report_type} retrieved successfully`,
      data: {
        order_id: parseInt(order_id),
        report_type: report_type,
        report: report,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Export multer middleware for use in routes
exports.uploadChassisImage = upload.single("chassis_no_pencil_impression");
