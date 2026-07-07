const db = require("../../../db");
const {
  ORDER_LIST_SELECT,
  applyOrderListJoins,
  parsePagination,
  applyRequestFilters,
  buildFilterOptions,
} = require("../../utils/orderListQueryHelpers");
const { computeR2CoverageForOrders } = require("../../utils/r2CoverageHelper");

const VALID_R2_STATE_FILTERS = new Set(["full", "partial", "remaining"]);

async function attachR2CoverageToOrders(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return orders;
  }

  const coverageMap = await computeR2CoverageForOrders(orders);
  return orders.map((order) => ({
    ...order,
    ...(coverageMap.get(Number(order.id)) || {
      r2_state: null,
      has_local_files: false,
      has_r2_content: false,
      can_sync_r2: false,
    }),
  }));
}

// Helper: robust role parsing to distinguish ADMIN vs SUPER/DEVELOPER ADMIN variants
function parseRole(roleNameRaw) {
  const roleName = (roleNameRaw || "").toUpperCase().trim();
  const tokens = roleName.split(/[^A-Z0-9]+/).filter(Boolean); // split on spaces/symbols
  const hasAdmin = tokens.includes("ADMIN");
  const hasSuper = tokens.includes("SUPER");
  const hasDeveloper = tokens.includes("DEVELOPER");

  return {
    isDeveloperAdmin: hasDeveloper && hasAdmin, // e.g., DEVELOPER ADMIN
    isSuperAdmin: hasSuper && hasAdmin, // e.g., SUPER ADMIN, SUPER ADMIN 1
    // Only treat as plain admin if it has ADMIN but not SUPER/DEVELOPER
    isAdminOnly: hasAdmin && !hasSuper && !hasDeveloper,
  };
}

// Helper: for a BANK AUTHORITY user, get all user_ids that should be visible
// Includes:
// - the authority themself
// - any officers they have created
// - any linked authorities
// - officers created by those linked authorities
async function getAuthorityVisibleUserIds(authorityUserId) {
  // Get linked authorities for this main authority
  const linkedRows = await db("bank_authority_linked_authorities")
    .select("linked_authority_user_id")
    .whereNull("deleted_at")
    .where("authority_user_id", authorityUserId);

  const linkedAuthorityUserIds = linkedRows.map(
    (row) => row.linked_authority_user_id
  );

  // All authority-type users in this hierarchy: main + linked authorities
  const allAuthorityUserIds = [authorityUserId, ...linkedAuthorityUserIds];

  // Get officers created by any of these authorities
  const officers = await db("officers")
    .select("user_id")
    .whereNull("deleted_at")
    .whereIn("created_by", allAuthorityUserIds);

  const officerUserIds = officers.map((o) => o.user_id);

  const ids = [...allAuthorityUserIds, ...officerUserIds];
  return [...new Set(ids)];
}

// Helper: get all category_ids (departments) assigned to the logged-in officer user
// via officer_categories. Used to filter orders by department for officer-type roles.
async function getOfficerDepartmentCategoryIds(userId) {
  const rows = await db("officers")
    .leftJoin(
      "officer_categories",
      "officers.id",
      "officer_categories.officer_id"
    )
    .select("officer_categories.category_id")
    .where("officers.user_id", userId)
    .whereNull("officers.deleted_at")
    .whereNull("officer_categories.deleted_at");

  const ids = rows
    .map((row) => row.category_id)
    .filter((id) => id !== null && id !== undefined);

  return [...new Set(ids)];
}

// Helper: get all category_ids (departments) assigned to a non-officer user
// via user_categories. Used to filter orders by department for non-officer roles.
async function getUserDepartmentCategoryIds(userId) {
  const rows = await db("user_categories")
    .select("category_id")
    .where("user_id", userId)
    .whereNull("deleted_at");

  const ids = rows
    .map((row) => row.category_id)
    .filter((id) => id !== null && id !== undefined);

  return [...new Set(ids)];
}

/**
 * Non-privileged users: orders assigned to them OR orders with no active
 * order_users rows. Uses NOT EXISTS instead of loading every distinct
 * order_id from order_users (very expensive when that table is large).
 */
