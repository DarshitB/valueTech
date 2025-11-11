const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const multer = require("multer");

// Import models and utilities
const Order = require("../../../models/orders/order");
const CvReport = require("../../../models/orders/reports/cvReport");
const AvrReport = require("../../../models/orders/reports/avrReport");
const MachineryReport = require("../../../models/orders/reports/machineryReport");
const CeReport = require("../../../models/orders/reports/ceReport");
const orderMediaDocument = require("../../../models/orders/orderMediaDocument");
const OrderStatusHistory = require("../../../models/orders/orderStatusHistory");
const AssetMakesForReports = require("../../../models/orders/assetMakesOfReports");
const { ensureDirectoryExists } = require("../../../utils/localFileHelper");

// Import report templates
const cvReportTemplate = require("./templates/cv_report_template");
const avrReportTemplate = require("./templates/avr_report_template");
const machineryReportTemplate = require("./templates/machinery_report_template");
const ceReportTemplate = require("./templates/ce_report_template");

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
 * Helper function to check if order has both report and collage, and update status to 9 if true
 * @param {number} orderId - The order ID
 * @param {number} userId - The user ID making the change
 */
async function checkAndUpdateOrderStatus(orderId, userId) {
  try {
    // Check if order has at least one report
    const documents = await orderMediaDocument.findByOrderId(orderId);
    const hasReport = documents.some(doc => doc.document_type === 'report');
    
    // Check if order has at least one collage
    const hasCollage = documents.some(doc => doc.document_type === 'collage');
    
    // If both exist, update status to 9
    if (hasReport && hasCollage) {
      await Order.updateOrder(orderId, {
        current_status_id: 9,
        updated_at: new Date(),
        updated_by: userId
      });
      
      // Create status history entry
      const statusHistoryData = {
        order_id: orderId,
        status_id: 9,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: 'Both report and collage generated'
      };
      
      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }
  } catch (error) {
    console.error('Error checking/updating order status:', error);
    // Don't throw error - this is a non-critical operation
  }
}

/**
 * Helper function to convert number to words
 * e.g., 12 -> "TWELVE"
 */
function numberToWords(num) {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  const teens = ["TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  
  if (num === 0) return "ZERO";
  if (num < 10) return ones[num];
  if (num >= 10 && num < 20) return teens[num - 10];
  if (num >= 20 && num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return tens[ten] + (one > 0 ? " " + ones[one] : "");
  }
  if (num >= 100 && num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return ones[hundred] + " HUNDRED" + (remainder > 0 ? " " + numberToWords(remainder) : "");
  }
  
  return num.toString(); // For numbers >= 1000, just return as string
}

/**
 * Generic helper function to convert numeric expression to formatted string
 * e.g., "1+2+9" -> "12(TWELVE)"
 * ONLY allows numbers, spaces, + and - symbols
 * Throws error if other symbols are present
 * 
 * @param {string} fieldValue - The field value to convert (e.g., "1+2+9")
 * @param {string} fieldName - Name of the field for error messages (e.g., "no_of_photograph")
 * @returns {string} Formatted string like "12(TWELVE)" or original if just a number
 * @throws {BadRequestError} If invalid characters are present
 */
function convertNumericExpression(fieldValue, fieldName = 'field') {
  if (!fieldValue || typeof fieldValue !== 'string') {
    return fieldValue;
  }
  
  // Trim whitespace
  const trimmedValue = fieldValue.trim();
  
  // Check for invalid characters - ONLY allow: numbers (0-9), spaces, + and -
  const invalidCharsRegex = /[^0-9+\-\s]/g;
  const invalidChars = trimmedValue.match(invalidCharsRegex);
  
  if (invalidChars) {
    const uniqueInvalidChars = [...new Set(invalidChars)].join(', ');
    throw new BadRequestError(
      `Invalid characters found in ${fieldName}: "${uniqueInvalidChars}". Only numbers, spaces, + and - are allowed.`
    );
  }
  
  // Check if it contains mathematical operators (+ or -)
  if (trimmedValue.includes('+') || trimmedValue.includes('-')) {
    try {
      // Replace spaces and evaluate
      const expression = trimmedValue.replace(/\s/g, '');
      
      // Additional safety check: ensure it's a valid expression pattern
      // Should be: number, then (+/-), then number, etc.
      const validExpressionPattern = /^-?\d+(\s*[+\-]\s*\d+)*$/;
      if (!validExpressionPattern.test(trimmedValue)) {
        throw new BadRequestError(
          `Invalid expression format in ${fieldName}: "${trimmedValue}". Expected format like "1+2+3" or "10-5+3".`
        );
      }
      
      // Evaluate the expression
      const sum = eval(expression);
      
      if (!isNaN(sum) && isFinite(sum)) {
        const roundedSum = Math.round(sum);
        const wordsInParens = numberToWords(roundedSum);
        return `${roundedSum}(${wordsInParens})`;
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error; // Re-throw BadRequestError
      }
      throw new BadRequestError(
        `Failed to evaluate expression in ${fieldName}: "${trimmedValue}"`
      );
    }
  }
  
  // If it's just a number, return as is
  return trimmedValue;
}

const IMAGE_MIME_EXTENSION_MAP = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp"
};

