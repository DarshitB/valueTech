const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const multer = require("multer");

// Import database connection
const db = require("../../../../db");

// Import models and utilities
const Order = require("../../../models/orders/order");
const CvReport = require("../../../models/orders/reports/cvReport");
const AvrReport = require("../../../models/orders/reports/avrReport");
const MachineryReport = require("../../../models/orders/reports/machineryReport");
const CeReport = require("../../../models/orders/reports/ceReport");
const MarineReport = require("../../../models/orders/reports/marineReport");
const orderMediaDocument = require("../../../models/orders/orderMediaDocument");
const OrderStatusHistory = require("../../../models/orders/orderStatusHistory");
const AssetMakesForReports = require("../../../models/orders/assetMakesOfReports");
const { ensureDirectoryExists } = require("../../../utils/localFileHelper");

// Import report templates
const cvReportTemplate = require("./templates/cv_report_template");
const avrReportTemplate = require("./templates/avr_report_template");
const machineryReportTemplate = require("./templates/machinery_report_template");
const ceReportTemplate = require("./templates/ce_report_template");
const marineReportTemplate = require("./templates/marine_report_template");

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
    const hasReport = documents.some((doc) => doc.document_type === "report");

    // Check if order has at least one collage
    const hasCollage = documents.some((doc) => doc.document_type === "collage");

    // If both exist, update status to 9
    if (hasReport && hasCollage) {
      await Order.updateOrder(orderId, {
        current_status_id: 9,
        updated_at: new Date(),
        updated_by: userId,
      });

      // Create status history entry
      const statusHistoryData = {
        order_id: orderId,
        status_id: 9,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: "Both report and collage generated",
      };

      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }
  } catch (error) {
    console.error("Error checking/updating order status:", error);
    // Don't throw error - this is a non-critical operation
  }
}

/**
 * Helper function to convert number to words
 * e.g., 12 -> "TWELVE"
 */
