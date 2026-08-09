const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const puppeteer = require("puppeteer");
const multer = require("multer");

// Import database connection
const db = require("../../../../db");

// Import models and utilities
const Order = require("../../../models/orders/order");
const CvReport = require("../../../models/orders/reports/cvReport");
const AvrReport = require("../../../models/orders/reports/avrReport");
const MachineryReport = require("../../../models/orders/reports/machineryReport");
const SummarizedReport = require("../../../models/orders/reports/summarizedReport");
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
const { generateSummarizedNormalFieldsHTML, generateSummarizedTableAppendixHTML } = require("./templates/summarized_report_template");
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
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

/**
 * Convert an image URL / relative path to an inline base64 data URI so that
 * Puppeteer does not need to make any network round-trip to render it.
 *
 * The function is deliberately defensive: if anything goes wrong (file not
 * found, unsupported scheme, unreadable buffer, etc.) we simply return the
 * original value unchanged so the existing template behaviour is preserved.
 *
 * Recognised inputs:
 *   - data:...            => returned as-is (already inline)
 *   - http(s)://host/...  => we only try to resolve the pathname against the
 *                            local uploads directory; if not found we return
 *                            the original URL so the template can still try it
 *   - /uploads/...        => resolved against <cwd>/uploads/
 *   - uploads/...         => resolved against <cwd>/uploads/
 *
 * Any other scheme (blob:, etc.) is returned unchanged.
 */
function inlineImageAsDataUri(value) {
  if (!value || typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  // Already an inline data URI - nothing to do
  if (trimmed.startsWith("data:")) return trimmed;

  // We cannot fetch blob: URLs from the backend; leave as-is
  if (trimmed.startsWith("blob:")) return trimmed;

  // Candidate path on disk (relative to the project root uploads dir)
  let candidatePath = null;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      // Extract only the pathname from the URL, e.g. /uploads/2025/Oct/123/foo.jpg
      const parsed = new URL(trimmed);
      candidatePath = resolveAbsoluteUploadPath(parsed.pathname);
    } else {
      candidatePath = resolveAbsoluteUploadPath(trimmed);
    }
  } catch (err) {
    // Malformed URL - keep original value
    return value;
  }

  if (!candidatePath) return value;

  try {
    if (!fs.existsSync(candidatePath)) return value;
    const buffer = fs.readFileSync(candidatePath);
    if (!buffer || !buffer.length) return value;

    const ext = path.extname(candidatePath).toLowerCase();
    let mime = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    else if (ext === ".webp") mime = "image/webp";
    else if (ext === ".gif") mime = "image/gif";
    else if (ext === ".svg") mime = "image/svg+xml";
    else if (ext === ".bmp") mime = "image/bmp";

    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (err) {
    // Any IO failure - fall back to original value so rendering still tries
    return value;
  }
}

/**
 * Produce a shallow clone of the marine report formData with any image fields
 * replaced by inline data URIs. This avoids Puppeteer having to hit the
 * backend for each `<img>` while rendering the PDF, which is what currently
 * causes the "Navigation timeout of 30000 ms exceeded" error.
 *
 * Only the fields known to contain images are touched:
 *   - formData.vessel_photo
 *   - formData.vessel_photo_preview
 *   - formData.vessel_photo_for_template
 *   - flexible_fields[*].field_3 where the section name contains
 *     "HEADING_DESCRIPTION_IMAGE" (the only section type that renders images)
 *
 * Any field that cannot be resolved to a file on disk is left untouched so
 * the existing rendering path (absolute HTTP URL) still works.
 */
function inlineMarineReportImages(formData) {
  if (!formData || typeof formData !== "object") return formData;

  const cloned = { ...formData };

  if (cloned.vessel_photo) {
    cloned.vessel_photo = inlineImageAsDataUri(cloned.vessel_photo);
  }
  if (cloned.vessel_photo_preview) {
    cloned.vessel_photo_preview = inlineImageAsDataUri(
      cloned.vessel_photo_preview
    );
  }
  if (cloned.vessel_photo_for_template) {
    cloned.vessel_photo_for_template = inlineImageAsDataUri(
      cloned.vessel_photo_for_template
    );
  }

  if (Array.isArray(cloned.flexible_fields)) {
    cloned.flexible_fields = cloned.flexible_fields.map((field) => {
      if (!field || typeof field !== "object") return field;
      const sectionName = (field.section_name || "").toString();
      if (!sectionName.includes("HEADING_DESCRIPTION_IMAGE")) return field;
      if (!field.field_3) return field;
      return { ...field, field_3: inlineImageAsDataUri(field.field_3) };
    });
  }

  return cloned;
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
  const fileName = `chassis_${uniqueSuffix}${extension.startsWith(".") ? extension : `.${extension}`
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
  const candidates = [
    formValue,
    existingReport && existingReport.chassis_no_pencil_impression,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.startsWith("data:")) continue;

    // Prefer local /uploads path when present
    const sanitized = sanitizeStoredUploadPath(trimmed);
    if (sanitized) return sanitized;

    // Absolute URL (R2/CDN or API host with /uploads)
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const fromPathname = sanitizeStoredUploadPath(parsed.pathname);
        if (fromPathname) return fromPathname;
      } catch (_) {
        // keep absolute URL below
      }
      return trimmed;
    }
  }

  return null;
}

async function downloadUrlToBuffer(url, maxRedirects = 5) {
  if (!url || typeof url !== "string") {
    throw new Error("Invalid URL");
  }

  const fetchOnce = (targetUrl, redirectsLeft) =>
    new Promise((resolve, reject) => {
      const protocol = targetUrl.startsWith("https://") ? https : http;
      const req = protocol.get(targetUrl, { timeout: 30000 }, (res) => {
        const status = res.statusCode || 0;

        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, targetUrl).toString();
          fetchOnce(nextUrl, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} downloading chassis image`));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: res.headers["content-type"] || "",
          });
        });
        res.on("error", reject);
      });

      req.on("timeout", () => {
        req.destroy(new Error("Request timeout downloading chassis image"));
      });
      req.on("error", reject);
    });

  return fetchOnce(url, maxRedirects);
}

