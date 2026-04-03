const db = require("../../db");
const Notification = require("../models/notifications/notification");
const OrderStatusHistory = require("../models/orders/orderStatusHistory");
const { PROTECTED_ROLE } = require("../constants/protectedRoles");

/**
 * Determine which users should receive notifications for an order activity
 * This replicates the permission logic from order.js getAllOrders
 */
async function getUsersToNotify(orderId, activityUserId) {
  // Get the order with all necessary relationships
  const order = await db("orders")
    .leftJoin("officers", "orders.officer_id", "officers.id")
    .leftJoin("users as officer_user", "officers.user_id", "officer_user.id")
    .leftJoin("bank_branch", "officers.branch_id", "bank_branch.id")
    .leftJoin("bank", "bank_branch.bank_id", "bank.id")
    .select(
      "orders.id",
      "orders.created_by",
      "orders.manager_id",
      "orders.officer_id",
      "orders.field_verifier_id",
      "officers.user_id as officer_user_id",
      "bank.id as bank_id"
    )
    .where("orders.id", orderId)
    .whereNull("orders.deleted_at")
    .first();

  if (!order) {
    return []; // Order doesn't exist or is deleted
  }

  // Get all users who should be notified
  // This includes users who can see the order based on permissions
  const usersToNotify = [];

  // 1. Get users assigned to this order via order_users table
  const assignedUsers = await db("order_users")
    .select("user_id")
    .where("order_id", orderId)
    .whereNull("deleted_at");

  const assignedUserIds = assignedUsers.map((u) => u.user_id);

  // 2. ALWAYS get developer_admin users first (they can see everything, no restrictions)
  const developerAdminUsers = await db("users")
    .leftJoin("roles", "users.role_id", "roles.id")
    .select("users.id", "users.role_id", "roles.name as role_name")
    .whereRaw("LOWER(TRIM(roles.name)) = ?", ["developer_admin"])
    .whereNull("users.deleted_at");

  // 3. Get other privileged roles that can see all orders
  const privilegedRoles = await db("roles")
    .select("id", "name")
    .whereIn("name", [
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER"
    ]);

  const privilegedRoleIds = privilegedRoles.map((r) => r.id);

  // 4. Get all users with other privileged roles (excluding developer_admin as we already have them)
  let otherPrivilegedUsers = [];
  if (privilegedRoleIds.length > 0) {
    otherPrivilegedUsers = await db("users")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select("users.id", "users.role_id", "roles.name as role_name")
      .whereIn("users.role_id", privilegedRoleIds)
      .whereNull("users.deleted_at");
  }

  // Combine developer_admin with other privileged users
  const privilegedUsers = [...developerAdminUsers, ...otherPrivilegedUsers];

  // 4. Get users with role-specific access to this order
  const roleSpecificUsers = [];

  // BANK AUTHORITY users who created the order, are officers, or are managers
  const bankAuthorityUsers = await db("users")
    .leftJoin("roles", "users.role_id", "roles.id")
    .select("users.id", "users.role_id", "roles.name as role_name")
    .where("roles.name", "like", "%BANK AUTHORITY%")
    .where(function () {
      this.where("users.id", order.created_by)
        .orWhere("users.id", order.officer_user_id)
        .orWhere("users.id", order.manager_id);
    })
    .whereNull("users.deleted_at");

  roleSpecificUsers.push(...bankAuthorityUsers);

  // BANK OFFICER users who are officers for this order
  if (order.officer_user_id) {
    const bankOfficerUsers = await db("users")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select("users.id", "users.role_id", "roles.name as role_name")
      .where("roles.name", "like", "%BANK OFFICER%")
      .where("users.id", order.officer_user_id)
      .whereNull("users.deleted_at");

    roleSpecificUsers.push(...bankOfficerUsers);
  }

  // MANAGER users who are managers for this order
  if (order.manager_id) {
    const managerUsers = await db("users")
      .leftJoin("roles", "users.role_id", "roles.id")
      .select("users.id", "users.role_id", "roles.name as role_name")
      .where("roles.name", "like", "%MANAGER%")
      .where("users.id", order.manager_id)
      .whereNull("users.deleted_at");

    roleSpecificUsers.push(...managerUsers);
  }

  // 5. Get users assigned via order_users (for non-privileged roles)
  const assignedUsersDetails = await db("users")
    .leftJoin("roles", "users.role_id", "roles.id")
    .select("users.id", "users.role_id", "roles.name as role_name")
    .whereIn("users.id", assignedUserIds)
    .whereNull("users.deleted_at");

  // Combine all potential users
  const allPotentialUsers = [
    ...privilegedUsers,
    ...roleSpecificUsers,
    ...assignedUsersDetails
  ];

  // FINAL SAFETY: Always ensure developer_admin users are included
  // Get ALL developer_admin users one more time to be absolutely sure
  const allDeveloperAdmins = await db("users")
    .leftJoin("roles", "users.role_id", "roles.id")
    .select("users.id", "users.role_id", "roles.name as role_name")
    .whereRaw("LOWER(TRIM(roles.name)) = ?", ["developer_admin"])
    .whereNull("users.deleted_at");

  // Add developer_admin users to allPotentialUsers if not already there
  const existingUserIds = new Set(allPotentialUsers.map(u => u.id));
  allDeveloperAdmins.forEach(devAdmin => {
    if (!existingUserIds.has(devAdmin.id)) {
      allPotentialUsers.push(devAdmin);
    }
  });

  // Remove duplicates and filter out the user who performed the action
  const uniqueUserIds = new Set();
  for (const user of allPotentialUsers) {
    // Skip the user who performed the action (self-actions should not generate notifications)
    if (user.id === activityUserId) {
      continue;
    }

    // For developer_admin, skip permission check - they can see everything, no restrictions
    const roleName = (user.role_name || "").toLowerCase().trim();
    if (roleName === "developer_admin" || 
        roleName === "developer admin" || 
        roleName.includes("developer_admin") || 
        roleName.includes("developer admin")) {
      uniqueUserIds.add(user.id);
      continue;
    }

    // Check if user has permission to see this order
    if (await canUserSeeOrder(user, order)) {
      uniqueUserIds.add(user.id);
    }
  }

  return Array.from(uniqueUserIds);
}

