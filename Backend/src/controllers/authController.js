const User = require("../models/user/user");
const Role = require("../models/permissions/role");
const db = require("../../db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { NotFoundError, BadRequestError } = require("../utils/customErrors");
const { getDeviceDetails } = require("../utils/deviceData");

/* exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      throw new BadRequestError("email and password are required");

    const user = await User.findByUsername(email);
    if (!user) throw new NotFoundError("User not found");

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new BadRequestError("Invalid password");

    const role = await Role.findById(user.role_id);

    // 👇 Check if role name is 'developer_admin'
    let rolePermissions = [];
    if (role.name === "developer_admin") {
      // Get all permissions
      rolePermissions = await db("permissions").select("name");
    } else {
      // Get permissions assigned to the role
      rolePermissions = await Role.getPermissions(user.role_id);
    }

    const deviceInfo = getDeviceDetails(req);

    await db("activity_logs").insert({
      user_id: user.id,
      action: "login",
      table_name: null,
      record_id: null,
      metadata: {
        ip: req.ip,
        user_agent: req.headers["user-agent"],
        device_info: deviceInfo,
      },
    }); // Log login activity

    const token = jwt.sign(
      { userId: user.id, roleId: user.role_id },
      process.env.JWT_SECRET,
      { expiresIn: "3h" }
    );

    // res.json({
    //  token,
    //  user: {
    //    id: user.id,
    //    email: user.email,
    //    role: {
    //      id: role.id,
    //      name: role.name,
    //      permissions: rolePermissions.map((p) => p.name),
    //    },
    //  },
    //});
    res.json({
      token,
    });
  } catch (err) {
    next(err);
  }
}; */
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    /* console.log(req.body); */
    // ✅ Validate required fields
    if (!username || !password) {
      throw new BadRequestError("Username and password are required");
    }

    // ✅ Find user by email
    const user = await User.findByEmailOrMobile(username);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // ✅ Compare hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestError("Invalid password");
    }

    // ✅ Get user role & permissions
    const role = await Role.findById(user.role_id);
    let permissions = [];

    if (role.name === "developer_admin") {
      // Developer admin gets all permissions
      permissions = await db("permissions").select("name");
    } else {
      // Get permissions assigned to this role
      permissions = await Role.getPermissions(role.id);
    }

    // ✅ Generate JWT Token
    const token = jwt.sign(
      { userId: user.id, roleId: user.role_id },
      process.env.JWT_SECRET,
      { expiresIn: "14h" }
    );

    // ✅ Store active token in database (for single session login)
    await db("users").where({ id: user.id }).update({
      active_token: token,
    });

    // ✅ Log activity
    await db("activity_logs").insert({
      user_id: user.id,
      action: "login",
      table_name: null,
      record_id: null,
      metadata: {
        ip: req.ip,
        user_agent: req.headers["user-agent"],
        device_info: getDeviceDetails(req),
      },
    });

    // ✅ Send response (only token for now)
    res.json({ token });

    // 👉 To include user info in response, uncomment below:
    /*
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: {
          id: role.id,
          name: role.name,
          permissions: permissions.map(p => p.name),
        },
      },
    });
    */
  } catch (err) {
    next(err);
  }
};
exports.logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Clear active token from database
    await db("users").where({ id: decoded.userId }).update({
      active_token: null,
    });

    // Log the logout activity
    await db("activity_logs").insert({
      user_id: decoded.userId,
      action: "logout",
      table_name: null,
      record_id: null,
      metadata: {
        ip: req.ip,
        user_agent: req.headers["user-agent"],
        device_info: getDeviceDetails(req),
      },
    });

    res.json({ 
      success: true,
      message: "Logged out successfully" 
    });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const userId = req.user?.id; // comes from decoded token in auth middleware

    if (!userId) throw new BadRequestError("Invalid user");

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    /* console.log(user); */
    const role = await Role.findById(user.role_id);

    let permissions = [];
    if (role.name === "developer_admin") {
      permissions = await db("permissions").select("name");
    } else {
      permissions = await Role.getPermissions(user.role_id);
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      mobile: user.mobile,
      city_id: user.city_id,
      city_name: user.city_name,
      role: {
        id: role.id,
        name: role.name,
      },
      permissions: permissions.map((p) => p.name),
    });
  } catch (err) {
    next(err);
  }
};

