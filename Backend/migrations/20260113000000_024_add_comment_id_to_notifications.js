/**
 * Migration to add comment_id field to notifications table
 * This allows notifications to be linked to order comments as well as status history
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Add comment_id column to notifications table
  await knex.schema.table("notifications", (table) => {
    table.integer("comment_id").unsigned().nullable()
      .references("id").inTable("order_comments").onDelete("CASCADE")
      .comment("References order_comments table for comment-based notifications");
  });

  // Make activity_id nullable since comment notifications won't have an activity_id
  await knex.schema.alterTable("notifications", (table) => {
    table.integer("activity_id").unsigned().nullable().alter();
  });

  // Update the unique constraint to allow either activity_id or comment_id
  // Drop existing unique constraint
  await knex.schema.raw(`
    ALTER TABLE notifications 
    DROP CONSTRAINT IF EXISTS notifications_user_id_activity_id_unique
  `);

  // Create new partial unique index for activity-based notifications
  await knex.schema.raw(`
    CREATE UNIQUE INDEX notifications_user_activity_unique 
    ON notifications(user_id, activity_id) 
    WHERE activity_id IS NOT NULL
  `);

  // Create partial unique index for comment-based notifications
  await knex.schema.raw(`
    CREATE UNIQUE INDEX notifications_user_comment_unique 
    ON notifications(user_id, comment_id) 
    WHERE comment_id IS NOT NULL
  `);

  // Add index for comment_id for faster lookups
  await knex.schema.raw(`
    CREATE INDEX idx_notifications_comment 
    ON notifications(comment_id, created_at DESC)
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop the indexes
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_notifications_comment`);
  await knex.schema.raw(`DROP INDEX IF EXISTS notifications_user_comment_unique`);
  await knex.schema.raw(`DROP INDEX IF EXISTS notifications_user_activity_unique`);

  // Restore the original unique constraint
  await knex.schema.raw(`
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_user_id_activity_id_unique 
    UNIQUE (user_id, activity_id)
  `);

  // Make activity_id NOT NULL again
  await knex.schema.alterTable("notifications", (table) => {
    table.integer("activity_id").unsigned().notNullable().alter();
  });

  // Drop comment_id column
  await knex.schema.table("notifications", (table) => {
    table.dropColumn("comment_id");
  });
};
