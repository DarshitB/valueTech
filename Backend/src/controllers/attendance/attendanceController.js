const Attendance = require("../../models/attendance/attendance");
const AttendanceBreak = require("../../models/attendance/attendanceBreak");
const User = require("../../models/user/user");
const {
  NotFoundError,
  BadRequestError,
} = require("../../utils/customErrors");

const toWorkingDateStr = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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

exports.getBreaksByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) throw new BadRequestError("User ID is required");
    const breaks = await AttendanceBreak.getByUserId(userId);
    res.json(breaks);
  } catch (err) {
    next(err);
  }
};

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

    const openBreak = await AttendanceBreak.getOpenByAttendanceId(
      lastRecord.id
    );
    res.json({ ...lastRecord, open_break: openBreak || null });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { user_id, checkin_via } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const user = await User.findById(user_id);
    if (!user) throw new NotFoundError("User not found");

    const lastRecord = await Attendance.getLastRecordByUserId(user_id);
    if (lastRecord && (!lastRecord.checkin_time || !lastRecord.checkout_time)) {
      throw new BadRequestError(
        "Cannot create new attendance record. Please complete your previous check-out first."
      );
    }

    const currentDate = new Date();
    const [attendance] = await Attendance.create({
      user_id,
      working_date: currentDate.toISOString().split("T")[0],
      checkin_time: currentDate,
      checkin_via: checkin_via || null,
    });

    res.status(201).json({
      ...attendance,
      user_name: user.name || null,
      open_break: null,
    });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { user_id, checkout_remarks } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const user = await User.findById(user_id);
    if (!user) throw new NotFoundError("User not found");

    const lastRecord = await Attendance.getLastRecordByUserId(user_id);
    if (!lastRecord) {
      throw new BadRequestError(
        "No attendance record found for this user. Please check-in first."
      );
    }
    if (lastRecord.checkout_time) {
      throw new BadRequestError(
        "Checkout time is already set for this record. Please create a new attendance entry for check-in."
      );
    }
    if (!lastRecord.checkin_time) {
      throw new BadRequestError(
        "Checkin time is not set for this record. Cannot update checkout."
      );
    }
    if (lastRecord.lunch_in && !lastRecord.lunch_out) {
      throw new BadRequestError("Please complete lunch out before day out.");
    }

    const openBreak = await AttendanceBreak.getOpenByAttendanceId(
      lastRecord.id
    );
    if (openBreak) {
      throw new BadRequestError("Please complete break out before day out.");
    }

    const updateData = { checkout_time: new Date() };
    if (checkout_remarks !== undefined && checkout_remarks !== null) {
      updateData.checkout_remarks = checkout_remarks;
    }

    const [updated] = await Attendance.update(lastRecord.id, updateData);
    res.json({ ...updated, user_name: user.name || null, open_break: null });
  } catch (err) {
    next(err);
  }
};

const getOpenAttendanceForUser = async (user_id) => {
  const user = await User.findById(user_id);
  if (!user) throw new NotFoundError("User not found");

  const lastRecord = await Attendance.getLastRecordByUserId(user_id);
  if (!lastRecord || !lastRecord.checkin_time || lastRecord.checkout_time) {
    throw new BadRequestError(
      "No active day in record found. Please day in first."
    );
  }
  return { user, lastRecord };
};

exports.lunchIn = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const { user, lastRecord } = await getOpenAttendanceForUser(user_id);
    if (lastRecord.lunch_in) {
      throw new BadRequestError("Lunch in is already recorded for today.");
    }

    const openBreak = await AttendanceBreak.getOpenByAttendanceId(
      lastRecord.id
    );
    if (openBreak) {
      throw new BadRequestError("Please complete break out before lunch in.");
    }

    const [updated] = await Attendance.update(lastRecord.id, {
      lunch_in: new Date(),
    });
    res.json({ ...updated, user_name: user.name || null, open_break: null });
  } catch (err) {
    next(err);
  }
};

exports.lunchOut = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const { user, lastRecord } = await getOpenAttendanceForUser(user_id);
    if (!lastRecord.lunch_in) {
      throw new BadRequestError("Please lunch in before lunch out.");
    }
    if (lastRecord.lunch_out) {
      throw new BadRequestError("Lunch out is already recorded for today.");
    }

    const openBreak = await AttendanceBreak.getOpenByAttendanceId(
      lastRecord.id
    );
    if (openBreak) {
      throw new BadRequestError("Please complete break out before lunch out.");
    }

    const [updated] = await Attendance.update(lastRecord.id, {
      lunch_out: new Date(),
    });
    res.json({ ...updated, user_name: user.name || null, open_break: null });
  } catch (err) {
    next(err);
  }
};

// UI Break In = start break → DB break_out
exports.breakIn = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const { user, lastRecord } = await getOpenAttendanceForUser(user_id);

    if (lastRecord.lunch_in && !lastRecord.lunch_out) {
      throw new BadRequestError(
        "Cannot start break while lunch is in progress."
      );
    }

    const existingOpen = await AttendanceBreak.getOpenByAttendanceId(
      lastRecord.id
    );
    if (existingOpen) {
      throw new BadRequestError(
        "Break already in progress. Please break out first."
      );
    }

    const now = new Date();
    const workingDate =
      toWorkingDateStr(lastRecord.working_date) ||
      now.toISOString().split("T")[0];

    const [created] = await AttendanceBreak.create({
      attendance_id: lastRecord.id,
      user_id,
      working_date: workingDate,
      break_out: now,
      break_in: null,
      created_by: req.user?.id || user_id,
      created_at: now,
    });

    res.status(201).json({
      ...lastRecord,
      user_name: user.name || null,
      open_break: created,
    });
  } catch (err) {
    next(err);
  }
};

// UI Break Out = end break → DB break_in
exports.breakOut = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const { user, lastRecord } = await getOpenAttendanceForUser(user_id);

    const openBreak = await AttendanceBreak.getOpenByAttendanceId(
      lastRecord.id
    );
    if (!openBreak) {
      throw new BadRequestError(
        "No active break found. Please break in first."
      );
    }

    const now = new Date();
    const [updatedBreak] = await AttendanceBreak.update(openBreak.id, {
      break_in: now,
      updated_by: req.user?.id || user_id,
      updated_at: now,
    });

    res.json({
      ...lastRecord,
      user_name: user.name || null,
      open_break: null,
      closed_break: updatedBreak,
    });
  } catch (err) {
    next(err);
  }
};
