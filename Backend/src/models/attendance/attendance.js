const db = require("../../../db");

const attendance = {
  // Get attendance by user ID (optional from/to on working_date)
  getByUserId: (userId, { from, to } = {}) => {
    const query = db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        db.raw("to_char(attendance.working_date, 'YYYY-MM-DD') as working_date"),
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.lunch_in",
        "attendance.lunch_out",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.user_id", userId);

    if (from) query.andWhereRaw("attendance.working_date >= ?::date", [from]);
    if (to) query.andWhereRaw("attendance.working_date <= ?::date", [to]);

    return query
      .orderBy("attendance.working_date", "desc")
      .orderBy("attendance.id", "desc");
  },

  // Get last attendance record for a user
  getLastRecordByUserId: (userId) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        db.raw("to_char(attendance.working_date, 'YYYY-MM-DD') as working_date"),
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.lunch_in",
        "attendance.lunch_out",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.user_id", userId)
      .orderBy("attendance.working_date", "desc")
      .orderBy("attendance.id", "desc")
      .first(),

  // All attendance rows for a working date (all users), with schedule times
  getByWorkingDate: (workingDate) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        "users.day_start",
        "users.day_end",
        db.raw("to_char(attendance.working_date, 'YYYY-MM-DD') as working_date"),
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.lunch_in",
        "attendance.lunch_out",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .whereRaw("attendance.working_date = ?::date", [workingDate])
      .orderBy("users.name", "asc")
      .orderBy("attendance.id", "desc"),

  // Get attendance record by ID
  findById: (id) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        db.raw("to_char(attendance.working_date, 'YYYY-MM-DD') as working_date"),
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.lunch_in",
        "attendance.lunch_out",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.id", id)
      .first(),

  // One user's attendance for a specific working date (latest row if duplicates)
  getByUserIdAndWorkingDate: (userId, workingDate) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        db.raw("to_char(attendance.working_date, 'YYYY-MM-DD') as working_date"),
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.lunch_in",
        "attendance.lunch_out",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.user_id", userId)
      .whereRaw("attendance.working_date = ?::date", [workingDate])
      .orderBy("attendance.id", "desc")
      .first(),

  // Create new attendance record
  create: (data) => db("attendance").insert(data).returning("*"),

  // Update attendance record
  update: (id, data) =>
    db("attendance").where({ id }).update(data).returning("*"),

  // Open days: day in set, day out missing (for midnight auto-close)
  findOpenWithoutCheckout: () =>
    db("attendance")
      .select(
        "id",
        "user_id",
        "working_date",
        "checkin_time",
        "checkout_time",
        "lunch_in",
        "lunch_out"
      )
      .whereNotNull("checkin_time")
      .whereNull("checkout_time"),
};

module.exports = attendance;