/**
 * Check if a user can see an order (replicates permission logic)
 */
async function canUserSeeOrder(user, order) {
  const roleName = (user.role_name || "").toLowerCase();

  // Super Admin and Developer Admin can see all - NO RESTRICTIONS
  if (roleName === "developer_admin" || roleName.includes("developer admin") || roleName.includes("super admin")) {
    return true;
  }

  // TELECALLER - can see all (privileged role)
  if (roleName.includes("telecaller")) {
    return true;
  }

  // BANK AUTHORITY - can see orders they created, are officers for, or are managers for
  if (roleName.includes("bank authority")) {
    return (
      order.created_by === user.id ||
      order.officer_user_id === user.id ||
      order.manager_id === user.id
    );
  }

  // BANK OFFICER - can only see orders where they are the officer
  if (roleName.includes("bank officer")) {
    return order.officer_user_id === user.id;
  }

  // MANAGER - can only see orders where they are the manager
  if (roleName.includes("manager")) {
    return order.manager_id === user.id;
  }

  // Field Verifier - can see orders assigned to them
  if (order.field_verifier_id) {
    // Check if user is the field verifier (field_verifiers table has user_id)
    const fieldVerifier = await db("field_verifiers")
      .where("id", order.field_verifier_id)
      .where("user_id", user.id)
      .first();

    if (fieldVerifier) {
      return true;
    }
  }

  // Check if user is assigned to this order via order_users
  const isAssigned = await db("order_users")
    .where("order_id", order.id)
    .where("user_id", user.id)
    .whereNull("deleted_at")
    .first();

  if (isAssigned) {
    return true;
  }

  // Check if order has no user assignments (available to everyone)
  const hasAnyAssignments = await db("order_users")
    .where("order_id", order.id)
    .whereNull("deleted_at")
    .first();

  if (!hasAnyAssignments) {
    return true; // Order has no assignments, available to everyone
  }

  return false;
}