async function applyNonPrivilegedOrderAssignmentFilter(baseQuery, userId) {
  const assignedOrderIds = await db("order_users")
    .pluck("order_id")
    .where("user_id", userId)
    .whereNull("deleted_at");

  baseQuery.where(function () {
    const noActiveAssignmentSubquery = function () {
      this.select(db.raw("1"))
        .from("order_users")
        .join("users", "order_users.user_id", "users.id")
        .whereRaw("order_users.order_id = orders.id")
        .whereNull("order_users.deleted_at")
        .whereNull("users.deleted_at");
    };

    if (assignedOrderIds.length > 0) {
      this.whereIn("orders.id", assignedOrderIds).orWhereNotExists(
        noActiveAssignmentSubquery
      );
    } else {
      this.whereNotExists(noActiveAssignmentSubquery);
    }
  });
}

/**
 * Same enrichment as before: assigned_users + ref_no_id per order (response shape unchanged).
 */
async function enrichOrdersWithAssignedUsersAndRefNo(orders) {
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length === 0) {
    return [];
  }

  const assignedUsers = await db("order_users")
    .join("users", "order_users.user_id", "users.id")
    .leftJoin("roles", "users.role_id", "roles.id")
    .select(
      "order_users.order_id",
      "users.id",
      "users.name",
      "users.email",
      "users.mobile",
      "roles.name as role_name"
    )
    .whereIn("order_users.order_id", orderIds)
    .whereNull("order_users.deleted_at")
    .whereNull("users.deleted_at");

  const assignedUsersMap = assignedUsers.reduce((acc, user) => {
    if (!user.id) return acc;
    if (!acc[user.order_id]) {
      acc[user.order_id] = [];
    }
    acc[user.order_id].push({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role_name: user.role_name,
    });
    return acc;
  }, {});

  const refNoIdMap = {};

  const [
    cvReports,
    avrReports,
    machineryReports,
    ceReports,
    marineReports,
    summarizedReports,
    customReports,
  ] = await Promise.all([
    db("report_cv")
      .select("order_id", "ref_no_id")
      .whereIn("order_id", orderIds)
      .whereNotNull("ref_no_id"),
    db("report_avr")
      .select("order_id", "ref_no_id")
      .whereIn("order_id", orderIds)
      .whereNotNull("ref_no_id"),
    db("report_machinery")
      .select("order_id", "ref_no_id")
      .whereIn("order_id", orderIds)
      .whereNotNull("ref_no_id"),
    db("report_ce")
      .select("order_id", "ref_no_id")
      .whereIn("order_id", orderIds)
      .whereNotNull("ref_no_id"),
    db("report_marine")
      .select("order_id", "ref_no_id")
      .whereIn("order_id", orderIds)
      .whereNotNull("ref_no_id"),
    db("report_summarized")
      .select("order_id", "ref_no_id")
      .whereIn("order_id", orderIds)
      .whereNotNull("ref_no_id"),
    db("report_custom")
      .select("order_id", "content")
      .whereIn("order_id", orderIds)
      .whereNotNull("content"),
  ]);

  [
    ...cvReports,
    ...avrReports,
    ...machineryReports,
    ...ceReports,
    ...marineReports,
    ...summarizedReports,
  ].forEach(
    (report) => {
      if (report.ref_no_id) {
        refNoIdMap[report.order_id] = report.ref_no_id;
      }
    }
  );

  customReports.forEach((report) => {
    if (report.content && typeof report.content === "object") {
      if (report.content.ref_no_id) {
        refNoIdMap[report.order_id] = report.content.ref_no_id;
      }
    }
  });

  return orders.map((order) => ({
    ...order,
    assigned_users: assignedUsersMap[order.id] || [],
    ref_no_id: refNoIdMap[order.id] || null,
  }));
}

