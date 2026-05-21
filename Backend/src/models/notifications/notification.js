const db = require("../../../db");
const { PROTECTED_ROLE } = require("../../constants/protectedRoles");

const VIEW_COMMENT_NOTIFICATIONS_PERMISSION = "view_comment_notifications";

/**
 * Whether the viewing user's role may see comment notifications in the API.
 * Permission is added manually in DB (no migration).
 */
async function hasViewCommentNotificationsPermission(roleId, roleName) {
  try {
    if (roleName === PROTECTED_ROLE) {
      return true;
    }
    if (!roleId) {
      return false;
    }

    const permission = await db("permissions")
      .join(
        "role_permissions",
        "permissions.id",
        "role_permissions.permission_id"
      )
      .where({
        "permissions.name": VIEW_COMMENT_NOTIFICATIONS_PERMISSION,
        "role_permissions.role_id": roleId,
      })
      .whereNull("role_permissions.deleted_at")
      .first();

    return !!permission;
  } catch (error) {
    console.error("Error checking view_comment_notifications permission:", error);
    return false;
  }
}

function isCommentNotificationRow(notif) {
  return !!(notif?.comment_id && notif?.notification_type === "comment");
}

/**
 * Strip comment notifications when the viewer lacks view_comment_notifications.
 */
async function filterCommentNotifications(notifications, viewerRoleId, viewerRoleName) {
  const list = notifications || [];
  const canView = await hasViewCommentNotificationsPermission(
    viewerRoleId,
    viewerRoleName
  );
  if (canView) {
    return list;
  }
  return list.filter((notif) => !isCommentNotificationRow(notif));
}

/**
 * Privileged roles: hide your own status/comment alerts from others' feeds,
 * but always include media uploads (status 7 + "Uploaded" in activity_extra).
 */
function applyPrivilegedSelfActionFilter(queryBuilder, userId) {
  return queryBuilder.where(function () {
    this.where(function () {
      this.whereNotNull("notifications.activity_id").where(function () {
        this.where("order_status_history.changed_by", "!=", userId).orWhere(
          function () {
            this.where("order_status_history.status_id", 7).whereRaw(
              "COALESCE(order_status_history.activity_extra, '') ILIKE ?",
              ["%uploaded%"]
            );
          }
        );
      });
    }).orWhere(function () {
      this.whereNotNull("notifications.comment_id").where(
        "order_comments.user_id",
        "!=",
        userId
      );
    });
  });
}

