const db = require("../../../db");

const normalizeDateFields = (row) => {
  if (!row) return row;
  const toYmd = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      const plain = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (plain && !value.includes("T")) return plain[1];
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return {
    ...row,
    start_date: toYmd(row.start_date),
    end_date: toYmd(row.end_date),
  };
};

const userLeave = {
  findByUserId: async (userId) => {
    const rows = await db("user_leaves")
      .leftJoin("users as created_user", "user_leaves.created_by", "created_user.id")
      .select(
        "user_leaves.id",
        "user_leaves.user_id",
        db.raw("to_char(user_leaves.start_date, 'YYYY-MM-DD') as start_date"),
        db.raw("to_char(user_leaves.end_date, 'YYYY-MM-DD') as end_date"),
        "user_leaves.leave_type",
        "user_leaves.half_day_session",
        "user_leaves.remarks",
        "user_leaves.status",
        "user_leaves.created_at",
        "created_user.name as created_by"
      )
      .where("user_leaves.user_id", userId)
      .whereNull("user_leaves.deleted_at")
      .where("user_leaves.status", "approved")
      .orderBy("user_leaves.start_date", "desc");
    return rows;
  },

  findOverlappingForUser: async (userId, fromDate, toDate) => {
    const rows = await db("user_leaves")
      .select(
        "user_leaves.id",
        "user_leaves.user_id",
        db.raw("to_char(user_leaves.start_date, 'YYYY-MM-DD') as start_date"),
        db.raw("to_char(user_leaves.end_date, 'YYYY-MM-DD') as end_date"),
        "user_leaves.leave_type",
        "user_leaves.half_day_session",
        "user_leaves.remarks",
        "user_leaves.status"
      )
      .where("user_leaves.user_id", userId)
      .whereNull("user_leaves.deleted_at")
      .where("user_leaves.status", "approved")
      .andWhere("user_leaves.start_date", "<=", toDate)
      .andWhere("user_leaves.end_date", ">=", fromDate)
      .orderBy("user_leaves.start_date", "asc");
    return rows;
  },

  findById: (id) =>
    db("user_leaves")
      .select("*")
      .where({ id })
      .whereNull("deleted_at")
      .first(),

  // Prefer exact single-day leave for that date, else any covering range
  findForUserOnDate: (userId, date) =>
    db("user_leaves")
      .where("user_id", userId)
      .whereNull("deleted_at")
      .where("status", "approved")
      .andWhere("start_date", "<=", date)
      .andWhere("end_date", ">=", date)
      .orderByRaw(
        "CASE WHEN start_date = ? AND end_date = ? THEN 0 ELSE 1 END",
        [date, date]
      )
      .orderBy("id", "desc")
      .first(),

  create: async (data) => {
    const [row] = await db("user_leaves").insert(data).returning("*");
    return [normalizeDateFields(row)];
  },

  update: async (id, data) => {
    const [row] = await db("user_leaves").where({ id }).update(data).returning("*");
    return [normalizeDateFields(row)];
  },

  softDelete: (id, userId) =>
    db("user_leaves").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),
};

module.exports = userLeave;
