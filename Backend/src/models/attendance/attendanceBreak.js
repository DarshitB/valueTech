const db = require("../../../db");

const attendanceBreak = {
  // All breaks for a user (optional from/to on working_date)
  getByUserId: (userId, { from, to } = {}) => {
    const query = db("attendance_breaks")
      .select(
        "id",
        "attendance_id",
        "user_id",
        db.raw("to_char(working_date, 'YYYY-MM-DD') as working_date"),
        "break_out",
        "break_in"
      )
      .where({ user_id: userId })
      .whereNull("deleted_at");

    if (from) query.andWhereRaw("working_date >= ?::date", [from]);
    if (to) query.andWhereRaw("working_date <= ?::date", [to]);

    return query.orderBy("break_out", "asc");
  },

  getByAttendanceId: (attendanceId) =>
    db("attendance_breaks")
      .select(
        "id",
        "attendance_id",
        "user_id",
        db.raw("to_char(working_date, 'YYYY-MM-DD') as working_date"),
        "break_out",
        "break_in"
      )
      .where({ attendance_id: attendanceId })
      .whereNull("deleted_at")
      .orderBy("break_out", "asc"),

  // All breaks for a working date (all users)
  getByWorkingDate: (workingDate) =>
    db("attendance_breaks")
      .select(
        "id",
        "attendance_id",
        "user_id",
        db.raw("to_char(working_date, 'YYYY-MM-DD') as working_date"),
        "break_out",
        "break_in"
      )
      .whereRaw("working_date = ?::date", [workingDate])
      .whereNull("deleted_at")
      .orderBy("break_out", "asc"),

  // Open break = started (break_out set) but not ended (break_in null)
  getOpenByAttendanceId: (attendanceId) =>
    db("attendance_breaks")
      .select(
        "id",
        "attendance_id",
        "user_id",
        db.raw("to_char(working_date, 'YYYY-MM-DD') as working_date"),
        "break_out",
        "break_in"
      )
      .where({ attendance_id: attendanceId })
      .whereNull("deleted_at")
      .whereNotNull("break_out")
      .whereNull("break_in")
      .orderBy("id", "desc")
      .first(),

  findById: (id) =>
    db("attendance_breaks")
      .select(
        "id",
        "attendance_id",
        "user_id",
        db.raw("to_char(working_date, 'YYYY-MM-DD') as working_date"),
        "break_out",
        "break_in"
      )
      .where({ id })
      .whereNull("deleted_at")
      .first(),

  create: (data) => db("attendance_breaks").insert(data).returning("*"),

  update: (id, data) =>
    db("attendance_breaks").where({ id }).update(data).returning("*"),

  // Close any open breaks for an attendance row (e.g. end-of-day auto-close)
  closeOpenForAttendance: (attendanceId, breakInTime) =>
    db("attendance_breaks")
      .where({ attendance_id: attendanceId })
      .whereNull("deleted_at")
      .whereNotNull("break_out")
      .whereNull("break_in")
      .update({
        break_in: breakInTime,
        updated_at: new Date(),
      }),
};

module.exports = attendanceBreak;