const EXTENSION_MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp"
};

function getExtensionFromMime(mimeType = "") {
  if (!mimeType) return "";
  const lower = mimeType.toLowerCase();
  return IMAGE_MIME_EXTENSION_MAP[lower] || "";
}

function getMimeFromExtension(extension = "") {
  if (!extension) return "image/jpeg";
  const lower = extension.toLowerCase();
  return EXTENSION_MIME_MAP[lower] || "image/jpeg";
}

function sanitizeStoredUploadPath(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  let normalized = trimmed.replace(/\\/g, "/");

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (!normalized.startsWith("/uploads/")) {
    if (normalized.startsWith("/public/uploads/")) {
      normalized = normalized.replace("/public", "");
    } else {
      return null;
    }
  }

  const withoutPrefix = normalized.replace(/^\/uploads\//, "");
  const safeSegments = withoutPrefix
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..");

  if (safeSegments.length === 0) {
    return null;
  }

  return `/uploads/${safeSegments.join("/")}`;
}

function resolveAbsoluteUploadPath(storedPath) {
  const sanitized = sanitizeStoredUploadPath(storedPath);
  if (!sanitized) return null;

  const relative = sanitized.replace(/^\/uploads\//, "");
  return path.join(process.cwd(), "uploads", relative);
}

function saveChassisImage(buffer, mimeType, originalName, year, month, orderNumber) {
  if (!buffer || !buffer.length || !orderNumber) return null;

  const extensionFromOriginal = originalName ? path.extname(originalName) : "";
  const extensionFromMime = getExtensionFromMime(mimeType);
  const extension = (extensionFromOriginal || extensionFromMime || ".jpg").toLowerCase();

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const fileName = `chassis_${uniqueSuffix}${extension.startsWith(".") ? extension : `.${extension}`}`;

  const chassisDir = path.join(
    process.cwd(),
    "uploads",
    year,
    month,
    orderNumber,
    "chassis_no"
  );
  ensureDirectoryExists(chassisDir);

  const absolutePath = path.join(chassisDir, fileName);
  fs.writeFileSync(absolutePath, buffer);

  const relativePath = `/uploads/${year}/${month}/${orderNumber}/chassis_no/${fileName}`;
  return { relativePath, absolutePath };
}

async function saveChassisImageFromDiskFile(file, year, month, orderNumber) {
  if (!file) {
    return { relativePath: null, base64: null };
  }

  const tempBuffer = fs.readFileSync(file.path);
  const storedImage = saveChassisImage(
    tempBuffer,
    file.mimetype,
    file.originalname,
    year,
    month,
    orderNumber
  );

  try {
    fs.unlinkSync(file.path);
  } catch (unlinkErr) {
    console.warn("Failed to remove temporary chassis image:", unlinkErr);
  }

  if (!storedImage) {
    return { relativePath: null, base64: null };
  }

  return {
    relativePath: storedImage.relativePath,
    base64: `data:${file.mimetype};base64,${tempBuffer.toString("base64")}`,
  };
}

function saveChassisImageFromMemoryFile(file, year, month, orderNumber) {
  if (!file || !file.buffer || !file.buffer.length) {
    return null;
  }

  const storedImage = saveChassisImage(
    file.buffer,
    file.mimetype,
    file.originalname,
    year,
    month,
    orderNumber
  );

  return storedImage ? storedImage.relativePath : null;
}

function resolveChassisRelativePath(formValue, existingReport) {
  const sanitizedInput = sanitizeStoredUploadPath(formValue);
  if (sanitizedInput) {
    return sanitizedInput;
  }

  if (existingReport && existingReport.chassis_no_pencil_impression) {
    const sanitizedExisting = sanitizeStoredUploadPath(
      existingReport.chassis_no_pencil_impression
    );
    if (sanitizedExisting) {
      return sanitizedExisting;
    }
  }

  return null;
}

async function loadChassisImageBase64(relativePath) {
  const absolutePath = resolveAbsoluteUploadPath(relativePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return null;
  }

  const buffer = fs.readFileSync(absolutePath);
  const mimeType = getMimeFromExtension(path.extname(absolutePath));
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function deleteChassisImage(relativePath) {
  const absolutePath = resolveAbsoluteUploadPath(relativePath);
  if (absolutePath && fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
    } catch (err) {
      console.warn("Failed to delete chassis image:", err);
    }
  }
}

function getReportModelByType(reportType) {
  const normalized = (reportType || "").toLowerCase();

  switch (normalized) {
    case "report_cv":
      return CvReport;
    case "report_avr":
      return AvrReport;
    case "report_machinery":
      return MachineryReport;
    case "report_ce":
      return CeReport;
    default:
      throw new BadRequestError(`Report type '${reportType}' is not supported`);
  }
}

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
    
    // Define report types that have asset_make field
    const reportTypesWithAssetMake = ['report_cv', 'report_machinery', 'report_ce'];
    
    // Get order details with relationships
    const order = await Order.findById(order_id, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const ReportModel = getReportModelByType(requestedReportType);
    let existingReport = await ReportModel.findByOrderId(order_id);
    let existingChassisPath = existingReport
      ? sanitizeStoredUploadPath(existingReport.chassis_no_pencil_impression)
      : null;

    // Get form data from request body
    const formData = req.body;

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = now.toLocaleString("en-US", { month: "short" });
    const orderNumber = order.order_number;

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

    // Handle chassis impression image
    let chassisImageRelativePath = resolveChassisRelativePath(
      formData.chassis_no_pencil_impression,
      existingReport
    );
    let chassisImageBase64 = null;

    if (chassisImageRelativePath) {
      existingChassisPath = chassisImageRelativePath;
    }

    if (req.file) {
      const saved = await saveChassisImageFromDiskFile(
        req.file,
        year,
        month,
        orderNumber
      );
      if (saved.relativePath) {
        if (
          existingChassisPath &&
          existingChassisPath !== saved.relativePath
        ) {
          deleteChassisImage(existingChassisPath);
        }
        chassisImageRelativePath = saved.relativePath;
        existingChassisPath = saved.relativePath;
      }
      if (saved.base64) {
        chassisImageBase64 = saved.base64;
      }
    }

    if (chassisImageRelativePath && !chassisImageBase64) {
      chassisImageBase64 = await loadChassisImageBase64(chassisImageRelativePath);
    }

    if (chassisImageRelativePath) {
      formData.chassis_no_pencil_impression = chassisImageRelativePath;
    } else {
      delete formData.chassis_no_pencil_impression;
    }

    // Handle asset_make: Only for report types that have this field (CV, Machinery, CE)
    // AVR report does NOT have asset_make field
    let assetMakeIdForDB = null;
    let assetMakeNameForTemplate = null;
    
    if (reportTypesWithAssetMake.includes(requestedReportType.toLowerCase())) {
      if (formData.new_asset_make && formData.new_asset_make.trim().length > 0) {
        // If new_asset_make is provided, create new record and get its ID
        const newAssetMakeRecord = await AssetMakesForReports.create({
          order_type: requestedReportType,
          name: formData.new_asset_make.trim(),
          created_by: userId
        });
        
        assetMakeIdForDB = newAssetMakeRecord.id;
        assetMakeNameForTemplate = newAssetMakeRecord.name;
      } else if (formData.asset_make) {
        // If asset_make ID is provided, fetch the name
        const assetMakeRecord = await AssetMakesForReports.findById(formData.asset_make);
        if (assetMakeRecord) {
          assetMakeIdForDB = assetMakeRecord.id;
          assetMakeNameForTemplate = assetMakeRecord.name;
        }
      }
      
      // Replace asset_make in formData with the name for template display
      if (assetMakeNameForTemplate) {
        formData.asset_make = assetMakeNameForTemplate;
      }
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

    // Convert no_of_photograph for display (e.g., "1+2+9" -> "12(TWELVE)")
    // Store original in DB, but convert for template
    const originalPhotographNumber = formData.no_of_photograph;
    if (formData.no_of_photograph) {
      formData.no_of_photograph = convertNumericExpression(
        formData.no_of_photograph, 
        'no_of_photograph'
      );
    }

    // Convert no_of_collage for display (same logic as no_of_photograph)
    const originalCollageNumber = formData.no_of_collage;
    if (formData.no_of_collage) {
      formData.no_of_collage = convertNumericExpression(
        formData.no_of_collage, 
        'no_of_collage'
      );
    }

    // Create upload directory structure: uploads/YYYY/MMM/orderNumber/reports/
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

    // Prepare report data (exclude flexible_fields, report_type, tyre_image_base64, and new_asset_make from main report data)
    const {
      flexible_fields,
      report_type,
      tyre_image_base64,
      new_asset_make,
      ...mainReportData
    } = formData;
    
    // Restore original values for database storage
    if (originalPhotographNumber !== undefined) {
      mainReportData.no_of_photograph = originalPhotographNumber;
    }
    if (originalCollageNumber !== undefined) {
      mainReportData.no_of_collage = originalCollageNumber;
    }
    
    // Store asset_make ID (not name) in database - only for report types that have this field
    if (reportTypesWithAssetMake.includes(requestedReportType.toLowerCase()) && assetMakeIdForDB !== null) {
      mainReportData.asset_make = assetMakeIdForDB;
    }
    
    // Filter form data to only include valid database columns
    const validFields = filterValidReportFields(mainReportData, requestedReportType);
    
    const reportData = {
      order_id: order.id,
      ...validFields,
      created_by: userId,
      created_at: new Date(),
    };

    if (["report_cv", "report_ce"].includes(requestedReportType.toLowerCase())) {
      if (chassisImageRelativePath) {
        reportData.chassis_no_pencil_impression = chassisImageRelativePath;
      } else {
        delete reportData.chassis_no_pencil_impression;
      }
    }

    let report;

    if (existingReport) {
      // Update existing report (whether saved or generated) - NO DUPLICATES
      report = await ReportModel.updateReport(
        existingReport.id,
        {
          ...reportData,
          updated_by: userId,
          updated_at: new Date()
        },
        userId
      );
      // Delete existing flexible fields and add new ones
      await ReportModel.deleteFlexibleFieldsByReportId(report.id);
    } else {
      // Create new report (no existing data)
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

    // Check if both report and collage exist, update status to 9 if true
    await checkAndUpdateOrderStatus(order.id, userId);

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
  let bgImageFileName = "vkassociate_letter_head.jpg"; // Default image
  let stampPngFile = null; // Optional stamp overlay

  // Check for valuer_name (CV reports) or surveyor (AVR reports)
  const nameField = formData.valuer_name || formData.surveyor;
  
  if (nameField) {
    const name = nameField.toUpperCase().trim();
    
    if (name === "V.K. ASSOCIATES") {
      bgImageFileName = "vkassociate_letter_head.jpg";
      stampPngFile = "vka.png";
    } else if (name === "VALUETECH SOLUTIONS") {
      bgImageFileName = "valuetech-solutions.png";
      stampPngFile = "vts.png";
    } else if (name === "VISHAL D. KOTHARI") {
      bgImageFileName = "vishal-d-kothri.png";
      stampPngFile = "vdk.png";
    }
  }
  
  
  // Background image path
  const bgPath = path.join(process.cwd(), "public", "img", bgImageFileName);

  // Convert background image to base64 (optimized)
  let bgImageBase64 = null;
  let stampImageBase64 = null;
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

    if (stampPngFile) {
      const stampPath = path.join(process.cwd(), "public", "img", stampPngFile);
      if (fs.existsSync(stampPath)) {
        const stampBuffer = fs.readFileSync(stampPath);
        const stampMime = "image/png";
        stampImageBase64 = `data:${stampMime};base64,${stampBuffer.toString("base64")}`;
      }
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
    bgImageBase64,
    stampImageBase64
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
 * @param {string|null} stampImageBase64 - Optional stamp image as base64
 * @returns {string} HTML content
 */
function generateReportHTML(reportType, formData, extraData, bgImageBase64, stampImageBase64) {
  // Route to appropriate template based on report type
  switch (reportType.toLowerCase()) {
    case "report_cv":
      return cvReportTemplate.generateCVReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64
      );

    case "report_avr":
      return avrReportTemplate.generateAVRReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64
      );

    case "report_machinery":
      return machineryReportTemplate.generateMachineryReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64
      );

      case "report_ce":
        return ceReportTemplate.generateCEReportHTML(
          formData,
          extraData,
          bgImageBase64,
          stampImageBase64
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

      case "report_ce":
        // Get CE report with flexible fields
        report = await CeReport.findByOrderIdWithFlexibleFields(order_id);
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

    // If report has asset_make ID, fetch the name
    if (report.asset_make) {
      const assetMakeRecord = await AssetMakesForReports.findById(report.asset_make);
      if (assetMakeRecord) {
        report.asset_make_name = assetMakeRecord.name;
      }
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

/**
 * Save Report Data (step by step, allows partial data)
 * POST /orders-reports/:order_id/save
 * Works exactly like generateReport but saves data without creating PDF
 */
exports.saveReportData = async (req, res, next) => {
  try {
    const { order_id } = req.params;
    const { report_type: requestedReportType } = req.body;
    const { id: userId } = req.user;
    // Get order details with relationships
    const order = await Order.findById(order_id, req.user);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const ReportModel = getReportModelByType(requestedReportType);
    let existingReport = await ReportModel.findByOrderId(order_id);
    let existingChassisPath = existingReport
      ? sanitizeStoredUploadPath(existingReport.chassis_no_pencil_impression)
      : null;

    // Get form data from request body
    const formData = req.body;

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = now.toLocaleString("en-US", { month: "short" });
    const orderNumber = order.order_number;

    let chassisImageRelativePath = resolveChassisRelativePath(
      formData.chassis_no_pencil_impression,
      existingReport
    );

    if (chassisImageRelativePath) {
      existingChassisPath = chassisImageRelativePath;
    }

    if (Array.isArray(req.files) && req.files.length > 0) {
      const chassisFile = req.files.find(
        (file) => file.fieldname === "chassis_no_pencil_impression"
      );
      const storedPath = saveChassisImageFromMemoryFile(
        chassisFile,
        year,
        month,
        orderNumber
      );
      if (storedPath) {
        if (existingChassisPath && existingChassisPath !== storedPath) {
          deleteChassisImage(existingChassisPath);
        }
        chassisImageRelativePath = storedPath;
        existingChassisPath = storedPath;
      }
    }

    if (chassisImageRelativePath) {
      formData.chassis_no_pencil_impression = chassisImageRelativePath;
    } else {
      delete formData.chassis_no_pencil_impression;
    }

    // Handle flexible_fields - parse from request body format for save API
    let flexibleFields = parseFlexibleFieldsFromRequest(formData);

    // Handle asset_make: Only for report types that have this field (CV, Machinery, CE)
    // AVR report does NOT have asset_make field
    const reportTypesWithAssetMake = ['report_cv', 'report_machinery', 'report_ce'];
    let assetMakeIdForDB = null;
    
    if (reportTypesWithAssetMake.includes(requestedReportType.toLowerCase())) {
      if (formData.new_asset_make && formData.new_asset_make.trim().length > 0) {
        // If new_asset_make is provided, create new record and get its ID
        const newAssetMakeRecord = await AssetMakesForReports.create({
          order_type: requestedReportType,
          name: formData.new_asset_make.trim(),
          created_by: userId
        });
        
        assetMakeIdForDB = newAssetMakeRecord.id;
      } else if (formData.asset_make) {
        // If asset_make ID is provided, use it as is
        assetMakeIdForDB = formData.asset_make;
      }
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

    // Prepare report data (same structure as generateReport)
    const reportData = {
      order_id: order.id,
      created_by: userId,
      created_at: new Date()
    };

    // Add period_of_insurance only for report types that have this column
    if (['report_cv'].includes(requestedReportType.toLowerCase())) {
      reportData.period_of_insurance = formattedPeriod;
    }

    // Store asset_make ID in database (not the name) - only for report types that have this field
    if (reportTypesWithAssetMake.includes(requestedReportType.toLowerCase()) && assetMakeIdForDB !== null) {
      formData.asset_make = assetMakeIdForDB;
    }
    
    // Filter form data to only include valid database columns
    const validFields = filterValidReportFields(formData, requestedReportType);
    Object.assign(reportData, validFields);

    if (["report_cv", "report_ce"].includes(requestedReportType.toLowerCase())) {
      if (chassisImageRelativePath) {
        reportData.chassis_no_pencil_impression = chassisImageRelativePath;
      } else {
        delete reportData.chassis_no_pencil_impression;
      }
    }

    let report;

    if (existingReport) {
      // Update existing report with new/partial data
      report = await ReportModel.updateReport(
        existingReport.id,
        reportData,
        userId
      );
      // Delete existing flexible fields and add new ones
      await ReportModel.deleteFlexibleFieldsByReportId(report.id);
    } else {
      // Create new report
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

    // Get the complete report data with flexible fields for response
    const completeReport = await ReportModel.findByOrderIdWithFlexibleFields(
      order_id
    );

    res.json({
      success: true,
      message: "Report data saved successfully",
      data: {
        report_id: report.id,
        report: completeReport,
        order_id: parseInt(order_id),
        report_type: requestedReportType
      },
    });
  } catch (err) {
    next(err);
  }
};


/**
 * Parse flexible fields from request body format
 * Handles format like: flexible_fields[0][section_name], flexible_fields[0][col_span], etc.
 * @param {Object} formData - Form data from request
 * @returns {Array} Array of flexible field objects
 */
function parseFlexibleFieldsFromRequest(formData) {
  const flexibleFields = [];
  const fieldIndices = new Set();

  // Find all flexible field indices
  Object.keys(formData).forEach(key => {
    const match = key.match(/^flexible_fields\[(\d+)\]\[([^\]]+)\]$/);
    if (match) {
      fieldIndices.add(parseInt(match[1]));
    }
  });

  // Parse each flexible field
  fieldIndices.forEach(index => {
    const field = {};
    const sectionName = formData[`flexible_fields[${index}][section_name]`];
    const colSpan = formData[`flexible_fields[${index}][col_span]`];
    const fieldLabel = formData[`flexible_fields[${index}][field_label]`];
    const fieldValue = formData[`flexible_fields[${index}][field_value]`];
    const fieldOrder = formData[`flexible_fields[${index}][field_order]`];

    // Only add field if it has at least section_name and field_label
    if (sectionName && fieldLabel) {
      field.section_name = sectionName;
      field.col_span = colSpan ? parseInt(colSpan) : null;
      field.field_label = fieldLabel;
      field.field_value = fieldValue || null;
      field.field_order = fieldOrder ? parseInt(fieldOrder) : null;
      flexibleFields.push(field);
    }
  });

  return flexibleFields;
}

/**
 * Filter form data to only include valid database columns for each report type
 * @param {Object} formData - Form data from request
 * @param {string} reportType - Type of report
 * @returns {Object} Filtered data with only valid columns
 */
function filterValidReportFields(formData, reportType) {
  // Define valid columns for each report type based on actual database schema
  const validColumns = {
    report_cv: [
      'ref_no_year', 'ref_no_bank', 'state_name', 'ref_no_code', 'ref_no_id',
      'report_date', 'valuer_name', 'license_no', 'valuer_contact', 'valuation_purpose',
      'initiated_by', 'date_of_inspection', 'place_of_inspection',
      'registered_owner_name', 'registered_owner_address', 'proposed_owner_name', 'proposed_owner_address',
      'registration_no', 'registration_date', 'registered_location', 'owner_serial_no',
      'manufacture_year', 'asset_make', 'model', 'engine_no_detail', 'chassis_no',
      'body_type', 'fuel_type', 'kilometer_reading', 'invoice_no_date',
      'hyp_with', 'hyp_from_date', 'asset_classification', 'no_of_cylinder',
      'engine_condition', 'chassis_condition', 'body_condition', 'cabin_condition',
      'electrical_condition', 'gear_transmission', 'battery_available', 'gross_vehicle_weight',
      'front_tyre_no', 'front_tyre_condition', 'middle_tyre_no', 'middle_tyre_condition',
      'rear_tyre_no', 'rear_tyre_condition', 'no_of_tyres', 'stepney',
      'horse_power', 'mechanical_unit_condition', 'cubic_capacity', 'suspension',
      'seating_capacity', 'tool_kit_available', 'vehicle_colour', 'color_condition',
      'damages_if_any', 'rc_book_verified', 'invoice_verified', 'tax_upto',
      'permit_upto', 'permit_type', 'fitness_upto',
      'insurance_co_name', 'policy_no', 'period_of_insurance', 'insured_value', 'insurance_verified',
      'current_invoice_cost', 'depreciation', 'depreciation_value', 'appraiser_value',
      'fair_market_value', 'amount_in_words',
      'no_of_photograph', 'no_of_collage', 'valuer_comments_remarks',
      'declaration', 'disclaimer', 'chassis_no_pencil_impression'
    ],
    report_avr: [
      'ref_no_year', 'ref_no_bank', 'ref_no_code', 'ref_no_id', 'lan_no',
      'report_date', 'bank_name', 'branch_name', 'state_name',
      'model_number', 'officer_name', 'officer_designation', 'inspected_item', 'inspected_date',
      'inspection_address', 'customer_name', 'address_as_per_kyc', 'machinery_locations', 'lan_city_no',
      'date_of_disbursement', 'date_of_invoice_delivery_no', 'invoice_price', 'lien_of_bank',
      'chassis_no', 'machine_serial_no', 'engine_no', 'regn_no',
      'installed_running', 'installed_asset_whether_functional_or_not', 'class_make_of_asset', 'year_of_mfg',
      'invoice_purchase_order_no', 'pro_owner_address',
      'insurer_policy_no', 'insurance_validity_insured_value', 'insurance_having_lien_of_bank',
      'total_crane_weight_capacity', 'material_usefulness', 'colour', 'observation', 'status_of_machine',
      'visit_done_by', 'place', 'date_time', 'surveyor', 'license_no', 'surveyor_location',
      'no_of_photograph', 'no_of_collage', 'valuer_comments_remarks',
      'declaration', 'disclaimer'
    ],
    report_machinery: [
      'ref_no_year', 'ref_no_bank', 'state_name', 'ref_no_code', 'ref_no_id',
      'report_date', 'valuer_name', 'license_no', 'valuer_contact', 'valuation_purpose',
      'initiated_by', 'date_of_inspection', 'place_of_inspection',
      'registered_owner_name', 'registered_owner_address', 'proposed_owner_name', 'proposed_owner_address',
      'registration_no', 'registration_date', 'location_of_machinery', 'owner_serial_no',
      'manufacture_year', 'asset_make', 'model', 'control_system', 'machine_serial_no',
      'laf_id', 'application_usage', 'invoice_no_date',
      'hyp_with', 'machine_type', 'asset_classification', 'no_of_cylinder',
      'machine_technology', 'machine_condition', 'electrical_condition', 'mechanical_condition',
      'fix_but_flex_heading_1', 'fix_but_flex_value_1', 'fix_but_flex_heading_2', 'fix_but_flex_value_2',
      'fix_but_flex_heading_3', 'fix_but_flex_value_3', 'fix_but_flex_heading_4', 'fix_but_flex_value_4',
      'fix_but_flex_heading_5', 'fix_but_flex_value_5', 'fix_but_flex_heading_6', 'fix_but_flex_value_6',
      'fix_but_flex_heading_7', 'fix_but_flex_value_7', 'fix_but_flex_heading_8', 'fix_but_flex_value_8',
      'fix_but_flex_heading_9', 'fix_but_flex_value_9', 'fix_but_flex_heading_10', 'fix_but_flex_value_10',
      'fix_but_flex_heading_11', 'fix_but_flex_value_11', 'fix_but_flex_heading_12', 'fix_but_flex_value_12',
      'machine_colour', 'color_condition', 'damages_if_any',
      'rc_book_verified', 'tax_invoice_copy', 'tax_upto_title', 'tax_upto',
      'permit_upto', 'permit_type', 'fitness_upto_title', 'fitness_upto',
      'insurance_co_name', 'policy_no', 'insurance_valid_date', 'insured_value', 'insurance_verified',
      'tax_invoice_cost', 'depreciation', 'depreciation_value', 'appraiser_value',
      'fair_market_value', 'amount_in_words',
      'no_of_photograph', 'no_of_collage', 'valuer_comments_remarks',
      'declaration', 'disclaimer'
    ],
    report_ce: [
      'ref_no_year', 'ref_no_bank', 'state_name', 'ref_no_code', 'ref_no_id', 'rev_report_date',
      'valuer_name', 'license_no', 'valuer_contact', 'valuation_purpose', 'initiated_by',
      'date_of_inspection', 'place_of_inspection',
      'registered_owner_name', 'registered_owner_address', 'proposed_owner_name', 'proposed_owner_address',
      'registration_no', 'registration_date', 'registered_location', 'owner_serial_no',
      'manufacture_year', 'asset_make', 'model', 'engine_no_detail', 'crane_chassis_no',
      'body_type', 'crane_model_code', 'hours_meter_reading', 'invoice_no_date', 'invoice_no', 'invoice_date',
      'hyp_with', 'hyp_from_date', 'asset_classification', 'no_of_cylinder',
      'engine_condition', 'chassis_condition', 'body_condition', 'cabin_condition',
      'electrical_condition', 'gear_transmission', 'battery_available', 'gross_machine_weight',
      'fix_but_flex_heading_1', 'fix_but_flex_value_1', 'fix_but_flex_heading_2', 'fix_but_flex_value_2',
      'fix_but_flex_heading_3', 'fix_but_flex_value_3', 'fix_but_flex_title_1', 'fix_but_flex_title_2',
      'fix_but_flex_title_3', 'fix_but_flex_heading_4', 'fix_but_flex_value_4', 'fix_but_flex_heading_5',
      'fix_but_flex_value_5', 'fix_but_flex_heading_6', 'fix_but_flex_value_6', 'fix_but_flex_heading_7',
      'fix_but_flex_value_7', 'fix_but_flex_heading_8', 'fix_but_flex_value_8', 'fix_but_flex_heading_9',
      'fix_but_flex_value_9', 'fix_but_flex_heading_10', 'fix_but_flex_value_10', 'fix_but_flex_heading_11',
      'fix_but_flex_value_11', 'fix_but_flex_heading_12', 'fix_but_flex_value_12', 'fix_but_flex_top_heading_13',
      'fix_but_flex_heading_13', 'fix_but_flex_value_13', 'fix_but_flex_heading_14', 'fix_but_flex_value_14',
      'fix_but_flex_heading_15', 'fix_but_flex_value_15', 'fix_but_flex_heading_16', 'fix_but_flex_value_16',
      'fix_but_flex_heading_17', 'fix_but_flex_value_17', 'fix_but_flex_heading_18', 'fix_but_flex_value_18',
      'fix_but_flex_heading_19', 'fix_but_flex_value_19', 'fix_but_flex_heading_20', 'fix_but_flex_value_20',
      'fix_but_flex_heading_21', 'fix_but_flex_value_21', 'fix_but_flex_heading_22', 'fix_but_flex_value_22',
      'fix_but_flex_heading_23', 'fix_but_flex_value_23', 'fix_but_flex_heading_24', 'fix_but_flex_value_24',
      'fix_but_flex_heading_25', 'fix_but_flex_value_25', 'damages_if_any',
      'bill_of_entry', 'proforma_invoice_verified', 'tax_upto', 'bill_of_lading',
      'chartered_engineer_certificate', 'fitness_upto',
      'insurance_co_name', 'policy_no', 'insurance_valid_date', 'insured_value', 'insurance_verified',
      'invoice_cost', 'depreciation', 'depreciation_value', 'appraiser_value',
      'fair_market_value', 'amount_in_words',
      'no_of_photograph', 'no_of_collage', 'valuer_comments_remarks',
      'declaration', 'disclaimer', 'chassis_no_pencil_impression'
    ]
  };

  const allowedColumns = validColumns[reportType.toLowerCase()] || [];
  const filteredData = {};

  // Only include fields that exist in the valid columns list
  Object.keys(formData).forEach(key => {
    if (allowedColumns.includes(key)) {
      filteredData[key] = formData[key];
    }
  });

  return filteredData;
}

// Export multer middleware for use in routes
exports.uploadChassisImage = upload.single("chassis_no_pencil_impression");
