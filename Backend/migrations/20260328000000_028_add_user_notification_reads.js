/**
 * Migration: 028 — Add user_notification_reads table
 *
 * Problem solved by this migration:
 *   The notifications table has one row per event (status change / comment).
 *   Previously, is_read was a single shared flag on that row, so marking a
 *   notification as read for one user also marked it as read for every other
 *   user who could see the same notification.
 *
 * Fix (Option A — additive, zero data loss):
 *   Add a separate user_notification_reads table that records which specific
 *   user has read which notification.  The notifications table is left
 *   completely untouched — its is_read / read_at columns become unused legacy
 *   columns and can be dropped in a future clean-up migration.
 *
 * Schema:
 *   user_notification_reads
 *     id              — surrogate PK
 *     notification_id — FK → notifications.id (CASCADE DELETE)
 *     user_id         — FK → users.id          (CASCADE DELETE)
 *     read_at         — when this user read it (defaults to now)
 *     UNIQUE (notification_id, user_id)  — one read-record per user per notification
 */
exports.up = async function (knex) {
  await knex.schema.createTable("user_notification_reads", (table) => {
    table.increments("id").primary();

    table
      .integer("notification_id")
      .notNullable()
      .references("id")
      .inTable("notifications")
      .onDelete("CASCADE");

    table
      .integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    // When the user actually read the notification
    table.timestamp("read_at").notNullable().defaultTo(knex.fn.now());

    // Enforce one read-record per user per notification
    table.unique(["notification_id", "user_id"]);
  });

  // Index to speed up the per-user unread look-up
  // (notification_id alone is already covered by the unique index above)
  await knex.schema.table("user_notification_reads", (table) => {
    table.index(["user_id"], "idx_unr_user_id");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("user_notification_reads");
};
