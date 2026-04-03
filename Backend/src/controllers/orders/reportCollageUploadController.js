const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Order = require("../../models/orders/order");
const orderMediaDocument = require("../../models/orders/orderMediaDocument");
const OrderStatusHistory = require("../../models/orders/orderStatusHistory");
const { ensureDirectoryExists } = require("../../utils/localFileHelper");
const {
  NotFoundError,
  BadRequestError,
} = require("../../utils/customErrors");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "tmp_uploads");
    ensureDirectoryExists(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new BadRequestError("Only PDF files are allowed"), false);
    }
  },
});

/**
 * Helper function to generate unique filename from original filename
 * Format: originalname_randomchars.pdf
 * @param {string} originalFilename - Original filename from upload
 * @param {string} uploadDir - Directory where file will be stored
 * @returns {string} Unique filename
 */
function generateUniqueFilename(originalFilename, uploadDir) {
  // Get file extension
  const fileExtension = path.extname(originalFilename);
  // Get filename without extension
  const fileNameWithoutExt = path.basename(originalFilename, fileExtension);
  
  // Sanitize filename (remove special characters that might cause issues)
  const sanitizedBaseName = fileNameWithoutExt
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
    .substring(0, 100); // Limit length to 100 characters
  
  // Generate random characters (8 alphanumeric characters)
  const randomChars = Math.random().toString(36).substring(2, 10);
  
  // Create filename: originalname_randomchars.pdf
  let finalFileName = `${sanitizedBaseName}_${randomChars}${fileExtension}`;
  
  // Ensure directory exists
  ensureDirectoryExists(uploadDir);
  
  // Check if file already exists, if so, generate new random chars
  let attempts = 0;
  const maxAttempts = 10;
  while (fs.existsSync(path.join(uploadDir, finalFileName)) && attempts < maxAttempts) {
    const newRandomChars = Math.random().toString(36).substring(2, 10);
    finalFileName = `${sanitizedBaseName}_${newRandomChars}${fileExtension}`;
    attempts++;
  }
  
  // If still exists after max attempts, add timestamp
  if (fs.existsSync(path.join(uploadDir, finalFileName))) {
    const timestamp = Date.now();
    finalFileName = `${sanitizedBaseName}_${timestamp}_${randomChars}${fileExtension}`;
  }
  
  return finalFileName;
}

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
        activity_extra: "Both report and collage uploaded",
      };
      
      await OrderStatusHistory.createStatusHistory(statusHistoryData);
    }
  } catch (error) {
    console.error("Error checking/updating order status:", error);
    // Don't throw error - this is a non-critical operation
  }
}

/**
 * Upload Report or Collage PDF
 * POST /api/orders-reports-collages/upload
 * 
 * Body (multipart/form-data):
 * - file: PDF file to upload
 * - order_id: Order ID
 * - type: "report" or "collage"
 */