/**
 * Create notifications for an order activity
 * @param {number} orderId - The order ID
 * @param {number} activityId - The activity/status history ID
 * @param {number} activityUserId - The user who performed the activity (will be excluded from notifications)
 * @param {string} notificationType - Type of notification (default: 'status_change')
 * @param {string} title - Optional title for the notification
 * @param {string} description - Optional description for the notification
 */
// Track in-flight notification creation to prevent duplicates
const notificationCreationInProgress = new Set();

async function createNotificationsForActivity(
  orderId,
  activityId,
  activityUserId,
  notificationType = "status_change",
  title = null,
  description = null
) {
  // Create a unique key for this activity to prevent duplicate processing
  const activityKey = `${orderId}_${activityId}_${activityUserId}`;
  
  // FIRST: Check if notifications already exist for this activity (BEFORE setting lock)
  // This prevents duplicates even if the function is called multiple times
  const existingNotifications = await db("notifications")
    .select("id", "user_id")
    .where("activity_id", activityId)
    .limit(1); // Just check if any exist

  if (existingNotifications.length > 0) {
    // Notifications already exist for this activity, skip creation
    return existingNotifications; // Return existing ones
  }

  // Check if notification creation is already in progress for this activity
  if (notificationCreationInProgress.has(activityKey)) {
    return []; // Already processing, skip duplicate
  }

  // Mark as in progress
  notificationCreationInProgress.add(activityKey);

  try {
    // DOUBLE CHECK: Check again after acquiring lock (race condition protection)
    const doubleCheckNotifications = await db("notifications")
      .select("id", "user_id")
      .where("activity_id", activityId)
      .limit(1);

    if (doubleCheckNotifications.length > 0) {
      // Notification already exists for this activity, skip creation
      notificationCreationInProgress.delete(activityKey);
      return doubleCheckNotifications;
    }

    // Get order details for notification description
    const order = await db("orders")
      .select("order_number")
      .where("id", orderId)
      .first();

    // Get activity details
    const activity = await db("order_status_history")
      .leftJoin("order_status_master", "order_status_history.status_id", "order_status_master.id")
      .leftJoin("users", "order_status_history.changed_by", "users.id")
      .leftJoin("field_verifiers", "order_status_history.changed_by", "field_verifiers.id")
      .select(
        "order_status_history.*",
        "order_status_master.name as status_name",
        db.raw(`
          CASE 
            WHEN order_status_history.user_type = 'field_verifier' THEN field_verifiers.name 
            ELSE users.name 
          END as changed_by_name
        `)
      )
      .where("order_status_history.id", activityId)
      .first();

    if (!activity) {
      // Activity doesn't exist, skip notification creation
      notificationCreationInProgress.delete(activityKey);
      return [];
    }

    // Build notification description if not provided
    let notificationDescription = description;
    if (!notificationDescription) {
      if (activity.status_name) {
        notificationDescription = `Status changed to '${activity.status_name}'`;
        if (activity.changed_by_name) {
          notificationDescription += ` by ${activity.changed_by_name}`;
        }
      } else if (activity.activity_extra) {
        notificationDescription = activity.activity_extra;
      } else {
        notificationDescription = `Order ${order?.order_number || orderId} was updated`;
      }
    }

    // Build notification title if not provided
    let notificationTitle = title;
    if (!notificationTitle && order) {
      notificationTitle = `Order ${order.order_number} updated`;
    }

    // Create ONLY ONE notification record per activity
    // Use the user_id of the person who performed the action (changed_by)
    const notificationToCreate = {
      user_id: activityUserId, // Use the user who performed the action
      order_id: orderId,
      activity_id: activityId,
      notification_type: notificationType,
      title: notificationTitle,
      description: notificationDescription
    };

    // Create single notification (with duplicate prevention via unique constraint)
    const createdNotification = await Notification.create(notificationToCreate);

    return createdNotification ? [createdNotification] : [];
  } catch (error) {
    // Silently fail - notification creation should not break the main flow
    return [];
  } finally {
    // Always remove from in-progress set, even if there was an error
    notificationCreationInProgress.delete(activityKey);
    
    // Clean up after 5 minutes to prevent memory leak (in case of errors)
    setTimeout(() => {
      notificationCreationInProgress.delete(activityKey);
    }, 5 * 60 * 1000);
  }
}

