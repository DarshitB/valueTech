const db = require("../../../db");
const Attendance = require("../../models/attendance/attendance");
const AttendanceBreak = require("../../models/attendance/attendanceBreak");
const UserLeave = require("../../models/userLeave/userLeave");
const User = require("../../models/user/user");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");
const {
  NotFoundError,
  BadRequestError,
} = require("../../utils/customErrors");

const DAY_OUT_REMARK_PERMISSION = "attendance_user_day_out_remark_update";

const userHasNamedPermission = async (req, permissionName) => {
  if (req.user?.role_name === PROTECTED_ROLE) return true;
  const roleId = req.user?.role_id;
  if (!roleId) return false;
  const permission = await db("permissions")
    .join(
      "role_permissions",
      "permissions.id",
      "role_permissions.permission_id"
    )
    .where({
      "permissions.name": permissionName,
      "role_permissions.role_id": roleId,
    })
    .whereNull("role_permissions.deleted_at")
    .first();
  return Boolean(permission);
};

// Own attendance OR attendance_user_day_out_remark_update
const canUpdateDayOutRemark = async (req, targetUserId) => {
  if (String(req.user?.id) === String(targetUserId)) return true;
  return userHasNamedPermission(req, DAY_OUT_REMARK_PERMISSION);
};

// Order activities by this user on the attendance working date (by when order was updated)
const fetchUserOrderActivitiesForDate = async (userId, workingDate) => {
  if (!userId || !workingDate) return [];

  return db("order_status_history as osh")
    .leftJoin("order_status_master as osm", "osh.status_id", "osm.id")
    .leftJoin("users", "osh.changed_by", "users.id")
    .leftJoin("orders as o", "osh.order_id", "o.id")
    .leftJoin("officers as off", "o.officer_id", "off.id")
    .leftJoin("bank_branch as bb", "off.branch_id", "bb.id")
    .leftJoin("bank as b", "bb.bank_id", "b.id")
    .leftJoin("child_category as cc", "o.child_category_id", "cc.id")
    .select(
      "osh.id",
      "osh.order_id",
      "osh.changed_by",
      "osh.changed_at",
      "osh.activity_extra",
      "osh.user_type",
      "osh.status_id",
      "osm.name as status_name",
      "users.name as changed_by_name",
      "o.order_number",
      "o.customer_name_2",
      "b.name as bank_name",
      "cc.name as category_name"
    )
    .where("osh.changed_by", userId)
    .where(function () {
      this.whereNull("osh.user_type").orWhereNot(
        "osh.user_type",
        "field_verifier"
      );
    })
    .whereRaw("osh.changed_at::date = ?::date", [workingDate])
    .whereNull("o.deleted_at")
    .orderBy("osh.changed_at", "desc")
    .limit(100);
};

// Attendance/break timestamp edits for this attendance day (by record, not by edit calendar day)
const fetchAttendanceEditActivities = async (attendanceId, breakIds = []) => {
  if (!attendanceId && (!breakIds || breakIds.length === 0)) {
    return [];
  }

  return db("activity_logs")
    .leftJoin("users", "activity_logs.user_id", "users.id")
    .select(
      "activity_logs.id",
      "activity_logs.user_id",
      "users.name as changed_by_name",
      "activity_logs.action",
      "activity_logs.table_name",
      "activity_logs.record_id",
      "activity_logs.old_data",
      "activity_logs.new_data",
      "activity_logs.created_at"
    )
    .whereIn("activity_logs.action", [
      "update_work_times",
      "update_break_times",
      "update_checkout_remarks",
    ])
    .where(function () {
      if (attendanceId) {
        this.orWhere({
          "activity_logs.table_name": "attendance",
          "activity_logs.record_id": attendanceId,
        });
      }
      if (breakIds.length) {
        this.orWhere(function () {
          this.where("activity_logs.table_name", "attendance_breaks").whereIn(
            "activity_logs.record_id",
            breakIds
          );
        });
      }
    })
    .orderBy("activity_logs.created_at", "desc")
    .limit(100);
};

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

    const from = toWorkingDateStr(req.query.from);
    const to = toWorkingDateStr(req.query.to);
    if ((req.query.from && !from) || (req.query.to && !to)) {
      throw new BadRequestError("Valid from/to dates (YYYY-MM-DD) are required");
    }
    if (from && to && from > to) {
      throw new BadRequestError("from date cannot be after to date");
    }

    const attendance = await Attendance.getByUserId(userId, { from, to });
    res.json(attendance);
  } catch (err) {
    next(err);
  }
};

