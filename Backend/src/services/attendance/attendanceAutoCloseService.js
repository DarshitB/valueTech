const Attendance = require("../../models/attendance/attendance");
const AttendanceBreak = require("../../models/attendance/attendanceBreak");
const logger = require("../../utils/logger");

/**
 * Build end-of-day timestamp (23:59:59) for a working_date in Asia/Kolkata.
 * @param {string|Date} workingDate
 * @returns {Date}
 */
const getEndOfWorkingDay = (workingDate) => {
  let dateStr;
  if (workingDate instanceof Date && !Number.isNaN(workingDate.getTime())) {
    const y = workingDate.getFullYear();
    const m = String(workingDate.getMonth() + 1).padStart(2, "0");
    const d = String(workingDate.getDate()).padStart(2, "0");
    if (
      workingDate.getUTCHours() === 0 &&
      workingDate.getUTCMinutes() === 0 &&
      workingDate.getUTCSeconds() === 0
    ) {
      const uy = workingDate.getUTCFullYear();
      const um = String(workingDate.getUTCMonth() + 1).padStart(2, "0");
      const ud = String(workingDate.getUTCDate()).padStart(2, "0");
      dateStr = `${uy}-${um}-${ud}`;
    } else {
      dateStr = `${y}-${m}-${d}`;
    }
  } else {
    dateStr = String(workingDate).slice(0, 10);
  }

  return new Date(`${dateStr}T23:59:59+05:30`);
};

/**
 * Auto-close open attendance at end of day:
 * - Only rows with day in and no day out
 * - Always set day out to 23:59:59 on working_date
 * - Set lunch out only when lunch in exists and lunch out is empty
 * - Close open personal breaks (break_out without break_in)
 */
const autoCloseOpenAttendance = async () => {
  const openRows = await Attendance.findOpenWithoutCheckout();

  if (!openRows.length) {
    logger.info("[attendance-auto-close] No open attendance rows to close");
    return { closed: 0, lunchClosed: 0, breaksClosed: 0 };
  }

  let closed = 0;
  let lunchClosed = 0;
  let breaksClosed = 0;

  for (const row of openRows) {
    const endOfDay = getEndOfWorkingDay(row.working_date);
    const updateData = {
      checkout_time: endOfDay,
      checkout_remarks: row.checkout_remarks || "Auto day out (end of day)",
    };

    if (row.lunch_in && !row.lunch_out) {
      updateData.lunch_out = endOfDay;
      lunchClosed += 1;
    }

    const closedBreaks = await AttendanceBreak.closeOpenForAttendance(
      row.id,
      endOfDay
    );
    breaksClosed += Number(closedBreaks) || 0;

    await Attendance.update(row.id, updateData);
    closed += 1;
  }

  logger.info(
    `[attendance-auto-close] Closed ${closed} day-out row(s); set lunch-out on ${lunchClosed} row(s); closed ${breaksClosed} break(s)`
  );

  return { closed, lunchClosed, breaksClosed };
};

module.exports = {
  autoCloseOpenAttendance,
  getEndOfWorkingDay,
};
