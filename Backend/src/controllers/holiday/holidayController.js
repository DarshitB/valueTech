const Holiday = require("../../models/holiday/holiday");
const {
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");

const toDateOnly = (value) => {
  if (!value) return null;
  // Plain YYYY-MM-DD only — do not take prefix from ISO datetimes
  if (typeof value === "string") {
    const plain = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
    if (plain) return plain[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

exports.getAll = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (from || to) {
      const fromDate = toDateOnly(from) || toDateOnly(to);
      const toDate = toDateOnly(to) || toDateOnly(from);
      if (!fromDate || !toDate) {
        throw new BadRequestError("Valid from/to dates are required");
      }
      const holidays = await Holiday.findOverlapping(fromDate, toDate);
      return res.json(holidays);
    }
    const holidays = await Holiday.findAll();
    res.json(holidays);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { title, start_date, end_date, type } = req.body;

    if (!title || !String(title).trim()) {
      throw new BadRequestError("Holiday title is required");
    }

    const startDate = toDateOnly(start_date);
    if (!startDate) {
      throw new BadRequestError("Start date is required");
    }

    // Single-day holiday: only start selected → end = start
    const endDate = toDateOnly(end_date) || startDate;
    if (endDate < startDate) {
      throw new BadRequestError("End date cannot be before start date");
    }

    // Same date range already exists → update instead of duplicate
    const existing = await Holiday.findByExactDates(startDate, endDate);
    if (existing) {
      const [holiday] = await Holiday.update(existing.id, {
        title: String(title).trim(),
        type: type || existing.type || "holiday",
        is_active: true,
        updated_by: req.user.id,
        updated_at: new Date(),
      });
      res.locals.newRecordId = holiday.id;
      return res.json({ ...holiday, updated: true });
    }

    const [holiday] = await Holiday.create({
      title: String(title).trim(),
      start_date: startDate,
      end_date: endDate,
      type: type || "holiday",
      is_active: true,
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = holiday.id;
    res.status(201).json({ ...holiday, updated: false });
  } catch (err) {
    next(err);
  }
};

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Holiday.findById(id);
    if (!existing) throw new NotFoundError("Holiday not found");

    await Holiday.softDelete(id, req.user.id);
    res.status(204).json({ message: "Holiday deleted successfully" });
  } catch (err) {
    next(err);
  }
};