exports.getBreaksByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) throw new BadRequestError("User ID is required");

    const from = toWorkingDateStr(req.query.from);
    const to = toWorkingDateStr(req.query.to);
    if ((req.query.from && !from) || (req.query.to && !to)) {
      throw new BadRequestError("Valid from/to dates (YYYY-MM-DD) are required");
    }
    if (from && to && from > to) {
      throw new BadRequestError("from date cannot be after to date");
    }

    const breaks = await AttendanceBreak.getByUserId(userId, { from, to });
    res.json(breaks);
  } catch (err) {
    next(err);
  }
};

// Attendance Date page: all users for one working date (+ breaks + leaves)
exports.getByWorkingDate = async (req, res, next) => {
  try {
    const { workingDate } = req.params;
    const dateMatch =
      typeof workingDate === "string" &&
      workingDate.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) {
      throw new BadRequestError("Valid working date (YYYY-MM-DD) is required");
    }
    const date = dateMatch[1];

    const [attendance, breaks, leaves] = await Promise.all([
      Attendance.getByWorkingDate(date),
      AttendanceBreak.getByWorkingDate(date),
      UserLeave.findCoveringDate(date),
    ]);

    res.json({ attendance, breaks, leaves });
  } catch (err) {
    next(err);
  }
};

// Detail page: one user + one working date (attendance + breaks)
exports.getDetailByUserAndDate = async (req, res, next) => {
  try {
    const { userId, workingDate } = req.params;
    if (!userId) throw new BadRequestError("User ID is required");

    const dateMatch =
      typeof workingDate === "string" &&
      workingDate.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) {
      throw new BadRequestError("Valid working date (YYYY-MM-DD) is required");
    }
    const date = dateMatch[1];

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const attendance = await Attendance.getByUserIdAndWorkingDate(
      userId,
      date
    );
    const breaks = attendance?.id
      ? await AttendanceBreak.getByAttendanceId(attendance.id)
      : [];
    const breakIds = breaks.map((b) => b.id).filter(Boolean);

    const [orderActivities, attendanceEditActivities] = await Promise.all([
      fetchUserOrderActivitiesForDate(userId, date),
      fetchAttendanceEditActivities(attendance?.id || null, breakIds),
    ]);

    const activities = [
      ...orderActivities.map((item) => ({
        ...item,
        source: "order",
        activity_at: item.changed_at,
      })),
      ...attendanceEditActivities.map((item) => ({
        ...item,
        source: "attendance",
        activity_at: item.created_at,
      })),
    ].sort(
      (a, b) =>
        new Date(b.activity_at).getTime() - new Date(a.activity_at).getTime()
    );

    res.json({
      attendance: attendance || {
        id: null,
        user_id: Number(userId) || userId,
        user_name: user.name || null,
        working_date: date,
        checkin_time: null,
        checkout_time: null,
        lunch_in: null,
        lunch_out: null,
        checkout_remarks: null,
      },
      breaks,
      activities,
    });
  } catch (err) {
    next(err);
  }
};

