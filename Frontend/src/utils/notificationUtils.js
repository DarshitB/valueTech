/** Add these permissions manually in DB and assign to roles. */
export const VIEW_MEDIA_NOTIFICATIONS_PERMISSION = "view_media_notifications";
export const VIEW_COMMENT_NOTIFICATIONS_PERMISSION = "view_comment_notifications";

/**
 * Media upload notifications: Assets Submitted (status 7) with "Uploaded" in activity_extra.
 * Matches mobile app uploads and dashboard ZIP uploads (same as Recent Activity).
 */
export function isMediaUploadNotification(notification) {
  if (!notification || notification.notification_type === "comment") {
    return false;
  }
  const statusId = Number(notification.status_id);
  const activityExtra = String(notification.activity_extra || "");
  const isAssetsSubmitted =
    statusId === 7 || /assets submitted/i.test(String(notification.status_name || ""));
  return isAssetsSubmitted && /uploaded/i.test(activityExtra);
}

export function isCommentNotification(notification) {
  return notification?.notification_type === "comment";
}

export function isBellNotification(notification) {
  return !isCommentNotification(notification) && !isMediaUploadNotification(notification);
}

/**
 * Who performed the activity — same source as Order Details Recent Activity.
 * Prefer changed_by_name (respects field_verifier vs dashboard user); user_name
 * is notifications.user_id joined to users only and is wrong for verifier uploads.
 */
export function getNotificationActorName(notification) {
  return (
    notification?.changed_by_name ||
    notification?.user_name ||
    "Unknown User"
  );
}

/** Same copy as Order Details → Recent Activity (media uploads only). */
export function formatMediaActivityDescription(notification) {
  if (!notification) return "Media uploaded";
  const userName = getNotificationActorName(notification);
  const statusName = notification.status_name;
  const activityExtra = notification.activity_extra;

  if (statusName && activityExtra) {
    return `${statusName} by ${userName} [ ${activityExtra} ]`;
  }
  if (statusName) {
    return `${statusName} by ${userName}`;
  }
  if (activityExtra) {
    return `${activityExtra} by ${userName}`;
  }
  if (notification.description) {
    return notification.description;
  }
  return "Media uploaded";
}
