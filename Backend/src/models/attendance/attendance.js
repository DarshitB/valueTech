const db = require("../../../db");

const attendance = {
  // Get all attendance records by user ID
  getByUserId: (userId) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        "attendance.working_date",
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.user_id", userId)
      .orderBy("attendance.working_date", "desc")
      .orderBy("attendance.id", "desc"),

  // Get last attendance record for a user
  getLastRecordByUserId: (userId) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        "attendance.working_date",
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.user_id", userId)
      .orderBy("attendance.working_date", "desc")
      .orderBy("attendance.id", "desc")
      .first(),

  // Get attendance record by ID
  findById: (id) =>
    db("attendance")
      .leftJoin("users", "attendance.user_id", "users.id")
      .select(
        "attendance.id",
        "attendance.user_id",
        "users.name as user_name",
        "attendance.working_date",
        "attendance.checkin_time",
        "attendance.checkout_time",
        "attendance.checkin_via",
        "attendance.checkout_remarks"
      )
      .where("attendance.id", id)
      .first(),

  // Create new attendance record
  create: (data) => db("attendance").insert(data).returning("*"),

  // Update attendance record
  update: (id, data) =>
    db("attendance").where({ id }).update(data).returning("*"),
};

module.exports = attendance;