// Add/update day-out remarks (own attendance OR attendance_user_day_out_remark_update)
// Only when Day Out is already set for that working date
exports.updateCheckoutRemarks = async (req, res, next) => {
  try {
    const { user_id, working_date, checkout_remarks } = req.body;
    if (!user_id) throw new BadRequestError("User ID is required");

    const date = toWorkingDateStr(working_date);
    if (!date) {
      throw new BadRequestError("Valid working_date (YYYY-MM-DD) is required");
    }

    const allowed = await canUpdateDayOutRemark(req, user_id);
    if (!allowed) {
      return res.status(403).json({
        message:
          "Forbidden: You can only update remarks on your own attendance, or with attendance_user_day_out_remark_update permission",
      });
    }

    const user = await User.findById(user_id);
    if (!user) throw new NotFoundError("User not found");

    const record = await Attendance.getByUserIdAndWorkingDate(user_id, date);
    if (!record?.id) {
      throw new NotFoundError("Attendance record not found for this date");
    }
    if (!record.checkout_time) {
      throw new BadRequestError(
        "Day Out must be set before adding or updating remarks"
      );
    }

    const remarkValue =
      checkout_remarks === undefined || checkout_remarks === null
        ? null
        : String(checkout_remarks).trim() || null;

    res.locals.oldData = {
      id: record.id,
      user_id: record.user_id,
      working_date: record.working_date || date,
      checkout_remarks: record.checkout_remarks ?? null,
    };

    const [updated] = await Attendance.update(record.id, {
      checkout_remarks: remarkValue,
    });

    const fresh = await Attendance.getByUserIdAndWorkingDate(user_id, date);
    const attendancePayload = {
      ...(fresh || updated),
      user_name: user.name || null,
      working_date: date,
    };

    res.locals.newRecordId = attendancePayload.id;
    req.body = {
      user_id,
      working_date: date,
      id: attendancePayload.id,
      edited_by: req.user?.id || null,
      checkout_remarks: remarkValue,
    };

    res.json({ attendance: attendancePayload });
  } catch (err) {
    next(err);
  }
};

