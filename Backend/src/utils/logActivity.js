const db = require('../../db');

const logActivity = async ({ user_id, action, table_name, record_id, old_data = null, new_data = null, metadata = null }) => {
  try {
    await db('activity_logs').insert({
      user_id,
      action,
      table_name,
      record_id,
      old_data: old_data ? JSON.stringify(old_data) : null,
      new_data: new_data ? JSON.stringify(new_data) : null,
      metadata,
    });
  } catch (err) {
    console.error('Activity log failed:', err.message);
  }
};

module.exports = logActivity;
