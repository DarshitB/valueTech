const Attendance = require("../../models/attendance/attendance");
const User = require("../../models/user/user");
const {
  NotFoundError,
  BadRequestError,
} = require("../../utils/customErrors");

// Get all attendance records by user ID
exports.getByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) throw new BadRequestError("User ID is required");

    const attendance = await Attendance.getByUserId(userId);
    res.json(attendance);
  } catch (err) {
    next(err);
  }
};

// Get last attendance record for a user
exports.getLastRecord = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) throw new BadRequestError("User ID is required");

    const lastRecord = await Attendance.getLastRecordByUserId(userId);
    
    if (!lastRecord) {
      return res.json({
        message: "No attendance record found for this user",
        data: null,
      });
    }

    res.json(lastRecord);
  } catch (err) {
    next(err);
  }
};

// Create new attendance record
exports.create = async (req, res, next) => {
  try {
    const { user_id, checkin_via } = req.body;

    // Validate required fields
    if (!user_id) {
      throw new BadRequestError("User ID is required");
    }

    // Check if user exists
    const user = await User.findById(user_id);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get the last attendance record for this user
    const lastRecord = await Attendance.getLastRecordByUserId(user_id);

    // Check if the last record is complete (both checkin_time and checkout_time are set)
    if (lastRecord && (!lastRecord.checkin_time || !lastRecord.checkout_time)) {
      // Last record is incomplete, throw error
      throw new BadRequestError(
        "Cannot create new attendance record. Please complete your previous check-out first."
      );
    }

    // Create new attendance record
    const currentDate = new Date();
    const [attendance] = await Attendance.create({
      user_id,
      working_date: currentDate.toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      checkin_time: currentDate, // Current timestamp
      checkin_via: checkin_via || null,
    });

    // Fetch user name for enriched response
    const userName = user.name || null;
    const enriched = { ...attendance, user_name: userName };

    res.status(201).json(enriched);
  } catch (err) {
    next(err);
  }
};

// Update attendance record (for checkout)
exports.update = async (req, res, next) => {
  try {
    const { user_id, checkout_remarks } = req.body;

    if (!user_id) throw new BadRequestError("User ID is required");

    // Check if user exists
    const user = await User.findById(user_id);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get the last attendance record for this user
    const lastRecord = await Attendance.getLastRecordByUserId(user_id);
    
    if (!lastRecord) {
      throw new BadRequestError(
        "No attendance record found for this user. Please check-in first."
      );
    }

    // Check if checkout_time is already set
    if (lastRecord.checkout_time) {
      throw new BadRequestError(
        "Checkout time is already set for this record. Please create a new attendance entry for check-in."
      );
    }

    // Check if checkin_time is set
    if (!lastRecord.checkin_time) {
      throw new BadRequestError(
        "Checkin time is not set for this record. Cannot update checkout."
      );
    }

    // Prepare update data
    const updateData = {
      checkout_time: new Date(), // Current timestamp
    };

    // Add checkout_remarks only if provided
    if (checkout_remarks !== undefined && checkout_remarks !== null) {
      updateData.checkout_remarks = checkout_remarks;
    }

    // Update attendance record
    const [updated] = await Attendance.update(
      lastRecord.id,
      updateData
    );

    // Fetch user name for enriched response
    const userName = user ? user.name : null;
    const enriched = { ...updated, user_name: userName };

    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

