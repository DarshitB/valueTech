const db = require("../../../db");
const logger = require("../../utils/logger");

const BATCH_SIZE = 5000;
const MAX_BATCHES_PER_RUN = 200;

/**
 * Retention window in months (default 3). Env: NOTIFICATION_RETENTION_MONTHS.
 * @returns {number}
 */
function getRetentionMonths() {
  const parsed = parseInt(process.env.NOTIFICATION_RETENTION_MONTHS, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 3;
}

/**
 * Delete notification rows older than the retention window, in batches.
 * Does not change create rules or who receives new notifications.
 * Related user_notification_reads rows are removed via FK CASCADE.
 *
 * @returns {Promise<{ deleted: number, batches: number, retentionMonths: number, stoppedEarly: boolean }>}
 */
async function cleanupOldNotifications() {
  const retentionMonths = getRetentionMonths();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);

  let deleted = 0;
  let batches = 0;
  let stoppedEarly = false;

  logger.info(
    `[notification-cleanup] Starting. retentionMonths=${retentionMonths} cutoff=${cutoff.toISOString()} batchSize=${BATCH_SIZE}`
  );

  while (batches < MAX_BATCHES_PER_RUN) {
    const ids = await db("notifications")
      .select("id")
      .where("created_at", "<", cutoff)
      .orderBy("id", "asc")
      .limit(BATCH_SIZE);

    if (!ids.length) {
      break;
    }

    const idList = ids.map((row) => row.id);
    const removed = await db("notifications").whereIn("id", idList).del();

    deleted += removed;
    batches += 1;

    logger.info(
      `[notification-cleanup] Batch ${batches}: deleted=${removed} totalDeleted=${deleted}`
    );

    if (removed === 0) {
      break;
    }
  }

  if (batches >= MAX_BATCHES_PER_RUN) {
    stoppedEarly = true;
    logger.warn(
      `[notification-cleanup] Hit max batches (${MAX_BATCHES_PER_RUN}); remaining old rows will be cleaned on a later run`
    );
  }

  return { deleted, batches, retentionMonths, stoppedEarly };
}

module.exports = {
  cleanupOldNotifications,
  getRetentionMonths,
};
