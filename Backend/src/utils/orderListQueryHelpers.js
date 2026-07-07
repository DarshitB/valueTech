const db = require("../../db");

const REF_NO_REPORT_TABLES = [
  "report_cv",
  "report_avr",
  "report_machinery",
  "report_ce",
  "report_marine",
  "report_summarized",
];

function applyRefNoIdSearchClause(queryBuilder, term) {
  REF_NO_REPORT_TABLES.forEach((table) => {
    queryBuilder.orWhereExists(function () {
      this.select(db.raw("1"))
        .from(table)
        .whereRaw(`${table}.order_id = orders.id`)
        .whereNotNull(`${table}.ref_no_id`)
        .where(`${table}.ref_no_id`, "ilike", term);
    });
  });

  queryBuilder.orWhereExists(function () {
    this.select(db.raw("1"))
      .from("report_custom")
      .whereRaw("report_custom.order_id = orders.id")
      .whereNotNull("report_custom.content")
      .whereRaw("report_custom.content->>'ref_no_id' ILIKE ?", [term]);
  });
}

const ORDER_LIST_SELECT = [
  "orders.id",
  "orders.order_number",
  "orders.customer_name",
  "orders.customer_name_2",
  "orders.contact",
  "orders.alternative_contact",
  "orders.supervisor_number",
  "orders.driver_number",
  "orders.payment_amount",
  "orders.payment_mode",
  "orders.payment_status",
  "orders.officer_id",
  "officer_user.name as officer_name",
  "officer_user.email as officer_email",
  "officer_user.mobile as officer_mobile",
  "officers.branch_id",
  "bank_branch.name as branch_name",
  "bank.id as bank_id",
  "bank.name as bank_name",
  "cities.id as city_id",
  "cities.name as city_name",
  "states.id as state_id",
  "states.name as state_name",
  "orders.manager_id",
  "manager.name as manager_name",
  "orders.telecaller_id",
  "telecaller.name as telecaller_name",
  "orders.registration_number",
  "orders.place_of_inspection",
  "orders.date_of_inspection",
  "orders.current_status_id",
  "order_status_master.name as current_status_name",
  "order_status_master.description as current_status_description",
  "orders.order_priority",
  "orders.order_type",
  "orders.created_at",
  "created_user.name as created_by",
  "orders.updated_at",
  "updated_user.name as updated_by",
  "orders.field_verifier_id",
  "field_verifiers.name as field_verifier_name",
  "child_category.id as child_category_id",
  "child_category.name as child_category_name",
  "sub_category.id as sub_category_id",
  "sub_category.name as sub_category_name",
  "category.id as category_id",
  "category.name as category_name",
  "category.report_type as category_report_type",
  "orders.valuer_name",
  "orders.job_started_at",
  "orders.job_started_by",
  "orders.covered_distance_by_verifier",
];

function applyOrderListJoins(queryBuilder) {
  return queryBuilder
    .leftJoin(
      "order_status_master",
      "orders.current_status_id",
      "order_status_master.id"
    )
    .leftJoin("officers", "orders.officer_id", "officers.id")
    .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
    .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
    .leftJoin("bank", "bank_branch.bank_id", "bank.id")
    .leftJoin("cities", "bank_branch.city_id", "cities.id")
    .leftJoin("states", "cities.state_id", "states.id")
    .leftJoin("users as manager", "orders.manager_id", "manager.id")
    .leftJoin("users as telecaller", "orders.telecaller_id", "telecaller.id")
    .leftJoin("users as created_user", "orders.created_by", "created_user.id")
    .leftJoin("users as updated_user", "orders.updated_by", "updated_user.id")
    .leftJoin("field_verifiers", "orders.field_verifier_id", "field_verifiers.id")
    .leftJoin("child_category", "orders.child_category_id", "child_category.id")
    .leftJoin(
      "sub_category",
      "child_category.sub_category_id",
      "sub_category.id"
    )
    .leftJoin("category", "sub_category.category_id", "category.id");
}

