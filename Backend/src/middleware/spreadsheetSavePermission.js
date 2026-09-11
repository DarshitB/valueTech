const {
  assertSpreadsheetAccess,
} = require("../services/spreadsheets/spreadsheetAccessPolicy");

module.exports = function spreadsheetSavePermission() {
  return async function (req, res, next) {
    try {
      await assertSpreadsheetAccess({
        spreadsheetId: req.params.id,
        user: req.user,
      });
      return next();
    } catch (error) {
      return next(error);
    }
  };
};