const order = {
  // Get all orders (excludes status 13 finalized and 14 on hold - those are fetched via getAllOrdersWithWoStatus / finalized-and-on-hold-orders)
  getAllOrders: async (user) => {
    // Base order query
    const baseQuery = db("orders")
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
      .leftJoin(
        "field_verifiers",
        "orders.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
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
        "orders.covered_distance_by_verifier"
      )
      .whereNull("orders.deleted_at")
      .whereNotIn("orders.current_status_id", [13, 14]);

    // Role-based filters - check if role contains specific keywords
    const roleName = (user.role_name || "").toUpperCase();

    // Roles that should see all orders (no filtering)
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    // Check if user role contains any of the privileged keywords
    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    // If user doesn't have a privileged role, apply order assignment filtering
    if (!hasPrivilegedRole) {
      await applyNonPrivilegedOrderAssignmentFilter(baseQuery, user.id);
    }

    // Additional role-specific filters (these work alongside assigned orders)
    if ((user.role_name || "").toUpperCase().includes("BANK AUTHORITY")) {
      const visibleUserIds = await getAuthorityVisibleUserIds(user.id);

      baseQuery.andWhere(function () {
        this.whereIn("orders.created_by", visibleUserIds)
          .orWhereIn("officers.user_id", visibleUserIds)
          .orWhereIn("orders.manager_id", visibleUserIds);
      });
    } else if ((user.role_name || "").toUpperCase().includes("BANK OFFICER")) {
      baseQuery.andWhere("officers.user_id", user.id);
    } else if ((user.role_name || "").toUpperCase().includes("MANAGER")) {
      baseQuery.andWhere("orders.manager_id", user.id);
    } else if ((user.role_name || "").toUpperCase().includes("TELECALLER")) {
      // TELECALLER can only see orders assigned to them via telecaller_id,
      // and only while no manager is assigned yet
      baseQuery
        .andWhere("orders.telecaller_id", user.id)
        .whereNull("orders.manager_id");
    }

    // Additional department-based filtering:
    // - Officer-type roles (BANK OFFICER / BANK AUTHORITY / CREDIT HEAD) use officer_categories
    // - Other roles (e.g. manager, telecaller, etc.) use user_categories
    if (
      roleName.includes("BANK OFFICER") ||
      roleName.includes("BANK AUTHORITY") ||
      roleName.includes("CREDIT HEAD")
    ) {
      const departmentCategoryIds = await getOfficerDepartmentCategoryIds(
        user.id
      );

      if (departmentCategoryIds.length > 0) {
        baseQuery.whereIn("category.id", departmentCategoryIds);
      }
      // If officer has no departments, do not apply any extra category filter
    } else {
      const departmentCategoryIds = await getUserDepartmentCategoryIds(user.id);

      if (departmentCategoryIds.length > 0) {
        baseQuery.whereIn("category.id", departmentCategoryIds);
      }
      // If user has no departments, do not apply any extra category filter
    }

    // For MANAGER roles, exclude orders with current_status_id >= 8
    if (roleName.includes("MANAGER")) {
      baseQuery.andWhere("orders.current_status_id", "<", 8);
    }

    // Sort by newest first
    baseQuery.orderBy("orders.created_at", "asc");

    const orders = await baseQuery;

    return enrichOrdersWithAssignedUsersAndRefNo(orders);
  },

  // Get all orders that are finalized (status 13) or on hold (status 14) - same logic as getAllOrders but only these statuses
  getAllOrdersWithWoStatus: async (user, queryOptions = {}) => {
    const baseQuery = applyOrderListJoins(db("orders"))
      .select(ORDER_LIST_SELECT)
      .whereNull("orders.deleted_at")
      .whereIn("orders.current_status_id", [13, 14]);

    // Role-based filters - check if role contains specific keywords
    const roleName = (user.role_name || "").toUpperCase();

    // Roles that should see all orders (no filtering)
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    // Check if user role contains any of the privileged keywords
    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    // If user doesn't have a privileged role, apply order assignment filtering
    if (!hasPrivilegedRole) {
      await applyNonPrivilegedOrderAssignmentFilter(baseQuery, user.id);
    }

    // Additional role-specific filters (these work alongside assigned orders)
    if ((user.role_name || "").toUpperCase().includes("BANK AUTHORITY")) {
      const visibleUserIds = await getAuthorityVisibleUserIds(user.id);

      baseQuery.andWhere(function () {
        this.whereIn("orders.created_by", visibleUserIds)
          .orWhereIn("officers.user_id", visibleUserIds)
          .orWhereIn("orders.manager_id", visibleUserIds);
      });
    } else if ((user.role_name || "").toUpperCase().includes("BANK OFFICER")) {
      baseQuery.andWhere("officers.user_id", user.id);
    } else if ((user.role_name || "").toUpperCase().includes("MANAGER")) {
      baseQuery.andWhere("orders.manager_id", user.id);
    } else if ((user.role_name || "").toUpperCase().includes("TELECALLER")) {
      baseQuery
        .andWhere("orders.telecaller_id", user.id)
        .whereNull("orders.manager_id");
    }

    if (
      roleName.includes("BANK OFFICER") ||
      roleName.includes("BANK AUTHORITY") ||
      roleName.includes("CREDIT HEAD")
    ) {
      const departmentCategoryIds = await getOfficerDepartmentCategoryIds(
        user.id
      );

      if (departmentCategoryIds.length > 0) {
        baseQuery.whereIn("category.id", departmentCategoryIds);
      }
    } else {
      const departmentCategoryIds = await getUserDepartmentCategoryIds(user.id);

      if (departmentCategoryIds.length > 0) {
        baseQuery.whereIn("category.id", departmentCategoryIds);
      }
    }

    if (roleName.includes("MANAGER")) {
      baseQuery.andWhere("orders.current_status_id", "<", 8);
    }

    const pagination = parsePagination(queryOptions);
    if (!pagination) {
      baseQuery.orderBy("orders.created_at", "asc");
      const orders = await baseQuery;
      const enriched = await enrichOrdersWithAssignedUsersAndRefNo(orders);
      return attachR2CoverageToOrders(enriched);
    }

    const roleScopedQuery = baseQuery.clone();
    applyRequestFilters(roleScopedQuery, queryOptions);

    const r2StateFilter = String(queryOptions.r2_state || "")
      .trim()
      .toLowerCase();
    let filteredQuery = roleScopedQuery.clone();

    if (VALID_R2_STATE_FILTERS.has(r2StateFilter)) {
      const candidateRows = await roleScopedQuery
        .clone()
        .clearSelect()
        .clearOrder()
        .select("orders.id", "orders.order_number", "orders.current_status_id");

      const coverageMap = await computeR2CoverageForOrders(candidateRows);
      const matchingIds = candidateRows
        .filter((row) => coverageMap.get(Number(row.id))?.r2_state === r2StateFilter)
        .map((row) => Number(row.id));

      if (matchingIds.length === 0) {
        const includeFilterOptionsEmpty =
          queryOptions.include_filter_options === "1" ||
          queryOptions.include_filter_options === "true" ||
          queryOptions.include_filter_options === true;

        const emptyResponse = {
          data: [],
          pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: 0,
            totalPages: 1,
          },
        };

        if (includeFilterOptionsEmpty) {
          emptyResponse.filterOptions = await buildFilterOptions(baseQuery);
        }

        return emptyResponse;
      }

      filteredQuery = roleScopedQuery.clone().whereIn("orders.id", matchingIds);
    }

    const countRow = await filteredQuery
      .clone()
      .clearSelect()
      .clearOrder()
      .countDistinct({ total: "orders.id" })
      .first();
    const total = Number(countRow?.total || 0);

    const rows = await filteredQuery
      .clone()
      .orderBy("orders.created_at", "desc")
      .limit(pagination.limit)
      .offset(pagination.offset);

    const data = await attachR2CoverageToOrders(
      await enrichOrdersWithAssignedUsersAndRefNo(rows)
    );

    const includeFilterOptions =
      queryOptions.include_filter_options === "1" ||
      queryOptions.include_filter_options === "true" ||
      queryOptions.include_filter_options === true;

    const response = {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 1,
      },
    };

    if (includeFilterOptions) {
      response.filterOptions = await buildFilterOptions(baseQuery);
    }

    return response;
  },

  // Get orders for mobile app filtered by field verifier ID (excludes finalized 13 and on hold 14)
  getForMobile: async (fieldVerifierId) => {
    // Base order query
    const baseQuery = db("orders")
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
      .leftJoin(
        "field_verifiers",
        "orders.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
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
        "bank.initial as bank_initial",
        "cities.id as city_id",
        "cities.name as city_name",
        "states.id as state_id",
        "states.name as state_name",
        "orders.manager_id",
        "manager.name as manager_name",
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
        "orders.job_started_at",
        "orders.job_started_by",
        "orders.covered_distance_by_verifier",
        "child_category.id as child_category_id",
        "child_category.name as child_category_name",
        "sub_category.id as sub_category_id",
        "sub_category.name as sub_category_name",
        "category.id as category_id",
        "category.name as category_name",
        "category.report_type as category_report_type",
        "orders.valuer_name"
      )
      .whereNull("orders.deleted_at")
      .where("orders.field_verifier_id", fieldVerifierId)
      .where("orders.current_status_id", "<", 8)
      .whereNotIn("orders.current_status_id", [13, 14]);

    // Sort by newest first
    baseQuery.orderBy("orders.created_at", "desc");

    const orders = await baseQuery;
    return orders;
  },

  // Get order by ID (with status and user details)
  findById: async (id, user) => {
    const order = await db("orders")
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
      .leftJoin(
        "field_verifiers",
        "orders.field_verifier_id",
        "field_verifiers.id"
      )
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
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
        "officers.user_id as officer_user_id",
        "officer_user.name as officer_name",
        "officer_user.email as officer_email",
        "officer_user.mobile as officer_mobile",
        "officers.branch_id",
        "bank_branch.name as branch_name",
        "bank.id as bank_id",
        "bank.name as bank_name",
        "bank.initial as bank_initial",
        "cities.id as city_id",
        "cities.name as city_name",
        "states.id as state_id",
        "states.name as state_name",
        "orders.manager_id",
        "manager.name as manager_name",
        "orders.telecaller_id",
        "telecaller.name as telecaller_name",
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
        "orders.covered_distance_by_verifier"
      )
      .whereNull("orders.deleted_at")
      .where("orders.id", id)
      .first();

    if (!order) return null;

    // Check user access permissions - now we have officer_user_id in the order data
    const roleName = (user.role_name || "").toUpperCase();

    // Roles that should see all orders (no filtering)
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    // Check if user role contains any of the privileged keywords
    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    // If user doesn't have a privileged role, check order assignment
    if (!hasPrivilegedRole) {
      // Check if this order is assigned to the user
      const isAssigned = await db("order_users")
        .where({ order_id: id, user_id: user.id })
        .whereNull("deleted_at")
        .first();

      // Check if this order has ANY active user assignments (exclude deleted users)
      const hasAnyAssignment = await db("order_users")
        .join("users", "order_users.user_id", "users.id")
        .where({ order_id: id })
        .whereNull("order_users.deleted_at")
        .whereNull("users.deleted_at")
        .first();

      // If order has assignments but user is not assigned, deny access
      if (hasAnyAssignment && !isAssigned) {
        return null; // User can only see orders assigned to them
      }

      // If order has no assignments, allow access to everyone
      // If user is assigned, allow access
    }

    // Additional role-specific access checks (these work alongside assigned orders)
    if ((user.role_name || "").toUpperCase().includes("BANK OFFICER")) {
      if (order.officer_user_id !== user.id) {
        return null; // Officer can only see orders assigned to them
      }
    } else if (
      (user.role_name || "").toUpperCase().includes("MANAGER") &&
      order.manager_id !== user.id
    ) {
      return null; // Manager can only see their own orders
    } else if (
      (user.role_name || "").toUpperCase().includes("TELECALLER") &&
      order.telecaller_id !== user.id
    ) {
      return null; // Telecaller can only see orders assigned to them
    } else if (
      (user.role_name || "").toUpperCase().includes("BANK AUTHORITY")
    ) {
      // BANK AUTHORITY can see orders they or their officers/linked users
      // created, are assigned to, or manage
      const visibleUserIds = await getAuthorityVisibleUserIds(user.id);

      if (
        !visibleUserIds.includes(order.created_by) &&
        !visibleUserIds.includes(order.officer_user_id) &&
        !visibleUserIds.includes(order.manager_id)
      ) {
        return null;
      }
    }

    // Department-based access check:
    // - Officer-type roles use officer_categories
    // - Other roles use user_categories
    if (
      roleName.includes("BANK OFFICER") ||
      roleName.includes("BANK AUTHORITY") ||
      roleName.includes("CREDIT HEAD")
    ) {
      const departmentCategoryIds = await getOfficerDepartmentCategoryIds(
        user.id
      );

      if (
        departmentCategoryIds.length > 0 &&
        !departmentCategoryIds.includes(order.category_id)
      ) {
        return null;
      }
      // If officer has no departments, do not block access based on category
    } else {
      const departmentCategoryIds = await getUserDepartmentCategoryIds(user.id);

      if (
        departmentCategoryIds.length > 0 &&
        !departmentCategoryIds.includes(order.category_id)
      ) {
        return null;
      }
      // If user has no departments, do not block access based on category
    }

    // Get status history for this order
    const statusHistory = await db("order_status_history")
      .leftJoin(
        "order_status_master",
        "order_status_history.status_id",
        "order_status_master.id"
      )
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .leftJoin(
        "field_verifiers",
        "order_status_history.changed_by",
        "field_verifiers.id"
      )
      .select(
        "order_status_history.id",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_history.changed_by",
        "order_status_history.activity_extra",
        "order_status_history.user_type",
        db.raw(
          "CASE WHEN order_status_history.user_type = 'field_verifier' THEN field_verifiers.name ELSE users.name END as changed_by_name"
        ),
        "order_status_history.changed_at"
      )
      .where("order_status_history.order_id", id)
      .orderBy("order_status_history.id", "desc");

    // Get assigned users for this order (exclude soft-deleted users)
    const assignedUsers = await db("order_users")
      .join("users", "order_users.user_id", "users.id")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "roles.name as role_name"
      )
      .where("order_users.order_id", id)
      .whereNull("order_users.deleted_at")
      .whereNull("users.deleted_at");

    const r2Coverage = await computeR2CoverageForOrders([
      {
        id: order.id,
        order_number: order.order_number,
        current_status_id: order.current_status_id,
      },
    ]);

    return {
      ...order,
      status_history: statusHistory,
      assigned_users: assignedUsers,
      ...(r2Coverage.get(Number(order.id)) || {
        r2_state: null,
        has_local_files: false,
        has_r2_content: false,
        can_sync_r2: false,
      }),
    };
  },

  // Get orders by officer ID
  /* getOrdersByOfficer: async (officerId, user) => {
    // Check if user has permission to view this officer's orders
      if (user.role_name.toUpperCase().includes("BANK OFFICER") && user.id !== officerId) {
      return []; // Officers can only see their own orders
    }

    const orders = await db("orders")
      .leftJoin("order_status_master", "orders.current_status_id", "order_status_master.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
      .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
      .leftJoin("bank", "bank_branch.bank_id", "bank.id")
      .leftJoin("users as manager", "orders.manager_id", "manager.id")
      .select(
        "orders.id",
        "orders.order_number",
        "orders.customer_name",
        "orders.contact",
        "orders.place_of_inspection",
        "orders.date_of_inspection",
        "orders.current_status_id",
        "order_status_master.name as current_status_name",
        "orders.created_at",
        "officer_user.name as officer_name",
        "bank_branch.name as branch_name",
        "bank.name as bank_name"
      )
      .whereNull("orders.deleted_at")
      .where("orders.officer_id", officerId);

    return orders;
  }, */

  // Find order by order number
  findByOrderNumber: async (orderNumber) => {
    const order = await db("orders")
      .leftJoin(
        "child_category",
        "orders.child_category_id",
        "child_category.id"
      )
      .leftJoin(
        "sub_category",
        "child_category.sub_category_id",
        "sub_category.id"
      )
      .leftJoin("category", "sub_category.category_id", "category.id")
      .select(
        "orders.*",
        "child_category.id as child_category_id",
        "child_category.name as child_category_name",
        "sub_category.id as sub_category_id",
        "sub_category.name as sub_category_name",
        "category.id as category_id",
        "category.name as category_name",
        "category.report_type as report_type",
        "category.report_type as category_report_type"
      )
      .where({ order_number: orderNumber })
      .whereNull("orders.deleted_at")
      .first();
    return order;
  },

  // Create order
  createOrder: async (data) => {
    const [order] = await db("orders").insert(data).returning("*");
    return order;
  },

  // Update order
  updateOrder: async (id, data, userId) => {
    const [order] = await db("orders")
      .where({ id })
      .update({
        ...data,
        updated_at: new Date(),
        updated_by: userId,
      })
      .returning("*");
    return order;
  },

  updatePaymentStatus: async (id, data) => {
    const [order] = await db("orders")
      .where({ id })
      .update({
        payment_status: data.payment_status,
        payment_amount: data.payment_amount,
        payment_mode: data.payment_mode,
      })
      .returning("*");
    return order;
  },

  // Soft delete order
  softDelete: async (id, userId) => {
    await db("orders").where({ id }).update({
      deleted_at: new Date(),
      deleted_by: userId,
    });
  },

  // Get order status history
  /*   getOrderStatusHistory: async (orderId, user) => {
    // First check if user has access to this order
    const order = await db("orders")
      .select("officer_id", "manager_id", "created_by")
      .where("id", orderId)
      .whereNull("deleted_at")
      .first();

    if (!order) return null;

    // Check user access permissions
    const roleName = user.role_name.toUpperCase();
    
    if (roleName.includes("BANK OFFICER") && order.officer_id !== user.id) {
      return null;
    } else if (roleName.includes("MANAGER") && order.manager_id !== user.id) {
      return null;
    } else if (roleName.includes("BANK AUTHORITY")) {
      if (order.created_by !== user.id && 
          order.officer_id !== user.id && 
          order.manager_id !== user.id) {
        return null;
      }
    }

    const statusHistory = await db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .select(
        "order_status_history.id",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_master.description as status_description",
        "order_status_history.changed_by",
        "users.name as changed_by_name",
        "order_status_history.changed_at"
      )
      .where("order_status_history.order_id", orderId)
      .orderBy("order_status_history.changed_at", "desc");

    return statusHistory;
  }, */

  // Update specific order attributes (partial update)
  updateOrderAttributes: async (orderId, updateData, userId) => {
    // Add updated_by and updated_at to the update data
    const finalUpdateData = {
      ...updateData,
      updated_by: userId,
      updated_at: new Date(),
    };

    // Update the order with the provided attributes
    const [updatedOrder] = await db("orders")
      .where({ id: orderId })
      .update(finalUpdateData)
      .returning("*");

    return updatedOrder;
  },

  // Create order-user assignments (bulk insert)
  createOrderUsers: async (data, trx = db) => {
    // Guard clause
    if (!Array.isArray(data) || data.length === 0) return [];
    return await trx("order_users").insert(data).returning("*");
  },

  // Replace order-user assignments (hard delete old, insert new)
  replaceOrderUsers: async (order_id, newUserData, trx = db) => {
    // Guard clause - ensure newUserData is an array
    if (!Array.isArray(newUserData)) return [];

    // Hard delete ALL existing assignments for this order (always do this)
    await trx("order_users").where({ order_id }).del();

    // Insert new assignments only if there are any
    if (newUserData.length === 0) return [];

    return await trx("order_users").insert(newUserData).returning("*");
  },

  // Get assigned users for an order (exclude soft-deleted users)
  getOrderUsers: async (orderId) => {
    const users = await db("order_users")
      .join("users", "order_users.user_id", "users.id")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "users.mobile",
        "roles.name as role_name"
      )
      .where("order_users.order_id", orderId)
      .whereNull("order_users.deleted_at")
      .whereNull("users.deleted_at");
    return users;
  },
};

module.exports = order;
