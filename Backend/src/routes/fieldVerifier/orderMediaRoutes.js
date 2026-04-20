const express = require("express");
const router = express.Router();
const multer = require("multer");
const orderMediaController = require("../../controllers/fieldVerifier/orderMediaController");
const mobileAuth = require("../../middleware/mobileAuth");
const path = require("path");

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, "..", "tmp_uploads"),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit
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
  express.json({ limit: "200mb" }),
  orderMediaController.uploadBase64
);

// Combined endpoint: accepts multipart files, base64 files, or BOTH in the
// same request. Content-Type decides how the body is parsed so multer does
// not run on JSON payloads and express.json does not run on multipart
// payloads. In multipart mode, a body field named `files` may additionally
// carry a JSON string array of base64 items.
const combinedParser = (req, res, next) => {
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  if (contentType.startsWith("multipart/form-data")) {
    return upload.any()(req, res, next);
  }
  return express.json({ limit: "200mb" })(req, res, next);
};

router.post(
  "/upload-combined",
  combinedParser,
  orderMediaController.uploadCombined
);

module.exports = router;
