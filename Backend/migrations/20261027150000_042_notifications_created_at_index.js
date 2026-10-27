/**
 * Support notification read-window queries (created_at >= now() - N days)
 * used by getUnreadCount / list / unread list to avoid full-table scans.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON notifications (created_at DESC)
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_notifications_created_at
  `);
};
