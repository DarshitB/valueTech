const db = require("../../../../db");

const LOCK_TTL_MS = 3 * 60 * 1000; // 3 minutes without heartbeat → free

const reportEditLock = {
  LOCK_TTL_MS,

  deleteExpired: (orderId, reportType, trx = db) =>
    trx("report_edit_locks")
      .where({ order_id: orderId, report_type: reportType })
      .andWhere("expires_at", "<", new Date())
      .del(),

  findByOrderAndType: (orderId, reportType, trx = db) =>
    trx("report_edit_locks")
      .where({ order_id: orderId, report_type: reportType })
      .first(),

  /**
   * Active = not expired.
   */
  findActiveByOrderAndType: async (orderId, reportType, trx = db) => {
    await reportEditLock.deleteExpired(orderId, reportType, trx);
    return reportEditLock.findByOrderAndType(orderId, reportType, trx);
  },

  /**
   * Acquire or refresh lock for the same user.
   * Returns { acquired, lock }.
   */
  acquire: async ({ orderId, reportType, userId, userName }) => {
    return db.transaction(async (trx) => {
      await reportEditLock.deleteExpired(orderId, reportType, trx);

      const existing = await trx("report_edit_locks")
        .where({ order_id: orderId, report_type: reportType })
        .forUpdate()
        .first();

      const now = new Date();
      const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

      if (!existing) {
        const [lock] = await trx("report_edit_locks")
          .insert({
            order_id: orderId,
            report_type: reportType,
            user_id: userId,
            user_name: userName,
            locked_at: now,
            last_heartbeat_at: now,
            expires_at: expiresAt,
            created_at: now,
            updated_at: now,
          })
          .returning("*");
        return { acquired: true, lock };
      }

      if (Number(existing.user_id) === Number(userId)) {
        const [lock] = await trx("report_edit_locks")
          .where({ id: existing.id })
          .update({
            user_name: userName,
            last_heartbeat_at: now,
            expires_at: expiresAt,
            updated_at: now,
          })
          .returning("*");
        return { acquired: true, lock, refreshed: true };
      }

      return { acquired: false, lock: existing };
    });
  },

  heartbeat: async ({ orderId, reportType, userId }) => {
    return db.transaction(async (trx) => {
      await reportEditLock.deleteExpired(orderId, reportType, trx);

      const existing = await trx("report_edit_locks")
        .where({ order_id: orderId, report_type: reportType })
        .forUpdate()
        .first();

      if (!existing) {
        return { ok: false, reason: "missing" };
      }

      if (Number(existing.user_id) !== Number(userId)) {
        return { ok: false, reason: "owned_by_other", lock: existing };
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
      const [lock] = await trx("report_edit_locks")
        .where({ id: existing.id })
        .update({
          last_heartbeat_at: now,
          expires_at: expiresAt,
          updated_at: now,
        })
        .returning("*");

      return { ok: true, lock };
    });
  },

  release: async ({ orderId, reportType, userId }) => {
    return db.transaction(async (trx) => {
      const existing = await trx("report_edit_locks")
        .where({ order_id: orderId, report_type: reportType })
        .forUpdate()
        .first();

      if (!existing) {
        return { released: true, alreadyFree: true };
      }

      // Only owner can release; expired locks are cleaned as free
      if (Number(existing.user_id) !== Number(userId)) {
        if (new Date(existing.expires_at) < new Date()) {
          await trx("report_edit_locks").where({ id: existing.id }).del();
          return { released: true, alreadyFree: true };
        }
        return { released: false, lock: existing };
      }

      await trx("report_edit_locks").where({ id: existing.id }).del();
      return { released: true };
    });
  },
};

module.exports = reportEditLock;
