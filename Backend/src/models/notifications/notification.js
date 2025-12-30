const db = require("../../../db");

const notification = {
  // Get ALL notifications (read + unread) for a user with optional last_check filter
  // Filter based on order permissions (same logic as order model)
  getAllNotificationsWithFilter: async (userId, userRole, user, options = {}) => {
    const { last_check, limit = 50, offset = 0 } = options;
    
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
        .leftJoin("officers", "orders.officer_id", "officers.id")
        .whereNull("orders.deleted_at")
        .whereNot("orders.current_status_id", 13); // Exclude status 13

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

      // Exclude self-actions for admin roles
      if (hasPrivilegedRole) {
        baseNotificationQuery = baseNotificationQuery.where("order_status_history.changed_by", "!=", userId);
      }

      // Apply last_check filter if provided
      if (last_check) {
        const lastCheckDate = new Date(last_check);
        if (!isNaN(lastCheckDate.getTime())) {
          baseNotificationQuery = baseNotificationQuery.where("notifications.created_at", ">", lastCheckDate);
        }
      }

      // STEP 3: Get unique notification IDs (only the oldest one for each activity_id)
      // Since we now have one notification per activity, we just need to get unique activity_ids
      const uniqueIdsQuery = db("notifications")
        .select(db.raw("MIN(notifications.id) as id"))
        .whereIn("notifications.id", baseNotificationQuery)
        .groupBy("notifications.activity_id");

      const uniqueIdsResult = await uniqueIdsQuery;
      const uniqueIds = uniqueIdsResult.map(row => row.id);

      if (uniqueIds.length === 0) {
        return [];
      }

      // STEP 2: Get full notification data for these unique IDs
      let query = db("notifications")
        .whereIn("notifications.id", uniqueIds)
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
        .leftJoin("users as notification_user", "notifications.user_id", "notification_user.id")
        .leftJoin("users as changed_by_user", function() {
          this.on("order_status_history.changed_by", "=", "changed_by_user.id")
              .andOn("order_status_history.user_type", "!=", db.raw("'field_verifier'"));
        })
        .leftJoin("field_verifiers", function() {
          this.on("order_status_history.changed_by", "=", "field_verifiers.id")
              .andOn("order_status_history.user_type", "=", db.raw("'field_verifier'"));
        })
        .select(
          "notifications.id",
          "notifications.user_id",
          "notification_user.name as user_name",
          "notifications.order_id",
          "orders.order_number",
          "notifications.activity_id",
          "notifications.is_read",
          "notifications.read_at",
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
          "order_status_history.changed_at"
        )
        .orderBy("notifications.created_at", "desc")
        .limit(limit)
        .offset(offset);

      const results = await query;
      return results || [];
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

    // Build query with order permission filters
    let query = db("notifications")
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .where("notifications.is_read", false)
      .whereNull("orders.deleted_at")
      .whereNot("orders.current_status_id", 13);

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
      // Exclude self-actions for admin roles
      query = query.where("order_status_history.changed_by", "!=", userId);
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
    const { limit = 50, offset = 0 } = options;
    
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

      // STEP 1: Get unique notification IDs
      let baseNotificationQuery = db("notifications")
        .select("notifications.id")
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("officers", "orders.officer_id", "officers.id")
        .where("notifications.is_read", false)
        .whereNull("orders.deleted_at")
        .whereNot("orders.current_status_id", 13);

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
        baseNotificationQuery = baseNotificationQuery.where("order_status_history.changed_by", "!=", userId);
      }

      const uniqueIdsQuery = db("notifications")
        .select(db.raw("MIN(notifications.id) as id"))
        .whereIn("notifications.id", baseNotificationQuery)
        .groupBy("notifications.activity_id");

      const uniqueIdsResult = await uniqueIdsQuery;
      const uniqueIds = uniqueIdsResult.map(row => row.id);

      if (uniqueIds.length === 0) {
        return [];
      }

      // STEP 2: Get full notification data for these unique IDs
      let query = db("notifications")
        .whereIn("notifications.id", uniqueIds)
        .leftJoin("orders", "notifications.order_id", "orders.id")
        .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
        .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
        .leftJoin("users as notification_user", "notifications.user_id", "notification_user.id")
        .leftJoin("users as changed_by_user", function() {
          this.on("order_status_history.changed_by", "=", "changed_by_user.id")
              .andOn("order_status_history.user_type", "!=", db.raw("'field_verifier'"));
        })
        .leftJoin("field_verifiers", function() {
          this.on("order_status_history.changed_by", "=", "field_verifiers.id")
              .andOn("order_status_history.user_type", "=", db.raw("'field_verifier'"));
        })
        .select(
          "notifications.id",
          "notifications.user_id",
          "notification_user.name as user_name",
          "notifications.order_id",
          "orders.order_number",
          "notifications.activity_id",
          "notifications.is_read",
          "notifications.read_at",
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
          "order_status_history.changed_at"
        )
        .orderBy("notifications.created_at", "desc")
        .limit(limit)
        .offset(offset);

      return await query;
    } catch (error) {
      return [];
    }
  },

  // Get all notifications for a user (read and unread)
  // Filter based on order permissions (same logic as order model)
  getAllNotifications: async (userId, userRole, user, options = {}) => {
    const { limit = 50, offset = 0 } = options;
    
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
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .whereNull("orders.deleted_at")
      .whereNot("orders.current_status_id", 13);

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
      baseNotificationQuery = baseNotificationQuery.where("order_status_history.changed_by", "!=", userId);
    }

    const uniqueIdsQuery = db("notifications")
      .select(db.raw("MIN(notifications.id) as id"))
      .whereIn("notifications.id", baseNotificationQuery)
      .groupBy("notifications.activity_id");

    const uniqueIdsResult = await uniqueIdsQuery;
    const uniqueIds = uniqueIdsResult.map(row => row.id);

    if (uniqueIds.length === 0) {
      return [];
    }

    // STEP 2: Get full notification data for these unique IDs
    let query = db("notifications")
      .whereIn("notifications.id", uniqueIds)
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users as notification_user", "notifications.user_id", "notification_user.id")
      .leftJoin("users as changed_by_user", function() {
        this.on("order_status_history.changed_by", "=", "changed_by_user.id")
            .andOn("order_status_history.user_type", "!=", db.raw("'field_verifier'"));
      })
      .leftJoin("field_verifiers", function() {
        this.on("order_status_history.changed_by", "=", "field_verifiers.id")
            .andOn("order_status_history.user_type", "=", db.raw("'field_verifier'"));
      })
      .select(
        "notifications.id",
        "notifications.user_id",
        "notification_user.name as user_name",
        "notifications.order_id",
        "orders.order_number",
        "notifications.activity_id",
        "notifications.is_read",
        "notifications.read_at",
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
        "order_status_history.changed_at"
      )
      .orderBy("notifications.created_at", "desc")
      .limit(limit)
      .offset(offset);

    return await query;
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

    // User has access, mark as read
    const [updated] = await db("notifications")
      .where("id", notificationId)
      .update({
        is_read: true,
        read_at: new Date()
      })
      .returning("*");

    return updated;
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

    // Build query with order permission filters
    let query = db("notifications")
      .leftJoin("orders", "notifications.order_id", "orders.id")
      .leftJoin("order_status_history", "notifications.activity_id", "order_status_history.id")
      .leftJoin("officers", "orders.officer_id", "officers.id")
      .where("notifications.is_read", false)
      .whereNull("orders.deleted_at")
      .whereNot("orders.current_status_id", 13);

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
      // Exclude self-actions for admin roles
      query = query.where("order_status_history.changed_by", "!=", userId);
    }

    // Get notification IDs that match the permission filters
    const notificationIds = await query.select("notifications.id");
    const ids = notificationIds.map(n => n.id);
    
    if (ids.length === 0) {
      return 0;
    }

    // Update all matching notifications
    const updatedCount = await db("notifications")
      .whereIn("id", ids)
      .where("is_read", false)
      .update({
        is_read: true,
        read_at: new Date()
      });

    return updatedCount;
  },

  // Create a notification
  create: async (data) => {
    // Use insert with onConflict to prevent duplicates
    const [notification] = await db("notifications")
      .insert({
        user_id: data.user_id,
        order_id: data.order_id,
        activity_id: data.activity_id,
        notification_type: data.notification_type || "status_change",
        title: data.title || null,
        description: data.description || null,
        is_read: false,
        created_at: new Date()
      })
      .onConflict(["user_id", "activity_id"])
      .ignore()
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
      const activityIds = [...new Set(notificationsArray.map(n => n.activity_id))];
      const userIds = [...new Set(notificationsArray.map(n => n.user_id))];
      
      const existingNotifications = await trx("notifications")
        .select("user_id", "activity_id")
        .whereIn("activity_id", activityIds)
        .whereIn("user_id", userIds)
        .forUpdate(); // Lock rows to prevent concurrent inserts

      // Create a Set of existing notification keys for fast lookup
      const existingKeys = new Set(
        existingNotifications.map(n => `${n.user_id}_${n.activity_id}`)
      );

      // Filter out notifications that already exist
      const notificationsToInsert = notificationsArray.filter((n) => {
        const key = `${n.user_id}_${n.activity_id}`;
        return !existingKeys.has(key);
      });

      if (notificationsToInsert.length === 0) {
        return []; // All notifications already exist
      }

      // Insert with conflict handling to prevent duplicates (triple safety)
      const inserted = await trx("notifications")
        .insert(
          notificationsToInsert.map((n) => ({
            user_id: n.user_id,
            order_id: n.order_id,
            activity_id: n.activity_id,
            notification_type: n.notification_type || "status_change",
            title: n.title || null,
            description: n.description || null,
            is_read: false,
            created_at: new Date()
          }))
        )
        .onConflict(["user_id", "activity_id"])
        .ignore()
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

