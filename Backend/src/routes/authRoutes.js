const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', auth, authController.getMe);

// OTP endpoints
router.post('/generate-otp', authController.generateOtp);
router.post('/verify-otp', authController.verifyOtp);

module.exports = router;