// Manual edit of Day In / Day Out / Lunch In / Lunch Out (permission: edit_users_time_stamp_attendance)
exports.updateWorkTimes = async (req, res, next) => {
  try {
    const { user_id, working_date, checkin_time, checkout_time, lunch_in, lunch_out } =
      req.body;

    if (!user_id) throw new BadRequestError("User ID is required");
    const date = toWorkingDateStr(working_date);
    if (!date) {
      throw new BadRequestError("Valid working_date (YYYY-MM-DD) is required");
    }

    const user = await User.findById(user_id);
    if (!user) throw new NotFoundError("User not found");

    const toDateOrNull = (value) => {
      if (value === undefined) return undefined;
      if (value === null || value === "") return null;
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestError("Invalid date/time value");
      }
      return d;
    };

    const checkin = toDateOrNull(checkin_time);
    const checkout = toDateOrNull(checkout_time);
    const lunchIn = toDateOrNull(lunch_in);
    const lunchOut = toDateOrNull(lunch_out);

    // Only fields explicitly sent are written (partial update)
    const payload = {};
    if (checkin_time !== undefined) payload.checkin_time = checkin;
    if (checkout_time !== undefined) payload.checkout_time = checkout;
    if (lunch_in !== undefined) payload.lunch_in = lunchIn;
    if (lunch_out !== undefined) payload.lunch_out = lunchOut;

    if (Object.keys(payload).length === 0) {
      throw new BadRequestError("No time fields to update");
    }

    let record = await Attendance.getByUserIdAndWorkingDate(user_id, date);

    // Validate against effective values (sent + existing)
    const effectiveCheckin =
      checkin_time !== undefined ? checkin : record?.checkin_time || null;
    const effectiveCheckout =
      checkout_time !== undefined ? checkout : record?.checkout_time || null;
    const effectiveLunchIn =
      lunch_in !== undefined ? lunchIn : record?.lunch_in || null;
    const effectiveLunchOut =
      lunch_out !== undefined ? lunchOut : record?.lunch_out || null;

    const asDate = (value) => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const checkinAt = asDate(effectiveCheckin);
    const checkoutAt = asDate(effectiveCheckout);
    const lunchInAt = asDate(effectiveLunchIn);
    const lunchOutAt = asDate(effectiveLunchOut);

    if (checkinAt && checkoutAt && checkoutAt < checkinAt) {
      throw new BadRequestError("Day Out cannot be before Day In");
    }
    if (lunchInAt && lunchOutAt && lunchOutAt < lunchInAt) {
      throw new BadRequestError("Lunch Out cannot be before Lunch In");
    }
    if (lunchOutAt && !lunchInAt) {
      throw new BadRequestError("Lunch In is required before Lunch Out");
    }

    // For activity log (before change) — only fields being updated
    res.locals.oldData = record
      ? {
          id: record.id,
          user_id: record.user_id,
          working_date: record.working_date || date,
          ...Object.fromEntries(
            Object.keys(payload).map((key) => [key, record[key] ?? null])
          ),
        }
      : null;

    if (!record) {
      const [created] = await Attendance.create({
        user_id,
        working_date: date,
        checkin_time: null,
        checkout_time: null,
        lunch_in: null,
        lunch_out: null,
        ...payload,
        checkin_via: "manual",
      });
      record = created;
    } else {
      const [updated] = await Attendance.update(record.id, payload);
      record = updated;
    }

    const fresh = await Attendance.getByUserIdAndWorkingDate(user_id, date);
    const breaks = fresh?.id
      ? await AttendanceBreak.getByAttendanceId(fresh.id)
      : [];

    const attendancePayload = {
      ...(fresh || record),
      user_name: user.name || null,
      working_date: date,
    };

    // Activity logger: only changed fields in new_data
    res.locals.newRecordId = attendancePayload.id;
    req.body = {
      user_id,
      working_date: date,
      id: attendancePayload.id,
      edited_by: req.user?.id || null,
      ...payload,
    };

    res.json({
      attendance: attendancePayload,
      breaks,
    });
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
// Manual edit Break In (DB break_out) / Break Out (DB break_in) — partial update
exports.updateBreakTimes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { break_out, break_in } = req.body;

    if (!id) throw new BadRequestError("Break ID is required");

    const existing = await AttendanceBreak.findById(id);
    if (!existing) throw new NotFoundError("Break record not found");

    const toDateOrNull = (value) => {
      if (value === undefined) return undefined;
      if (value === null || value === "") return null;
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestError("Invalid date/time value");
      }
      return d;
    };

    const breakOut = toDateOrNull(break_out);
    const breakIn = toDateOrNull(break_in);

    const payload = {};
    if (break_out !== undefined) payload.break_out = breakOut;
    if (break_in !== undefined) payload.break_in = breakIn;

    if (Object.keys(payload).length === 0) {
      throw new BadRequestError("No break time fields to update");
    }

    const effectiveOut =
      break_out !== undefined ? breakOut : existing.break_out || null;
    const effectiveIn =
      break_in !== undefined ? breakIn : existing.break_in || null;

    const asDate = (value) => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const outAt = asDate(effectiveOut);
    const inAt = asDate(effectiveIn);

    if (outAt && inAt && inAt < outAt) {
      throw new BadRequestError("Break Out cannot be before Break In");
    }

    res.locals.oldData = {
      id: existing.id,
      attendance_id: existing.attendance_id,
      user_id: existing.user_id,
      working_date: existing.working_date,
      ...Object.fromEntries(
        Object.keys(payload).map((key) => [key, existing[key] ?? null])
      ),
    };

    const now = new Date();
    const [updated] = await AttendanceBreak.update(id, {
      ...payload,
      updated_by: req.user?.id || null,
      updated_at: now,
    });

    res.locals.newRecordId = updated.id;
    req.body = {
      id: updated.id,
      attendance_id: updated.attendance_id,
      user_id: updated.user_id,
      working_date: existing.working_date,
      edited_by: req.user?.id || null,
      ...payload,
    };

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

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
