const cron = require("node-cron");
const logger = require("../utils/logger");
const {
  cleanupOldNotifications,
} = require("../services/notifications/notificationCleanupService");

const NOTIFICATION_CLEANUP_TIMEZONE = "Asia/Kolkata";

/**
 * Schedule monthly cleanup of old notification rows (bell history only).
 * Default: 1st of each month at 03:00 IST.
 */
const startNotificationCleanupCronJobs = () => {
  cron.schedule(
    "0 3 1 * *",
    async () => {
      logger.info("[notification-cleanup-cron] Starting monthly cleanup job");
      try {
        const result = await cleanupOldNotifications();
        logger.info(
          `[notification-cleanup-cron] Finished. deleted=${result.deleted}, batches=${result.batches}, retentionMonths=${result.retentionMonths}, stoppedEarly=${result.stoppedEarly}`
        );
      } catch (err) {
        logger.error(
          `[notification-cleanup-cron] Cleanup failed: ${err.message || err}`
        );
      }
    },
    {
      timezone: NOTIFICATION_CLEANUP_TIMEZONE,
    }
  );

  logger.info(
    `[notification-cleanup-cron] Scheduled monthly on day 1 at 03:00 (${NOTIFICATION_CLEANUP_TIMEZONE})`
  );
};

module.exports = {
  startNotificationCleanupCronJobs,
};
