const UserLeave = require("../../models/userLeave/userLeave");
const db = require("../../../db");
const {
  BadRequestError,
  NotFoundError,
} = require("../../utils/customErrors");

const ALLOWED_LEAVE_TYPES = ["paid_leave", "leave", "half_day"];
const ALLOWED_HALF_DAY_SESSIONS = ["first_half", "second_half"];

const toDateOnly = (value) => {
  if (!value) return null;
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

exports.getByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;

    if (from || to) {
      const fromDate = toDateOnly(from) || toDateOnly(to);
      const toDate = toDateOnly(to) || toDateOnly(from);
      if (!fromDate || !toDate) {
        throw new BadRequestError("Valid from/to dates are required");
      }
      const leaves = await UserLeave.findOverlappingForUser(
        userId,
        fromDate,
        toDate
      );
      return res.json(leaves);
    }

    const leaves = await UserLeave.findByUserId(userId);
    res.json(leaves);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const {
      user_id,
      start_date,
      end_date,
      leave_type,
      half_day_session,
      remarks,
    } = req.body;

    if (!user_id) throw new BadRequestError("User is required");

    if (!leave_type || !ALLOWED_LEAVE_TYPES.includes(leave_type)) {
      throw new BadRequestError(
        "Leave type must be paid_leave, leave, or half_day"
      );
    }

    const startDate = toDateOnly(start_date);
    if (!startDate) throw new BadRequestError("Start date is required");

    const endDate = toDateOnly(end_date) || startDate;
    if (endDate < startDate) {
      throw new BadRequestError("End date cannot be before start date");
    }

    let session = null;
    if (leave_type === "half_day") {
      if (
        half_day_session &&
        !ALLOWED_HALF_DAY_SESSIONS.includes(half_day_session)
      ) {
        throw new BadRequestError(
          "Half day session must be first_half or second_half"
        );
      }
      session = half_day_session || null;
    }

    // Same user + day already has leave → update instead of duplicate
    const existing = await UserLeave.findForUserOnDate(user_id, startDate);
    if (existing) {
      const [leave] = await UserLeave.update(existing.id, {
        start_date: startDate,
        end_date: endDate,
        leave_type,
        half_day_session: session,
        remarks: remarks ? String(remarks).trim() : null,
        status: "approved",
        updated_by: req.user.id,
        updated_at: new Date(),
      });

      // Soft-delete any other overlapping leaves for this user/day
      await db("user_leaves")
        .where("user_id", user_id)
        .whereNull("deleted_at")
        .whereNot("id", existing.id)
        .andWhere("start_date", "<=", endDate)
        .andWhere("end_date", ">=", startDate)
        .update({
          deleted_at: new Date(),
          deleted_by: req.user.id,
        });

      res.locals.newRecordId = leave.id;
      return res.json({ ...leave, updated: true });
    }

    const [leave] = await UserLeave.create({
      user_id,
      start_date: startDate,
      end_date: endDate,
      leave_type,
      half_day_session: session,
      remarks: remarks ? String(remarks).trim() : null,
      status: "approved",
      created_by: req.user.id,
      created_at: new Date(),
    });

    res.locals.newRecordId = leave.id;
    res.status(201).json({ ...leave, updated: false });
  } catch (err) {
    next(err);
  }
};

exports.softDelete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await UserLeave.findById(id);
    if (!existing) throw new NotFoundError("Leave not found");

    await UserLeave.softDelete(id, req.user.id);
    res.status(204).json({ message: "Leave deleted successfully" });
  } catch (err) {
    next(err);
  }
};
