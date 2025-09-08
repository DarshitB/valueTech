const express = require("express");
const router = express.Router();

const mobileAuthController = require("../../controllers/fieldVerifier/mobileAuthController");
const orderController = require("../../controllers/orders/orderController");

const mobileAuth = require("../../middleware/mobileAuth"); // Checks if user is authenticated

// Apply auth middleware to all branch routes
router.use(mobileAuth);

router.get("/me", mobileAuthController.getMe);
router.get("/orders", orderController.getForMobile);

module.exports = router;
