const {
  assertSpreadsheetAccess,
} = require("../services/spreadsheets/spreadsheetAccessPolicy");

module.exports = function spreadsheetEditPermission() {
  return async function (req, res, next) {
    try {
      await assertSpreadsheetAccess({
        spreadsheetId: req.params.id,
        user: req.user,
        requiredPermission: "edit_spreadsheet",
        creatorBypassesPermission: true,
      });
      return next();
    } catch (error) {
      return next(error);
    }
  };
};
