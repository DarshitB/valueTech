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

const holiday = {
  findAll: () =>
    db("holidays")
      .leftJoin("users as created_user", "holidays.created_by", "created_user.id")
      .select(
        "holidays.id",
        "holidays.title",
        db.raw("to_char(holidays.start_date, 'YYYY-MM-DD') as start_date"),
        db.raw("to_char(holidays.end_date, 'YYYY-MM-DD') as end_date"),
        "holidays.type",
        "holidays.is_active",
        "holidays.created_at",
        "created_user.name as created_by"
      )
      .whereNull("holidays.deleted_at")
      .where("holidays.is_active", true)
      .orderBy("holidays.start_date", "desc"),

  findOverlapping: (fromDate, toDate) =>
    db("holidays")
      .select(
        "holidays.id",
        "holidays.title",
        db.raw("to_char(holidays.start_date, 'YYYY-MM-DD') as start_date"),
        db.raw("to_char(holidays.end_date, 'YYYY-MM-DD') as end_date"),
        "holidays.type",
        "holidays.is_active"
      )
      .whereNull("holidays.deleted_at")
      .where("holidays.is_active", true)
      .andWhere("holidays.start_date", "<=", toDate)
      .andWhere("holidays.end_date", ">=", fromDate)
      .orderBy("holidays.start_date", "asc"),

  findById: (id) =>
    db("holidays")
      .select("*")
      .where({ id })
      .whereNull("deleted_at")
      .first(),

  findByExactDates: (startDate, endDate) =>
    db("holidays")
      .whereNull("deleted_at")
      .where("is_active", true)
      .where("start_date", startDate)
      .where("end_date", endDate)
      .first(),

  create: async (data) => {
    const [row] = await db("holidays").insert(data).returning("*");
    return [normalizeDateFields(row)];
  },

  update: async (id, data) => {
    const [row] = await db("holidays").where({ id }).update(data).returning("*");
    return [normalizeDateFields(row)];
  },

  softDelete: (id, userId) =>
    db("holidays").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    }),
};

module.exports = holiday;