exports.upload = [
  upload.single("file"),
  async (req, res, next) => {
    try {
      const { order_id, type } = req.body;
      const { id: userId } = req.user;
      const uploadedFile = req.file;

      // Validate input
      if (!order_id) {
        throw new BadRequestError("order_id is required");
      }

      if (!type) {
        throw new BadRequestError("type is required. Must be 'report' or 'collage'");
      }

      if (type !== "report" && type !== "collage") {
        throw new BadRequestError("type must be either 'report' or 'collage'");
      }

      if (!uploadedFile) {
        throw new BadRequestError("No file uploaded. Please upload a PDF file.");
      }

      // Validate file is PDF
      if (
        uploadedFile.mimetype !== "application/pdf" &&
        !uploadedFile.originalname.toLowerCase().endsWith(".pdf")
      ) {
        throw new BadRequestError("Only PDF files are allowed");
      }

      // Get order details
      const order = await Order.findById(order_id, req.user);
      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Create upload directory structure: uploads/YYYY/MMM/orderNumber/reports/ or collages/
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = now.toLocaleString("en-US", { month: "short" });
      const orderNumber = order.order_number;

      const folderName = type === "report" ? "reports" : "collages";
      const uploadDir = path.join(
        process.cwd(),
        "uploads",
        year,
        month,
        orderNumber,
        folderName
      );
      ensureDirectoryExists(uploadDir);

      // Generate unique filename from original filename
      const fileName = generateUniqueFilename(uploadedFile.originalname, uploadDir);
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
        media_url: `/uploads/${year}/${month}/${orderNumber}/${folderName}/${fileName}`,
        media_type: "pdf",
        document_type: type,
        created_type: "upload",
        created_by: userId,
        created_at: new Date(),
      };

      const documentId = await orderMediaDocument.createDocument(documentData);

      // Set document ID for activity logger
      res.locals.documentId = documentId;

      // Check current documents to determine status
      const documents = await orderMediaDocument.findByOrderId(order.id);
      const hasReport = documents.some((doc) => doc.document_type === "report");
      const hasCollage = documents.some((doc) => doc.document_type === "collage");

      // Create status history entry for upload
      let statusId;
      let activityExtra;
      
      if (hasReport && hasCollage) {
        // Both report and collage exist - status 9 (Under Review)
        statusId = 9;
        activityExtra = `${type === "report" ? "Report" : "Collage"} uploaded. Both report and collage completed`;
        
        // Update order status to 9
        await Order.updateOrder(order.id, {
          current_status_id: 9,
          updated_at: new Date(),
          updated_by: userId,
        });
      } else {
        // Only one exists - status 8 (Documentation In Progress)
        statusId = 8;
        activityExtra = `${type === "report" ? "Report" : "Collage"} uploaded`;
        
        // Update order status to 8 if current status is lower
        if (order.current_status_id < 8) {
          await Order.updateOrder(order.id, {
            current_status_id: 8,
            updated_at: new Date(),
            updated_by: userId,
          });
        }
      }

      // Create status history entry
      const statusHistoryData = {
        order_id: order.id,
        status_id: statusId,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: activityExtra,
      };
      await OrderStatusHistory.createStatusHistory(statusHistoryData);

      // Return success response
      res.json({
        success: true,
        message: `${type === "report" ? "Report" : "Collage"} uploaded successfully`,
        data: {
          id: documentId,
          download_url: `/uploads/${year}/${month}/${orderNumber}/${folderName}/${fileName}`,
          filename: fileName,
          original_filename: uploadedFile.originalname,
          file_size: uploadedFile.size,
          document_type: type,
          created_type: "upload",
          order_id: parseInt(order_id),
          uploaded_at: new Date(),
        },
      });
    } catch (err) {
      // Clean up temp file if it exists
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Error cleaning up temp file:", cleanupError);
        }
      }
      next(err);
    }
  },
];

/**
 * Upload Multiple Reports or Collages
 * POST /api/orders-reports-collages/upload-multiple
 * 
 * Body (multipart/form-data):
 * - files: Array of PDF files to upload
 * - order_id: Order ID
 * - type: "report" or "collage"
 */
