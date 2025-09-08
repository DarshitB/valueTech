// middleware/beforeUpdateLogger.js
const db = require("../../db");

const sanitize = (data) => {
  if (!data) return null;
  const clone = { ...data };
  if ("password" in clone) delete clone.password;
  return clone;
};

const beforeUpdateLogger = (tableName, getRecordId) => {
  return async (req, res, next) => {
    try {
      const method = req.method.toLowerCase();
      if (!["put", "patch", "delete"].includes(method)) return next();

      const record_id = getRecordId(req, res);
      if (!record_id) return next();

      const oldData = await db(tableName).where({ id: record_id }).first();
      res.locals.oldData = sanitize(oldData);
    } catch (err) {
      console.error("Failed to fetch old data for logging:", err.message);
    }
    next();
  };
};

module.exports = beforeUpdateLogger;