const notification = {
  // Get ALL notifications (read + unread) for a user with optional last_check filter
  // Filter based on order permissions (same logic as order model)
  getAllNotificationsWithFilter: async (userId, userRole, user, options = {}) => {
    const { last_check, limit = 200, offset = 0 } = options;
    
    try {
      const roleName = (userRole || "").toUpperCase();
      
      // Privileged roles that can see all orders
      const privilegedRoles = [
        "DEVELOPER_ADMIN",
        "SUPER ADMIN",
        "MANAGER",
        "TELECALLER",
        "BANK AUTHORITY",
        "BANK OFFICER",
      ];

      const hasPrivilegedRole = privilegedRoles.some((keyword) =>
        roleName.includes(keyword)
      );

      // STEP 1: Get order IDs that the user has access to (using same logic as order model)
      let accessibleOrderIds = null;

      if (!hasPrivilegedRole) {
        // For non-privileged roles: get orders assigned to user OR orders with no assignments
        const assignedOrderIds = await db("order_users")
          .select("order_id")
          .where("user_id", userId)
          .whereNull("deleted_at");

        const userAssignedOrderIds = assignedOrderIds.map((o) => o.order_id);

        const ordersWithAssignments = await db("order_users")
          .select("order_id")
          .whereNull("deleted_at")
          .distinct();

        const ordersWithAnyAssignment = ordersWithAssignments.map((o) => o.order_id);

        // Orders accessible: assigned to user OR have no assignments
        const unassignedOrders = await db("orders")
          .select("id")
          .whereNotIn("id", ordersWithAnyAssignment)
          .whereNull("deleted_at");
        
        const unassignedOrderIds = unassignedOrders.map(o => o.id);
        accessibleOrderIds = [...userAssignedOrderIds, ...unassignedOrderIds];
      }

      // STEP 2: Build base query to get all notification IDs that match filters
      let baseNotificationQuery = db("notifications")
        .select("notifications.id")
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
        .leftJoin("officers", "orders.officer_id", "officers.id")
        .whereNull("orders.deleted_at");

      // Apply order permission filters
      if (!hasPrivilegedRole) {
        // Non-privileged: only orders they have access to
        if (accessibleOrderIds && accessibleOrderIds.length > 0) {
          baseNotificationQuery = baseNotificationQuery.whereIn("notifications.order_id", accessibleOrderIds);
        } else {
          // No accessible orders, return empty
          return [];
        }
      } else {
        // Privileged roles: apply role-specific filters
        if (roleName.includes("BANK AUTHORITY")) {
          baseNotificationQuery = baseNotificationQuery.where(function() {
            this.where("orders.created_by", userId)
              .orWhere("officers.user_id", userId)
              .orWhere("orders.manager_id", userId);
          });
        } else if (roleName.includes("BANK OFFICER")) {
          baseNotificationQuery = baseNotificationQuery.where("officers.user_id", userId);
        } else if (roleName.includes("MANAGER")) {
          baseNotificationQuery = baseNotificationQuery.where("orders.manager_id", userId);
        }
        // DEVELOPER_ADMIN, SUPER ADMIN, TELECALLER see all (no additional filter)
      }

      if (hasPrivilegedRole) {
        baseNotificationQuery = applyPrivilegedSelfActionFilter(
          baseNotificationQuery,
          userId
        );
      }

      // Apply last_check filter if provided
      if (last_check) {
        const lastCheckDate = new Date(last_check);
        if (!isNaN(lastCheckDate.getTime())) {
          baseNotificationQuery = baseNotificationQuery.where("notifications.created_at", ">", lastCheckDate);
        }
      }

      // STEP 2: Fetch full notification data. Each notification event has exactly one row in
      // the notifications table. Per-user read state is tracked in user_notification_reads —
      // so we never need to collapse duplicates here any more.
      let query = db("notifications")
        .whereIn("notifications.id", baseNotificationQuery)
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
        .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
        .leftJoin("users as notification_user", "notifications.user_id", "notification_user.id")
        .leftJoin(
          "users as changed_by_user",
          "order_status_history.changed_by",
          "changed_by_user.id"
        )
        .leftJoin(
          "field_verifiers",
          "order_status_history.changed_by",
          "field_verifiers.id"
        )
        .leftJoin("users as comment_user", "order_comments.user_id", "comment_user.id")
        .leftJoin(
          "field_verifiers as comment_field_verifier",
          "order_comments.user_id",
          "comment_field_verifier.id"
        )
        .select(
          "notifications.id",
          "notifications.user_id",
          "notification_user.name as user_name",
          "notifications.order_id",
          "orders.order_number",
          "notifications.activity_id",
          "notifications.comment_id",
          "notifications.notification_type",
          "notifications.title",
          "notifications.description",
          // Per-user read state: true if this user has a row in user_notification_reads
          db.raw(
            "EXISTS(SELECT 1 FROM user_notification_reads WHERE notification_id = notifications.id AND user_id = ?) as is_read",
            [userId]
          ),
          db.raw(
            "(SELECT read_at FROM user_notification_reads WHERE notification_id = notifications.id AND user_id = ? LIMIT 1) as read_at",
            [userId]
          ),
          "notifications.created_at",
          "order_status_history.status_id",
          "order_status_master.name as status_name",
          "order_status_history.activity_extra",
          "order_status_history.changed_by",
          "order_status_history.user_type",
          db.raw(`
            CASE
              WHEN order_status_history.user_type = 'field_verifier' THEN field_verifiers.name
              ELSE changed_by_user.name
            END as changed_by_name
          `),
          "order_status_history.changed_at",
          "order_comments.comment as comment_text",
          "order_comments.user_id as comment_user_id",
          "order_comments.user_type as comment_user_type",
          db.raw(`
            COALESCE(
              CASE
                WHEN order_comments.user_type IN ('field_verifier', 'filed_verifier', 'filed_varifier')
                  THEN comment_field_verifier.name
                ELSE comment_user.name
              END,
              comment_user.name,
              comment_field_verifier.name
            ) as comment_user_name
          `),
          "order_comments.commented_at"
        )
        .orderBy("notifications.created_at", "desc")
        .limit(limit)
        .offset(offset);

      const results = await query;
      // Filter comment notifications based on permission
      const filteredResults = await filterCommentNotifications(
        results || [],
        user?.role_id,
        user?.role_name || userRole
      );
      return filteredResults;
    } catch (error) {
      return [];
    }
  },

  // Get total count of unread notifications for a user (all-time, not filtered by last_check)
  // Filter based on order permissions (same logic as order model)
  getUnreadCount: async (userId, userRole, user) => {
    const roleName = (userRole || "").toUpperCase();
    
    // Privileged roles that can see all orders
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    // Build query with order permission filters.
    // A notification is "unread for this user" when there is no matching row in
    // user_notification_reads — we never touch the legacy notifications.is_read column.
    let query = db("notifications")
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .whereNotExists(function () {
        this.select("id")
          .from("user_notification_reads")
          .whereRaw("notification_id = notifications.id")
          .where("user_id", userId);
      })
      .whereNull("orders.deleted_at");

    // Apply order permission filters (same as getAllNotificationsWithFilter)
    if (!hasPrivilegedRole) {
      // Get accessible order IDs
      const assignedOrderIds = await db("order_users")
        .select("order_id")
        .where("user_id", userId)
        .whereNull("deleted_at");

      const userAssignedOrderIds = assignedOrderIds.map((o) => o.order_id);

      const ordersWithAssignments = await db("order_users")
        .select("order_id")
        .whereNull("deleted_at")
        .distinct();

      const ordersWithAnyAssignment = ordersWithAssignments.map((o) => o.order_id);

      const unassignedOrders = await db("orders")
        .select("id")
        .whereNotIn("id", ordersWithAnyAssignment)
        .whereNull("deleted_at");
      
      const unassignedOrderIds = unassignedOrders.map(o => o.id);
      const accessibleOrderIds = [...userAssignedOrderIds, ...unassignedOrderIds];

      if (accessibleOrderIds.length > 0) {
        query = query.whereIn("notifications.order_id", accessibleOrderIds);
      } else {
        return 0; // No accessible orders
      }
    } else {
      // Privileged roles: apply role-specific filters
      if (roleName.includes("BANK AUTHORITY")) {
        query = query.where(function() {
          this.where("orders.created_by", userId)
            .orWhere("officers.user_id", userId)
            .orWhere("orders.manager_id", userId);
        });
      } else if (roleName.includes("BANK OFFICER")) {
        query = query.where("officers.user_id", userId);
      } else if (roleName.includes("MANAGER")) {
        query = query.where("orders.manager_id", userId);
      }
      query = applyPrivilegedSelfActionFilter(query, userId);
    }

    // Use distinct count to avoid duplicates from joins
    const result = await query
      .countDistinct("notifications.id as count")
      .first();
    
    return parseInt(result.count) || 0;
  },

  // Get unread notifications for a user (without last_check filter)
  // Filter based on order permissions (same logic as order model)
  getUnreadNotifications: async (userId, userRole, user, options = {}) => {
    const { limit = 200, offset = 0 } = options;
    
    try {
      const roleName = (userRole || "").toUpperCase();
      
      // Privileged roles that can see all orders
      const privilegedRoles = [
        "DEVELOPER_ADMIN",
        "SUPER ADMIN",
        "MANAGER",
        "TELECALLER",
        "BANK AUTHORITY",
        "BANK OFFICER",
      ];

      const hasPrivilegedRole = privilegedRoles.some((keyword) =>
        roleName.includes(keyword)
      );

      // Get accessible order IDs (same logic as getAllNotificationsWithFilter)
      let accessibleOrderIds = null;

      if (!hasPrivilegedRole) {
        const assignedOrderIds = await db("order_users")
          .select("order_id")
          .where("user_id", userId)
          .whereNull("deleted_at");

        const userAssignedOrderIds = assignedOrderIds.map((o) => o.order_id);

        const ordersWithAssignments = await db("order_users")
          .select("order_id")
          .whereNull("deleted_at")
          .distinct();

        const ordersWithAnyAssignment = ordersWithAssignments.map((o) => o.order_id);

        const unassignedOrders = await db("orders")
          .select("id")
          .whereNotIn("id", ordersWithAnyAssignment)
          .whereNull("deleted_at");
        
        const unassignedOrderIds = unassignedOrders.map(o => o.id);
        accessibleOrderIds = [...userAssignedOrderIds, ...unassignedOrderIds];
      }

      // STEP 1: Build the base query for notifications this user can see and has NOT yet read.
      // "Unread for this user" = no row in user_notification_reads for (notification_id, user_id).
      let baseNotificationQuery = db("notifications")
        .select("notifications.id")
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
        .leftJoin("officers", "orders.officer_id", "officers.id")
        .whereNotExists(function () {
          this.select("id")
            .from("user_notification_reads")
            .whereRaw("notification_id = notifications.id")
            .where("user_id", userId);
        })
        .whereNull("orders.deleted_at");

      // Apply order permission filters
      if (!hasPrivilegedRole) {
        if (accessibleOrderIds && accessibleOrderIds.length > 0) {
          baseNotificationQuery = baseNotificationQuery.whereIn("notifications.order_id", accessibleOrderIds);
        } else {
          return [];
        }
      } else {
        if (roleName.includes("BANK AUTHORITY")) {
          baseNotificationQuery = baseNotificationQuery.where(function() {
            this.where("orders.created_by", userId)
              .orWhere("officers.user_id", userId)
              .orWhere("orders.manager_id", userId);
          });
        } else if (roleName.includes("BANK OFFICER")) {
          baseNotificationQuery = baseNotificationQuery.where("officers.user_id", userId);
        } else if (roleName.includes("MANAGER")) {
          baseNotificationQuery = baseNotificationQuery.where("orders.manager_id", userId);
        }
        baseNotificationQuery = applyPrivilegedSelfActionFilter(
          baseNotificationQuery,
          userId
        );
      }

      // STEP 2: Fetch full notification data for all unread (per-user) notifications.
      // No MIN(id) grouping needed — each event has exactly one notification row.
      let query = db("notifications")
        .whereIn("notifications.id", baseNotificationQuery)
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
        .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
        .leftJoin("users as notification_user", "notifications.user_id", "notification_user.id")
        .leftJoin(
          "users as changed_by_user",
          "order_status_history.changed_by",
          "changed_by_user.id"
        )
        .leftJoin(
          "field_verifiers",
          "order_status_history.changed_by",
          "field_verifiers.id"
        )
        .leftJoin("users as comment_user", "order_comments.user_id", "comment_user.id")
        .leftJoin(
          "field_verifiers as comment_field_verifier",
          "order_comments.user_id",
          "comment_field_verifier.id"
        )
        .select(
          "notifications.id",
          "notifications.user_id",
          "notification_user.name as user_name",
          "notifications.order_id",
          "orders.order_number",
          "notifications.activity_id",
          "notifications.comment_id",
          "notifications.notification_type",
          "notifications.title",
          "notifications.description",
          // Per-user read state: true if this user has a row in user_notification_reads
          db.raw(
            "EXISTS(SELECT 1 FROM user_notification_reads WHERE notification_id = notifications.id AND user_id = ?) as is_read",
            [userId]
          ),
          db.raw(
            "(SELECT read_at FROM user_notification_reads WHERE notification_id = notifications.id AND user_id = ? LIMIT 1) as read_at",
            [userId]
          ),
          "notifications.created_at",
          "order_status_history.status_id",
          "order_status_master.name as status_name",
          "order_status_history.activity_extra",
          "order_status_history.changed_by",
          "order_status_history.user_type",
          db.raw(`
            CASE
              WHEN order_status_history.user_type = 'field_verifier' THEN field_verifiers.name
              ELSE changed_by_user.name
            END as changed_by_name
          `),
          "order_status_history.changed_at",
          "order_comments.comment as comment_text",
          "order_comments.user_id as comment_user_id",
          "order_comments.user_type as comment_user_type",
          db.raw(`
            COALESCE(
              CASE
                WHEN order_comments.user_type IN ('field_verifier', 'filed_verifier', 'filed_varifier')
                  THEN comment_field_verifier.name
                ELSE comment_user.name
              END,
              comment_user.name,
              comment_field_verifier.name
            ) as comment_user_name
          `),
          "order_comments.commented_at"
        )
        .orderBy("notifications.created_at", "desc")
        .limit(limit)
        .offset(offset);

      const results = await query;
      // Filter comment notifications based on permission
      const filteredResults = await filterCommentNotifications(
        results || [],
        user?.role_id,
        user?.role_name || userRole
      );
      return filteredResults;
    } catch (error) {
      return [];
    }
  },

  // Get all notifications for a user (read and unread)
  // Filter based on order permissions (same logic as order model)
  getAllNotifications: async (userId, userRole, user, options = {}) => {
    const { limit = 200, offset = 0 } = options;
    
    const roleName = (userRole || "").toUpperCase();
    
    // Privileged roles that can see all orders
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    // Get accessible order IDs (same logic as getAllNotificationsWithFilter)
    let accessibleOrderIds = null;

    if (!hasPrivilegedRole) {
      const assignedOrderIds = await db("order_users")
        .select("order_id")
        .where("user_id", userId)
        .whereNull("deleted_at");

      const userAssignedOrderIds = assignedOrderIds.map((o) => o.order_id);

      const ordersWithAssignments = await db("order_users")
        .select("order_id")
        .whereNull("deleted_at")
        .distinct();

      const ordersWithAnyAssignment = ordersWithAssignments.map((o) => o.order_id);

      const unassignedOrders = await db("orders")
        .select("id")
        .whereNotIn("id", ordersWithAnyAssignment)
        .whereNull("deleted_at");
      
      const unassignedOrderIds = unassignedOrders.map(o => o.id);
      accessibleOrderIds = [...userAssignedOrderIds, ...unassignedOrderIds];
    }

    // STEP 1: Get unique notification IDs
    let baseNotificationQuery = db("notifications")
      .select("notifications.id")
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .whereNull("orders.deleted_at");

    // Apply order permission filters
    if (!hasPrivilegedRole) {
      if (accessibleOrderIds && accessibleOrderIds.length > 0) {
        baseNotificationQuery = baseNotificationQuery.whereIn("notifications.order_id", accessibleOrderIds);
      } else {
        return [];
      }
    } else {
      if (roleName.includes("BANK AUTHORITY")) {
        baseNotificationQuery = baseNotificationQuery.where(function() {
          this.where("orders.created_by", userId)
            .orWhere("officers.user_id", userId)
            .orWhere("orders.manager_id", userId);
        });
      } else if (roleName.includes("BANK OFFICER")) {
        baseNotificationQuery = baseNotificationQuery.where("officers.user_id", userId);
      } else if (roleName.includes("MANAGER")) {
        baseNotificationQuery = baseNotificationQuery.where("orders.manager_id", userId);
      }
      baseNotificationQuery = applyPrivilegedSelfActionFilter(
        baseNotificationQuery,
        userId
      );
    }

    // STEP 2: Fetch full notification data (read + unread).
    // Per-user read state comes from user_notification_reads — not the legacy is_read column.
    let query = db("notifications")
      .whereIn("notifications.id", baseNotificationQuery)
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
      .leftJoin("users as notification_user", "notifications.user_id", "notification_user.id")
      .leftJoin(
        "users as changed_by_user",
        "order_status_history.changed_by",
        "changed_by_user.id"
      )
      .leftJoin(
        "field_verifiers",
        "order_status_history.changed_by",
        "field_verifiers.id"
      )
      .leftJoin("users as comment_user", "order_comments.user_id", "comment_user.id")
      .leftJoin(
        "field_verifiers as comment_field_verifier",
        "order_comments.user_id",
        "comment_field_verifier.id"
      )
      .select(
        "notifications.id",
        "notifications.user_id",
        "notification_user.name as user_name",
        "notifications.order_id",
        "orders.order_number",
        "notifications.activity_id",
        "notifications.comment_id",
        "notifications.notification_type",
        "notifications.title",
        "notifications.description",
        // Per-user read state: true if this user has a row in user_notification_reads
        db.raw(
          "EXISTS(SELECT 1 FROM user_notification_reads WHERE notification_id = notifications.id AND user_id = ?) as is_read",
          [userId]
        ),
        db.raw(
          "(SELECT read_at FROM user_notification_reads WHERE notification_id = notifications.id AND user_id = ? LIMIT 1) as read_at",
          [userId]
        ),
        "notifications.created_at",
        "order_status_history.status_id",
        "order_status_master.name as status_name",
        "order_status_history.activity_extra",
        "order_status_history.changed_by",
        "order_status_history.user_type",
        db.raw(`
          CASE
            WHEN order_status_history.user_type = 'field_verifier' THEN field_verifiers.name
            ELSE changed_by_user.name
          END as changed_by_name
        `),
        "order_status_history.changed_at",
        "order_comments.comment as comment_text",
        "order_comments.user_id as comment_user_id",
        "order_comments.user_type as comment_user_type",
        db.raw(`
          COALESCE(
            CASE
              WHEN order_comments.user_type IN ('field_verifier', 'filed_verifier', 'filed_varifier')
                THEN comment_field_verifier.name
              ELSE comment_user.name
            END,
            comment_user.name,
            comment_field_verifier.name
          ) as comment_user_name
        `),
        "order_comments.commented_at"
      )
      .orderBy("notifications.created_at", "desc")
      .limit(limit)
      .offset(offset);

    const results = await query;
    // Filter comment notifications based on permission
    const filteredResults = await filterCommentNotifications(
      results || [],
      user?.role_id,
      user?.role_name || userRole
    );
    return filteredResults;
  },

  // Mark notification as read
  // Check order permissions instead of user_id (since user_id is the person who performed action)
  markAsRead: async (notificationId, userId, userRole, user) => {
    // First, get the notification with order info
    const notification = await db("notifications")
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .select("notifications.*", "orders.id as order_id", "orders.created_by", "orders.manager_id", "officers.user_id as officer_user_id")
      .where("notifications.id", notificationId)
      .whereNull("orders.deleted_at")
      .first();

    if (!notification) {
      return null; // Notification doesn't exist or order is deleted
    }

    // Check if user has access to this order (same permission logic)
    const roleName = (userRole || "").toUpperCase();
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    let hasAccess = false;

    if (hasPrivilegedRole) {
      // Privileged roles: check role-specific access
      if (roleName.includes("BANK AUTHORITY")) {
        hasAccess = notification.created_by === userId ||
                    notification.officer_user_id === userId ||
                    notification.manager_id === userId;
      } else if (roleName.includes("BANK OFFICER")) {
        hasAccess = notification.officer_user_id === userId;
      } else if (roleName.includes("MANAGER")) {
        hasAccess = notification.manager_id === userId;
      } else {
        // DEVELOPER_ADMIN, SUPER ADMIN, TELECALLER - have access to all
        hasAccess = true;
      }
    } else {
      // Non-privileged: check if order is assigned to user or has no assignments
      const isAssigned = await db("order_users")
        .where("order_id", notification.order_id)
        .where("user_id", userId)
        .whereNull("deleted_at")
        .first();

      if (isAssigned) {
        hasAccess = true;
      } else {
        // Check if order has no assignments (available to everyone)
        const hasAnyAssignments = await db("order_users")
          .where("order_id", notification.order_id)
          .whereNull("deleted_at")
          .first();

        hasAccess = !hasAnyAssignments;
      }
    }

    if (!hasAccess) {
      return null; // User doesn't have access to this order
    }

    // Insert a per-user read record so only THIS user's notification is marked read.
    // ON CONFLICT DO NOTHING makes this idempotent — safe to call multiple times.
    await db("user_notification_reads")
      .insert({
        notification_id: notificationId,
        user_id: userId,
        read_at: new Date()
      })
      .onConflict(["notification_id", "user_id"])
      .ignore();

    // Return a truthy object so the controller knows it succeeded
    return { id: notificationId, user_id: userId, is_read: true };
  },

  // Mark all notifications as read for a user
  // Filter based on order permissions (same logic as getAllNotificationsWithFilter)
  markAllAsRead: async (userId, userRole, user) => {
    const roleName = (userRole || "").toUpperCase();
    
    // Privileged roles that can see all orders
    const privilegedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    const hasPrivilegedRole = privilegedRoles.some((keyword) =>
      roleName.includes(keyword)
    );

    // Build query to find all notifications this user can see and has NOT yet read.
    // "Unread for this user" = no row in user_notification_reads for (notification_id, user_id).
    let query = db("notifications")
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("order_comments", "notifications.comment_id", "order_comments.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .whereNotExists(function () {
        this.select("id")
          .from("user_notification_reads")
          .whereRaw("notification_id = notifications.id")
          .where("user_id", userId);
      })
      .whereNull("orders.deleted_at");

    // Apply order permission filters (same as getAllNotificationsWithFilter)
    if (!hasPrivilegedRole) {
      // Get accessible order IDs
      const assignedOrderIds = await db("order_users")
        .select("order_id")
        .where("user_id", userId)
        .whereNull("deleted_at");

      const userAssignedOrderIds = assignedOrderIds.map((o) => o.order_id);

      const ordersWithAssignments = await db("order_users")
        .select("order_id")
        .whereNull("deleted_at")
        .distinct();

      const ordersWithAnyAssignment = ordersWithAssignments.map((o) => o.order_id);

      const unassignedOrders = await db("orders")
        .select("id")
        .whereNotIn("id", ordersWithAnyAssignment)
        .whereNull("deleted_at");
      
      const unassignedOrderIds = unassignedOrders.map(o => o.id);
      const accessibleOrderIds = [...userAssignedOrderIds, ...unassignedOrderIds];

      if (accessibleOrderIds.length > 0) {
        query = query.whereIn("notifications.order_id", accessibleOrderIds);
      } else {
        return 0; // No accessible orders
      }
    } else {
      // Privileged roles: apply role-specific filters
      if (roleName.includes("BANK AUTHORITY")) {
        query = query.where(function() {
          this.where("orders.created_by", userId)
            .orWhere("officers.user_id", userId)
            .orWhere("orders.manager_id", userId);
        });
      } else if (roleName.includes("BANK OFFICER")) {
        query = query.where("officers.user_id", userId);
      } else if (roleName.includes("MANAGER")) {
        query = query.where("orders.manager_id", userId);
      }
      query = applyPrivilegedSelfActionFilter(query, userId);
    }

    // Get notification IDs that match the permission filters
    const notificationIds = await query.select("notifications.id");
    const ids = notificationIds.map(n => n.id);
    
    if (ids.length === 0) {
      return 0;
    }

    // Bulk-insert per-user read records — one row per notification for THIS user only.
    // ON CONFLICT DO NOTHING keeps this idempotent if any were already marked read.
    const readAt = new Date();
    const inserts = ids.map((id) => ({
      notification_id: id,
      user_id: userId,
      read_at: readAt,
    }));

    await db("user_notification_reads")
      .insert(inserts)
      .onConflict(["notification_id", "user_id"])
      .ignore();

    return ids.length;
  },

  // Create a notification
  create: async (data) => {
    // Prepare insert data
    const insertData = {
      user_id: data.user_id,
      order_id: data.order_id,
      notification_type: data.notification_type || "status_change",
      title: data.title || null,
      description: data.description || null,
      is_read: false,
      created_at: new Date()
    };

    // Add activity_id if provided (for status change notifications)
    if (data.activity_id) {
      insertData.activity_id = data.activity_id;
    }

    // Add comment_id if provided (for comment notifications)
    if (data.comment_id) {
      insertData.comment_id = data.comment_id;
    }

    // Use insert - conflict is now handled by partial unique indexes
    const [notification] = await db("notifications")
      .insert(insertData)
      .returning("*");

    return notification;
  },

  // Create notifications for multiple users (bulk insert)
  createBulk: async (notificationsArray) => {
    if (!notificationsArray || notificationsArray.length === 0) {
      return [];
    }

    // Use a transaction to ensure atomicity and prevent race conditions
    return await db.transaction(async (trx) => {
      // First, check which notifications already exist to avoid unnecessary inserts
      const activityIds = [...new Set(notificationsArray.filter(n => n.activity_id).map(n => n.activity_id))];
      const commentIds = [...new Set(notificationsArray.filter(n => n.comment_id).map(n => n.comment_id))];
      const userIds = [...new Set(notificationsArray.map(n => n.user_id))];
      
      let existingNotifications = [];
      
      // Check existing activity-based notifications
      if (activityIds.length > 0) {
        const activityNotifs = await trx("notifications")
          .select("user_id", "activity_id", "comment_id")
          .whereIn("activity_id", activityIds)
          .whereIn("user_id", userIds)
          .forUpdate(); // Lock rows to prevent concurrent inserts
        existingNotifications = [...existingNotifications, ...activityNotifs];
      }
      
      // Check existing comment-based notifications
      if (commentIds.length > 0) {
        const commentNotifs = await trx("notifications")
          .select("user_id", "activity_id", "comment_id")
          .whereIn("comment_id", commentIds)
          .whereIn("user_id", userIds)
          .forUpdate(); // Lock rows to prevent concurrent inserts
        existingNotifications = [...existingNotifications, ...commentNotifs];
      }

      // Create a Set of existing notification keys for fast lookup
      const existingKeys = new Set(
        existingNotifications.map(n => {
          if (n.activity_id) {
            return `${n.user_id}_activity_${n.activity_id}`;
          } else if (n.comment_id) {
            return `${n.user_id}_comment_${n.comment_id}`;
          }
          return null;
        }).filter(k => k !== null)
      );

      // Filter out notifications that already exist
      const notificationsToInsert = notificationsArray.filter((n) => {
        let key;
        if (n.activity_id) {
          key = `${n.user_id}_activity_${n.activity_id}`;
        } else if (n.comment_id) {
          key = `${n.user_id}_comment_${n.comment_id}`;
        }
        return key && !existingKeys.has(key);
      });

      if (notificationsToInsert.length === 0) {
        return []; // All notifications already exist
      }

      // Insert with conflict handling to prevent duplicates (triple safety)
      const inserted = await trx("notifications")
        .insert(
          notificationsToInsert.map((n) => {
            const insertData = {
              user_id: n.user_id,
              order_id: n.order_id,
              notification_type: n.notification_type || "status_change",
              title: n.title || null,
              description: n.description || null,
              is_read: false,
              created_at: new Date()
            };

            // Add activity_id if provided (for status change notifications)
            if (n.activity_id) {
              insertData.activity_id = n.activity_id;
            }

            // Add comment_id if provided (for comment notifications)
            if (n.comment_id) {
              insertData.comment_id = n.comment_id;
            }

            return insertData;
          })
        )
        .returning("*");

      return inserted || [];
    });
  },

  // Delete notification (soft delete by marking as read, or hard delete)
  delete: async (notificationId, userId) => {
    const deleted = await db("notifications")
      .where("id", notificationId)
      .where("user_id", userId)
      .delete();

    return deleted;
  },

  // Remove duplicate notifications (keep only the oldest one for each user_id + activity_id)
  removeDuplicates: async () => {
    // Find duplicate notifications (same user_id + activity_id)
    const duplicates = await db("notifications")
      .select("user_id", "activity_id")
      .groupBy("user_id", "activity_id")
      .havingRaw("COUNT(*) > 1");

    let deletedCount = 0;

    for (const dup of duplicates) {
      // Get all notifications for this user_id + activity_id, ordered by created_at
      const notifications = await db("notifications")
        .where("user_id", dup.user_id)
        .where("activity_id", dup.activity_id)
        .orderBy("created_at", "asc")
        .orderBy("id", "asc"); // Use ID as tiebreaker

      // Keep the first (oldest) one, delete the rest
      if (notifications.length > 1) {
        const idsToDelete = notifications.slice(1).map(n => n.id);
        const deleted = await db("notifications")
          .whereIn("id", idsToDelete)
          .delete();
        deletedCount += deleted;
      }
    }

    return deletedCount;
  }
};

module.exports = notification;

