const cron = require("node-cron");
const logger = require("../utils/logger");
const {
  autoCloseOpenAttendance,
} = require("../services/attendance/attendanceAutoCloseService");

const ATTENDANCE_TIMEZONE = "Asia/Kolkata";

/**
 * Schedule end-of-day attendance auto-close once daily at 11:50 PM IST.
 * Gives ~10 minutes before midnight for processing.
 */
const startAttendanceCronJobs = () => {
  // 11:50 PM every day, India time
  cron.schedule(
    "50 23 * * *",
    async () => {
      logger.info("[attendance-cron] Starting end-of-day auto-close job");
      try {
        const result = await autoCloseOpenAttendance();
        logger.info(
          `[attendance-cron] Finished. day_out=${result.closed}, lunch_out=${result.lunchClosed}`
        );
      } catch (err) {
        logger.error(
          `[attendance-cron] Auto-close failed: ${err.message || err}`
        );
      }
    },
    {
      timezone: ATTENDANCE_TIMEZONE,
    }
  );

  logger.info(
    `[attendance-cron] Scheduled daily at 23:50 (${ATTENDANCE_TIMEZONE})`
  );
};

module.exports = {
  startAttendanceCronJobs,
};