/**
 * Check if a user has "view_order_comments" permission
 * @param {number} userId - The user ID
 * @param {number} roleId - The user's role ID
 * @param {string} roleName - The user's role name
 * @returns {Promise<boolean>} - True if user has permission
 */
async function hasViewOrderCommentsPermission(userId, roleId, roleName) {
  try {
    // Protected role (developer_admin) always has permission
    if (roleName === PROTECTED_ROLE) {
      return true;
    }

    // Check if user's role has "view_order_comments" permission
    const permission = await db("permissions")
      .join(
        "role_permissions",
        "permissions.id",
        "role_permissions.permission_id"
      )
      .where({
        "permissions.name": "view_order_comments",
        "role_permissions.role_id": roleId,
      })
      .whereNull("role_permissions.deleted_at")
      .first();

    return !!permission;
  } catch (error) {
    // On error, default to false (no permission)
    console.error("Error checking view_order_comments permission:", error);
    return false;
  }
}

/**
 * Create notifications for an order comment
 * @param {number} orderId - The order ID
 * @param {number} commentId - The comment ID
 * @param {number} commentUserId - The user who created the comment (will be excluded from notifications)
 */
async function createNotificationsForComment(orderId, commentId, commentUserId) {
  try {
    // Check if notifications already exist for this comment
    const existingNotifications = await db("notifications")
      .select("id", "user_id")
      .where("comment_id", commentId)
      .limit(1);

    if (existingNotifications.length > 0) {
      // Notifications already exist for this comment, skip creation
      return existingNotifications;
    }

    // Get order details
    const order = await db("orders")
      .select("order_number")
      .where("id", orderId)
      .first();

    if (!order) {
      return [];
    }

    // Get comment details
    const comment = await db("order_comments")
      .leftJoin("users", "order_comments.user_id", "users.id")
      .select(
        "order_comments.*",
        "users.name as commenter_name"
      )
      .where("order_comments.id", commentId)
      .first();

    if (!comment) {
      return [];
    }

    // Build notification title and description
    const notificationTitle = `New comment on Order ${order.order_number}`;
    const notificationDescription = comment.commenter_name 
      ? `${comment.commenter_name} commented: ${comment.comment.substring(0, 100)}${comment.comment.length > 100 ? '...' : ''}`
      : `New comment added: ${comment.comment.substring(0, 100)}${comment.comment.length > 100 ? '...' : ''}`;

    // Create ONLY ONE notification record per comment
    // Use the user_id of the person who created the comment (same structure as status change)
    const notificationToCreate = {
      user_id: commentUserId, // Use the user who created the comment (same as activityUserId for status changes)
      order_id: orderId,
      comment_id: commentId,
      notification_type: "comment",
      title: notificationTitle,
      description: notificationDescription
    };

    // Create single notification (with duplicate prevention via unique constraint)
    const createdNotification = await Notification.create(notificationToCreate);

    return createdNotification ? [createdNotification] : [];
  } catch (error) {
    // Silently fail - notification creation should not break the main flow
    console.error("Error creating notifications for comment:", error);
    return [];
  }
}

module.exports = {
  createNotificationsForActivity,
  createNotificationsForComment,
  getUsersToNotify,
  canUserSeeOrder,
  hasViewOrderCommentsPermission
};

