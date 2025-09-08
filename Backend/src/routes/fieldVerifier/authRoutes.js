const express = require("express");
const router = express.Router();

const mobileAuthController = require("../../controllers/fieldVerifier/mobileAuthController");

// Mobile Verifier Login
router.post("/login", mobileAuthController.login);

// Mobile Verifier Logout
router.post("/logout", mobileAuthController.logout);

module.exports = router;