function parsePagination(query = {}) {
  const hasPage = query.page !== undefined && query.page !== "";
  const hasLimit = query.limit !== undefined && query.limit !== "";
  if (!hasPage && !hasLimit) return null;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

function parseDateParam(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function applyRequestFilters(queryBuilder, query = {}) {
  const text = (key) => {
    const val = query[key];
    if (val === undefined || val === null) return "";
    return String(val).trim();
  };

  const orderType = text("order_type");
  if (orderType) {
    queryBuilder.andWhereRaw("LOWER(TRIM(orders.order_type)) = LOWER(?)", [orderType]);
  }

  const orderPriority = text("order_priority");
  if (orderPriority) {
    queryBuilder.andWhereRaw("LOWER(TRIM(orders.order_priority)) = LOWER(?)", [orderPriority]);
  }

  const bankName = text("bank_name");
  if (bankName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(bank.name)) = LOWER(?)", [bankName]);
  }

  const branchName = text("branch_name");
  if (branchName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(bank_branch.name)) = LOWER(?)", [branchName]);
  }

  const officerName = text("officer_name");
  if (officerName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(officer_user.name)) = LOWER(?)", [officerName]);
  }

  const managerName = text("manager_name");
  if (managerName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(manager.name)) = LOWER(?)", [managerName]);
  }

  const fieldVerifierName = text("field_verifier_name");
  if (fieldVerifierName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(field_verifiers.name)) = LOWER(?)", [fieldVerifierName]);
  }

  const valuerName = text("valuer_name");
  if (valuerName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(orders.valuer_name)) = LOWER(?)", [valuerName]);
  }

  const currentStatusName = text("current_status_name");
  if (currentStatusName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(order_status_master.name)) = LOWER(?)", [currentStatusName]);
  }

  const paymentStatus = text("payment_status");
  if (paymentStatus) {
    queryBuilder.andWhereRaw("LOWER(TRIM(orders.payment_status)) = LOWER(?)", [paymentStatus]);
  }

  const categoryName = text("category_name");
  if (categoryName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(category.name)) = LOWER(?)", [categoryName]);
  }

  const subCategoryName = text("sub_category_name");
  if (subCategoryName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(sub_category.name)) = LOWER(?)", [subCategoryName]);
  }

  const childCategoryName = text("child_category_name");
  if (childCategoryName) {
    queryBuilder.andWhereRaw("LOWER(TRIM(child_category.name)) = LOWER(?)", [childCategoryName]);
  }

  const createdBy = text("created_by");
  if (createdBy) {
    queryBuilder.andWhereRaw("LOWER(TRIM(created_user.name)) = LOWER(?)", [createdBy]);
  }

  const userAssigned = text("user_assigned");
  if (userAssigned) {
    queryBuilder.whereExists(function () {
      this.select(db.raw("1"))
        .from("order_users")
        .join("users", "order_users.user_id", "users.id")
        .whereRaw("order_users.order_id = orders.id")
        .whereNull("order_users.deleted_at")
        .whereNull("users.deleted_at")
        .whereRaw("LOWER(TRIM(users.name)) = LOWER(?)", [userAssigned]);
    });
  }

  const search = text("search");
  if (search) {
    const term = `%${search.replace(/[%_\\]/g, "\\$&")}%`;
    queryBuilder.andWhere(function () {
      this.where("orders.order_number", "ilike", term)
        .orWhere("orders.customer_name", "ilike", term)
        .orWhere("orders.customer_name_2", "ilike", term)
        .orWhere("orders.registration_number", "ilike", term)
        .orWhere("orders.contact", "ilike", term)
        .orWhere("orders.valuer_name", "ilike", term)
        .orWhere("orders.order_priority", "ilike", term)
        .orWhere("orders.order_type", "ilike", term)
        .orWhere("orders.payment_status", "ilike", term)
        .orWhere("officer_user.name", "ilike", term)
        .orWhere("bank.name", "ilike", term)
        .orWhere("bank_branch.name", "ilike", term)
        .orWhere("manager.name", "ilike", term)
        .orWhere("field_verifiers.name", "ilike", term)
        .orWhere("order_status_master.name", "ilike", term)
        .orWhere("category.name", "ilike", term)
        .orWhere("sub_category.name", "ilike", term)
        .orWhere("child_category.name", "ilike", term)
        .orWhere("created_user.name", "ilike", term)
        .orWhere("updated_user.name", "ilike", term);

      applyRefNoIdSearchClause(this, term);
    });
  }

  const dateFrom = parseDateParam(query.date_from, false);
  const dateTo = parseDateParam(query.date_to, true);
  if (dateFrom) queryBuilder.andWhere("orders.created_at", ">=", dateFrom);
  if (dateTo) queryBuilder.andWhere("orders.created_at", "<=", dateTo);
}

