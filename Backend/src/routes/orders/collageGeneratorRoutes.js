const express = require("express");
const router = express.Router();

const collageGeneratorController = require("../../controllers/orders/collageGeneratorController");

const auth = require("../../middleware/auth"); // Middleware to check authentication
const checkPermission = require("../../middleware/permission"); // Middleware to check user permissions
const activityLogger = require("../../middleware/activityLogger"); // Middleware to log user activity

router.use(auth); // Apply authentication middleware to all routes

router.post(
  "/generate",
  checkPermission("generate_order_collage"), // Check if user has permission to generate collages
  activityLogger("order_media_documents", (req, res) => res.locals.documentId, "Collage Generation"), // Log collage generation activity
  collageGeneratorController.generateCollage
);

// POST /api/collage-generator/generate-text-image
// Body: { order_id: number, text: string (required, non-empty) }
// Creates an image with the same text/background styling as collage overlay, saves to order media folder,
// and inserts a row in order_media_image_video with status 4.
router.post(
  "/generate-text-image",
  checkPermission("generate_order_collage"),
  collageGeneratorController.generateTextCollageImage
);

module.exports = router;