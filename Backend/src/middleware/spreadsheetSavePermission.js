const { validate: isUuid } = require("uuid");

const Spreadsheet = require("../models/spreadsheets/spreadsheet");
const { PROTECTED_ROLE } = require("../constants/protectedRoles");

module.exports = function spreadsheetSavePermission() {
  return async function (req, res, next) {
    const { role_name, id: userId } = req.user;

    if (role_name === PROTECTED_ROLE) {
      return next();
    }

    const { id } = req.params;
    if (!id || typeof id !== "string" || !isUuid(id)) {
      return res.status(400).json({ message: "Valid spreadsheet id is required" });
    }

    const spreadsheet = await Spreadsheet.findById(id);
    if (!spreadsheet) {
      return res.status(404).json({ message: "Spreadsheet not found" });
    }

    if (Number(spreadsheet.created_by) === Number(userId)) {
      return next();
    }

    const assignedUserIds = await Spreadsheet.getAssignedUserIds(id);
    if (assignedUserIds.includes(Number(userId))) {
      return next();
    }

    return res
      .status(403)
      .json({ message: "Forbidden: You are not allowed to save this spreadsheet" });
  };
};