exports.uploadMultiple = [
  upload.array("files", 10), // Allow up to 10 files
  async (req, res, next) => {
    try {
      const { order_id, type } = req.body;
      const { id: userId } = req.user;
      const uploadedFiles = req.files;

      // Validate input
      if (!order_id) {
        throw new BadRequestError("order_id is required");
      }

      if (!type) {
        throw new BadRequestError("type is required. Must be 'report' or 'collage'");
      }

      if (type !== "report" && type !== "collage") {
        throw new BadRequestError("type must be either 'report' or 'collage'");
      }

      if (!uploadedFiles || !Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        throw new BadRequestError("No files uploaded. Please upload at least one PDF file.");
      }

      // Get order details
      const order = await Order.findById(order_id, req.user);
      if (!order) {
        throw new NotFoundError("Order not found");
      }

      // Create upload directory structure
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = now.toLocaleString("en-US", { month: "short" });
      const orderNumber = order.order_number;

      const folderName = type === "report" ? "reports" : "collages";
      const uploadDir = path.join(
        process.cwd(),
        "uploads",
        year,
        month,
        orderNumber,
        folderName
      );
      ensureDirectoryExists(uploadDir);

      // Process all uploaded files
      const uploadedDocuments = [];
      const tempPaths = [];

      for (let i = 0; i < uploadedFiles.length; i++) {
        const uploadedFile = uploadedFiles[i];
        tempPaths.push(uploadedFile.path);

        try {
          // Validate file is PDF
          if (
            uploadedFile.mimetype !== "application/pdf" &&
            !uploadedFile.originalname.toLowerCase().endsWith(".pdf")
          ) {
            console.error(`Skipping non-PDF file: ${uploadedFile.originalname}`);
            continue;
          }

          // Generate unique filename from original filename
          const fileName = generateUniqueFilename(uploadedFile.originalname, uploadDir);
          const finalPath = path.join(uploadDir, fileName);

          // Move file from temp to final location
          fs.renameSync(uploadedFile.path, finalPath);
          tempPaths.pop(); // Remove from temp paths since it's been moved

          // Verify file was moved successfully
          if (!fs.existsSync(finalPath)) {
            throw new Error(`Failed to save uploaded file: ${uploadedFile.originalname}`);
          }

          // Save document record to database
          const documentData = {
            order_id: order.id,
            media_url: `/uploads/${year}/${month}/${orderNumber}/${folderName}/${fileName}`,
            media_type: "pdf",
            document_type: type,
            created_type: "upload",
            created_by: userId,
            created_at: new Date(),
          };

          const documentId = await orderMediaDocument.createDocument(documentData);

          // Add to uploaded documents list
          uploadedDocuments.push({
            id: documentId,
            download_url: `/uploads/${year}/${month}/${orderNumber}/${folderName}/${fileName}`,
            filename: fileName,
            original_filename: uploadedFile.originalname,
            file_size: uploadedFile.size,
            document_type: type,
            created_type: "upload",
            uploaded_at: new Date(),
          });
        } catch (fileError) {
          console.error(`Error processing file ${uploadedFile.originalname}:`, fileError);
          // Continue with other files even if one fails
        }
      }

      // Clean up any remaining temp files
      tempPaths.forEach((tempPath) => {
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch (cleanupError) {
            console.error("Error cleaning up temp file:", cleanupError);
          }
        }
      });

      // Check if any files were successfully uploaded
      if (uploadedDocuments.length === 0) {
        throw new BadRequestError("No files were successfully uploaded. Please ensure all files are PDF format.");
      }

      // Set document ID for activity logger (use first document ID)
      res.locals.documentId = uploadedDocuments[0].id;

      // Check current documents to determine status
      const documents = await orderMediaDocument.findByOrderId(order.id);
      const hasReport = documents.some((doc) => doc.document_type === "report");
      const hasCollage = documents.some((doc) => doc.document_type === "collage");

      // Create status history entry for upload
      let statusId;
      let activityExtra;
      
      if (hasReport && hasCollage) {
        // Both report and collage exist - status 9 (Under Review)
        statusId = 9;
        activityExtra = `${uploadedDocuments.length} ${type}(s) uploaded. Both report and collage completed`;
        
        // Update order status to 9
        await Order.updateOrder(order.id, {
          current_status_id: 9,
          updated_at: new Date(),
          updated_by: userId,
        });
      } else {
        // Only one exists - status 8 (Documentation In Progress)
        statusId = 8;
        activityExtra = `${uploadedDocuments.length} ${type}(s) uploaded`;
        
        // Update order status to 8 if current status is lower
        if (order.current_status_id < 8) {
          await Order.updateOrder(order.id, {
            current_status_id: 8,
            updated_at: new Date(),
            updated_by: userId,
          });
        }
      }

      // Create status history entry
      const statusHistoryData = {
        order_id: order.id,
        status_id: statusId,
        changed_by: userId,
        changed_at: new Date(),
        activity_extra: activityExtra,
      };
      await OrderStatusHistory.createStatusHistory(statusHistoryData);

      // Return success response
      res.json({
        success: true,
        message: `${uploadedDocuments.length} ${type}(s) uploaded successfully`,
        data: {
          total_uploaded: uploadedDocuments.length,
          documents: uploadedDocuments,
          order_id: parseInt(order_id),
        },
      });
    } catch (err) {
      // Clean up temp files if they exist
      if (req.files && Array.isArray(req.files)) {
        req.files.forEach((file) => {
          if (file.path && fs.existsSync(file.path)) {
            try {
              fs.unlinkSync(file.path);
            } catch (cleanupError) {
              console.error("Error cleaning up temp file:", cleanupError);
            }
          }
        });
      }
      next(err);
    }
  },
];

// Export multer middleware for use in routes
exports.uploadMiddleware = upload;

