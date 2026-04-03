const express = require("express");
const router = express.Router();

const notificationController = require("../../controllers/notifications/notificationController");
const auth = require("../../middleware/auth");

// Apply authentication middleware to all routes
router.use(auth);

// Get unread notifications (with optional last_check filter)
router.get("/", notificationController.getNotifications);

// Get all notifications (read and unread)
router.get("/all", notificationController.getAllNotifications);

// Mark a specific notification as read
router.post("/:id/read", notificationController.markAsRead);

// Mark all notifications as read for the current user
router.post("/read-all", notificationController.markAllAsRead);

module.exports = router;

