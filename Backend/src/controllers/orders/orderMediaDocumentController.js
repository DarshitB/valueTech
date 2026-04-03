const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const yauzl = require("yauzl");

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
    fileSize: 300 * 1024 * 1024, // 300MB limit (increased for ZIP file uploads)
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
      // Archives - allow multiple ZIP MIME types
      "application/zip",
      "application/x-zip-compressed",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ];

    // Check by MIME type
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    // Also allow ZIP files by extension (fallback for cases where MIME type detection fails)
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if ([".zip", ".rar", ".7z"].includes(fileExtension)) {
      cb(null, true);
      return;
    }

    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  },
});

/**
 * Helper: Extract ZIP file and return array of extracted file paths
 * Accepts all file types (not just images/videos)
 */
function extractZipFile(zipPath, extractDir) {
  return new Promise((resolve, reject) => {
    const extractedFiles = [];

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        // Skip directories
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) {
            zipfile.readEntry();
            return;
          }

          // Create safe filename
          const safeFileName = entry.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
          const extractPath = path.join(extractDir, safeFileName);

          // Ensure directory exists
          const extractDirPath = path.dirname(extractPath);
          if (!fs.existsSync(extractDirPath)) {
            fs.mkdirSync(extractDirPath, { recursive: true });
          }

          const writeStream = fs.createWriteStream(extractPath);

          readStream.pipe(writeStream);

          writeStream.on("close", () => {
            extractedFiles.push({
              originalName: entry.fileName,
              extractedPath: extractPath,
              size: entry.uncompressedSize,
            });
            zipfile.readEntry();
          });

          writeStream.on("error", (err) => {
            zipfile.readEntry();
          });
        });
      });

      zipfile.on("end", () => {
        resolve(extractedFiles);
      });

      zipfile.on("error", reject);
    });
  });
}

/**
 * Helper: Recursively delete directory and its contents
 */
function deleteDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteDirectory(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

/**
 * Upload any type of document to the portal
 * Supports both normal files and ZIP files
 * POST /api/order-media-document/upload
 */
exports.upload = [
  upload.any(), // Accept any field name for files (documents, files, etc.)
  async (req, res, next) => {
    // Declare cleanup arrays outside try block so they're accessible in catch
    const zipFilesToCleanup = [];
    const extractDirsToCleanup = [];

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
          // Check if file is a ZIP file
          const isZipFile =
            uploadedFile.mimetype === "application/zip" ||
            uploadedFile.mimetype === "application/x-zip-compressed" ||
            uploadedFile.originalname.toLowerCase().endsWith(".zip");

          if (isZipFile) {
            // Extract ZIP file
            const extractDir = path.join(os.tmpdir(), `zip_extract_${uuidv4()}`);
            fs.mkdirSync(extractDir, { recursive: true });
            extractDirsToCleanup.push(extractDir);
            zipFilesToCleanup.push(uploadedFile.path);

            console.log(`📦 Extracting ZIP file: ${uploadedFile.originalname}`);
            const extractedFiles = await extractZipFile(uploadedFile.path, extractDir);

            if (extractedFiles.length === 0) {
              console.warn(`No files found in ZIP: ${uploadedFile.originalname}`);
              continue;
            }

            console.log(`📁 Extracted ${extractedFiles.length} files from ZIP`);

            // Process each extracted file
            for (const extractedFile of extractedFiles) {
              try {
                // Get file stats
                const stats = fs.statSync(extractedFile.extractedPath);
                if (!stats.isFile()) {
                  continue; // Skip directories
                }

                // Determine media type from extracted file
                const fileExtension = path.extname(extractedFile.originalName);
                const mimeType = getMimeTypeFromExtension(extractedFile.originalName);
                const mediaType = determineMediaType(mimeType, extractedFile.originalName);

                // Determine document type based on media type
                const documentType = determineDocumentType(mediaType);

                // Generate unique filename for the document
                const fileNameWithoutExt = path.basename(extractedFile.originalName, fileExtension);
                const randomNumber = Math.floor(Math.random() * 10000);
                const fileName = `${fileNameWithoutExt}_${randomNumber}${fileExtension}`;
                const finalPath = path.join(uploadDir, fileName);

                // Copy extracted file to final location
                fs.copyFileSync(extractedFile.extractedPath, finalPath);

                // Verify file was copied successfully
                if (!fs.existsSync(finalPath)) {
                  throw new Error(`Failed to save extracted file: ${extractedFile.originalName}`);
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
                  filename: extractedFile.originalName,
                  media_type: mediaType,
                  document_type: "documents",
                  created_type: "upload",
                  download_url: `/uploads/${year}/${month}/${orderNumber}/documents/${fileName}`,
                  file_size: extractedFile.size || stats.size,
                  uploaded_at: new Date(),
                });
              } catch (extractedFileError) {
                console.error(
                  `Error processing extracted file ${extractedFile.originalName}:`,
                  extractedFileError
                );
                // Continue with other files even if one fails
              }
            }
          } else {
            // Process normal (non-ZIP) file
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
          }
        } catch (fileError) {
          console.error(`Error processing file ${uploadedFile.originalname}:`, fileError);
          // Continue with other files even if one fails
        }
      }

      // Clean up ZIP files and extraction directories
      for (const zipPath of zipFilesToCleanup) {
        try {
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
          }
        } catch (cleanupError) {
          console.error(`Error cleaning up ZIP file ${zipPath}:`, cleanupError);
        }
      }

      for (const extractDir of extractDirsToCleanup) {
        try {
          deleteDirectory(extractDir);
        } catch (cleanupError) {
          console.error(`Error cleaning up extraction directory ${extractDir}:`, cleanupError);
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
      // Clean up ZIP files and extraction directories
      for (const zipPath of zipFilesToCleanup) {
        try {
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
          }
        } catch (cleanupError) {
          console.error(`Error cleaning up ZIP file ${zipPath}:`, cleanupError);
        }
      }

      for (const extractDir of extractDirsToCleanup) {
        try {
          deleteDirectory(extractDir);
        } catch (cleanupError) {
          console.error(`Error cleaning up extraction directory ${extractDir}:`, cleanupError);
        }
      }

      // Clean up temp files if they exist
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          if (file.path && fs.existsSync(file.path)) {
            try {
              fs.unlinkSync(file.path);
            } catch (cleanupError) {
              console.error(`Error cleaning up temp file ${file.path}:`, cleanupError);
            }
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
 * For BANK OFFICER and BANK AUTHORITY: only returns approved reports and collages
 * For other users: returns all documents
 */
exports.getCollagesByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const user = req.user;

    // Check if user is BANK OFFICER or BANK AUTHORITY
    const roleName = (user.role_name || "").toUpperCase();
    const isBankOfficerOrAuthority = 
      roleName.includes("BANK OFFICER") || roleName.includes("BANK AUTHORITY");

    let result;

    if (isBankOfficerOrAuthority) {
      // For BANK OFFICER and BANK AUTHORITY: only get approved reports and collages
      const allDocuments = await orderMediaDocument.findByOrderId(parseInt(orderId));
      result = allDocuments.filter(
        (doc) =>
          doc.status === "approved" &&
          (doc.document_type === "report" || doc.document_type === "collage")
      );
    } else {
      // For other users: get all documents
      result = await orderMediaDocument.findByOrderId(parseInt(orderId));
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get approved documents for a specific order
 * GET /api/order-media-document/:orderId/approved
 */
exports.getApprovedByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      throw new BadRequestError("orderId is required");
    }

    const result = await orderMediaDocument.findApprovedByOrderId(parseInt(orderId));

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
 * Approve multiple documents for an order
 * POST /api/order-media-document/:orderId/approve
 * Body: { document_ids: number[] }
 */
exports.approveByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { document_ids } = req.body;

    if (!orderId) {
      throw new BadRequestError("orderId is required");
    }

    if (!Array.isArray(document_ids) || document_ids.length === 0) {
      throw new BadRequestError("document_ids must be a non-empty array");
    }

    const { updated } = await orderMediaDocument.approveByIdsForOrder(
      parseInt(orderId),
      document_ids.map((id) => parseInt(id)),
      req.user?.id
    );

    res.json({
      success: true,
      message: `${updated} document(s) approved`,
      data: { updated },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Remove approval (set status to null) for multiple documents for an order
 * POST /api/order-media-document/:orderId/remove-approve
 * Body: { document_ids: number[] }
 */
exports.removeApprovalByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { document_ids } = req.body;

    if (!orderId) {
      throw new BadRequestError("orderId is required");
    }

    if (!Array.isArray(document_ids) || document_ids.length === 0) {
      throw new BadRequestError("document_ids must be a non-empty array");
    }

    const { updated } = await orderMediaDocument.removeApprovalByIdsForOrder(
      parseInt(orderId),
      document_ids.map((id) => parseInt(id)),
      req.user?.id
    );

    res.json({
      success: true,
      message: `${updated} document(s) approval removed`,
      data: { updated },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(filename) {
  const extension = path.extname(filename).toLowerCase();
  const mimeTypes = {
    // Images
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    // Documents
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Text files
    ".txt": "text/plain",
    ".csv": "text/csv",
    // Archives
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
    ".7z": "application/x-7z-compressed",
  };

  return mimeTypes[extension] || "application/octet-stream";
}

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