async function distinctNonEmpty(queryBuilder, columnExpr, alias) {
  const rows = await queryBuilder
    .clone()
    .clearSelect()
    .clearOrder()
    .distinct(`${columnExpr} as ${alias}`)
    .whereNotNull(columnExpr)
    .orderBy(alias, "asc");

  const trimmed = rows
    .map((row) => (row[alias] != null ? String(row[alias]).trim() : ""))
    .filter((value) => value !== "");

  return [...new Set(trimmed)];
}

async function buildFilterOptions(roleFilteredQuery) {
  const base = roleFilteredQuery.clone().clearSelect().clearOrder();

  const [
    banks,
    branches,
    officers,
    managers,
    fieldVerifiers,
    valuerNames,
    orderStatuses,
    paymentStatuses,
    categories,
    assetCategories,
    subCategories,
    createdByValues,
  ] = await Promise.all([
    distinctNonEmpty(base, "bank.name", "bank_name"),
    distinctNonEmpty(base, "bank_branch.name", "branch_name"),
    distinctNonEmpty(base, "officer_user.name", "officer_name"),
    distinctNonEmpty(base, "manager.name", "manager_name"),
    distinctNonEmpty(base, "field_verifiers.name", "field_verifier_name"),
    distinctNonEmpty(base, "orders.valuer_name", "valuer_name"),
    distinctNonEmpty(base, "order_status_master.name", "current_status_name"),
    distinctNonEmpty(base, "orders.payment_status", "payment_status"),
    distinctNonEmpty(base, "category.name", "category_name"),
    distinctNonEmpty(base, "sub_category.name", "sub_category_name"),
    distinctNonEmpty(base, "child_category.name", "child_category_name"),
    distinctNonEmpty(base, "created_user.name", "created_by"),
  ]);

  const assignedRows = await base
    .clone()
    .clearSelect()
    .clearOrder()
    .join("order_users", function () {
      this.on("order_users.order_id", "=", "orders.id").andOnNull(
        "order_users.deleted_at"
      );
    })
    .join("users as assigned_user", "order_users.user_id", "assigned_user.id")
    .distinct("assigned_user.name as user_assigned")
    .whereNull("assigned_user.deleted_at")
    .whereNotNull("assigned_user.name")
    .orderBy("user_assigned", "asc");

  const userAssignedTrimmed = assignedRows
    .map((row) => (row.user_assigned != null ? String(row.user_assigned).trim() : ""))
    .filter((value) => value !== "");

  const userAssigned = [...new Set(userAssignedTrimmed)];

  return {
    banks,
    branches,
    officers,
    managers,
    fieldVerifiers,
    valuerNames,
    orderStatuses,
    paymentStatuses,
    categories,
    assetCategories,
    subCategories,
    createdBy: createdByValues,
    userAssigned,
  };
}

module.exports = {
  ORDER_LIST_SELECT,
  applyOrderListJoins,
  parsePagination,
  applyRequestFilters,
  buildFilterOptions,
};
