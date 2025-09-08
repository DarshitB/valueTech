const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");

// Import models and utilities
const Order = require("../../models/orders/order");
const orderMediaDocument = require("../../models/orders/orderMediaDocument");
const { ensureDirectoryExists } = require("../../utils/localFileHelper");

// Import custom error classes
const { NotFoundError, BadRequestError } = require("../../utils/customErrors");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create a temporary directory for uploads
    const tempDir = path.join(process.cwd(), "tmp_uploads");
    ensureDirectoryExists(tempDir);
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with original extension
    const randomNumber = Math.floor(Math.random() * 10000);
    const uniqueName = `${randomNumber}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow common document types
    const allowedTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      // Text files
      "text/plain",
      "text/csv",
      // Archives
      "application/zip",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  },
});

/**
 * Upload any type of document to the portal
 * POST /api/order-media-document/upload
 */
exports.upload = [
  upload.any(), // Accept any field name for files (documents, files, etc.)
  async (req, res, next) => {
    try {
      const { order_id } = req.body;
      const { id: userId } = req.user;
      const uploadedFiles = req.files; // Changed from req.file to req.files

      // Validate input
      if (!order_id) {
        throw new BadRequestError("order_id is required");
      }
      if (!uploadedFiles || !Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        throw new BadRequestError("No files uploaded");
      }

      // Get order details
      const order = await Order.findById(order_id, req.user);
      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Create upload directory structure: uploads/YYYY/MMM/orderNumber/documents/
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
        "documents"
      );
      ensureDirectoryExists(uploadDir);

      // Process all uploaded files
      const uploadedDocuments = [];
      const tempPaths = [];

      for (const uploadedFile of uploadedFiles) {
        try {
          // Determine media type from file
          const mediaType = determineMediaType(
            uploadedFile.mimetype,
            uploadedFile.originalname
          );

          // Determine document type based on media type
          const documentType = determineDocumentType(mediaType);

          // Generate unique filename for the document
          const fileExtension = path.extname(uploadedFile.originalname);
          const fileNameWithoutExt = path.basename(uploadedFile.originalname, fileExtension);
          const randomNumber = Math.floor(Math.random() * 10000); // Random 4-digit number
          const fileName = `${fileNameWithoutExt}_${randomNumber}${fileExtension}`;
          const finalPath = path.join(uploadDir, fileName);

          // Move file from temp to final location
          fs.renameSync(uploadedFile.path, finalPath);

          // Verify file was moved successfully
          if (!fs.existsSync(finalPath)) {
            throw new Error(`Failed to save uploaded file: ${uploadedFile.originalname}`);
          }

          // Save document record to database
          const documentData = {
            order_id: order.id,
            media_url: `/uploads/${year}/${month}/${orderNumber}/documents/${fileName}`,
            media_type: mediaType,
            document_type: "documents",
            created_type: "upload",
            created_by: userId,
            created_at: new Date(),
          };

          const documentId = await orderMediaDocument.createDocument(documentData);

          // Add to uploaded documents list
          uploadedDocuments.push({
            id: documentId,
            filename: uploadedFile.originalname,
            media_type: mediaType,
            document_type: "documents",
            created_type: "upload",
            download_url: `/uploads/${year}/${month}/${orderNumber}/documents/${fileName}`,
            file_size: uploadedFile.size,
            uploaded_at: new Date(),
          });

        } catch (fileError) {
          console.error(`Error processing file ${uploadedFile.originalname}:`, fileError);
          // Continue with other files even if one fails
        }
      }

      // Check if any files were successfully uploaded
      if (uploadedDocuments.length === 0) {
        throw new Error("No files were successfully uploaded");
      }

      // Set document ID for activity logger (use first document ID)
      res.locals.documentId = uploadedDocuments[0].id;

      // Return success response
      res.json({
        success: true,
        message: `${uploadedDocuments.length} document(s) uploaded successfully`,
        data: {
          total_uploaded: uploadedDocuments.length,
          documents: uploadedDocuments,
        },
      });
    } catch (err) {
      // Clean up temp files if they exist
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
      next(err);
    }
  },
];

/**
 * Get all documents for a specific order
 * GET /api/order-media-document/:orderId
 */
exports.getCollagesByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const result = await orderMediaDocument.findByOrderId(parseInt(orderId));

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Soft delete document
 * DELETE /api/order-media-document/:id
 */
exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const success = await orderMediaDocument.softDelete(parseInt(id), userId);

    if (!success) {
      throw new NotFoundError("Document not found");
    }

    res.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Determine media type from MIME type and filename
 */
function determineMediaType(mimeType, filename) {
  const extension = path.extname(filename).toLowerCase();

  // Image types
  if (
    mimeType.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(extension)
  ) {
    return "image";
  }

  // PDF
  if (mimeType === "application/pdf" || extension === ".pdf") {
    return "pdf";
  }

  // Excel files
  if (mimeType.includes("excel") || [".xls", ".xlsx"].includes(extension)) {
    return "excel";
  }

  // Word documents
  if (mimeType.includes("word") || [".doc", ".docx"].includes(extension)) {
    return "word";
  }

  // PowerPoint
  if (
    mimeType.includes("powerpoint") ||
    [".ppt", ".pptx"].includes(extension)
  ) {
    return "powerpoint";
  }

  // Text files
  if (mimeType.startsWith("text/") || [".txt", ".csv"].includes(extension)) {
    return "text";
  }

  // Archives
  if (
    mimeType.includes("zip") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z") ||
    [".zip", ".rar", ".7z"].includes(extension)
  ) {
    return "archive";
  }

  // Default
  return "other";
}

/**
 * Determine document type based on media type
 */
function determineDocumentType(mediaType) {
  switch (mediaType) {
    case "image":
      return "image";
    case "pdf":
      return "document";
    case "excel":
      return "spreadsheet";
    case "word":
      return "document";
    case "powerpoint":
      return "presentation";
    case "text":
      return "text";
    case "archive":
      return "archive";
    default:
      return "other";
  }
}