function numberToWords(num) {
  const ones = [
    "",
    "ONE",
    "TWO",
    "THREE",
    "FOUR",
    "FIVE",
    "SIX",
    "SEVEN",
    "EIGHT",
    "NINE",
  ];
  const tens = [
    "",
    "",
    "TWENTY",
    "THIRTY",
    "FORTY",
    "FIFTY",
    "SIXTY",
    "SEVENTY",
    "EIGHTY",
    "NINETY",
  ];
  const teens = [
    "TEN",
    "ELEVEN",
    "TWELVE",
    "THIRTEEN",
    "FOURTEEN",
    "FIFTEEN",
    "SIXTEEN",
    "SEVENTEEN",
    "EIGHTEEN",
    "NINETEEN",
  ];

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
    return (
      ones[hundred] +
      " HUNDRED" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
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
function convertNumericExpression(fieldValue, fieldName = "field") {
  if (!fieldValue || typeof fieldValue !== "string") {
    return fieldValue;
  }

  // Trim whitespace
  const trimmedValue = fieldValue.trim();

  // Check for invalid characters - ONLY allow: numbers (0-9), spaces, + and -
  const invalidCharsRegex = /[^0-9+\-\s]/g;
  const invalidChars = trimmedValue.match(invalidCharsRegex);

  if (invalidChars) {
    const uniqueInvalidChars = [...new Set(invalidChars)].join(", ");
    throw new BadRequestError(
      `Invalid characters found in ${fieldName}: "${uniqueInvalidChars}". Only numbers, spaces, + and - are allowed.`
    );
  }

  // Check if it contains mathematical operators (+ or -)
  if (trimmedValue.includes("+") || trimmedValue.includes("-")) {
    try {
      // Replace spaces and evaluate
      const expression = trimmedValue.replace(/\s/g, "");

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
  "image/bmp": ".bmp",
};

const EXTENSION_MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
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

function saveChassisImage(
  buffer,
  mimeType,
  originalName,
  year,
  month,
  orderNumber
) {
  if (!buffer || !buffer.length || !orderNumber) return null;

  const extensionFromOriginal = originalName ? path.extname(originalName) : "";
  const extensionFromMime = getExtensionFromMime(mimeType);
  const extension = (
    extensionFromOriginal ||
    extensionFromMime ||
    ".jpg"
  ).toLowerCase();

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const fileName = `chassis_${uniqueSuffix}${
    extension.startsWith(".") ? extension : `.${extension}`
  }`;

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
    case "report_marine":
      return MarineReport;
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
    const reportTypesWithAssetMake = [
      "report_cv",
      "report_machinery",
      "report_ce",
    ];

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
    let flexibleFields = extractFlexibleFieldsFromFormData(formData);

    // If no flexible fields in request body but report exists, load from database
    if (flexibleFields.length === 0 && existingReport) {
      const reportWithFlexibleFields =
        await ReportModel.findByOrderIdWithFlexibleFields(order_id);
      if (
        reportWithFlexibleFields &&
        reportWithFlexibleFields.flexible_fields
      ) {
        flexibleFields = reportWithFlexibleFields.flexible_fields;
        /* console.log(`[Marine Report] Loaded ${flexibleFields.length} flexible fields from database`); */
      }
    } else if (flexibleFields.length > 0) {
      /* console.log(`[Marine Report] Using ${flexibleFields.length} flexible fields from request body`); */
    }

    // Debug: Log flexible fields for marine reports
    if (
      requestedReportType.toLowerCase() === "report_marine" &&
      flexibleFields.length > 0
    ) {
      /* console.log(`[Marine Report] Flexible fields sections:`, flexibleFields.map(f => f.section_name).filter(Boolean)); */
    }

    // Add flexible fields back to formData for template rendering
    formData.flexible_fields = flexibleFields;

    // Handle chassis impression image (for CV and CE reports)
    let chassisImageRelativePath = null;
    let chassisImageBase64 = null;

    if (
      ["report_cv", "report_ce"].includes(requestedReportType.toLowerCase())
    ) {
      chassisImageRelativePath = resolveChassisRelativePath(
        formData.chassis_no_pencil_impression,
        existingReport
      );

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
        chassisImageBase64 = await loadChassisImageBase64(
          chassisImageRelativePath
        );
      }

      if (chassisImageRelativePath) {
        formData.chassis_no_pencil_impression = chassisImageRelativePath;
      } else {
        delete formData.chassis_no_pencil_impression;
      }
    }

    // Handle vessel_photo for marine reports
    if (requestedReportType.toLowerCase() === "report_marine") {
      // Store the relative path, use preview URL for template if available
      if (formData.vessel_photo_preview) {
        // Keep preview URL for template, but store relative path in DB
        formData.vessel_photo_for_template = formData.vessel_photo_preview;
      } else if (formData.vessel_photo) {
        // Convert relative path to full URL for template
        const baseUrl = process.env.BASE_URL || "http://localhost:5000";
        formData.vessel_photo_for_template = formData.vessel_photo.startsWith(
          "/"
        )
          ? `${baseUrl}${formData.vessel_photo}`
          : `${baseUrl}/${formData.vessel_photo}`;
      }
    }

    // Handle asset_make: Only for report types that have this field (CV, Machinery, CE)
    // AVR report does NOT have asset_make field
    let assetMakeIdForDB = null;
    let assetMakeNameForTemplate = null;

    if (reportTypesWithAssetMake.includes(requestedReportType.toLowerCase())) {
      if (
        formData.new_asset_make &&
        formData.new_asset_make.trim().length > 0
      ) {
        // If new_asset_make is provided, create new record and get its ID
        const newAssetMakeRecord = await AssetMakesForReports.create({
          order_type: requestedReportType,
          name: formData.new_asset_make.trim(),
          created_by: userId,
        });

        assetMakeIdForDB = newAssetMakeRecord.id;
        assetMakeNameForTemplate = newAssetMakeRecord.name;
      } else if (formData.asset_make) {
        // Check if asset_make is a valid integer ID or a name string
        const assetMakeValue = formData.asset_make;
        const isNumericId =
          !isNaN(parseInt(assetMakeValue)) &&
          isFinite(assetMakeValue) &&
          Number.isInteger(Number(assetMakeValue));

        let assetMakeRecord = null;
        if (isNumericId) {
          // If it's a numeric ID, find by ID
          assetMakeRecord = await AssetMakesForReports.findById(
            parseInt(assetMakeValue)
          );
        } else {
          // If it's a name string, find by name and order type
          assetMakeRecord = await AssetMakesForReports.findByName(
            assetMakeValue,
            requestedReportType
          );
        }

        if (assetMakeRecord) {
          assetMakeIdForDB = assetMakeRecord.id;
          assetMakeNameForTemplate = assetMakeRecord.name;
        } else if (!isNumericId) {
          // If name not found and it's a string, use it directly as the name
          assetMakeNameForTemplate = assetMakeValue;
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
      childCat: order.child_category_name || "Child Category",
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
        "no_of_photograph"
      );
    }

    // Convert no_of_collage for display (same logic as no_of_photograph)
    const originalCollageNumber = formData.no_of_collage;
    if (formData.no_of_collage) {
      formData.no_of_collage = convertNumericExpression(
        formData.no_of_collage,
        "no_of_collage"
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

    // Prepare report data (exclude flexible_fields, report_type, tyre_image_base64, new_asset_make, and template-only fields from main report data)
    const {
      flexible_fields,
      report_type,
      tyre_image_base64,
      new_asset_make,
      vessel_photo_preview,
      vessel_photo_for_template,
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
    if (
      reportTypesWithAssetMake.includes(requestedReportType.toLowerCase()) &&
      assetMakeIdForDB !== null
    ) {
      mainReportData.asset_make = assetMakeIdForDB;
    }

    // Map frontend field name to database column name for CV, CE, and Machinery report headings
    if (
      ["report_cv", "report_ce", "report_machinery"].includes(
        requestedReportType.toLowerCase()
      )
    ) {
      if (mainReportData.valuation_report_for_heading !== undefined) {
        mainReportData.valueation_report_for_heading =
          mainReportData.valuation_report_for_heading;
        delete mainReportData.valuation_report_for_heading;
      }
    }

    // Filter form data to only include valid database columns
    const validFields = filterValidReportFields(
      mainReportData,
      requestedReportType
    );

    const reportData = {
      order_id: order.id,
      ...validFields,
      created_by: userId,
      created_at: new Date(),
    };

    if (
      ["report_cv", "report_ce"].includes(requestedReportType.toLowerCase())
    ) {
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
          updated_at: new Date(),
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
        // Marine reports use field_1, field_2, etc. instead of field_label/field_value
        if (requestedReportType.toLowerCase() === "report_marine") {
          await ReportModel.createFlexibleField({
            report_id: report.id,
            section_name: field.section_name || null,
            col_span: field.col_span ? parseInt(field.col_span) : null,
            field_1: field.field_1 || null,
            field_2: field.field_2 || null,
            field_3: field.field_3 || null,
            field_4: field.field_4 || null,
            field_5: field.field_5 || null,
            field_6: field.field_6 || null,
            field_7: field.field_7 || null,
            field_8: field.field_8 || null,
            field_9: field.field_9 || null,
            field_10: field.field_10 || null,
            field_order: field.field_order ? parseInt(field.field_order) : null,
            created_by: userId,
            created_at: new Date(),
          });
        } else {
          // Other reports use field_label/field_value
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
  // Determine background image based on report type
  let bgImageFileName = "vkassociate_letter_head.jpg"; // Default image
  let stampPngFile = null; // Optional stamp overlay

  // Marine reports use separate letterhead images
  if (reportType.toLowerCase() === "report_marine") {
    // For marine reports, use marine-specific letterhead
    // Check valuer_name to determine which marine letterhead to use
    const nameField = formData.valuer_name;

    if (nameField) {
      const name = nameField.toUpperCase().trim();

      if (name === "V.K. ASSOCIATES") {
        bgImageFileName = "marine-vs.webp"; // Marine letterhead for VKA
        stampPngFile = "vka.png";
      } else if (name === "VALUETECH SOLUTIONS") {
        bgImageFileName = "marine-vs.webp"; // Marine letterhead for VTS
        stampPngFile = "vts.png";
      } else if (name === "VISHAL D. KOTHARI") {
        bgImageFileName = "marine-vs.webp"; // Marine letterhead for VDK
        stampPngFile = "vdk.png";
      } else {
        // Default marine letterhead
        bgImageFileName = "marine-vs.webp";
      }
    } else {
      // Default marine letterhead
      bgImageFileName = "marine-vs.webp";
    }
  } else {
    // For other report types (CV, AVR, Machinery, CE), use regular letterheads
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
  }

  // Background image path
  const bgPath = path.join(process.cwd(), "public", "img", bgImageFileName);

  // Convert background image to base64 (optimized)
  let bgImageBase64 = null;
  let stampImageBase64 = null;
  try {
    if (fs.existsSync(bgPath)) {
      const imageBuffer = fs.readFileSync(bgPath);
      // Determine MIME type based on file extension
      let mimeType = "image/png"; // Default
      if (bgImageFileName.endsWith(".webp")) {
        mimeType = "image/webp";
      } else if (
        bgImageFileName.endsWith(".jpg") ||
        bgImageFileName.endsWith(".jpeg")
      ) {
        mimeType = "image/jpeg";
      } else if (bgImageFileName.endsWith(".png")) {
        mimeType = "image/png";
      }
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
        stampImageBase64 = `data:${stampMime};base64,${stampBuffer.toString(
          "base64"
        )}`;
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
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH ||
    undefined;

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

    // Set content with appropriate loading strategy
    // For marine reports, wait for networkidle to ensure JavaScript executes
    const waitStrategy =
      reportType.toLowerCase() === "report_marine"
        ? "networkidle0"
        : "domcontentloaded";

    await page.setContent(htmlContent, {
      waitUntil: waitStrategy,
      timeout: reportType.toLowerCase() === "report_marine" ? 30000 : 10000, // More time for marine reports
    });

    // For marine reports, add additional wait to ensure JavaScript pagination completes
    if (reportType.toLowerCase() === "report_marine") {
      // Wait for JavaScript to execute using waitForFunction
      try {
        await page
          .waitForFunction(
            () => {
              // Check if autoPaginate has run by looking for multiple pages or updated content
              const pages = document.querySelectorAll(".page");
              return pages.length > 0;
            },
            { timeout: 5000 }
          )
          .catch(() => {
            // If it times out, just continue - the content is already loaded
          });

        // Additional delay using Promise
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        // Continue even if wait fails
        console.warn(
          "Wait for pagination completed with warning:",
          error.message
        );
      }
    }

    // Generate PDF with legal size dimensions (8.5" x 14")
    const pdfStartTime = Date.now();

    // For CV reports, use displayHeaderFooter to add page numbers
    const pdfOptions = {
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
    };

    // CV, CE, and Machinery Report specific handling: Single-page detection and footer management
    if (
      reportType.toLowerCase() === "report_cv" ||
      reportType.toLowerCase() === "report_ce" ||
      reportType.toLowerCase() === "report_machinery"
    ) {
      // console.log("🔵 Starting table split for:", reportType);

      try {
        const splitResult = await page.evaluate((reportType) => {
          // Helper function to set page number on a table
          const setPageNumber = (table, pageNum) => {
            if (!table) return;
            const footerRow = table.querySelector("tfoot .footer-row");
            if (footerRow) {
              const pageNumberSpan =
                footerRow.querySelector(".page-number-value");
              if (pageNumberSpan) {
                pageNumberSpan.textContent = `Page ${pageNum}`;
                pageNumberSpan.setAttribute(
                  "data-page-number",
                  pageNum.toString()
                );
              }
            }
          };

          // Check if report type needs footer with page numbers
          const needsFooter = [
            "report_ce",
            "report_cv",
            "report_machinery",
          ].includes(reportType?.toLowerCase());

          // ============================================
          // 🔥 STEP 1: Measure ACTUAL page dimensions
          // ============================================

          const body = document.body;
          const wrapper = document.querySelector(".content-wrapper");
          const origTable = document.querySelector("table");

          if (!origTable) return { success: false, error: "Table not found" };

          const thead = origTable.querySelector("thead");
          const tbody = origTable.querySelector("tbody");
          const tfoot = origTable.querySelector("tfoot");

          if (!thead || !tbody)
            return { success: false, error: "thead/tbody not found" };

          // Measure everything
          const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
          const wrapperPaddingTop = wrapperStyle
            ? parseInt(wrapperStyle.paddingTop)
            : 30;
          const wrapperPaddingBottom = wrapperStyle
            ? parseInt(wrapperStyle.paddingBottom)
            : 0;

          // ============================================
          // 🔥 STEP 2: Calculate REAL available space
          // ============================================

          // Page height in pixels (Legal size = 14 inches at 96 DPI)
          const PAGE_HEIGHT_PX = 14 * 96; // 1344px

          // Get actual spacer height
          const spacerRow = thead.querySelector(".spacer-row");
          const actualSpacerHeight = spacerRow ? spacerRow.offsetHeight : 225;

          // Get tfoot height (includes footer row + spacer row)
          const tfootHeight = tfoot ? tfoot.offsetHeight : 0;
          const tfootSpacerRow = tfoot
            ? tfoot.querySelector(".spacer-row")
            : null;
          const tfootFooterRow = tfoot
            ? tfoot.querySelector(".footer-row")
            : null;
          
          // Calculate actual bottom space
          // Only count footer row (30px) - spacer is for visual spacing only, not needed in JS calculation
          const tfootSpacerHeight = tfootSpacerRow ? tfootSpacerRow.offsetHeight : 80;
          const tfootFooterHeight = tfootFooterRow ? tfootFooterRow.offsetHeight : 30;
          const actualBottomSpace = tfootFooterHeight; // Only footer row, spacer is visual only
          
          // console.log("   Tfoot total height:", tfootHeight, "px");
          // console.log("   Tfoot spacer row (visual only):", tfootSpacerHeight, "px");
          // console.log("   Tfoot footer row:", tfootFooterHeight, "px");
          // console.log("   Bottom space (footer only):", actualBottomSpace, "px");

          // Calculate REAL available space per page
          // Add safety margin to prevent text overflow and ensure rows don't break mid-way
          const SAFETY_MARGIN = 30; // 30px safety buffer (reduced from 50px since footer row is now counted)
          const realAvailable =
            PAGE_HEIGHT_PX -
            actualSpacerHeight -
            wrapperPaddingTop -
            wrapperPaddingBottom -
            actualBottomSpace -
            SAFETY_MARGIN;

          // console.log("📏 CALCULATED SPACE:");
          // console.log("   Page height:", PAGE_HEIGHT_PX, "px");
          // console.log("   Minus top spacer:", actualSpacerHeight, "px");
          // console.log("   Minus top padding:", wrapperPaddingTop, "px");
          // console.log("   Minus bottom padding:", wrapperPaddingBottom, "px");
          // console.log("   Minus bottom space (footer only):", actualBottomSpace, "px");
          // console.log("   Minus safety margin:", SAFETY_MARGIN, "px");
          // console.log("   = Available per page:", realAvailable, "px");

          // ============================================
          // STEP 3: Calculate thead heights
          // ============================================

          const theadRows = Array.from(thead.querySelectorAll("tr"));
          let baseTheadHeight = 0;
          let generalDetailsRows = [];

          theadRows.forEach((row) => {
            if (row.classList.contains("spacer-row")) {
              return; // Don't count spacer
            }

            const fullText = row.textContent.toUpperCase().trim();

            if (
              row.classList.contains("general-details-row") ||
              row.hasAttribute("data-first-page-only") ||
              fullText.includes("GENERAL DETAILS")
            ) {
              generalDetailsRows.push(row);
            } else {
              baseTheadHeight += row.offsetHeight;
            }
          });

          // console.log(
          //   "📏 Base thead height (without General Details):",
          //   baseTheadHeight,
          //   "px"
          // );

          // ============================================
          // STEP 4: Find Proposed Owner rows
          // ============================================

          const tbodyRows = Array.from(tbody.querySelectorAll("tr"));

          let proposedOwnerNameRow = null;
          let proposedOwnerAddressRow = null;
          let proposedOwnerNameIndex = -1;
          let proposedOwnerAddressIndex = -1;

          for (let i = 0; i < tbodyRows.length; i++) {
            const row = tbodyRows[i];
            const cells = Array.from(row.querySelectorAll("td, th"));
            const firstText = cells[0]
              ? cells[0].textContent.toUpperCase().trim()
              : "";

            if (firstText.includes("PROPOSED OWNER NAME")) {
              proposedOwnerNameRow = row;
              proposedOwnerNameIndex = i;
            } else if (
              proposedOwnerNameRow &&
              (row.hasAttribute("data-proposed-owner-address") ||
                firstText === "ADDRESS:")
            ) {
              proposedOwnerAddressRow = row;
              proposedOwnerAddressIndex = i;
              break;
            }
          }

          let proposedOwnerRowsHeight = 0;
          if (proposedOwnerNameRow) {
            proposedOwnerRowsHeight += proposedOwnerNameRow.offsetHeight;
          }
          if (proposedOwnerAddressRow) {
            proposedOwnerRowsHeight += proposedOwnerAddressRow.offsetHeight;
          }

          // console.log(
          //   "📏 Proposed Owner rows height:",
          //   proposedOwnerRowsHeight,
          //   "px"
          // );

          // ============================================
          // STEP 5: Multi-page split calculation
          // ============================================

          // First page: has General Details, no Proposed Owner in thead
          const firstPageTheadHeight = baseTheadHeight;
          const firstPageAvailable = realAvailable - firstPageTheadHeight;

          // Subsequent pages: no General Details, has Proposed Owner in thead
          const subsequentTheadHeight =
            baseTheadHeight + proposedOwnerRowsHeight;
          const subsequentAvailable = realAvailable - subsequentTheadHeight;

          // console.log("📏 FIRST PAGE:");
          // console.log("   Thead height:", firstPageTheadHeight, "px");
          // console.log("   Available for tbody:", firstPageAvailable, "px");
          // console.log("📏 SUBSEQUENT PAGES:");
          // console.log("   Thead height:", subsequentTheadHeight, "px");
          // console.log("   Available for tbody:", subsequentAvailable, "px");

          // ============================================
          // STEP 6: Calculate split points for all pages
          // ============================================

          const splitPoints = [];
          let currentRowIndex = 0;
          let pageNumber = 1;

          // console.log("📋 Calculating split points:");

          while (currentRowIndex < tbodyRows.length) {
            const availableSpace =
              pageNumber === 1 ? firstPageAvailable : subsequentAvailable;
            let accHeight = 0;
            let rowsInThisPage = 0;

            // console.log(
            //   `\n📄 Page ${pageNumber} (starting from row ${currentRowIndex}):`
            // );
            // console.log(`   Available space: ${availableSpace}px`);

            // Calculate how many rows fit in this page
            let actualRowsProcessed = 0;
            for (
              let i = currentRowIndex;
              i < tbodyRows.length;
              i++
            ) {
              // Skip Proposed Owner rows if they're in tbody (they'll be in thead for page 2+)
              if (
                pageNumber > 1 &&
                (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
              ) {
                actualRowsProcessed++;
                continue;
              }

              const rowHeight = tbodyRows[i].offsetHeight;
              const newHeight = accHeight + rowHeight;
              
              // Add extra buffer for rows with long text that might wrap
              const hasLongText = Array.from(tbodyRows[i].querySelectorAll('td')).some(td => {
                return td.textContent.length > 100; // If any cell has > 100 chars
              });
              const rowBuffer = hasLongText ? 10 : 0; // Extra 10px buffer for long text rows

              if (newHeight + rowBuffer <= availableSpace) {
                accHeight = newHeight;
                rowsInThisPage++;
                actualRowsProcessed++;
              } else {
                // Row doesn't fit - split here
                // console.log(
                //   `   ✂️ SPLIT at row ${i} (row height: ${rowHeight}px${hasLongText ? ' + 10px buffer (long text)' : ''}, would need: ${newHeight + rowBuffer}px)`
                // );
                break;
              }
            }

            if (rowsInThisPage === 0 && currentRowIndex < tbodyRows.length) {
              // Edge case: Even one row doesn't fit - force include it
              // console.log(
              //   `   ⚠️ Warning: Row ${currentRowIndex} doesn't fit but forcing it`
              // );
              rowsInThisPage = 1;
              actualRowsProcessed = 1;
              accHeight = tbodyRows[currentRowIndex].offsetHeight;
            }
            
            // Check if this would create an empty or near-empty next page
            const remainingRows = tbodyRows.length - (currentRowIndex + actualRowsProcessed);
            const MIN_ROWS_FOR_NEW_PAGE = 5; // Minimum 5 rows to justify a new page (increased from 2)
            
            if (remainingRows > 0 && remainingRows <= MIN_ROWS_FOR_NEW_PAGE) {
              // Too few rows left - try to fit them on current page
              // console.log(
              //   `   ⚠️ Only ${remainingRows} rows left - trying to fit on current page to avoid near-empty page`
              // );
              
              // Try to fit remaining rows
              let canFitRemaining = true;
              let testHeight = accHeight;
              let testRowsToAdd = 0;
              
              let skippedRows = 0;
              for (let i = currentRowIndex + actualRowsProcessed; i < tbodyRows.length; i++) {
                // Skip Proposed Owner rows if they're in tbody (they'll be in thead for page 2+)
                if (
                  pageNumber > 1 &&
                  (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
                ) {
                  skippedRows++;
                  continue;
                }
                
                const rowHeight = tbodyRows[i].offsetHeight;
                const newTestHeight = testHeight + rowHeight;
                
                // Use a very conservative threshold (allow up to 101% of available space)
                // Reduced from 103% to prevent text overflow issues
                const aggressiveThreshold = availableSpace * 1.01;
                
                if (newTestHeight <= aggressiveThreshold) {
                  testHeight = newTestHeight;
                  testRowsToAdd++;
                } else {
                  canFitRemaining = false;
                  break;
                }
              }
              
              if (canFitRemaining && testRowsToAdd > 0) {
                // Fit all remaining rows on this page
                const totalRowsToAdd = testRowsToAdd + skippedRows;
                // console.log(`   ✅ Fitting all ${testRowsToAdd} remaining content rows (${totalRowsToAdd} total with skipped) on current page (using ${testHeight}px vs ${availableSpace}px available)`);
                rowsInThisPage += testRowsToAdd;
                actualRowsProcessed += totalRowsToAdd;
                accHeight = testHeight;
              }
            }

            splitPoints.push({
              pageNumber: pageNumber,
              startRow: currentRowIndex,
              rowCount: actualRowsProcessed,
              spaceUsed: accHeight,
              spaceAvailable: availableSpace,
              unusedSpace: availableSpace - accHeight,
            });

            // console.log(
            //   `   ✅ Page ${pageNumber}: rows ${currentRowIndex} to ${
            //     currentRowIndex + actualRowsProcessed - 1
            //   } (${rowsInThisPage} content rows, ${actualRowsProcessed} total processed, ${accHeight}px used, ${
            //     availableSpace - accHeight
            //   }px unused)`
            // );

            currentRowIndex += actualRowsProcessed;
            pageNumber++;

            // Safety check to prevent infinite loop
            if (pageNumber > 100) {
              // console.error("❌ Too many pages, breaking loop");
              break;
            }
          }

          // ============================================
          // STEP 7: Check if single page
          // ============================================

          // console.log(`\n📊 Total split points: ${splitPoints.length}`);
          // console.log(`   Split points:`, splitPoints.map(sp => `Page ${sp.pageNumber}: ${sp.rowCount} rows`).join(', '));

          if (splitPoints.length === 1) {
            // Check if all rows are processed
            const totalRowsProcessed = splitPoints[0].rowCount;
            const totalRows = tbodyRows.length;
            const spaceUsed = splitPoints[0].spaceUsed;
            const spaceAvailable = splitPoints[0].spaceAvailable;
            
            // console.log(`   Total rows: ${totalRows}, Processed: ${totalRowsProcessed}`);
            // console.log(`   Space used: ${spaceUsed}px / ${spaceAvailable}px (${((spaceUsed/spaceAvailable)*100).toFixed(1)}%)`);
            
            // Only mark as single-page if ALL rows fit AND space usage is reasonable (< 95%)
            const allRowsProcessed = totalRowsProcessed >= totalRows - 2; // Allow margin for Proposed Owner rows
            const spaceUsageReasonable = (spaceUsed / spaceAvailable) < 0.95; // Less than 95% usage
            
            if (allRowsProcessed && spaceUsageReasonable) {
              // console.log("✅ All content fits comfortably on first page! No split needed.");
              document.body.classList.add("single-page");
              origTable.classList.add("last-page");
              return {
                success: false,
                error: "All content fits on one page",
                singlePage: true,
              };
            } else if (allRowsProcessed && !spaceUsageReasonable) {
              // console.log("⚠️ All rows processed but space usage is tight (>95%). Forcing split to avoid overflow.");
              // Don't return - continue with split logic
            }
          }

          // ============================================
          // STEP 8: Build multiple tables
          // ============================================

          const tables = [];
          const finalWrapper = origTable.parentElement;

          for (let p = 0; p < splitPoints.length; p++) {
            const split = splitPoints[p];
            const isFirstPage = split.pageNumber === 1;
            const isLastPage = p === splitPoints.length - 1;

            const table = document.createElement("table");
            table.style.cssText =
              "width:100%; border-collapse:collapse; margin-top:-30px; margin-bottom:0;";

            if (!isLastPage) {
              table.style.pageBreakAfter = "always";
            }

            // Build thead
            const newThead = document.createElement("thead");

            // Add spacer row
            theadRows.forEach((row) => {
              if (row.classList.contains("spacer-row")) {
                newThead.appendChild(row.cloneNode(true));
              }
            });

            // Add regular thead rows
            theadRows.forEach((row) => {
              if (row.classList.contains("spacer-row")) {
                return;
              }

              const fullText = row.textContent.toUpperCase().trim();
              const isGeneralDetails =
                row.classList.contains("general-details-row") ||
                row.hasAttribute("data-first-page-only") ||
                fullText.includes("GENERAL DETAILS");

              // General Details only on first page
              if (isGeneralDetails && !isFirstPage) {
                return;
              }

              newThead.appendChild(row.cloneNode(true));
            });

            // Add Proposed Owner rows to thead for subsequent pages
            if (!isFirstPage) {
              if (proposedOwnerNameRow) {
                newThead.appendChild(proposedOwnerNameRow.cloneNode(true));
              }
              if (proposedOwnerAddressRow) {
                newThead.appendChild(proposedOwnerAddressRow.cloneNode(true));
              }
              
              // Add empty spacing row after Proposed Owner on subsequent pages
              const spacingRow = document.createElement("tr");
              spacingRow.style.height = "20px"; // Adjust height as needed
              const spacingCell = document.createElement("td");
              spacingCell.setAttribute("colspan", "6");
              spacingCell.style.cssText = "border: none; height: 20px; padding: 0;";
              spacingRow.appendChild(spacingCell);
              newThead.appendChild(spacingRow);
            }

            table.appendChild(newThead);

            // Build tbody
            const newTbody = document.createElement("tbody");
            const endRow = split.startRow + split.rowCount;
            let tbodyRowsAdded = 0;

            for (let i = split.startRow; i < endRow && i < tbodyRows.length; i++) {
              // Skip Proposed Owner rows on subsequent pages (they're in thead)
              if (
                !isFirstPage &&
                (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
              ) {
                continue;
              }

              newTbody.appendChild(tbodyRows[i].cloneNode(true));
              tbodyRowsAdded++;
            }

            // Only add tbody if it has rows
            if (tbodyRowsAdded > 0) {
              table.appendChild(newTbody);
            } else {
              // Skip this table if no content rows
              // console.log(`   ⚠️ Skipping page ${split.pageNumber} - no content rows`);
              continue;
            }

            // Add tfoot
            if (tfoot) {
              table.appendChild(tfoot.cloneNode(true));
            }

            // Mark last page
            if (isLastPage) {
              table.classList.add("last-page");
            }

            // Set page number
            if (needsFooter) {
              setPageNumber(table, split.pageNumber);
            }

            tables.push(table);
          }

          // Replace original table with all new tables
          finalWrapper.innerHTML = "";
          tables.forEach((table) => {
            finalWrapper.appendChild(table);
          });

          // If only 1 page after split, mark as single-page
          if (tables.length === 1) {
            // console.log("✅ Only 1 page after split - marking as single-page");
            document.body.classList.add("single-page");
            tables[0].classList.add("last-page");
          }

          // console.log(`\n✅ Split completed into ${tables.length} pages!`);

          return {
            success: true,
            totalPages: tables.length,
            splitPoints: splitPoints,
            singlePage: tables.length === 1, // Add singlePage flag
            measurements: {
              pageHeight: PAGE_HEIGHT_PX,
              spacerHeight: actualSpacerHeight,
              bottomSpace: actualBottomSpace,
              firstPageAvailable: firstPageAvailable,
              subsequentAvailable: subsequentAvailable,
            },
          };
        }, reportType);

        // console.log(
        //   "📊 DETAILED SPLIT RESULT:",
        //   JSON.stringify(splitResult, null, 2)
        // );

        if (splitResult.success) {
          // console.log("");
          // console.log(`✅ Split completed into ${splitResult.totalPages} pages!`);
          
          // if (splitResult.splitPoints && splitResult.splitPoints.length > 0) {
          //   splitResult.splitPoints.forEach((split) => {
          //     console.log(
          //       `📄 Page ${split.pageNumber}: ${split.rowCount} rows, ${split.spaceUsed}/${split.spaceAvailable}px (${split.unusedSpace}px unused)`
          //     );
          //   });
          // }
        } else {
          // console.log("ℹ️", splitResult.error);

          // ✅ Verify કરો કે class add થઈ છે કે નહીં
          if (splitResult.singlePage) {
            const hasClass = await page.evaluate(() => {
              return document.body.classList.contains("single-page");
            });
            // console.log("✅ Single-page class present:", hasClass);

            // ✅ વધારે debugging માટે
            const bodyClasses = await page.evaluate(() => {
              return document.body.className;
            });
            // console.log("📝 Body classes:", bodyClasses);

            // Set page number to Page 1 for single-page reports that need footer
            const needsFooter = [
              "report_ce",
              "report_cv",
              "report_machinery",
            ].includes(reportType?.toLowerCase());
            if (needsFooter) {
              await page.evaluate(() => {
                const table = document.querySelector("table");
                if (table) {
                  const footerRow = table.querySelector("tfoot .footer-row");
                  if (footerRow) {
                    const pageNumberSpan =
                      footerRow.querySelector(".page-number-value");
                    if (pageNumberSpan) {
                      pageNumberSpan.textContent = "Page 1";
                      pageNumberSpan.setAttribute("data-page-number", "1");
                    }
                  }
                }
              });
            }
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch (error) {
        // console.error("❌ Error:", error);
      }
    } else {
      // Other reports: No footer by default
      pdfOptions.displayHeaderFooter = false;
    }

    await page.pdf(pdfOptions);
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
function generateReportHTML(
  reportType,
  formData,
  extraData,
  bgImageBase64,
  stampImageBase64
) {
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

    case "report_marine":
      return marineReportTemplate.generateMarineReportHTML(
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
        report = await MachineryReport.findByOrderIdWithFlexibleFields(
          order_id
        );
        break;

      case "report_ce":
        // Get CE report with flexible fields
        report = await CeReport.findByOrderIdWithFlexibleFields(order_id);
        break;

      case "report_marine":
        // Get Marine report with flexible fields
        report = await MarineReport.findByOrderIdWithFlexibleFields(order_id);
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
      const assetMakeRecord = await AssetMakesForReports.findById(
        report.asset_make
      );
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
 * Get last report by child_category_id and report_type
 * GET /orders-reports/child-category/:child_category_id/:report_type
 *
 * Returns the most recent report (by created_at) for the given child_category_id and report_type
 */
exports.getReportByChildCategoryAndType = async (req, res, next) => {
  try {
    const { child_category_id, report_type } = req.params;

    // Validate parameters
    if (!child_category_id) {
      throw new BadRequestError("Child category ID is required");
    }

    if (!report_type) {
      throw new BadRequestError("Report type is required");
    }

    const childCategoryId = parseInt(child_category_id);
    if (isNaN(childCategoryId)) {
      throw new BadRequestError("Invalid child category ID");
    }

    // Verify child category exists
    const childCategory = await db("child_category")
      .where("id", childCategoryId)
      .first();

    if (!childCategory) {
      throw new NotFoundError("Child category not found");
    }

    let report = null;
    let orderId = null;

    // Handle different report types
    switch (report_type.toLowerCase()) {
      case "report_cv":
        // Get last CV report for this child_category_id
        const cvReport = await db("report_cv")
          .leftJoin("orders", "report_cv.order_id", "orders.id")
          .leftJoin(
            "users as created_user",
            "report_cv.created_by",
            "created_user.id"
          )
          .leftJoin(
            "users as updated_user",
            "report_cv.updated_by",
            "updated_user.id"
          )
          .where("orders.child_category_id", childCategoryId)
          .whereNull("orders.deleted_at")
          .select(
            "report_cv.*",
            "orders.order_number",
            "orders.child_category_id",
            "created_user.name as created_by_name",
            "updated_user.name as updated_by_name"
          )
          .orderBy("report_cv.created_at", "desc")
          .first();

        if (cvReport) {
          orderId = cvReport.order_id;
          report = await CvReport.findByOrderIdWithFlexibleFields(orderId);
        }
        break;

      case "report_avr":
        const avrReport = await db("report_avr")
          .leftJoin("orders", "report_avr.order_id", "orders.id")
          .leftJoin(
            "users as created_user",
            "report_avr.created_by",
            "created_user.id"
          )
          .leftJoin(
            "users as updated_user",
            "report_avr.updated_by",
            "updated_user.id"
          )
          .where("orders.child_category_id", childCategoryId)
          .whereNull("orders.deleted_at")
          .select(
            "report_avr.*",
            "orders.order_number",
            "orders.child_category_id",
            "created_user.name as created_by_name",
            "updated_user.name as updated_by_name"
          )
          .orderBy("report_avr.created_at", "desc")
          .first();

        if (avrReport) {
          orderId = avrReport.order_id;
          report = await AvrReport.findByOrderIdWithFlexibleFields(orderId);
        }
        break;

      case "report_machinery":
        const machineryReport = await db("report_machinery")
          .leftJoin("orders", "report_machinery.order_id", "orders.id")
          .leftJoin(
            "users as created_user",
            "report_machinery.created_by",
            "created_user.id"
          )
          .leftJoin(
            "users as updated_user",
            "report_machinery.updated_by",
            "updated_user.id"
          )
          .where("orders.child_category_id", childCategoryId)
          .whereNull("orders.deleted_at")
          .select(
            "report_machinery.*",
            "orders.order_number",
            "orders.child_category_id",
            "created_user.name as created_by_name",
            "updated_user.name as updated_by_name"
          )
          .orderBy("report_machinery.created_at", "desc")
          .first();

        if (machineryReport) {
          orderId = machineryReport.order_id;
          report = await MachineryReport.findByOrderIdWithFlexibleFields(
            orderId
          );
        }
        break;

      case "report_ce":
        const ceReport = await db("report_ce")
          .leftJoin("orders", "report_ce.order_id", "orders.id")
          .leftJoin(
            "users as created_user",
            "report_ce.created_by",
            "created_user.id"
          )
          .leftJoin(
            "users as updated_user",
            "report_ce.updated_by",
            "updated_user.id"
          )
          .where("orders.child_category_id", childCategoryId)
          .whereNull("orders.deleted_at")
          .select(
            "report_ce.*",
            "orders.order_number",
            "orders.child_category_id",
            "created_user.name as created_by_name",
            "updated_user.name as updated_by_name"
          )
          .orderBy("report_ce.created_at", "desc")
          .first();

        if (ceReport) {
          orderId = ceReport.order_id;
          report = await CeReport.findByOrderIdWithFlexibleFields(orderId);
        }
        break;

      case "report_marine":
        const marineReport = await db("report_marine")
          .leftJoin("orders", "report_marine.order_id", "orders.id")
          .leftJoin(
            "users as created_user",
            "report_marine.created_by",
            "created_user.id"
          )
          .leftJoin(
            "users as updated_user",
            "report_marine.updated_by",
            "updated_user.id"
          )
          .where("orders.child_category_id", childCategoryId)
          .whereNull("orders.deleted_at")
          .select(
            "report_marine.*",
            "orders.order_number",
            "orders.child_category_id",
            "created_user.name as created_by_name",
            "updated_user.name as updated_by_name"
          )
          .orderBy("report_marine.created_at", "desc")
          .first();

        if (marineReport) {
          orderId = marineReport.order_id;
          report = await MarineReport.findByOrderIdWithFlexibleFields(orderId);
        }
        break;

      default:
        throw new BadRequestError(
          `Report type '${report_type}' does not exist`
        );
    }

    // If no report found for this child_category_id and report_type
    if (!report) {
      return res.status(404).json({
        success: false,
        message: `No ${report_type} found for child category ID ${childCategoryId}`,
        data: null,
      });
    }

    // If report has asset_make ID, fetch the name
    if (report.asset_make) {
      const assetMakeRecord = await AssetMakesForReports.findById(
        report.asset_make
      );
      if (assetMakeRecord) {
        report.asset_make_name = assetMakeRecord.name;
      }
    }

    // Return the report data
    res.status(200).json({
      success: true,
      message: `${report_type} retrieved successfully for child category`,
      data: {
        child_category_id: childCategoryId,
        child_category_name: childCategory.name,
        report_type: report_type,
        order_id: orderId,
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
    /* console.log("saveReportData", req.body); */

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

    const flexibleFields = extractFlexibleFieldsFromFormData(formData);

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

    // Handle asset_make: Only for report types that have this field (CV, Machinery, CE)
    // AVR report does NOT have asset_make field
    const reportTypesWithAssetMake = [
      "report_cv",
      "report_machinery",
      "report_ce",
    ];
    let assetMakeIdForDB = null;

    if (reportTypesWithAssetMake.includes(requestedReportType.toLowerCase())) {
      if (
        formData.new_asset_make &&
        formData.new_asset_make.trim().length > 0
      ) {
        // If new_asset_make is provided, create new record and get its ID
        const newAssetMakeRecord = await AssetMakesForReports.create({
          order_type: requestedReportType,
          name: formData.new_asset_make.trim(),
          created_by: userId,
        });

        assetMakeIdForDB = newAssetMakeRecord.id;
      } else if (formData.asset_make) {
        // Check if asset_make is a valid integer ID or a name string
        const assetMakeValue = formData.asset_make;
        const isNumericId =
          !isNaN(parseInt(assetMakeValue)) &&
          isFinite(assetMakeValue) &&
          Number.isInteger(Number(assetMakeValue));

        if (isNumericId) {
          // If it's a numeric ID, use it directly
          assetMakeIdForDB = parseInt(assetMakeValue);
        } else {
          // If it's a name string, try to find by name and order type
          const assetMakeRecord = await AssetMakesForReports.findByName(
            assetMakeValue,
            requestedReportType
          );
          if (assetMakeRecord) {
            assetMakeIdForDB = assetMakeRecord.id;
          }
          // If not found, assetMakeIdForDB remains null (will not be saved)
        }
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
      created_at: new Date(),
    };

    // Add period_of_insurance only for report types that have this column
    if (["report_cv"].includes(requestedReportType.toLowerCase())) {
      reportData.period_of_insurance = formattedPeriod;
    }

    // Store asset_make ID in database (not the name) - only for report types that have this field
    if (
      reportTypesWithAssetMake.includes(requestedReportType.toLowerCase()) &&
      assetMakeIdForDB !== null
    ) {
      formData.asset_make = assetMakeIdForDB;
    }

    // Map frontend field name to database column name for CV, CE, and Machinery report headings
    if (
      ["report_cv", "report_ce", "report_machinery"].includes(
        requestedReportType.toLowerCase()
      )
    ) {
      if (formData.valuation_report_for_heading !== undefined) {
        formData.valueation_report_for_heading =
          formData.valuation_report_for_heading;
        delete formData.valuation_report_for_heading;
      }
    }

    // Filter form data to only include valid database columns
    const validFields = filterValidReportFields(formData, requestedReportType);
    Object.assign(reportData, validFields);

    if (
      ["report_cv", "report_ce"].includes(requestedReportType.toLowerCase())
    ) {
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
        // Marine reports use field_1, field_2, etc. instead of field_label/field_value
        if (requestedReportType.toLowerCase() === "report_marine") {
          await ReportModel.createFlexibleField({
            report_id: report.id,
            section_name: field.section_name || null,
            col_span: field.col_span ? parseInt(field.col_span) : null,
            field_1: field.field_1 || null,
            field_2: field.field_2 || null,
            field_3: field.field_3 || null,
            field_4: field.field_4 || null,
            field_5: field.field_5 || null,
            field_6: field.field_6 || null,
            field_7: field.field_7 || null,
            field_8: field.field_8 || null,
            field_9: field.field_9 || null,
            field_10: field.field_10 || null,
            field_order: field.field_order ? parseInt(field.field_order) : null,
            created_by: userId,
            created_at: new Date(),
          });
        } else {
          // Other reports use field_label/field_value
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
    }

    // Get the complete report data with flexible fields for response
    const completeReport = await ReportModel.findByOrderIdWithFlexibleFields(
      order_id
    );

    // Create status history entry for report details saved (just logging, not updating status)
    try {
      const statusHistoryData = {
        order_id: order.id,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: "Report details saved",
      };
      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    } catch (statusHistoryError) {
      console.error("Error creating status history:", statusHistoryError);
      // Don't throw error - this is a non-critical operation
    }

    res.json({
      success: true,
      message: "Report data saved successfully",
      data: {
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
 * Parse flexible fields from request body format
 * Handles format like: flexible_fields[0][section_name], flexible_fields[0][col_span], etc.
 * @param {Object} formData - Form data from request
 * @returns {Array} Array of flexible field objects
 */
function parseFlexibleFieldsFromBracketSyntax(formData) {
  const flexibleFields = [];
  const fieldIndices = new Set();

  // Find all flexible field indices
  Object.keys(formData).forEach((key) => {
    const match = key.match(/^flexible_fields\[(\d+)\]\[([^\]]+)\]$/);
    if (match) {
      fieldIndices.add(parseInt(match[1]));
    }
  });

  // Parse each flexible field
  fieldIndices.forEach((index) => {
    const field = {};
    const sectionName = formData[`flexible_fields[${index}][section_name]`];
    const colSpan = formData[`flexible_fields[${index}][col_span]`];
    const fieldLabel = formData[`flexible_fields[${index}][field_label]`];
    const fieldValue = formData[`flexible_fields[${index}][field_value]`];
    const fieldOrder = formData[`flexible_fields[${index}][field_order]`];

    if (sectionName !== undefined) {
      delete formData[`flexible_fields[${index}][section_name]`];
    }
    if (colSpan !== undefined) {
      delete formData[`flexible_fields[${index}][col_span]`];
    }
    if (fieldLabel !== undefined) {
      delete formData[`flexible_fields[${index}][field_label]`];
    }
    if (fieldValue !== undefined) {
      delete formData[`flexible_fields[${index}][field_value]`];
    }
    if (fieldOrder !== undefined) {
      delete formData[`flexible_fields[${index}][field_order]`];
    }

    field.section_name = sectionName;
    field.col_span = colSpan;
    field.field_label = fieldLabel;
    field.field_value = fieldValue;
    field.field_order = fieldOrder;

    flexibleFields.push(field);
  });

  return flexibleFields;
}

function normalizeFlexibleField(field) {
  if (!field || typeof field !== "object") return null;

  const sectionName = field.section_name || field.sectionName || null;

  if (!sectionName) {
    return null;
  }

  const parseNumeric = (value) => {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  // Check if this is a marine report field (has field_1, field_2, etc.)
  const hasMarineFields =
    field.field_1 !== undefined ||
    field.field_2 !== undefined ||
    field.field_3 !== undefined ||
    field.field_4 !== undefined ||
    field.field_5 !== undefined;

  if (hasMarineFields) {
    // Marine report format: field_1 through field_10
    return {
      section_name: sectionName,
      col_span: parseNumeric(field.col_span || field.colSpan),
      field_1: field.field_1 !== undefined ? field.field_1 : null,
      field_2: field.field_2 !== undefined ? field.field_2 : null,
      field_3: field.field_3 !== undefined ? field.field_3 : null,
      field_4: field.field_4 !== undefined ? field.field_4 : null,
      field_5: field.field_5 !== undefined ? field.field_5 : null,
      field_6: field.field_6 !== undefined ? field.field_6 : null,
      field_7: field.field_7 !== undefined ? field.field_7 : null,
      field_8: field.field_8 !== undefined ? field.field_8 : null,
      field_9: field.field_9 !== undefined ? field.field_9 : null,
      field_10: field.field_10 !== undefined ? field.field_10 : null,
      field_order: parseNumeric(field.field_order || field.fieldOrder),
    };
  } else {
    // Other report formats: field_label/field_value
    const fieldLabel = field.field_label || field.fieldLabel || null;

    if (!fieldLabel) {
      return null;
    }

    return {
      section_name: sectionName,
      col_span: parseNumeric(field.col_span || field.colSpan),
      field_label: fieldLabel,
      field_value:
        field.field_value !== undefined
          ? field.field_value
          : field.fieldValue !== undefined
          ? field.fieldValue
          : null,
      field_order: parseNumeric(field.field_order || field.fieldOrder),
    };
  }
}

function extractFlexibleFieldsFromFormData(formData = {}) {
  if (!formData || typeof formData !== "object") {
    return [];
  }

  let rawFields = [];
  const rawFlexible = formData.flexible_fields;

  if (Array.isArray(rawFlexible)) {
    rawFields = rawFlexible.filter(
      (field) => field && typeof field === "object"
    );
  } else if (rawFlexible && typeof rawFlexible === "object") {
    rawFields = Object.keys(rawFlexible)
      .map((key) => rawFlexible[key])
      .filter((field) => field && typeof field === "object");
  } else {
    rawFields = parseFlexibleFieldsFromBracketSyntax(formData);
  }

  if (Object.prototype.hasOwnProperty.call(formData, "flexible_fields")) {
    delete formData.flexible_fields;
  }

  return rawFields.map(normalizeFlexibleField).filter(Boolean);
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
      "valueation_report_for_heading",
      "general_details_heading",
      "inspected_equipment_heading",
      "comments_on_equipment_heading",
      "rc_permit_tax_fitness_insurance_heading",
      "overall_feedback_heading",
      "ref_no_year",
      "ref_no_month",
      "ref_no_bank",
      "state_name",
      "ref_no_code",
      "ref_no_id",
      "report_date",
      "valuer_name",
      "license_no",
      "valuer_contact",
      "valuation_purpose",
      "initiated_by",
      "date_of_inspection",
      "place_of_inspection",
      "registered_owner_name",
      "registered_owner_address",
      "proposed_owner_name",
      "proposed_owner_address",
      "registration_no",
      "registration_date",
      "registered_location",
      "owner_serial_no",
      "manufacture_year",
      "asset_make",
      "model",
      "engine_no_detail",
      "chassis_no",
      "body_type",
      "chassis_no_type",
      "fuel_type",
      "kilometer_reading",
      "invoice_no_date",
      "hyp_with",
      "hyp_from_date",
      "asset_classification",
      "no_of_cylinder",
      "engine_condition",
      "chassis_condition",
      "body_condition",
      "cabin_condition",
      "electrical_condition",
      "gear_transmission",
      "battery_available",
      "gross_vehicle_weight",
      "front_tyre_no",
      "front_tyre_condition",
      "middle_tyre_no",
      "middle_tyre_condition",
      "rear_tyre_no",
      "rear_tyre_condition",
      "no_of_tyres",
      "stepney",
      "horse_power",
      "mechanical_unit_condition",
      "cubic_capacity",
      "suspension",
      "seating_capacity",
      "tool_kit_available",
      "vehicle_colour",
      "color_condition",
      "damages_if_any",
      "rc_book_verified",
      "invoice_verified",
      "tax_upto",
      "permit_upto",
      "permit_type",
      "fitness_upto",
      "insurance_co_name",
      "policy_no",
      "period_of_insurance",
      "insured_value",
      "insurance_verified",
      "current_invoice_cost",
      "depreciation",
      "depreciation_value",
      "appraiser_value",
      "fair_market_value",
      "amount_in_words",
      "no_of_photograph",
      "no_of_collage",
      "valuer_comments_remarks",
      "declaration",
      "disclaimer",
      "chassis_no_pencil_impression",
    ],
    report_avr: [
      "ref_no_year",
      "ref_no_month",
      "ref_no_bank",
      "ref_no_code",
      "ref_no_id",
      "lan_no",
      "report_date",
      "bank_name",
      "branch_name",
      "state_name",
      "model_number",
      "officer_name",
      "officer_designation",
      "inspected_item",
      "inspected_date",
      "inspection_address",
      "customer_name",
      "address_as_per_kyc",
      "machinery_locations",
      "lan_city_no",
      "date_of_disbursement",
      "date_of_invoice_delivery_no",
      "invoice_price",
      "lien_of_bank",
      "chassis_no",
      "machine_serial_no",
      "engine_no",
      "regn_no",
      "installed_running",
      "installed_asset_whether_functional_or_not",
      "class_make_of_asset",
      "year_of_mfg",
      "invoice_purchase_order_no",
      "pro_owner_address",
      "insurer_policy_no",
      "insurance_validity_insured_value",
      "insurance_having_lien_of_bank",
      "total_crane_weight_capacity",
      "material_usefulness",
      "colour",
      "observation",
      "status_of_machine",
      "visit_done_by",
      "place",
      "date_time",
      "surveyor",
      "license_no",
      "surveyor_location",
      "no_of_photograph",
      "no_of_collage",
      "valuer_comments_remarks",
      "declaration",
      "disclaimer",
    ],
    report_machinery: [
      "valueation_report_for_heading",
      "general_details_heading",
      "inspected_equipment_heading",
      "comments_on_equipment_heading",
      "insurance_details_heading",
      "overall_feedback_heading",
      "ref_no_year",
      "ref_no_month",
      "ref_no_bank",
      "state_name",
      "ref_no_code",
      "ref_no_id",
      "report_date",
      "valuer_name",
      "license_no",
      "valuer_contact",
      "valuation_purpose",
      "initiated_by",
      "date_of_inspection",
      "place_of_inspection",
      "registered_owner_name",
      "registered_owner_address",
      "proposed_owner_name",
      "proposed_owner_address",
      "registration_no",
      "registration_date",
      "location_of_machinery",
      "owner_serial_no",
      "manufacture_year",
      "asset_make",
      "model",
      "control_system",
      "machine_serial_no",
      "laf_id",
      "application_usage",
      "invoice_no_date",
      "hyp_with",
      "machine_type",
      "asset_classification",
      "no_of_cylinder",
      "machine_technology",
      "machine_condition",
      "electrical_condition",
      "mechanical_condition",
      "fix_but_flex_heading_1",
      "fix_but_flex_value_1",
      "fix_but_flex_heading_2",
      "fix_but_flex_value_2",
      "fix_but_flex_heading_3",
      "fix_but_flex_value_3",
      "fix_but_flex_heading_4",
      "fix_but_flex_value_4",
      "fix_but_flex_heading_5",
      "fix_but_flex_value_5",
      "fix_but_flex_heading_6",
      "fix_but_flex_value_6",
      "fix_but_flex_heading_7",
      "fix_but_flex_value_7",
      "fix_but_flex_heading_8",
      "fix_but_flex_value_8",
      "fix_but_flex_heading_9",
      "fix_but_flex_value_9",
      "fix_but_flex_heading_10",
      "fix_but_flex_value_10",
      "fix_but_flex_heading_11",
      "fix_but_flex_value_11",
      "fix_but_flex_heading_12",
      "fix_but_flex_value_12",
      "machine_colour",
      "color_condition",
      "damages_if_any",
      "rc_book_verified",
      "tax_invoice_copy",
      "tax_upto_title",
      "tax_upto",
      "permit_upto",
      "permit_type",
      "fitness_upto_title",
      "fitness_upto",
      "insurance_co_name",
      "policy_no",
      "insurance_valid_date",
      "insured_value",
      "insurance_verified",
      "tax_invoice_cost",
      "depreciation",
      "depreciation_value",
      "appraiser_value",
      "fair_market_value",
      "amount_in_words",
      "no_of_photograph",
      "no_of_collage",
      "valuer_comments_remarks",
      "declaration",
      "disclaimer",
    ],
    report_ce: [
      "valueation_report_for_heading",
      "general_details_heading",
      "inspected_equipment_heading",
      "comments_on_equipment_heading",
      "rc_permit_tax_fitness_insurance_heading",
      "overall_feedback_heading",
      "ref_no_year",
      "ref_no_month",
      "ref_no_bank",
      "state_name",
      "ref_no_code",
      "ref_no_id",
      "rev_report_date",
      "valuer_name",
      "license_no",
      "valuer_contact",
      "valuation_purpose",
      "initiated_by",
      "date_of_inspection",
      "place_of_inspection",
      "registered_owner_name",
      "registered_owner_address",
      "proposed_owner_name",
      "proposed_owner_address",
      "registration_no",
      "registration_date",
      "registered_location",
      "owner_serial_no",
      "manufacture_year",
      "asset_make",
      "model",
      "engine_no_heading",
      "engine_no_detail",
      "chassis_no_heading",
      "crane_chassis_no",
      "body_type",
      "crane_model_code",
      "hours_meter_reading",
      "invoice_no_date",
      "invoice_no",
      "invoice_date",
      "hyp_with",
      "hyp_from_date",
      "asset_classification",
      "no_of_cylinder",
      "engine_condition",
      "chassis_condition",
      "body_condition",
      "cabin_condition",
      "electrical_condition",
      "gear_transmission",
      "battery_available",
      "machine_weight_heading",
      "gross_machine_weight",
      "fix_but_flex_heading_1",
      "fix_but_flex_value_1",
      "fix_but_flex_heading_2",
      "fix_but_flex_value_2",
      "fix_but_flex_heading_3",
      "fix_but_flex_value_3",
      "fix_but_flex_title_1",
      "fix_but_flex_title_2",
      "fix_but_flex_title_3",
      "fix_but_flex_heading_4",
      "fix_but_flex_value_4",
      "fix_but_flex_heading_5",
      "fix_but_flex_value_5",
      "fix_but_flex_heading_6",
      "fix_but_flex_value_6",
      "fix_but_flex_heading_7",
      "fix_but_flex_value_7",
      "fix_but_flex_heading_8",
      "fix_but_flex_value_8",
      "fix_but_flex_heading_9",
      "fix_but_flex_value_9",
      "fix_but_flex_heading_10",
      "fix_but_flex_value_10",
      "fix_but_flex_heading_11",
      "fix_but_flex_value_11",
      "fix_but_flex_heading_12",
      "fix_but_flex_value_12",
      "fix_but_flex_top_heading_13",
      "fix_but_flex_heading_13",
      "fix_but_flex_value_13",
      "fix_but_flex_heading_14",
      "fix_but_flex_value_14",
      "fix_but_flex_heading_15",
      "fix_but_flex_value_15",
      "fix_but_flex_heading_16",
      "fix_but_flex_value_16",
      "fix_but_flex_heading_17",
      "fix_but_flex_value_17",
      "fix_but_flex_heading_18",
      "fix_but_flex_value_18",
      "fix_but_flex_heading_19",
      "fix_but_flex_value_19",
      "fix_but_flex_heading_20",
      "fix_but_flex_value_20",
      "fix_but_flex_heading_21",
      "fix_but_flex_value_21",
      "fix_but_flex_heading_22",
      "fix_but_flex_value_22",
      "fix_but_flex_heading_23",
      "fix_but_flex_value_23",
      "fix_but_flex_heading_24",
      "fix_but_flex_value_24",
      "fix_but_flex_heading_25",
      "fix_but_flex_value_25",
      "damages_if_any",
      "bill_of_entry",
      "proforma_invoice_verified",
      "tax_upto",
      "bill_of_lading",
      "chartered_engineer_certificate",
      "fitness_upto",
      "insurance_co_name",
      "policy_no",
      "insurance_valid_date",
      "insured_value",
      "insurance_verified",
      "invoice_cost",
      "depreciation",
      "depreciation_value",
      "appraiser_value",
      "fair_market_value_heading",
      "fair_market_value",
      "amount_in_words",
      "no_of_photograph",
      "no_of_collage",
      "valuer_comments_remarks",
      "declaration",
      "disclaimer",
      "chassis_no_pencil_impression",
    ],
    report_marine: [
      // Vessel Details Section
      "report_title_type",
      "report_title",
      "name_of_the_vessel",
      "official_no",
      "imo_or_regd_type",
      "imo_or_regd_no",
      "vessel_photo",
      "vessel_photo_id",
      "client_city_state_name",
      "execute_above",
      "valuer_name",
      "license_no",
      "inspection_location_front_page",
      "inspection_date_front_page",
      "ref_no_year",
      "ref_no_month",
      "ref_no_bank",
      "state_initial",
      "ref_no_code",
      "ref_no_id",
      "report_date",
      "client_name_with_full_address",
      "imo_official_regd_no",
      // PARTICULARS OF THE VESSEL
      "registry_vessel_date",
      "registry_vessel_location",
      "registered_or_proposed_owner",
      "registered_or_proposed_owner_address",
      "purpose_of_valuation",
      "marine_vessel_name",
      "type_or_description_of_vessel",
      "mmsi_no",
      "class_notation",
      "call_sign_class_notation_machinery",
      "current_registry_port",
      "classification_of_registry",
      "present_flag",
      "port_of_registry",
      "no_of_registry_registration_no",
      "date_of_registry",
      "registered_under",
      "year_of_built",
      "year_of_built_inwords",
      "place_of_built",
      "vessel_built_by",
      "type_of_propelled",
      "length_of_vessel",
      "loa_length_overall",
      "lbp_length_by_perpendicular",
      "breadth_of_vessel",
      "depth_of_vessel",
      "draught_of_vessel",
      "summer_draft_of_vessel",
      "length_of_stroke",
      "ballast_water_capacity",
      "light_ship",
      "propeller",
      "gross_registered_tonnage_grt",
      "net_registered_tonnage_nrt",
      "deadweight_tonnage_dwt",
      "free_board",
      "operating_speed_max_speed",
      "regd_accommodation",
      "bollard_pull_sustained",
      "type_of_propulsion",
      "no_of_decks",
      "no_of_masts",
      "no_of_bulkheads",
      "rigged_not_rigged",
      "stem_type",
      "stern_type",
      "built_type",
      "material_of_construction",
      // OWNERSHIP AND OPERATION
      "registered_owner",
      "technical_operator",
      "commercial_operator",
      "disponent_owner",
      // PROTECTION & INDEMNITY POLICY
      "institution_name_insurance_policy",
      "certificate_no_insurance_policy",
      "date_of_issue_insurance_policy",
      "p_i_clause_insurance_policy",
      "co_assured_insurance_policy",
      "start_period_of_p_i_policy_insurance_policy",
      "end_period_of_p_i_policy_insurance_policy",
      "insured_value_insurance_policy",
      "insured_value_in_words_insurance_policy",
      // INSURANCE FOR BUNKER OIL POLLUTION DAMAGE POLICY
      "institution_name_damage_policy",
      "certificate_type_damage_policy",
      "type_of_security_damage_policy",
      "insurer_guarantor_name_address_damage_policy",
      "policy_ref_no_damage_policy",
      "date_of_issue_damage_policy",
      "start_period_of_damage_policy",
      "end_period_of_damage_policy",
      // WAR RISK INSURANCE POLICY
      "insurance_company_name_war_risk_policy",
      "policy_no_war_risk_policy",
      "start_period_of_war_risk_policy",
      "end_period_of_war_risk_policy",
      "insured_value_war_risk_policy",
      "insured_value_in_words_war_risk_policy",
      // HULL & MACHINERY INSURANCE POLICY
      "insurance_company_name_hull_machinery_policy",
      "policy_no_hull_machinery_policy",
      "start_period_of_hull_machinery_policy",
      "end_period_of_hull_machinery_policy",
      "insured_value_hull_machinery_policy",
      "insured_value_in_words_hull_machinery_policy",
      // OTHER DETAILS
      "trading_limit",
      "collision_bulkhead",
      "vessel_bottom_type",
      "ex_name_flag",
      "previous_registry",
      "keel_to_masthead_ktm",
      "manifold_bcm_scm",
      // CLASSIFICATION
      "classification_society",
      "is_vessel_subject_to_any_conditions",
      "if_classification_society_changed_name",
      "does_the_vessel_have_ice_class",
      "date_place_of_last_dry_dock",
      "start_date_next_dry_dock_due_next_annual_survey_due",
      "end_date_next_dry_dock_due_next_annual_survey_due",
      "start_date_of_last_special_survey_next_special_survey_due",
      "end_date_of_last_special_survey_next_special_survey_due",
      "if_ship_has_condition_assessment",
      // HULL DESIGN
      "hull_design",
      "present_condition_1",
      "present_condition_2",
      "present_condition_3",
      "auxiliary_machinerie_other_auxiliary_machinerie_condition",
      "steering_details",
      "propeller_asd_vessel_condition",
      // DIMENSIONS
      "keel_to_masthead_ktm_dimensions",
      "distance_bridge_front_to_center_of_manifold_dimensions",
      "bow_to_center_manifold_bcm_dimensions",
      "stern_to_center_manifold_scm_dimensions",
      "forward_to_mid_point_manifold_lightship_dimensions",
      "forward_to_mid_point_manifold_normal_ballast_dimensions",
      "forward_to_mid_point_manifold_summer_dwt_dimensions",
      "aft_to_mid_point_manifold_lightship_dimensions",
      "aft_to_mid_point_manifold_normal_ballast_dimensions",
      "aft_to_mid_point_manifold_summer_dwt_dimensions",
      "parallel_body_length_lightship_dimensions",
      "parallel_body_length_normal_ballast_dimensions",
      "parallel_body_length_summer_dwt_dimensions",
      // LOADLINE INFORMATION (all summer, winter, tropical, lightship, normal_ballast, segregated_ballast variations)
      "summer_Freeboard_dimensions",
      "summer_Draft_dimensions",
      "summer_Deadweight_dimensions",
      "summer_Displacement_dimensions",
      "winter_Freeboard_dimensions",
      "winter_Draft_dimensions",
      "winter_Deadweight_dimensions",
      "winter_Displacement_dimensions",
      "tropical_Freeboard_dimensions",
      "tropical_Draft_dimensions",
      "tropical_Deadweight_dimensions",
      "tropical_Displacement_dimensions",
      "lightship_Freeboard_dimensions",
      "lightship_Draft_dimensions",
      "lightship_Deadweight_dimensions",
      "lightship_Displacement_dimensions",
      "normal_ballast_condition_Freeboard_dimensions",
      "normal_ballast_condition_Draft_dimensions",
      "normal_ballast_condition_Deadweight_dimensions",
      "normal_ballast_condition_Displacement_dimensions",
      "segregated_ballast_condition_Freeboard_dimensions",
      "segregated_ballast_condition_Draft_dimensions",
      "segregated_ballast_condition_Deadweight_dimensions",
      "segregated_ballast_condition_Displacement_dimensions",
      "fwa_tpc_at_summer_draft_Freeboard_dimensions",
      "fwa_tpc_at_summer_draft_Draft_dimensions",
      "does_vessel_have_multiple_sdwt",
      "constant_excluding_fresh_water",
      "company_guidelines_for_under_keel_clearance_ukc",
      "full_mast_summer_deadweight_dimensions",
      "collapsed_mast_summer_deadweight_dimensions",
      "full_mast_normal_ballast_dimensions",
      "collapsed_mast_normal_ballast_dimensions",
      "full_mast_lightship_dimensions",
      "collapsed_mast_lightship_dimensions",
      // CREW AND OPERATIONS
      "itopf_member",
      "ocimf_member",
      "nationality_of_master_name",
      "number_and_nationality_of_officers",
      "number_and_nationality_of_crew",
      "common_working_language_onboard",
      "do_officers_speak_and_understand_english",
      "if_officers_ratings_employed_by_a_manning_agency_full_style",
      "is_the_vessel_operated_under_a_quality_management_system",
      "can_the_ship_comply_with_the_ics_helicopter_guidelines",
      // VESSEL ACCESSORIES & CAPACITIES - COATING/ANODES
      "coated_cargo_tanks",
      "type_of_cargo_tanks",
      "to_what_extent_cargo_tanks",
      "anode_cargo_tanks",
      "coated_ballast_tanks",
      "type_of_ballast_tanks",
      "to_what_extent_ballast_tanks",
      "anode_ballast_tanks",
      "coated_slop_tanks",
      "type_of_slop_tanks",
      "to_what_extent_slop_tanks",
      "anode_slop_tanks",
      // BALLAST, CARGO, SLOP TANKS (all related fields from migration)
      "number_of_ballast_pumps",
      "type_of_ballast_pumps",
      "capacity_of_ballast_pumps",
      "at_what_head_ballast_pumps",
      "number_of_ballast_eductors",
      "type_of_ballast_eductors",
      "capacity_of_ballast_eductors",
      "at_what_head_ballast_eductors",
      "is_vessel_fitted_with_centerline_bulkhead_in_all_cargo_tanks",
      "number_of_cargo_tanks_and_total_cubic_capacity_98",
      "total_cubic_capacity_98",
      "capacity_of_each_natural_segregation_with_double_valve",
      "imo_class",
      "number_of_slop_tanks_and_total_cubic_capacity_98",
      "total_cubic_capacity_98_slop_tanks",
      "specify_segregations_double_valve",
      "residual_retention_oil_tank_capacity_98",
      "total_sbt_capacity_and_percentage_of_sdwt_vessel_can_maintain",
      "percentage_of_sdwt_vessel_can_maintain",
      "does_vessel_meet_the_requirements_of_marpol_annex_i_reg_18_2",
      "how_many_grades_products_can_vessel_load_discharge_with_double",
      "type_of_cargo_containment",
      "with_vecs_capacity",
      "without_vecs_capacity",
      "loaded_simultaneously_through_all_manifolds_with_vecs_capacity",
      "loaded_simultaneously_through_all_manifolds_without_vecs",
      "is_ship_fitted_with_a_cargo_control_room_ccr",
      "can_tank_innage_ullage_be_read_from_the_ccr",
      "is_gauging_system_certified_and_calibrated",
      "type_of_fixed_closed_tank_gauging_system_fitted",
      "are_high_level_alarms_fitted_to_the_cargo_tanks",
      "number_of_portable_gauging_units_on_board",
      "is_a_vapour_emission_control_system_vecs_fitted",
      "number_of_vecs_manifolds_per_side",
      "size_of_vecs_manifolds_per_side",
      "number_of_vecs_reducers_per_side",
      "state_what_type_of_venting_system_is_fitted",
      "total_number_of_cargo_manifold_connections_on_each_side",
      "what_type_of_valves_are_fitted_at_manifold",
      "what_is_the_material_rating_of_the_manifold",
      "does_vessel_comply",
      "distance_between_cargo_manifold_centers",
      "distance_ships_rail_to_manifold",
      "distance_manifold_to_ships_side",
      "distance_top_of_rail_to_center_of_manifold",
      "distance_main_deck_to_center_of_manifold",
      "distance_spill_tank_grating_to_center_of_manifold",
      "manifold_height_above_the_waterline_in_normal_ballast_at_sdwt",
      "manifold_height_above_the_waterline_in_lightship_condition",
      "number_of_reducers_per_side",
      "is_vessel_fitted_with_a_stern_manifold_if_yes_state_size",
      // CARGO TANKS HEATING
      "type_of_cargo_tanks_heating",
      "coiled_cargo_tanks_heating",
      "material_of_cargo_tanks_heating",
      "type_of_slop_tanks_heating",
      "coiled_slop_tanks_heating",
      "material_of_slop_tanks_heating",
      "maximum_temperature_cargo_can_be_loaded_maintained_1",
      "maximum_temperature_cargo_can_be_loaded_maintained_2",
      // INERT GAS SYSTEM
      "is_an_inert_gas_system_igs_fitted_operational",
      "is_igs_supplied_by_flue_gas_inert_gas_ig_generator",
      "if_nitrogen_generator_specify",
      // CARGO PUMPS
      "how_many_cargo_pumps_can_be_run_simultaneously_at_full_capacity",
      "sr_no_of_cargo_pumps",
      "type_of_cargo_pumps",
      "capacity_of_cargo_pumps",
      "at_what_head_cargo_pumps",
      "sr_no_of_cargo_eductors",
      "type_of_cargo_eductors",
      "capacity_of_cargo_eductors",
      "at_what_head_cargo_eductors",
      "sr_no_of_stripping",
      "type_of_stripping",
      "capacity_of_stripping",
      "at_what_head_stripping",
      "is_at_least_one_emergency_portable_cargo_pump_provided",
      // MOORING EQUIPMENT (all forecastle, main_deck_fwd, main_deck_aft, poop_deck variations)
      "no_of_forecastle",
      "diameter_of_forecastle",
      "material_of_forecastle",
      "length_of_forecastle",
      "breaking_of_forecastle",
      "no_of_main_deck_fwd",
      "diameter_of_main_deck_fwd",
      "material_of_main_deck_fwd",
      "length_of_main_deck_fwd",
      "breaking_of_main_deck_fwd",
      "no_of_main_deck_aft",
      "diameter_of_main_deck_aft",
      "material_of_main_deck_aft",
      "length_of_main_deck_aft",
      "breaking_of_main_deck_aft",
      "no_of_poop_deck",
      "diameter_of_poop_deck",
      "material_of_poop_deck",
      "length_of_poop_deck",
      "breaking_of_poop_deck",
      // TAILS (all variations)
      "no_of_forecastle_tails",
      "diameter_of_forecastle_tails",
      "material_of_forecastle_tails",
      "length_of_forecastle_tails",
      "breaking_of_forecastle_tails",
      "no_of_main_deck_fwd_tails",
      "diameter_of_main_deck_fwd_tails",
      "material_of_main_deck_fwd_tails",
      "length_of_main_deck_fwd_tails",
      "breaking_of_main_deck_fwd_tails",
      "no_of_main_deck_aft_tails",
      "diameter_of_main_deck_aft_tails",
      "material_of_main_deck_aft_tails",
      "length_of_main_deck_aft_tails",
      "breaking_of_main_deck_aft_tails",
      "no_of_poop_deck_tails",
      "diameter_of_poop_deck_tails",
      "material_of_poop_deck_tails",
      "length_of_poop_deck_tails",
      "breaking_of_poop_deck_tails",
      // ROPES (all variations)
      "no_of_forecastle_ropes",
      "diameter_of_forecastle_ropes",
      "material_of_forecastle_ropes",
      "length_of_forecastle_ropes",
      "breaking_of_forecastle_ropes",
      "no_of_main_deck_fwd_ropes",
      "diameter_of_main_deck_fwd_ropes",
      "material_of_main_deck_fwd_ropes",
      "length_of_main_deck_fwd_ropes",
      "breaking_of_main_deck_fwd_ropes",
      "no_of_main_deck_aft_ropes",
      "diameter_of_main_deck_aft_ropes",
      "material_of_main_deck_aft_ropes",
      "length_of_main_deck_aft_ropes",
      "breaking_of_main_deck_aft_ropes",
      "no_of_poop_deck_ropes",
      "diameter_of_poop_deck_ropes",
      "material_of_poop_deck_ropes",
      "length_of_poop_deck_ropes",
      "breaking_of_poop_deck_ropes",
      // OTHER LINES (all variations)
      "no_of_forecastle_other_lines",
      "diameter_of_forecastle_other_lines",
      "material_of_forecastle_other_lines",
      "length_of_forecastle_other_lines",
      "breaking_of_forecastle_other_lines",
      "no_of_main_deck_fwd_other_lines",
      "diameter_of_main_deck_fwd_other_lines",
      "material_of_main_deck_fwd_other_lines",
      "length_of_main_deck_fwd_other_lines",
      "breaking_of_main_deck_fwd_other_lines",
      "no_of_main_deck_aft_other_lines",
      "diameter_of_main_deck_aft_other_lines",
      "material_of_main_deck_aft_other_lines",
      "length_of_main_deck_aft_other_lines",
      "breaking_of_main_deck_aft_other_lines",
      "no_of_poop_deck_other_lines",
      "diameter_of_poop_deck_other_lines",
      "material_of_poop_deck_other_lines",
      "length_of_poop_deck_other_lines",
      "breaking_of_poop_deck_other_lines",
      // WINCHES (all variations)
      "no_of_forecastle_winches",
      "no_of_drums_of_forecastle_winches",
      "motive_power_of_forecastle_winches",
      "brake_capacity_of_forecastle_winches",
      "type_of_brake_of_forecastle_winches",
      "no_of_main_deck_fwd_winches",
      "no_of_drums_of_main_deck_fwd_winches",
      "motive_power_of_main_deck_fwd_winches",
      "brake_capacity_of_main_deck_fwd_winches",
      "type_of_brake_of_main_deck_fwd_winches",
      "no_of_main_deck_aft_winches",
      "no_of_drums_of_main_deck_aft_winches",
      "motive_power_of_main_deck_aft_winches",
      "brake_capacity_of_main_deck_aft_winches",
      "type_of_brake_of_main_deck_aft_winches",
      "no_of_poop_deck_winches",
      "no_of_drums_of_poop_deck_winches",
      "motive_power_of_poop_deck_winches",
      "brake_capacity_of_poop_deck_winches",
      "type_of_brake_of_poop_deck_winches",
      // BITTS (all variations)
      "no_of_forecastle_bitts",
      "swl_bitts_of_forecastle_bitts",
      "no_of_closed_chocks_of_forecastle_bitts",
      "swl_closed_chocks_of_forecastle_bitts",
      "no_of_main_deck_fwd_bitts",
      "swl_bitts_of_main_deck_fwd_bitts",
      "no_of_closed_chocks_of_main_deck_fwd_bitts",
      "swl_closed_chocks_of_main_deck_fwd_bitts",
      "no_of_main_deck_aft_bitts",
      "swl_bitts_of_main_deck_aft_bitts",
      "no_of_closed_chocks_of_main_deck_aft_bitts",
      "swl_closed_chocks_of_main_deck_aft_bitts",
      "no_of_poop_deck_bitts",
      "swl_bitts_of_poop_deck_bitts",
      "no_of_closed_chocks_of_poop_deck_bitts",
      "swl_closed_chocks_of_poop_deck_bitts",
      // ANCHORING AND TOWING
      "number_of_shackles_on_port_starboard_cable",
      "type_of_emergency_towing_system_forward_type",
      "type_of_emergency_towing_system_forward_swl",
      "type_of_emergency_towing_system_aft_type",
      "type_of_emergency_towing_system_aft_swl",
      "type_of_escort_tug_type",
      "type_of_escort_tug_swl",
      "swl_of_bollard_on_poop_deck_suitable_for_escort_tug",
      // DECK EQUIPMENT
      "derrick_crane_description",
      "accommodation_ladder_direction",
      "does_vessel_have_a_portable_gangway",
      "does_vessel_meet_the_recommendations",
      "how_many_chain_stoppers",
      "state_type_swl_of_chain_stopper_s",
      "maximum_size_chain_diameter_the_bow_stopper_s_can_handle",
      "distance_between_the_bow_fairlead_and_chain_stopper_bracket",
      "is_bow_chock_and_or_fairlead",
      // SPEED AND FUEL
      "ballast_speed_maximum",
      "ballast_speed_minimum",
      "laden_speed_maximum",
      "laden_speed_minimum",
      "what_type_of_fuel_is_used_maximum",
      "what_type_of_fuel_is_used_economic",
      "type_of_bunker_tanks",
      "is_vessel_fitted_with_fixed",
      // ENGINES
      "no_of_main_engine",
      "capacity_of_main_engine",
      "make_type_of_main_engine",
      "no_of_aux_engine",
      "capacity_of_aux_engine",
      "make_type_of_aux_engine",
      "no_of_power_packs",
      "capacity_of_power_packs",
      "make_type_of_power_packs",
      "no_of_boilers",
      "capacity_of_boilers",
      "make_type_of_boilers",
      "what_is_brake_horse_power_of_bow_thruster",
      "what_is_brake_horse_power_of_stern_thruster",
      "main_engine_imo_nox_emission_standard",
      "energy_efficiency_design_index_eedi_rating_number",
      // COMPLIANCE AND INSPECTIONS
      "does_vessel_comply_with_recommendations_contained_in_ocimf",
      "what_is_maximum_outreach_of_cranes_derricks_outboard",
      "date_place_of_last_sts_operation",
      "last_three_cargoes_charterers_voyages",
      "has_vessel_been_involved_in_a_pollution",
      "date_and_place_of_last_port_state_control_inspection",
      "any_outstanding_deficiencies_as_reported_by_any_port_state",
      "recent_oil_company_inspections_screenings",
      "date_place_of_last_sire_inspection",
    ],
  };

  const allowedColumns = validColumns[reportType.toLowerCase()] || [];
  const filteredData = {};

  // Only include fields that exist in the valid columns list
  Object.keys(formData).forEach((key) => {
    if (allowedColumns.includes(key)) {
      filteredData[key] = formData[key];
    }
  });

  return filteredData;
}

// Export multer middleware for use in routes
exports.uploadChassisImage = upload.single("chassis_no_pencil_impression");