function bufferToChassisDataUri(buffer, mimeHint = "", filePathOrUrl = "") {
  if (!buffer || !buffer.length) return null;

  let mimeType = "";
  if (typeof mimeHint === "string" && mimeHint.startsWith("image/")) {
    mimeType = mimeHint.split(";")[0].trim();
  }
  if (!mimeType) {
    try {
      const pathname = /^https?:\/\//i.test(filePathOrUrl)
        ? new URL(filePathOrUrl).pathname
        : filePathOrUrl;
      mimeType = getMimeFromExtension(path.extname(pathname || ""));
    } catch (_) {
      mimeType = "image/jpeg";
    }
  }

  return `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
}

async function loadChassisImageBase64(source) {
  if (!source || typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:")) return trimmed;

  // Remote URL (R2/CDN) — try local mirror first, then download
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const localFromPath = resolveAbsoluteUploadPath(parsed.pathname);
      if (localFromPath && fs.existsSync(localFromPath)) {
        const buffer = fs.readFileSync(localFromPath);
        return bufferToChassisDataUri(
          buffer,
          "",
          localFromPath
        );
      }
    } catch (_) {
      // continue to remote download
    }

    try {
      const { buffer, contentType } = await downloadUrlToBuffer(trimmed);
      return bufferToChassisDataUri(buffer, contentType, trimmed);
    } catch (err) {
      console.warn(
        `[chassis] failed to download image from URL: ${err.message}`
      );
      return null;
    }
  }

  // Local /uploads path
  const absolutePath = resolveAbsoluteUploadPath(trimmed);
  if (absolutePath && fs.existsSync(absolutePath)) {
    const buffer = fs.readFileSync(absolutePath);
    return bufferToChassisDataUri(buffer, "", absolutePath);
  }

  // Local file missing after R2 sync — try public R2 URL for the same key
  const r2Base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (r2Base && trimmed.startsWith("/uploads/")) {
    const r2Url = `${r2Base}${trimmed.replace(/^\/uploads/, "")}`;
    try {
      const { buffer, contentType } = await downloadUrlToBuffer(r2Url);
      return bufferToChassisDataUri(buffer, contentType, r2Url);
    } catch (err) {
      console.warn(
        `[chassis] failed to download image from R2 fallback: ${err.message}`
      );
    }
  }

  return null;
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
    case "report_summarized":
      return SummarizedReport;
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

    if (!requestedReportType || typeof requestedReportType !== "string") {
      throw new BadRequestError("report_type is required");
    }

    // Define report types that have asset_make field
    const reportTypesWithAssetMake = [
      "report_cv",
      "report_machinery",
      "report_summarized",
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

    // Always use live order bank initial so PDF matches frontend Ref NO. display
    if (order.bank_initial != null && String(order.bank_initial).trim() !== "") {
      formData.ref_no_bank = order.bank_initial;
    }

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

    // Handle chassis impression image (for CV, CE, AVR, and Machinery reports)
    let chassisImageRelativePath = null;
    let chassisImageBase64 = null;

    if (
      ["report_cv", "report_ce", "report_avr", "report_machinery", "report_summarized"].includes(
        requestedReportType.toLowerCase()
      )
    ) {
      // Body may send both an old path/URL and a new file under the same field name.
      // Always prefer a freshly uploaded file for the PDF.
      const previousChassisSource =
        resolveChassisRelativePath(
          formData.chassis_no_pencil_impression,
          existingReport
        ) || existingChassisPath;

      if (req.file) {
        const saved = await saveChassisImageFromDiskFile(
          req.file,
          year,
          month,
          orderNumber
        );
        if (saved.relativePath) {
          if (
            previousChassisSource &&
            previousChassisSource !== saved.relativePath
          ) {
            deleteChassisImage(previousChassisSource);
          }
          chassisImageRelativePath = saved.relativePath;
          existingChassisPath = saved.relativePath;
        }
        if (saved.base64) {
          chassisImageBase64 = saved.base64;
        }
      } else {
        chassisImageRelativePath = previousChassisSource;
        if (chassisImageRelativePath) {
          existingChassisPath = chassisImageRelativePath;
        }
      }

      if (chassisImageRelativePath && !chassisImageBase64) {
        chassisImageBase64 = await loadChassisImageBase64(
          chassisImageRelativePath
        );
      }

      // Store relative path / URL for database (same for CV, CE, and AVR)
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
      summarized_appendix_cell_padding_px: _summarizedAppendixCellPaddingPx,
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
      ["report_cv", "report_ce", "report_machinery", "report_summarized"].includes(
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
      ["report_cv", "report_ce", "report_avr", "report_machinery", "report_summarized"].includes(
        requestedReportType.toLowerCase()
      )
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

    // Create status history entry for report generation
    try {
      const statusHistoryData = {
        order_id: order.id,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: `Report generated successfully (${requestedReportType})`,
      };
      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    } catch (statusHistoryError) {
      console.error("Error creating status history:", statusHistoryError);
      // Don't throw error - this is a non-critical operation
    }

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
        bgImageFileName = "marine-vka.webp"; // Marine letterhead for VKA
        stampPngFile = "vka.png";
      } else if (name === "VALUETECH SOLUTIONS") {
        bgImageFileName = "marine-vs.webp"; // Marine letterhead for VTS
        stampPngFile = "marine-vs-stamp.png";
      } else if (name === "VISHAL D. KOTHARI") {
        bgImageFileName = "marine-vs.webp"; // Marine letterhead for VDK
        stampPngFile = "marine-vs-stamp.png";
      } else {
        // Default marine letterhead
        bgImageFileName = "marine-vs.webp";
        stampPngFile = "marine-vs-stamp.png";
      }
    } else {
      // Default marine letterhead
      bgImageFileName = "marine-vs.webp";
      stampPngFile = "marine-vs-stamp.png";
    }
  } else if (reportType.toLowerCase() === "report_summarized") {
    const nameField = formData.valuer_name || formData.surveyor;
    if (nameField) {
      const name = nameField.toUpperCase().trim();
      if (name === "V.K. ASSOCIATES") {
        bgImageFileName = "vks-horizontal.jpg";
        stampPngFile = "vka.png";
      } else if (name === "VALUETECH SOLUTIONS") {
        bgImageFileName = "vs-horizontal.jpg";
        stampPngFile = "vts.png";
      } else if (name === "VISHAL D. KOTHARI") {
        bgImageFileName = "vdk-horizontal.jpg";
        stampPngFile = "vdk.png";
      } else {
        bgImageFileName = "vs-horizontal.jpg";
      }
    } else {
      bgImageFileName = "vs-horizontal.jpg";
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

  // For marine reports only: inline vessel + section images as base64 data URIs
  // so Puppeteer does not need any network round-trip to render them. This
  // prevents the `networkidle0` wait from timing out when an image URL is slow
  // or unreachable from inside the headless Chromium. Other report types are
  // intentionally left untouched.
  let templateFormData = formData;
  if (reportType.toLowerCase() === "report_marine") {
    templateFormData = inlineMarineReportImages(formData);
  }

  // Generate HTML content based on report type
  const htmlContent = generateReportHTML(
    reportType,
    templateFormData,
    extraData,
    bgImageBase64,
    stampImageBase64,
    templateFormData.report_type_selection
  );
  /* const debugPath = path.join(process.cwd(), 'debug_marine.html');
  fs.writeFileSync(debugPath, htmlContent);
  console.log('DEBUG HTML WRITTEN TO:', debugPath); */

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

    // Set content with appropriate loading strategy.
    //
    // For marine reports we deliberately do NOT use `networkidle0`: the marine
    // template can reference remote `<img>` URLs (vessel photo, per-section
    // images) and if ANY of them is slow/unreachable the navigation used to
    // hang until the 30s timeout and crash the whole PDF generation. Images
    // are now inlined as base64 via `inlineMarineReportImages`, but we keep a
    // safety net here by waiting for image load explicitly below with a
    // per-image cap. Non-marine reports keep their previous behaviour.
    const isMarineReport = reportType.toLowerCase() === "report_marine";
    const waitStrategy = "domcontentloaded";

    await page.setContent(htmlContent, {
      waitUntil: waitStrategy,
      timeout: isMarineReport ? 60000 : 10000,
    });
    /* page.on('console', msg => console.log('PAGE LOG:', msg.text())); */
    page.on('console', (msg) => {
      try {
        console.log('[marine-pdf]', msg.text());
      } catch (_) {
        /* ignore */
      }
    });


    // For marine reports, add additional wait to ensure JavaScript pagination completes
    if (isMarineReport) {
      // Wait for any remaining <img> tags to finish loading (or erroring). A
      // per-image hard cap protects us from a single bad URL holding up the
      // render forever, which is what used to cause the timeout crash.
      try {
        await page.evaluate(async () => {
          const images = Array.from(document.images || []);
          await Promise.all(
            images.map((img) => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
                // Per-image cap: 8s is plenty for any reasonable image and
                // ensures a broken src never blocks rendering.
                setTimeout(done, 8000);
              });
            })
          );
        });
      } catch (imgWaitErr) {
        console.warn(
          "Image wait completed with warning:",
          imgWaitErr.message
        );
      }

      // Wait for JavaScript to execute using waitForFunction
      try {
        await page
          .waitForFunction(
            () => window.__marinePaginationComplete === true,
            { timeout: 20000 }
          )
          .catch(() => {
            // If it times out, just continue - the content is already loaded
            console.warn(
              "Marine pagination did not signal completion within timeout"
            );
          });

        // Small settle delay for final layout/paint
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        // Continue even if wait fails
        console.warn(
          "Wait for pagination completed with warning:",
          error.message
        );
      }
    }

    // Generate PDF defaults (Legal portrait for existing reports)
    const pdfStartTime = Date.now();

    // For CV reports, use displayHeaderFooter to add page numbers
    const isSummarizedReport = reportType.toLowerCase() === "report_summarized";
    const pdfOptions = {
      path: outputPath,
      format: isSummarizedReport ? "A4" : "Legal",
      landscape: isSummarizedReport,
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
      ...(isSummarizedReport
        ? { width: "11.69in", height: "8.27in" }
        : { width: "8.5in", height: "14in" }),
      preferCSSPageSize: true,
    };


    // SEPARATE HANDLING FOR AVR REPORTS (Signature Section Grouping)

    if (reportType.toLowerCase() === "report_avr") {
      try {
        const splitResult = await page.evaluate((reportType) => {
          // Helper function to set page number on a table
          const setPageNumber = (table, pageNum) => {
            if (!table) return;
            const footerRow = table.querySelector("tfoot .footer-row");
            if (footerRow) {
              const pageNumberSpan = footerRow.querySelector(".page-number-value");
              if (pageNumberSpan) {
                pageNumberSpan.textContent = `Page ${pageNum}`;
                pageNumberSpan.setAttribute("data-page-number", pageNum.toString());
              }
            }
          };

          const needsFooter = true; // AVR always needs footer

          // Measure ACTUAL page dimensions
          const body = document.body;
          const wrapper = document.querySelector(".content-wrapper");
          const origTable = document.querySelector("table");

          if (!origTable) return { success: false, error: "Table not found" };

          const thead = origTable.querySelector("thead");
          const tbody = origTable.querySelector("tbody");
          const tfoot = origTable.querySelector("tfoot");

          if (!thead || !tbody) return { success: false, error: "thead/tbody not found" };

          const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
          const wrapperPaddingTop = wrapperStyle ? parseInt(wrapperStyle.paddingTop) : 30;
          const wrapperPaddingBottom = wrapperStyle ? parseInt(wrapperStyle.paddingBottom) : 0;

          // Calculate REAL available space
          const PAGE_HEIGHT_PX = 14 * 96; // 1344px

          const spacerRow = thead.querySelector(".spacer-row");
          const actualSpacerHeight = spacerRow ? spacerRow.offsetHeight : 225;

          const tfootHeight = tfoot ? tfoot.offsetHeight : 0;
          const tfootSpacerRow = tfoot ? tfoot.querySelector(".spacer-row") : null;
          const tfootFooterRow = tfoot ? tfoot.querySelector(".footer-row") : null;

          const tfootFooterHeight = tfootFooterRow ? tfootFooterRow.offsetHeight : 30;
          const actualBottomSpace = tfootFooterHeight;

          const SAFETY_MARGIN = 30;
          const realAvailable = PAGE_HEIGHT_PX - actualSpacerHeight - wrapperPaddingTop -
            wrapperPaddingBottom - actualBottomSpace - SAFETY_MARGIN;

          // Calculate thead heights
          const theadRows = Array.from(thead.querySelectorAll("tr"));
          let baseTheadHeight = 0;

          theadRows.forEach((row) => {
            if (!row.classList.contains("spacer-row")) {
              baseTheadHeight += row.offsetHeight;
            }
          });

          const tbodyRows = Array.from(tbody.querySelectorAll("tr"));
          const firstPageTheadHeight = baseTheadHeight;
          const firstPageAvailable = realAvailable - firstPageTheadHeight;

          // AVR: subsequent pages have same thead (no special rows to move)
          const subsequentTheadHeight = baseTheadHeight;
          const subsequentAvailable = realAvailable - subsequentTheadHeight;

          // ============================================
          // CRITICAL FIX: Better single-page detection
          // ============================================

          // First, calculate total tbody height
          let totalTbodyHeight = 0;
          tbodyRows.forEach((row) => {
            totalTbodyHeight += row.offsetHeight;
          });

          // Check if ALL content fits on first page
          const fitsOnFirstPage = totalTbodyHeight <= firstPageAvailable;

          // ✅ FIXED: If content fits on first page, mark as single-page immediately
          if (fitsOnFirstPage) {
            /* console.log("✅ AVR: Content fits on first page!");
            console.log(`   Total tbody: ${totalTbodyHeight}px, Available: ${firstPageAvailable}px`); */

            document.body.classList.add("single-page");
            origTable.classList.add("last-page");

            // Hide heading separator row on single-page reports
            const separatorRow = thead.querySelector(".heading-separator-row");
            if (separatorRow) {
              separatorRow.style.display = "none";
            }

            // Set page number to Page 1
            setPageNumber(origTable, 1);

            return {
              success: true,
              singlePage: true,
              message: "Content fits on one page",
              measurements: {
                totalTbodyHeight,
                firstPageAvailable,
                fitsOnFirstPage: true
              }
            };
          }

          // ============================================
          // Multi-page split logic (only if doesn't fit)
          // ============================================

          const splitPoints = [];
          let currentRowIndex = 0;
          let pageNumber = 1;

          while (currentRowIndex < tbodyRows.length) {
            const availableSpace = pageNumber === 1 ? firstPageAvailable : subsequentAvailable;
            let accHeight = 0;
            let rowsInThisPage = 0;
            let actualRowsProcessed = 0;

            for (let i = currentRowIndex; i < tbodyRows.length; i++) {
              const rowHeight = tbodyRows[i].offsetHeight;

              // Normal row processing
              const hasLongText = Array.from(tbodyRows[i].querySelectorAll('td')).some(td => {
                return td.textContent.length > 100;
              });
              const rowBuffer = hasLongText ? 10 : 0;
              const newHeight = accHeight + rowHeight;

              if (newHeight + rowBuffer <= availableSpace) {
                accHeight = newHeight;
                rowsInThisPage++;
                actualRowsProcessed++;
              } else {
                break;
              }
            }

            if (rowsInThisPage === 0 && currentRowIndex < tbodyRows.length) {
              rowsInThisPage = 1;
              actualRowsProcessed = 1;
              accHeight = tbodyRows[currentRowIndex].offsetHeight;
            }

            splitPoints.push({
              pageNumber: pageNumber,
              startRow: currentRowIndex,
              rowCount: actualRowsProcessed,
              spaceUsed: accHeight,
              spaceAvailable: availableSpace,
            });

            currentRowIndex += actualRowsProcessed;
            pageNumber++;

            if (pageNumber > 100) break;
          }

          // Double-check: If only one split point, mark as single page
          if (splitPoints.length === 1) {
            const totalRowsProcessed = splitPoints[0].rowCount;
            const totalRows = tbodyRows.length;

            if (totalRowsProcessed >= totalRows) {
              /* console.log("✅ AVR: All rows processed in one split - single page!"); */
              document.body.classList.add("single-page");
              origTable.classList.add("last-page");

              const separatorRow = thead.querySelector(".heading-separator-row");
              if (separatorRow) {
                separatorRow.style.display = "none";
              }

              setPageNumber(origTable, 1);

              return {
                success: true,
                singlePage: true,
                message: "All rows in one split point",
                splitPoints: splitPoints
              };
            }
          }

          // Build multiple tables
          const tables = [];
          const finalWrapper = origTable.parentElement;

          for (let p = 0; p < splitPoints.length; p++) {
            const split = splitPoints[p];
            const isFirstPage = split.pageNumber === 1;
            const isLastPage = p === splitPoints.length - 1;

            const table = document.createElement("table");
            if (origTable.className) {
              table.className = origTable.className;
            }
            // Page 1 needs margin-top:-30px to cancel .content-wrapper's 30px
            // top padding so the 225px spacer-row lands the content at 225px
            // from the top of the page. Pages 2+ start at the top of a fresh
            // physical page (no wrapper padding is re-applied there), so the
            // -30px would pull their spacer ABOVE the letterhead area and
            // cause the header/content to overlap. Keep margin-top:0 on those
            // pages so every page uses the same top offset (225px spacer).
            const pageTopMargin = isFirstPage ? "-30px" : "0";
            table.style.cssText = `width:100%; border-collapse:collapse; margin-top:${pageTopMargin}; margin-bottom:0;`;
            if (!isLastPage) table.style.pageBreakAfter = "always";

            const newThead = document.createElement("thead");
            theadRows.forEach((row) => {
              newThead.appendChild(row.cloneNode(true));
            });

            // Hide heading separator row on first page only
            if (isFirstPage) {
              const separatorRow = newThead.querySelector(".heading-separator-row");
              if (separatorRow) {
                separatorRow.style.display = "none";
              }
            }

            table.appendChild(newThead);

            const newTbody = document.createElement("tbody");
            const endRow = split.startRow + split.rowCount;
            let tbodyRowsAdded = 0;

            for (let i = split.startRow; i < endRow && i < tbodyRows.length; i++) {
              newTbody.appendChild(tbodyRows[i].cloneNode(true));
              tbodyRowsAdded++;
            }

            if (tbodyRowsAdded > 0) {
              table.appendChild(newTbody);
            } else {
              continue;
            }

            if (tfoot) table.appendChild(tfoot.cloneNode(true));
            if (isLastPage) table.classList.add("last-page");
            if (needsFooter) setPageNumber(table, split.pageNumber);

            tables.push(table);
          }

          finalWrapper.innerHTML = "";
          tables.forEach((table) => finalWrapper.appendChild(table));

          // Final single-page check after building tables
          if (tables.length === 1) {
            /* console.log("✅ AVR: Only 1 table built - single page!"); */
            document.body.classList.add("single-page");
            tables[0].classList.add("last-page");

            const separatorRow = tables[0].querySelector("thead .heading-separator-row");
            if (separatorRow) {
              separatorRow.style.display = "none";
            }

            return {
              success: true,
              totalPages: 1,
              singlePage: true,
              splitPoints: splitPoints,
            };
          }

          return {
            success: true,
            totalPages: tables.length,
            splitPoints: splitPoints,
            singlePage: false,
          };
        }, reportType);

        // Log result
       /*  if (splitResult.singlePage) {
          console.log("✅ AVR Report: Single page detected");
        } else if (splitResult.success) {
          console.log(`✅ AVR Report: ${splitResult.totalPages} pages created`);
        } */

        await new Promise((r) => setTimeout(r, 300));
      } catch (error) {
        console.error("❌ Error in AVR report splitting:", error);
      }
    }

    /**
 * Enhanced page.evaluate for CV, CE, and Machinery reports
 * Ensures tyre-image-row and signature-row always stay together
 */
    async function splitReportWithGroupedRows(page, reportType) {
      const splitResult = await page.evaluate((reportType) => {
        // Helper function to set page number on a table
        const setPageNumber = (table, pageNum) => {
          if (!table) return;
          const footerRow = table.querySelector("tfoot .footer-row");
          if (footerRow) {
            const pageNumberSpan = footerRow.querySelector(".page-number-value");
            if (pageNumberSpan) {
              pageNumberSpan.textContent = `Page ${pageNum}`;
              pageNumberSpan.setAttribute("data-page-number", pageNum.toString());
            }
          }
        };

        const needsFooter = [
          "report_ce",
          "report_cv",
          "report_machinery",
          "report_avr",
          "report_summarized",
        ].includes(reportType?.toLowerCase());

        // Measure ACTUAL page dimensions
        const body = document.body;
        const wrapper = document.querySelector(".content-wrapper");
        const origTable = document.querySelector("table");

        if (!origTable) return { success: false, error: "Table not found" };

        const thead = origTable.querySelector("thead");
        const tbody = origTable.querySelector("tbody");
        const tfoot = origTable.querySelector("tfoot");

        if (!thead || !tbody)
          return { success: false, error: "thead/tbody not found" };

        const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
        const wrapperPaddingTop = wrapperStyle
          ? parseInt(wrapperStyle.paddingTop)
          : 30;
        const wrapperPaddingBottom = wrapperStyle
          ? parseInt(wrapperStyle.paddingBottom)
          : 0;

        // Calculate REAL available space - A4 landscape for summarized, Legal portrait for others
        const isSummarizedReport = reportType?.toLowerCase() === "report_summarized";
        const PAGE_HEIGHT_PX = isSummarizedReport
          ? Math.round(8.27 * 96) // 794px for A4 landscape
          : 14 * 96; // 1344px for Legal portrait

        const spacerRow = thead.querySelector(".spacer-row");
        const actualSpacerHeight = spacerRow ? spacerRow.offsetHeight : 225;

        const tfootHeight = tfoot ? tfoot.offsetHeight : 0;
        const tfootFooterRow = tfoot ? tfoot.querySelector(".footer-row") : null;

        const tfootFooterHeight = tfootFooterRow ? tfootFooterRow.offsetHeight : 30;
        // Summarized part 1 tfoot = page-number row only; reserve its full height (no pack slack).
        const actualBottomSpace = isSummarizedReport
          ? Math.max(
              tfoot ? tfoot.offsetHeight : 0,
              tfootFooterHeight + 6
            )
          : tfootFooterHeight;

        // Summarized part 1 pagination — midpoint between loose (55px slack) and strict (0px).
        const SUMMARIZED_BOTTOM_PACK_SLACK_PX = 28;
        const SUMMARIZED_TYRE_SIGNATURE_FIT_FACTOR = 1.04;
        const SUMMARIZED_TAIL_PULL_FACTOR = 1.05;
        const SUMMARIZED_REMAINING_ROWS_FIT_FACTOR = 1.015;
        const SUMMARIZED_MERGE_TAIL_SLACK_PX = 12;
        const SUMMARIZED_STAMP_HEIGHT_BUFFER_PX = 80;

        const SAFETY_MARGIN = isSummarizedReport ? 15 : 30;
        const realAvailable =
          PAGE_HEIGHT_PX -
          actualSpacerHeight -
          wrapperPaddingTop -
          wrapperPaddingBottom -
          actualBottomSpace -
          SAFETY_MARGIN;

        // Calculate thead heights
        const theadRows = Array.from(thead.querySelectorAll("tr"));
        let baseTheadHeight = 0;
        let generalDetailsRows = [];

        theadRows.forEach((row) => {
          if (row.classList.contains("spacer-row")) {
            return;
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

        // Find Proposed Owner rows
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

        // ⭐ NEW: Find tyre-image-row and signature-row
        let tyreImageRow = null;
        let signatureRow = null;
        let tyreImageIndex = -1;
        let signatureIndex = -1;
        let groupedRowsHeight = 0;

        for (let i = 0; i < tbodyRows.length; i++) {
          const row = tbodyRows[i];
          if (row.classList.contains("tyre-image-row")) {
            tyreImageRow = row;
            tyreImageIndex = i;
            groupedRowsHeight += row.offsetHeight;
          } else if (row.classList.contains("signature-row")) {
            signatureRow = row;
            signatureIndex = i;
            groupedRowsHeight += row.offsetHeight;
            break; // Both found
          }
        }
        if (isSummarizedReport && signatureRow) {
          groupedRowsHeight += SUMMARIZED_STAMP_HEIGHT_BUFFER_PX;
        }

        const countRenderableRowsInSplit = (split, pageIndex) => {
          let count = 0;
          const end = split.startRow + split.rowCount;
          for (let i = split.startRow; i < end && i < tbodyRows.length; i++) {
            if (
              pageIndex > 0 &&
              (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
            ) {
              continue;
            }
            count += 1;
          }
          return count;
        };

        // Multi-page split calculation
        const firstPageTheadHeight = baseTheadHeight;
        const firstPageAvailable = realAvailable - firstPageTheadHeight;

        const subsequentTheadHeight = baseTheadHeight + proposedOwnerRowsHeight;
        const subsequentAvailable = realAvailable - subsequentTheadHeight;

        // Calculate split points for all pages
        const splitPoints = [];
        let currentRowIndex = 0;
        let pageNumber = 1;

        while (currentRowIndex < tbodyRows.length) {
          const rawPageAvailable =
            pageNumber === 1 ? firstPageAvailable : subsequentAvailable;
          const availableSpace = isSummarizedReport
            ? rawPageAvailable + SUMMARIZED_BOTTOM_PACK_SLACK_PX
            : rawPageAvailable;
          let accHeight = 0;
          let rowsInThisPage = 0;
          let actualRowsProcessed = 0;

          for (let i = currentRowIndex; i < tbodyRows.length; i++) {
            // Skip Proposed Owner rows if they're in tbody (they'll be in thead for page 2+)
            if (
              pageNumber > 1 &&
              (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
            ) {
              actualRowsProcessed++;
              continue;
            }

            const rowHeight = tbodyRows[i].offsetHeight;

            // ⭐ NEW: Check if this is the tyre-image-row
            const isTyreImageRow = i === tyreImageIndex;
            const isSignatureRow = i === signatureIndex;

            // If we're at tyre-image-row, check if BOTH rows can fit
            if (isTyreImageRow && signatureRow) {
              const combinedHeight = groupedRowsHeight;
              const newHeight = accHeight + combinedHeight;
              const tyreFitLimit = isSummarizedReport
                ? availableSpace * SUMMARIZED_TYRE_SIGNATURE_FIT_FACTOR
                : availableSpace;
              if (newHeight <= tyreFitLimit) {
                // Both rows fit - add them together
                accHeight = newHeight;
                rowsInThisPage += 2;
                actualRowsProcessed += 2;
                i++; // Skip signature-row in next iteration (already counted)
                continue;
              } else {
                // Both rows don't fit - break here (they'll go to next page together)
                break;
              }
            }

            // Skip signature-row if we already processed it with tyre-image-row
            if (isSignatureRow && tyreImageRow && i === signatureIndex) {
              // Already handled above
              continue;
            }

            // Normal row processing
            const hasLongText = Array.from(tbodyRows[i].querySelectorAll("td")).some(
              (td) => {
                return td.textContent.length > 100;
              }
            );
            const rowBuffer = hasLongText
              ? isSummarizedReport
                ? 4
                : 10
              : 0;
            const newHeight = accHeight + rowHeight;
            const rowFitLimit = availableSpace;

            if (newHeight + rowBuffer <= rowFitLimit) {
              accHeight = newHeight;
              rowsInThisPage++;
              actualRowsProcessed++;
            } else {
              break;
            }
          }

          if (rowsInThisPage === 0 && currentRowIndex < tbodyRows.length) {
            rowsInThisPage = 1;
            actualRowsProcessed = 1;
            accHeight = tbodyRows[currentRowIndex].offsetHeight;
          }

          // Check if this would create an empty or near-empty next page
          const remainingRows =
            tbodyRows.length - (currentRowIndex + actualRowsProcessed);
          const MIN_ROWS_FOR_NEW_PAGE = 5;

          if (remainingRows > 0 && remainingRows <= MIN_ROWS_FOR_NEW_PAGE) {
            let canFitRemaining = true;
            let testHeight = accHeight;
            let testRowsToAdd = 0;

            let skippedRows = 0;
            for (
              let i = currentRowIndex + actualRowsProcessed;
              i < tbodyRows.length;
              i++
            ) {
              if (
                pageNumber > 1 &&
                (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
              ) {
                skippedRows++;
                continue;
              }

              const rowHeight = tbodyRows[i].offsetHeight;
              const newTestHeight = testHeight + rowHeight;
              const aggressiveThreshold = isSummarizedReport
                ? availableSpace * SUMMARIZED_REMAINING_ROWS_FIT_FACTOR
                : availableSpace * 1.01;

              if (newTestHeight <= aggressiveThreshold) {
                testHeight = newTestHeight;
                testRowsToAdd++;
              } else {
                canFitRemaining = false;
                break;
              }
            }

            if (canFitRemaining && testRowsToAdd > 0) {
              const totalRowsToAdd = testRowsToAdd + skippedRows;
              rowsInThisPage += testRowsToAdd;
              actualRowsProcessed += totalRowsToAdd;
              accHeight = testHeight;
            }
          }

          if (
            isSummarizedReport &&
            tyreImageRow &&
            signatureRow &&
            tyreImageIndex >= 0 &&
            currentRowIndex + actualRowsProcessed === tyreImageIndex
          ) {
            const combinedHeight = groupedRowsHeight;
            if (
              accHeight + combinedHeight <=
              availableSpace * SUMMARIZED_TAIL_PULL_FACTOR
            ) {
              accHeight += combinedHeight;
              actualRowsProcessed += 2;
              rowsInThisPage += 2;
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

          currentRowIndex += actualRowsProcessed;
          pageNumber++;

          if (pageNumber > 100) break;
        }

        // Summarized part 1: merge tail page when it fits in leftover space + small slack.
        if (isSummarizedReport) {
          const mergeSummarizedTailPage = () => {
            if (splitPoints.length < 2) return false;
            const lastIdx = splitPoints.length - 1;
            const last = splitPoints[lastIdx];
            const prev = splitPoints[lastIdx - 1];
            if (!last || !prev || last.rowCount <= 0) return false;

            let hasTyreOrSignature = false;
            let onlyTailOrSkipped = true;
            for (let i = last.startRow; i < last.startRow + last.rowCount; i++) {
              if (i === tyreImageIndex || i === signatureIndex) {
                hasTyreOrSignature = true;
              } else if (
                i !== proposedOwnerNameIndex &&
                i !== proposedOwnerAddressIndex
              ) {
                onlyTailOrSkipped = false;
              }
            }

            if (!hasTyreOrSignature || !onlyTailOrSkipped || last.rowCount > 4) {
              return false;
            }

            if (last.spaceUsed > prev.unusedSpace + SUMMARIZED_MERGE_TAIL_SLACK_PX) {
              return false;
            }

            prev.rowCount += last.rowCount;
            prev.spaceUsed += last.spaceUsed;
            prev.unusedSpace = prev.spaceAvailable - prev.spaceUsed;
            splitPoints.pop();
            return true;
          };

          while (mergeSummarizedTailPage()) {
            /* pull tail rows only if they fit in measured unused space */
          }
        }

        // Check if single page
        if (splitPoints.length === 1) {
          const totalRowsProcessed = splitPoints[0].rowCount;
          const totalRows = tbodyRows.length;
          const spaceUsed = splitPoints[0].spaceUsed;
          const spaceAvailable = splitPoints[0].spaceAvailable;

          const allRowsProcessed = totalRowsProcessed >= totalRows - 2;
          const spaceUsageReasonable = spaceUsed / spaceAvailable < 0.95;

          if (allRowsProcessed && spaceUsageReasonable) {
            document.body.classList.add("single-page");
            origTable.classList.add("last-page");
            return {
              success: false,
              error: "All content fits on one page",
              singlePage: true,
            };
          }
        }

        // Summarized part 1: drop splits that would render an empty tbody (header-only page).
        const buildSplitPoints = isSummarizedReport
          ? splitPoints.filter((split, pageIndex) =>
              countRenderableRowsInSplit(split, pageIndex) > 0
            )
          : splitPoints;

        // Build multiple tables
        const tables = [];
        const finalWrapper = origTable.parentElement;

        for (let p = 0; p < buildSplitPoints.length; p++) {
          const split = buildSplitPoints[p];
          const isFirstPage = split.pageNumber === 1;
          const isLastPage = p === buildSplitPoints.length - 1;

          const table = document.createElement("table");
          if (origTable.className) {
            table.className = origTable.className;
          }
          // Page 1 needs margin-top:-30px to cancel .content-wrapper's 30px
          // top padding so the 225px spacer-row lands the content at 225px
          // from the top of the page. Pages 2+ start at the top of a fresh
          // physical page (no wrapper padding is re-applied there), so the
          // -30px would pull their spacer ABOVE the letterhead area and
          // cause the header/content to overlap. Keep margin-top:0 on those
          // pages so every page uses the same top offset (225px spacer).
          const pageTopMargin = isFirstPage ? "-30px" : "0";
          table.style.cssText = `width:100%; border-collapse:collapse; margin-top:${pageTopMargin}; margin-bottom:0;`;

          if (!isLastPage) {
            table.style.pageBreakAfter = "always";
          }

          // Build thead
          const newThead = document.createElement("thead");

          theadRows.forEach((row) => {
            if (row.classList.contains("spacer-row")) {
              newThead.appendChild(row.cloneNode(true));
            }
          });

          theadRows.forEach((row) => {
            if (row.classList.contains("spacer-row")) {
              return;
            }

            const fullText = row.textContent.toUpperCase().trim();
            const isGeneralDetails =
              row.classList.contains("general-details-row") ||
              row.hasAttribute("data-first-page-only") ||
              fullText.includes("GENERAL DETAILS");

            if (isGeneralDetails && !isFirstPage) {
              return;
            }

            newThead.appendChild(row.cloneNode(true));
          });

          if (!isFirstPage) {
            if (proposedOwnerNameRow) {
              newThead.appendChild(proposedOwnerNameRow.cloneNode(true));
            }
            if (proposedOwnerAddressRow) {
              newThead.appendChild(proposedOwnerAddressRow.cloneNode(true));
            }

            const spacingRow = document.createElement("tr");
            spacingRow.style.height = "20px";
            const spacingCell = document.createElement("td");
            spacingCell.setAttribute("colspan", "6");
            spacingCell.style.cssText =
              "border: none; height: 20px; padding: 0;";
            spacingRow.appendChild(spacingCell);
            newThead.appendChild(spacingRow);
          }

          table.appendChild(newThead);

          // Build tbody
          const newTbody = document.createElement("tbody");
          const endRow = split.startRow + split.rowCount;
          let tbodyRowsAdded = 0;

          for (let i = split.startRow; i < endRow && i < tbodyRows.length; i++) {
            if (
              !isFirstPage &&
              (i === proposedOwnerNameIndex || i === proposedOwnerAddressIndex)
            ) {
              continue;
            }

            newTbody.appendChild(tbodyRows[i].cloneNode(true));
            tbodyRowsAdded++;
          }

          if (tbodyRowsAdded > 0) {
            table.appendChild(newTbody);
          } else {
            continue;
          }

          if (tfoot) {
            table.appendChild(tfoot.cloneNode(true));
          }

          // For summarized report the appendix always follows, so the last
          // normal-fields table is never truly the last page of the document.
          const isSummarized = reportType?.toLowerCase() === "report_summarized";
          if (isLastPage && !isSummarized) {
            table.classList.add("last-page");
          }

          if (needsFooter) {
            setPageNumber(
              table,
              isSummarizedReport ? p + 1 : split.pageNumber
            );
          }

          tables.push(table);
        }

        finalWrapper.innerHTML = "";
        tables.forEach((table) => {
          finalWrapper.appendChild(table);
        });

        if (tables.length === 1) {
          document.body.classList.add("single-page");
          // Single-page normal-fields: only mark last-page for non-summarized
          const isSummarizedSingle = reportType?.toLowerCase() === "report_summarized";
          if (!isSummarizedSingle) {
            tables[0].classList.add("last-page");
          }
        }

        return {
          success: true,
          totalPages: tables.length,
          splitPoints: splitPoints,
          singlePage: tables.length === 1,
          groupedRows: {
            tyreImageIndex,
            signatureIndex,
            groupedRowsHeight,
          },
          measurements: {
            pageHeight: PAGE_HEIGHT_PX,
            spacerHeight: actualSpacerHeight,
            bottomSpace: actualBottomSpace,
            firstPageAvailable: firstPageAvailable,
            subsequentAvailable: subsequentAvailable,
          },
        };
      }, reportType);

      return splitResult;
    }

    /**
     * JS-controlled pagination for summarized appendix table only.
     * Keeps note outside table and applies deterministic row chunking.
     */
    async function paginateSummarizedAppendix(
      page,
      appendixStartPage,
      currentReportType
    ) {
      if ((currentReportType || "").toLowerCase() !== "report_summarized") {
        return;
      }
      await page.evaluate((startPage, reportType) => {
        if ((reportType || "").toLowerCase() !== "report_summarized") {
          return;
        }
        const summaryRoot = document.querySelector(".summary-page");
        if (!summaryRoot) return;

        const originalTable = summaryRoot.querySelector("table.summary-table");
        if (!originalTable) return;

        const thead = originalTable.querySelector("thead");
        const tbody = originalTable.querySelector("tbody");
        if (!thead || !tbody) return;

        const noteEl = summaryRoot.querySelector(".summary-note");
        const stampSourceImg = summaryRoot.querySelector(".summary-stamp-source img");
        const footerEl = summaryRoot.querySelector(".summary-footer-row");

        const allRows = Array.from(tbody.querySelectorAll("tr"));
        if (allRows.length === 0) return;

        const grandRows = allRows.filter((row) =>
          row.classList.contains("summary-grand-total-row")
        );
        const dataRows = allRows.filter(
          (row) => !row.classList.contains("summary-grand-total-row")
        );

        const PAGE_HEIGHT_PX = Math.round(8.27 * 96); // A4 landscape height in px
        const SAFETY_MARGIN = 10;
        // Stamp is absolute (bottom -50px, height 105px) — reserve overlap only, not full page block.
        const STAMP_CLEARANCE = stampSourceImg ? 65 : 0;

        const spacerRow = thead.querySelector(".spacer-row");
        const spacerHeight = spacerRow ? spacerRow.offsetHeight : 180;

        const theadRows = Array.from(thead.querySelectorAll("tr")).filter(
          (row) => !row.classList.contains("spacer-row")
        );
        const theadContentHeight = theadRows.reduce(
          (sum, row) => sum + row.offsetHeight,
          0
        );

        const footerHeight = footerEl ? footerEl.offsetHeight : 30;
        const noteHeight = noteEl ? noteEl.offsetHeight + 8 : 0;
        const noteStampRowHeight = stampSourceImg
          ? Math.max(noteHeight, 140) + 10
          : noteHeight;
        const grandRowsHeight = grandRows.reduce((sum, row) => sum + row.offsetHeight, 0);

        const baseAvailable =
          PAGE_HEIGHT_PX -
          spacerHeight -
          theadContentHeight -
          footerHeight -
          SAFETY_MARGIN;
        const firstPageAvailable = baseAvailable + 30;
        const middlePageAvailable = Math.max(baseAvailable - STAMP_CLEARANCE, 60);
        const firstMiddlePageAvailable = Math.max(firstPageAvailable - STAMP_CLEARANCE, 60);

        // Last table page: reserve stamp clearance + grand total.
        // Note is handled separately (it can move alone to next page).
        const lastTablePageAvailable =
          baseAvailable - STAMP_CLEARANCE - grandRowsHeight;
        const firstPageLastTableAvailable =
          firstPageAvailable - STAMP_CLEARANCE - grandRowsHeight;

        const rowHeights = dataRows.map((row) => row.offsetHeight);

        const getPageRowsHeight = (pageDef) =>
          rowHeights
            .slice(pageDef.start, pageDef.end)
            .reduce((sum, h) => sum + h, 0);

        const capacityForPageIndex = (pageIndex, isLastPage) => {
          const isFirst = pageIndex === 0;
          if (isLastPage) {
            return Math.max(
              isFirst ? firstPageLastTableAvailable : lastTablePageAvailable,
              60
            );
          }
          return Math.max(
            isFirst ? firstMiddlePageAvailable : middlePageAvailable,
            60
          );
        };

        // Pass 1: pack rows — full height when all remaining fit on last page; else stamp clearance on middle pages
        const pages = [];
        let idx = 0;
        let builtPageCount = 0;
        while (idx < dataRows.length) {
          const isFirst = builtPageCount === 0;
          const remainingH = rowHeights
            .slice(idx)
            .reduce((sum, h) => sum + h, 0);
          const fitsAsSingleLastPage =
            remainingH <= (isFirst ? firstPageLastTableAvailable : lastTablePageAvailable);

          const availableForThisPage = fitsAsSingleLastPage
            ? Math.max(isFirst ? firstPageLastTableAvailable : lastTablePageAvailable, 60)
            : Math.max(isFirst ? firstMiddlePageAvailable : middlePageAvailable, 60);

          let acc = 0;
          const start = idx;
          while (idx < dataRows.length && acc + rowHeights[idx] <= availableForThisPage) {
            acc += rowHeights[idx];
            idx += 1;
          }
          if (idx === start) {
            idx += 1;
          }
          pages.push({ start, end: idx });
          builtPageCount += 1;
        }

        // Pass 2: last table page must fit data rows + grand total (not note) — move overflow up if needed
        for (let guard = 0; guard < dataRows.length + 5; guard += 1) {
          if (pages.length === 0) break;
          const lastIdx = pages.length - 1;
          const last = pages[lastIdx];
          let h = getPageRowsHeight(last);
          const limit = capacityForPageIndex(lastIdx, true);

          if (h <= limit) break;

          if (pages.length >= 2 && last.end - last.start > 1) {
            const prev = pages[lastIdx - 1];
            const moveRow = last.start;
            const prevH = getPageRowsHeight(prev);
            const prevCap = capacityForPageIndex(lastIdx - 1, false);
            if (prevH + rowHeights[moveRow] <= prevCap) {
              prev.end = moveRow + 1;
              last.start = moveRow + 1;
              continue;
            }
          }

          if (last.end - last.start <= 1) break;

          const splitAt = last.end - 1;
          pages[lastIdx] = { start: last.start, end: splitAt };
          pages.push({ start: splitAt, end: last.end });
        }

        // Pass 3: merge tiny trailing page into previous when it fits as last page
        for (let guard = 0; guard < pages.length; guard += 1) {
          if (pages.length < 2) break;
          const last = pages[pages.length - 1];
          const prev = pages[pages.length - 2];
          const lastRows = last.end - last.start;
          if (lastRows > 3) break;
          const combinedH = getPageRowsHeight({ start: prev.start, end: last.end });
          const mergedPageIndex = pages.length - 2;
          if (combinedH <= capacityForPageIndex(mergedPageIndex, true)) {
            pages[pages.length - 2] = { start: prev.start, end: last.end };
            pages.pop();
          } else {
            break;
          }
        }

        /** Measure column widths from full table (all rows) before split. */
        const captureSummarizedColumnWidths = (table) => {
          const headerRow = table.querySelector("thead tr:last-child");
          if (!headerRow) return [];
          return Array.from(headerRow.querySelectorAll("th, td")).map((cell) => {
            const w = cell.getBoundingClientRect().width;
            return Number.isFinite(w) && w > 0 ? w : 0;
          });
        };

        const applySummarizedColumnWidths = (table, widthsPx) => {
          if (!widthsPx || widthsPx.length === 0) return;
          const total = widthsPx.reduce((sum, w) => sum + w, 0);
          if (total <= 0) return;

          table.style.tableLayout = "fixed";
          table.style.width = "100%";

          const existing = table.querySelector("colgroup.summarized-col-widths");
          if (existing) existing.remove();

          const colgroup = document.createElement("colgroup");
          colgroup.className = "summarized-col-widths";
          widthsPx.forEach((w) => {
            const col = document.createElement("col");
            col.style.width = `${(w / total) * 100}%`;
            colgroup.appendChild(col);
          });
          table.insertBefore(colgroup, table.firstChild);
        };

        const summarizedColumnWidthsPx = captureSummarizedColumnWidths(originalTable);

        const getSummarizedAppendixColumnIds = (table) => {
          const headerRow = table?.querySelector("thead tr:last-child");
          if (!headerRow) return [];
          return Array.from(headerRow.querySelectorAll("th, td"))
            .map((el) => el.getAttribute("data-col-id"))
            .filter(Boolean);
        };

        /** Merged-column metadata from first non-title rowspan cells — used when splitting across pages. */
        const isSummarizedMergedTitleRowEl = (row) =>
          Boolean(
            row &&
              (row.classList.contains("summary-merged-row") ||
                row.querySelector("td.summary-title"))
          );

        const extractSummarizedVerticalMergeMeta = (rows, columnIds) => {
          if (!rows.length) return [];
          const meta = [];
          const seen = new Set();
          for (const row of rows) {
            if (isSummarizedMergedTitleRowEl(row)) continue;
            row.querySelectorAll("td").forEach((td, colIndex) => {
              const rowSpan = parseInt(td.getAttribute("rowspan"), 10);
              if (!Number.isFinite(rowSpan) || rowSpan <= 1) return;
              const colId =
                td.getAttribute("data-col-id") ||
                (Array.isArray(columnIds) ? columnIds[colIndex] : null);
              const key = colId || `idx:${colIndex}`;
              if (seen.has(key)) return;
              seen.add(key);
              if (colId) {
                meta.push({ colId, innerHTML: td.innerHTML });
                return;
              }
              meta.push({ colIndex, innerHTML: td.innerHTML });
            });
            if (meta.length > 0) break;
          }
          return meta;
        };

        const buildSummarizedMergedTd = (colId, rowSpan, innerHTML) => {
          const td = document.createElement("td");
          td.setAttribute("data-col-id", colId);
          td.setAttribute("rowspan", String(rowSpan));
          td.className = "summarized-vertical-merged-cell";
          td.style.verticalAlign = "middle";
          td.style.textAlign = "center";
          td.innerHTML = innerHTML;
          return td;
        };

        const normalizeSummarizedChunkRow = (
          row,
          columnIds,
          mergedByColId,
          { isFirstDataRow, dataRowCount }
        ) => {
          const cellByColId = new Map();
          row.querySelectorAll("td").forEach((td) => {
            const colId = td.getAttribute("data-col-id");
            if (colId) cellByColId.set(colId, td);
          });

          row.innerHTML = "";
          columnIds.forEach((colId) => {
            if (mergedByColId.has(colId)) {
              if (!isFirstDataRow) return;
              const mergedTd = buildSummarizedMergedTd(
                colId,
                dataRowCount,
                mergedByColId.get(colId)
              );
              row.appendChild(mergedTd);
              return;
            }

            const existing = cellByColId.get(colId);
            if (existing) {
              existing.removeAttribute("rowspan");
              row.appendChild(existing);
              return;
            }

            const emptyTd = document.createElement("td");
            emptyTd.setAttribute("data-col-id", colId);
            row.appendChild(emptyTd);
          });
        };

        /**
         * PDF pagination clones tbody chunks; full-table rowspan causes duplicated/overlapping
         * text on page 2+. Rebuild each chunk row by column id so multiple merged columns
         * stay aligned on continuation pages (td indices differ when rowspan cells are omitted).
         */
        const applyVerticalMergeToChunk = (tbody, mergeMeta, columnIds) => {
          if (!mergeMeta || mergeMeta.length === 0) return;
          if (!columnIds || columnIds.length === 0) return;

          const mergedByColId = new Map();
          mergeMeta.forEach((entry) => {
            if (entry.colId) {
              mergedByColId.set(entry.colId, entry.innerHTML);
            }
          });

          const allRows = Array.from(tbody.querySelectorAll("tr")).filter(
            (row) => !row.classList.contains("summary-grand-total-row")
          );
          if (allRows.length === 0) return;

          if (mergedByColId.size === 0) {
            const legacyMeta = mergeMeta.filter(
              (entry) => Number.isFinite(entry.colIndex)
            );
            if (legacyMeta.length === 0) return;

            // Legacy index-based path: only apply within contiguous non-title segments.
            let i = 0;
            while (i < allRows.length) {
              if (isSummarizedMergedTitleRowEl(allRows[i])) {
                i += 1;
                continue;
              }
              let j = i;
              while (j < allRows.length && !isSummarizedMergedTitleRowEl(allRows[j])) {
                j += 1;
              }
              const segment = allRows.slice(i, j);
              const dataRowCount = segment.length;
              const sortedMeta = [...legacyMeta].sort((a, b) => b.colIndex - a.colIndex);
              sortedMeta.forEach(({ colIndex, innerHTML }) => {
                const firstRow = segment[0];
                const cells = firstRow.querySelectorAll("td");
                const existing = cells[colIndex];
                const existingRowspan = existing
                  ? parseInt(existing.getAttribute("rowspan"), 10)
                  : 0;

                if (existingRowspan > 1) {
                  existing.setAttribute("rowspan", String(dataRowCount));
                  existing.style.verticalAlign = "middle";
                  existing.style.textAlign = "center";
                  return;
                }

                const newTd = document.createElement("td");
                newTd.setAttribute("rowspan", String(dataRowCount));
                newTd.className = "summarized-vertical-merged-cell";
                newTd.style.verticalAlign = "middle";
                newTd.style.textAlign = "center";
                newTd.innerHTML = innerHTML;

                if (colIndex >= cells.length) {
                  firstRow.appendChild(newTd);
                } else {
                  firstRow.insertBefore(newTd, cells[colIndex]);
                }
              });
              i = j;
            }
            return;
          }

          let i = 0;
          while (i < allRows.length) {
            if (isSummarizedMergedTitleRowEl(allRows[i])) {
              i += 1;
              continue;
            }
            let j = i;
            while (j < allRows.length && !isSummarizedMergedTitleRowEl(allRows[j])) {
              j += 1;
            }
            const segment = allRows.slice(i, j);
            segment.forEach((row, rowIndex) => {
              normalizeSummarizedChunkRow(row, columnIds, mergedByColId, {
                isFirstDataRow: rowIndex === 0,
                dataRowCount: segment.length,
              });
            });
            i = j;
          }
        };

        const summarizedColumnIds = getSummarizedAppendixColumnIds(originalTable);
        const summarizedVerticalMergeMeta = extractSummarizedVerticalMergeMeta(
          dataRows,
          summarizedColumnIds
        );

        const noteFitsOnLastTablePage = (() => {
          if (!noteEl || pages.length === 0) return true;
          const lastIdx = pages.length - 1;
          const lastChunk = pages[lastIdx];
          const isFirstAndLastPage = lastIdx === 0;
          const tableRowsHeight = getPageRowsHeight(lastChunk) + grandRowsHeight;
          // For fit check with note, compare against full page capacity (before grand-total reservation),
          // because tableRowsHeight already includes grandRowsHeight.
          const tableCapacity = isFirstAndLastPage ? firstPageAvailable : baseAvailable;
          return tableRowsHeight + noteStampRowHeight <= tableCapacity;
        })();
        const appendNoteOnSeparatePage = Boolean(noteEl) && !noteFitsOnLastTablePage;

        summaryRoot.innerHTML = "";

        const createFooter = (pageNo, isLastPage) => {
          const footer = document.createElement("div");
          footer.className = "summary-footer-row";
          const left = document.createElement("span");
          left.className = "summary-page-number-value page-number";
          left.setAttribute("data-page-number", String(pageNo));
          left.textContent = `Page ${pageNo}`;
          const right = document.createElement("span");
          right.className = "summary-continue-text continue-text";
          right.textContent = isLastPage ? "" : "Continue to next page...";
          footer.appendChild(left);
          footer.appendChild(right);
          return footer;
        };

        pages.forEach((chunk, pageIdx) => {
          const isFirst = pageIdx === 0;
          const isLastTablePage = pageIdx === pages.length - 1;
          const isLast = isLastTablePage && !appendNoteOnSeparatePage;
          const isSingle = pages.length === 1 && !appendNoteOnSeparatePage;
          const pageNo = startPage + pageIdx;

          const pageBlock = document.createElement("div");
          pageBlock.className = "summary-appendix-page";
          pageBlock.style.position = "relative";
          if (!isLastTablePage || appendNoteOnSeparatePage) {
            pageBlock.style.pageBreakAfter = "always";
          }

          const table = document.createElement("table");
          table.className = "summary-table";
          table.style.width = "100%";
          table.style.borderCollapse = "collapse";
          table.style.marginTop = isFirst ? "-30px" : "0";
          table.style.marginBottom = "0";

          table.appendChild(thead.cloneNode(true));

          const newTbody = document.createElement("tbody");
          for (let i = chunk.start; i < chunk.end; i += 1) {
            newTbody.appendChild(dataRows[i].cloneNode(true));
          }
          if (isLastTablePage && grandRows.length > 0) {
            grandRows.forEach((row) => newTbody.appendChild(row.cloneNode(true)));
          }
          table.appendChild(newTbody);
          applyVerticalMergeToChunk(
            newTbody,
            summarizedVerticalMergeMeta,
            summarizedColumnIds
          );
          applySummarizedColumnWidths(table, summarizedColumnWidthsPx);

          pageBlock.appendChild(table);

          if ((isLast || isSingle) && noteEl && !appendNoteOnSeparatePage) {
            if (stampSourceImg) {
              const noteStampRow = document.createElement("div");
              noteStampRow.className = "summary-note-stamp-row";

              const stampHolder = document.createElement("div");
              stampHolder.className = "summary-note-stamp";
              stampHolder.appendChild(stampSourceImg.cloneNode(true));
              noteStampRow.appendChild(stampHolder);

              const noteClone = noteEl.cloneNode(true);
              noteStampRow.appendChild(noteClone);
              pageBlock.appendChild(noteStampRow);
            } else {
              pageBlock.appendChild(noteEl.cloneNode(true));
            }
          }

          if (stampSourceImg && pages.length > 1 && !isLast) {
            const pageStamp = stampSourceImg.cloneNode(true);
            pageStamp.className = "summary-stamp-per-page";
            pageBlock.appendChild(pageStamp);
          }
          pageBlock.appendChild(createFooter(pageNo, isLast));
          summaryRoot.appendChild(pageBlock);
        });

        if (appendNoteOnSeparatePage && noteEl) {
          const notePageNo = startPage + pages.length;
          const noteBlock = document.createElement("div");
          noteBlock.className = "summary-appendix-page";
          noteBlock.style.position = "relative";
          // Keep note-only page aligned below letterhead/top header zone like normal appendix pages.
          const noteTopOffset = Math.max(
            spacerHeight + theadContentHeight - 10,
            190
          );
          noteBlock.style.paddingTop = `${noteTopOffset}px`;

          if (stampSourceImg) {
            const noteStampRow = document.createElement("div");
            noteStampRow.className = "summary-note-stamp-row";

            const stampHolder = document.createElement("div");
            stampHolder.className = "summary-note-stamp";
            stampHolder.appendChild(stampSourceImg.cloneNode(true));
            noteStampRow.appendChild(stampHolder);

            noteStampRow.appendChild(noteEl.cloneNode(true));
            noteBlock.appendChild(noteStampRow);
          } else {
            noteBlock.appendChild(noteEl.cloneNode(true));
          }

          noteBlock.appendChild(createFooter(notePageNo, true));
          summaryRoot.appendChild(noteBlock);
        }
      }, appendixStartPage, currentReportType);
    }

    // Now update the existing generateReportPDF function
    // Find this section in your code (around line 800-900) and replace it:

    // INSIDE generateReportPDF function, replace the CV/CE/Machinery handling section:

    if (
      reportType.toLowerCase() === "report_cv" ||
      reportType.toLowerCase() === "report_ce" ||
      reportType.toLowerCase() === "report_machinery" ||
      reportType.toLowerCase() === "report_summarized"
    ) {
      try {
        // ⭐ Use the new enhanced function
        const splitResult = await splitReportWithGroupedRows(page, reportType);

        if (splitResult.success) {
          // For summarized report: update appendix page number to continue from normal-fields pages
          if (reportType.toLowerCase() === "report_summarized") {
            const appendixStartPage = (splitResult.totalPages || 1) + 1;
            await paginateSummarizedAppendix(
              page,
              appendixStartPage,
              reportType
            );
          }
        } else if (splitResult.singlePage) {
          /* console.log("✅ Single page report - no split needed"); */

          const hasClass = await page.evaluate(() => {
            return document.body.classList.contains("single-page");
          });
          /* console.log("✅ Single-page class present:", hasClass); */

          const needsFooter = [
            "report_ce",
            "report_cv",
            "report_machinery",
            "report_avr",
            "report_summarized",
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
            // For summarized report single-page: appendix starts at page 2
            if (reportType.toLowerCase() === "report_summarized") {
              await paginateSummarizedAppendix(page, 2, reportType);
            }
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch (error) {
        console.error("❌ Error in report splitting:", error);
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
 * @param {string|null} reportTypeSelection - Report type selection ("Rough" or "Production")
 * @returns {string} HTML content
 */
function generateReportHTML(
  reportType,
  formData,
  extraData,
  bgImageBase64,
  stampImageBase64,
  reportTypeSelection
) {
  // Route to appropriate template based on report type
  switch (reportType.toLowerCase()) {
    case "report_cv":
      return cvReportTemplate.generateCVReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64,
        reportTypeSelection
      );

    case "report_avr":
      return avrReportTemplate.generateAVRReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64,
        reportTypeSelection
      );

    case "report_machinery":
      return machineryReportTemplate.generateMachineryReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64,
        reportTypeSelection
      );

    case "report_summarized":
      {
        const normalFieldsHtml = generateSummarizedNormalFieldsHTML(
          formData,
          extraData,
          bgImageBase64,
          stampImageBase64,
          reportTypeSelection
        );
        const appendixHtml = generateSummarizedTableAppendixHTML(
          formData,
          stampImageBase64
        );
        const summarizedOverrideCss = `
<style>
  @page {
    size: 11.69in 8.27in !important;
    margin: 0px !important;
  }
  body {
    width: 11.69in !important;
    background-size: 11.69in 8.27in !important;
    min-height: 8.27in !important;
  }
  .page, .content-wrapper {
    min-height: 8.27in !important;
  }
  thead .spacer-row,
  thead .spacer-row td {
    height: 180px !important;
    line-height: 180px !important;
  }
  body, table, th, td, .main-table td, .main-table th {
    text-align: center !important;
  }
  td.cell-text-left,
  th.cell-text-left,
  .main-table td.cell-text-left {
    text-align: left !important;
    text-transform: none !important;
  }
  /* Footer rows must override the center-align above */
  tfoot .footer-row td { text-align: left !important; border: none !important; }
  tfoot .footer-row td.continue-text { text-align: right !important; }
  .summary-footer-row td { text-align: left !important; border: none !important; border-top: 1px solid #e0e0e0 !important; }
  .summary-footer-row td.summary-continue-text { text-align: right !important; }
</style>`;
        return normalFieldsHtml
          .replace("</head>", `${summarizedOverrideCss}</head>`)
          .replace("</body>", `${appendixHtml}</body>`);
      }

    case "report_ce":
      return ceReportTemplate.generateCEReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64,
        reportTypeSelection
      );

    case "report_marine":
      return marineReportTemplate.generateMarineReportHTML(
        formData,
        extraData,
        bgImageBase64,
        stampImageBase64,
        reportTypeSelection
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

      case "report_summarized":
        report = await SummarizedReport.findByOrderIdWithFlexibleFields(order_id);
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
      const assetMakeId = Number(report.asset_make);
      if (Number.isInteger(assetMakeId) && assetMakeId > 0) {
        const assetMakeRecord = await AssetMakesForReports.findById(assetMakeId);
        if (assetMakeRecord) {
          report.asset_make_name = assetMakeRecord.name;
        }
      } else if (typeof report.asset_make === "string" && report.asset_make.trim()) {
        // Backward compatibility: old records may contain name directly.
        report.asset_make_name = report.asset_make.trim();
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

      case "report_summarized":
        const summarizedReport = await db("report_summarized")
          .leftJoin("orders", "report_summarized.order_id", "orders.id")
          .leftJoin(
            "users as created_user",
            "report_summarized.created_by",
            "created_user.id"
          )
          .leftJoin(
            "users as updated_user",
            "report_summarized.updated_by",
            "updated_user.id"
          )
          .where("orders.child_category_id", childCategoryId)
          .whereNull("orders.deleted_at")
          .select(
            "report_summarized.*",
            "orders.order_number",
            "orders.child_category_id",
            "created_user.name as created_by_name",
            "updated_user.name as updated_by_name"
          )
          .orderBy("report_summarized.created_at", "desc")
          .first();

        if (summarizedReport) {
          orderId = summarizedReport.order_id;
          report = await SummarizedReport.findByOrderIdWithFlexibleFields(orderId);
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
      const assetMakeId = Number(report.asset_make);
      if (Number.isInteger(assetMakeId) && assetMakeId > 0) {
        const assetMakeRecord = await AssetMakesForReports.findById(assetMakeId);
        if (assetMakeRecord) {
          report.asset_make_name = assetMakeRecord.name;
        }
      } else if (typeof report.asset_make === "string" && report.asset_make.trim()) {
        // Backward compatibility: old records may contain name directly.
        report.asset_make_name = report.asset_make.trim();
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

    // Always use live order bank initial so saved data matches frontend Ref NO. display
    if (order.bank_initial != null && String(order.bank_initial).trim() !== "") {
      formData.ref_no_bank = order.bank_initial;
    }

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = now.toLocaleString("en-US", { month: "short" });
    const orderNumber = order.order_number;

    const flexibleFields = extractFlexibleFieldsFromFormData(formData);

    let chassisImageRelativePath = null;
    const previousChassisSource =
      resolveChassisRelativePath(
        formData.chassis_no_pencil_impression,
        existingReport
      ) || existingChassisPath;

    const chassisFile =
      Array.isArray(req.files) && req.files.length > 0
        ? req.files.find(
            (file) => file.fieldname === "chassis_no_pencil_impression"
          )
        : null;

    if (chassisFile) {
      const storedPath = saveChassisImageFromMemoryFile(
        chassisFile,
        year,
        month,
        orderNumber
      );
      if (storedPath) {
        if (previousChassisSource && previousChassisSource !== storedPath) {
          deleteChassisImage(previousChassisSource);
        }
        chassisImageRelativePath = storedPath;
        existingChassisPath = storedPath;
      }
    } else {
      chassisImageRelativePath = previousChassisSource;
      if (chassisImageRelativePath) {
        existingChassisPath = chassisImageRelativePath;
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
      "report_summarized",
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
      ["report_cv", "report_ce", "report_machinery", "report_summarized"].includes(
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
      ["report_cv", "report_ce", "report_avr", "report_machinery", "report_summarized"].includes(
        requestedReportType.toLowerCase()
      )
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
      "is_repo",
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
      "report_date_heading",
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
      "valuer_special_remarks",
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
      "report_date_heading",
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
      "invoice_price_in_word",
      "loan_amount",
      "loan_amount_in_word",
      "lien_of_bank",
      "hour_meter_reading",
      "model_name",
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
      "valuer_special_remarks",
      "chassis_no_pencil_impression",
    ],
    report_machinery: [
      "valueation_report_for_heading",
      "general_details_heading",
      "is_repo",
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
      "report_date_heading",
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
      "supplier_names",
      "asset_make",
      "model",
      "control_system",
      "machine_serial_no",
      "laf_id",
      "application_usage",
      "invoice_no_date",
      "invoice_no_heading",
      "hyp_with",
      "machine_type",
      "asset_classification",
      "no_of_cylinder",
      "machine_technology",
      "control_panel_unit",
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
      "bill_of_entry",
      "bill_of_landing",
      "tax_invoice_copy_heading",
      "tax_invoice_copy",
      "quotation_copy",
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
      "valuer_special_remarks",
      "declaration",
      "disclaimer",
    ],
    report_ce: [
      "valueation_report_for_heading",
      "general_details_heading",
      "is_repo",
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
      "report_date_heading",
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
      "supplier_names",
      "asset_make",
      "model",
      "engine_no_heading",
      "engine_no_detail",
      "chassis_no_heading",
      "crane_chassis_no",
      "body_type",
      "crane_model_code",
      "hours_meter_reading",
      "invoice_no_heading",
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
      "rc_book_verified",
      "bill_of_entry",
      "proforma_invoice_heading",
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
      "valuer_special_remarks",
      "declaration",
      "disclaimer",
      "chassis_no_pencil_impression",
    ],
    report_marine: [
      // Vessel Details Section
      "report_title_type",
      "report_title",
      "report_title_other",
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
      "report_date_heading",
      "client_name_with_full_address",
      "imo_official_regd_no",
      // PARTICULARS OF THE VESSEL
      "registry_vessel_date",
      "registry_vessel_location",
      "registered_or_proposed_owner",
      "registered_or_proposed_owner_address",
      "proposed_owner",
      "proposed_owner_address",
      "purpose_of_valuation",
      "marine_vessel_name",
      "type_or_description_of_vessel",
      "mmsi_no",
      "international_maritime_number",
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
      // CERTIFICATIONS OF THE VESSEL
      "certifications_vessel_note",
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
      "valuer_special_remarks",
      "disclaimer",
    ],
  };

  if (!validColumns.report_summarized) {
    validColumns.report_summarized = [
      ...(validColumns.report_machinery || []),
      "summarized_table_data",
      "end_note",
    ];
  }

  const allowedColumns = validColumns[reportType.toLowerCase()] || [];
  const filteredData = {};

  // Boolean columns (DB type boolean) - must be actual boolean, not string/array
  const booleanColumns = ["is_repo"];

  // Only include fields that exist in the valid columns list
  Object.keys(formData).forEach((key) => {
    if (allowedColumns.includes(key)) {
      let value = formData[key];
      if (booleanColumns.includes(key)) {
        if (value === true || value === "true") value = true;
        else if (value === false || value === "false") value = false;
        else if (Array.isArray(value)) value = value.some((v) => v === true || v === "true");
        else if (value != null && typeof value === "string" && value.includes("true")) value = true;
        else value = false;
      }
      filteredData[key] = value;
    }
  });

  return filteredData;
}

// Export multer middleware for use in routes
exports.uploadChassisImage = upload.single("chassis_no_pencil_impression");
