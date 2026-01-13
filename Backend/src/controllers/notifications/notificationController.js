const Notification = require("../../models/notifications/notification");
const { BadRequestError, NotFoundError } = require("../../utils/customErrors");

/**
 * Get notifications for the current user
 * GET /api/notifications
 * Query params: last_check (ISO 8601), limit, offset
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role_name || "";
    const { last_check, limit = 50, offset = 0 } = req.query;

    // Validate limit and offset
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestError("Limit must be between 1 and 100");
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestError("Offset must be a non-negative integer");
    }

    // Validate last_check if provided
    let lastCheckDate = null;
    if (last_check) {
      lastCheckDate = new Date(last_check);
      if (isNaN(lastCheckDate.getTime())) {
        throw new BadRequestError("Invalid last_check format. Use ISO 8601 format.");
      }
    }

    // Get total unread count (all time, not filtered by last_check)
    // Pass user object to apply order permission logic
    const unreadCount = await Notification.getUnreadCount(userId, userRole, req.user);

    // Get ALL notifications (read + unread) created after last_check
    // Pass user object to apply order permission logic
    let notifications = await Notification.getAllNotificationsWithFilter(userId, userRole, req.user, {
      last_check: lastCheckDate ? last_check : null,
      limit: limitNum,
      offset: offsetNum
    });

    // If last_check filtered out all notifications but unread_count > 0,
    // return unread notifications anyway (fallback)
    if (notifications.length === 0 && unreadCount > 0) {
      notifications = await Notification.getUnreadNotifications(userId, userRole, req.user, {
        limit: limitNum,
        offset: offsetNum
      });
    }

    // Format notifications for response - match exact frontend format
    const formattedNotifications = (notifications || []).map((notif) => {
      // Ensure all required fields are present
      const formatted = {
        id: notif.id ? notif.id.toString() : null,
        user_id: notif.user_id || null,
        user_name: notif.user_name || null,
        order_id: notif.order_id || null,
        order_number: notif.order_number || null,
        activity_id: notif.activity_id || null,
        comment_id: notif.comment_id || null,
        notification_type: notif.notification_type || "status_change",
        title: notif.title || null,
        description: notif.description || null,
        status_name: notif.status_name || null,
        activity_extra: notif.activity_extra || null,
        changed_by_id: notif.changed_by || null,
        changed_by_name: notif.changed_by_name || null,
        changed_at: notif.changed_at || notif.created_at,
        created_at: notif.created_at || new Date().toISOString(),
        is_read: notif.is_read !== undefined ? notif.is_read : false
      };

      // Add comment data if this is a comment notification
      if (notif.comment_id) {
        formatted.comment_text = notif.comment_text || null;
        formatted.comment_user_id = notif.comment_user_id || null;
        formatted.comment_user_name = notif.comment_user_name || null;
        formatted.commented_at = notif.commented_at || null;
      }

      return formatted;
    }).filter(notif => notif.id !== null); // Filter out any invalid notifications

    res.json({
      success: true,
      data: {
        notifications: formattedNotifications,
        unread_count: unreadCount,
        last_check_timestamp: last_check || null
      },
      message: "Notifications fetched successfully"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark a notification as read
 * POST /api/notifications/:id/read
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      throw new BadRequestError("Valid notification ID is required");
    }

    // Try parsing as integer first (database ID)
    const notificationId = parseInt(id);
    if (isNaN(notificationId)) {
      throw new BadRequestError("Invalid notification ID format");
    }

    // Pass user object and role to check order permissions
    const notification = await Notification.markAsRead(
      notificationId, 
      userId, 
      req.user.role_name || "",
      req.user
    );

    if (!notification) {
      throw new NotFoundError("Notification not found or you don't have access to it");
    }

    res.json({
      success: true,
      message: "Notification marked as read"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark all notifications as read for the current user
 * POST /api/notifications/read-all
 */
exports.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role_name || "";

    // Pass user object and role to check order permissions
    const updatedCount = await Notification.markAllAsRead(userId, userRole, req.user);

    res.json({
      success: true,
      message: "All notifications marked as read"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all notifications (read and unread) for the current user
 * GET /api/notifications/all
 * Query params: limit, offset
 */
exports.getAllNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role_name || "";
    const { limit = 50, offset = 0 } = req.query;

    // Validate limit and offset
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestError("Limit must be between 1 and 100");
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestError("Offset must be a non-negative integer");
    }

    // Get all notifications
    // Pass user object to apply order permission logic
    const notifications = await Notification.getAllNotifications(userId, userRole, req.user, {
      limit: limitNum,
      offset: offsetNum
    });

    // Get unread count
    // Pass user object to apply order permission logic
    const unreadCount = await Notification.getUnreadCount(userId, userRole, req.user);

    // Format notifications for response - match exact frontend format
    const formattedNotifications = notifications.map((notif) => {
      const formatted = {
        id: notif.id.toString(), // Use database ID as string
        user_id: notif.user_id || null,
        user_name: notif.user_name || null,
        order_id: notif.order_id,
        order_number: notif.order_number,
        activity_id: notif.activity_id,
        comment_id: notif.comment_id || null,
        notification_type: notif.notification_type || "status_change",
        title: notif.title || null,
        description: notif.description || null,
        status_name: notif.status_name || null,
        activity_extra: notif.activity_extra || null,
        changed_by_id: notif.changed_by || null,
        changed_by_name: notif.changed_by_name || null,
        changed_at: notif.changed_at,
        created_at: notif.created_at,
        is_read: notif.is_read || false
      };

      // Add comment data if this is a comment notification
      if (notif.comment_id) {
        formatted.comment_text = notif.comment_text || null;
        formatted.comment_user_id = notif.comment_user_id || null;
        formatted.comment_user_name = notif.comment_user_name || null;
        formatted.commented_at = notif.commented_at || null;
      }

      return formatted;
    });

    res.json({
      success: true,
      data: {
        notifications: formattedNotifications,
        unread_count: unreadCount
      },
      message: "All notifications fetched successfully"
    });
  } catch (error) {
    next(error);
  }
};