// ✅ Generate OTP
exports.generateOtp = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      throw new BadRequestError("Username and password are required");
    }

    // Find user by email or mobile
    const user = await User.findByEmailOrMobile(username);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check if user is locked due to too many failed attempts
    if (user.otp_locked_until && new Date() < new Date(user.otp_locked_until)) {
      const remainingTime = Math.ceil((new Date(user.otp_locked_until) - new Date()) / 60000);
      throw new BadRequestError(`Account is locked due to too many failed OTP attempts. Please try again after ${remainingTime} minutes`);
    }

    // If lock period has expired, reset the lock
    if (user.otp_locked_until && new Date() >= new Date(user.otp_locked_until)) {
      await db("users").where({ id: user.id }).update({
        otp_attempts: 0,
        otp_locked_until: null,
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestError("Invalid password");
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set OTP expiry to 5 minutes from now
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Store OTP, expiry and reset attempts in database
    await db("users").where({ id: user.id }).update({
      otp: otp,
      otp_expiry: otpExpiry,
      otp_attempts: 0, // Reset attempts when new OTP is generated
    });

    // Log activity
    await db("activity_logs").insert({
      user_id: user.id,
      action: "generate_otp",
      table_name: "users",
      record_id: user.id,
      metadata: {
        ip: req.ip,
        user_agent: req.headers["user-agent"],
        device_info: getDeviceDetails(req),
      },
    });

    // ⚠️ In production, send OTP via SMS/Email service
    res.json({
      success: true,
      message: "OTP generated successfully",
    });
  } catch (err) {
    next(err);
  }
};

// ✅ Verify OTP
exports.verifyOtp = async (req, res, next) => {
  try {
    const { username, otp } = req.body;

    // Validate required fields
    if (!username || !otp) {
      throw new BadRequestError("Username and OTP are required");
    }

    // Find user by email or mobile
    const user = await User.findByEmailOrMobile(username);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Check if user is locked due to too many failed attempts
    if (user.otp_locked_until && new Date() < new Date(user.otp_locked_until)) {
      const remainingTime = Math.ceil((new Date(user.otp_locked_until) - new Date()) / 60000);
      throw new BadRequestError(`Account is locked due to too many failed OTP attempts. Please try again after ${remainingTime} minutes`);
    }

    // Check if OTP exists
    if (!user.otp) {
      throw new BadRequestError("No OTP found. Please generate OTP first");
    }

    // Check if OTP is expired
    if (new Date() > new Date(user.otp_expiry)) {
      throw new BadRequestError("OTP has expired. Please generate a new one");
    }

    // Verify OTP
    if (user.otp !== otp) {
      // Increment failed attempts
      const newAttempts = (user.otp_attempts || 0) + 1;
      const maxAttempts = 5;

      if (newAttempts >= maxAttempts) {
        // Lock account for 15 minutes after 5 failed attempts
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        
        await db("users").where({ id: user.id }).update({
          otp_attempts: newAttempts,
          otp_locked_until: lockUntil,
        });

        // Log failed attempt
        await db("activity_logs").insert({
          user_id: user.id,
          action: "otp_verification_locked",
          table_name: null,
          record_id: null,
          metadata: {
            ip: req.ip,
            user_agent: req.headers["user-agent"],
            device_info: getDeviceDetails(req),
            attempts: newAttempts,
          },
        });

        throw new BadRequestError(`Too many failed attempts. Account locked for 15 minutes`);
      } else {
        // Just increment attempts
        await db("users").where({ id: user.id }).update({
          otp_attempts: newAttempts,
        });

        // Log failed attempt
        await db("activity_logs").insert({
          user_id: user.id,
          action: "otp_verification_failed",
          table_name: null,
          record_id: null,
          metadata: {
            ip: req.ip,
            user_agent: req.headers["user-agent"],
            device_info: getDeviceDetails(req),
            attempts: newAttempts,
            remaining: maxAttempts - newAttempts,
          },
        });

        throw new BadRequestError(`Invalid OTP. ${maxAttempts - newAttempts} attempts remaining`);
      }
    }

    // OTP is correct - Clear OTP and reset attempts
    await db("users").where({ id: user.id }).update({
      otp: null,
      otp_expiry: null,
      otp_attempts: 0,
      otp_locked_until: null,
    });

    // Log successful verification
    await db("activity_logs").insert({
      user_id: user.id,
      action: "verify_otp_success",
      table_name: null,
      record_id: null,
      metadata: {
        ip: req.ip,
        user_agent: req.headers["user-agent"],
        device_info: getDeviceDetails(req),
      },
    });

    // Send simple success response
    res.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (err) {
    next(err);
  }
};