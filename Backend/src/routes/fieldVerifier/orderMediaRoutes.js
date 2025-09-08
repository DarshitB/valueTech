const express = require("express");
const router = express.Router();
const multer = require("multer");
const orderMediaController = require("../../controllers/fieldVerifier/orderMediaController");
const mobileAuth = require("../../middleware/mobileAuth");
const path = require("path");

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, "..", "tmp_uploads"),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed"));
    }
  },
});

// Apply auth middleware
router.use(mobileAuth);

// Routes
router.post(
  "/upload",
  upload.any(), // Accept any field name for files
  orderMediaController.uploadMultipart
);
router.post(
  "/upload-base64",
  /* express.json({ limit: "50mb" }), */
  orderMediaController.uploadBase64
);

module.exports = router;
