/**
 * Resolve which report type applies to an order from category data.
 * Mirrors frontend logic in OrderDetails.js / OrderDocuments.js:
 * 1) Use category.report_type when set on the category
 * 2) Else map from fixed category name rules (legacy categories without report_type)
 */
function resolveOrderReportType(categoryName, categoryReportType) {
  const fromCategory = String(categoryReportType || "").trim();
  if (fromCategory) {
    return fromCategory;
  }

  const name = String(categoryName || "").trim().toUpperCase();
  if (!name) {
    return null;
  }

  if (name === "COMMERCIAL VEHICLE") {
    return "report_cv";
  }
  if (name === "CONSTRUCTION EQUIPMENT" || name === "CONSTRUCTION EQUIPMENTS") {
    return "report_ce";
  }
  if (name.includes("AVR")) {
    return "report_avr";
  }
  if (name === "MACHINERY") {
    return "report_machinery";
  }
  if (name === "MARINE") {
    return "report_marine";
  }

  // Summarized has no category-name fallback (only via category.report_type).
  return null;
}

module.exports = { resolveOrderReportType };
