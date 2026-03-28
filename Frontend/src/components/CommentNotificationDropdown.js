import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { CommentBirdIcon } from "./icons";
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../redux/reducers/notificationReducer";
import { selectPermissions, selectUser } from "../redux/selectors/authSelectors";
import { hasPermission } from "../utils/permissionUtils";
import "./NotificationDropdown.scss";

// Reuse same date formatter as NotificationDropdown
function formatActivityTime(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes.toString().padStart(2, "0");
  const timeStr = `${hours}:${minutesStr} ${ampm}`;
  const monthAbbr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (activityDate.getTime() === today.getTime()) return `Today at ${timeStr}`;
  if (activityDate.getTime() === yesterday.getTime()) return `Yesterday at ${timeStr}`;
  return `${date.getDate()} ${monthAbbr[date.getMonth()]} at ${timeStr}`;
}

function CommentNotificationDropdown() {
  const dispatch = useDispatch();

  // Reads from the same Redux store as NotificationDropdown — no separate fetch needed.
  // NotificationDropdown owns the polling; this component just filters the shared list.
  const notifications = useSelector((state) => state.notifications.list);
  const loading = useSelector((state) => state.notifications.loading);
  const allowedPermissions = useSelector(selectPermissions);
  const currentUser = useSelector(selectUser);

  // Only comment-type notifications are shown in this dropdown
  const commentNotifications = useMemo(
    () => notifications.filter((n) => n.notification_type === "comment"),
    [notifications]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [hasNewComments, setHasNewComments] = useState(false);

  // Share the same read-IDs key as NotificationDropdown so both stay in sync
  const [readNotificationIds, setReadNotificationIds] = useState(new Set());
  const dropdownRef = useRef(null);
  const lastCheckTimeRef = useRef(null);

  // Separate last-check key so opening the comment dropdown doesn't reset bell's last-check
  const getLastCheckKey = useCallback(
    () => (currentUser?.id ? `comments_last_check_${currentUser.id}` : null),
    [currentUser?.id]
  );

  // Load last check time on mount
  useEffect(() => {
    if (currentUser?.id) {
      const key = getLastCheckKey();
      const stored = key ? localStorage.getItem(key) : null;
      if (stored) {
        lastCheckTimeRef.current = new Date(stored);
      } else {
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        lastCheckTimeRef.current = yesterday;
      }
    }
  }, [currentUser?.id, getLastCheckKey]);

  // Load read notification IDs from localStorage (shared with bell dropdown)
  useEffect(() => {
    if (currentUser?.id) {
      const readKey = `notifications_read_${currentUser.id}`;
      const saved = localStorage.getItem(readKey);
      if (saved) {
        try {
          setReadNotificationIds(new Set(JSON.parse(saved)));
        } catch (e) {
          console.error("Error parsing comment read notifications:", e);
        }
      }
    }
  }, [currentUser?.id]);

  // Detect new unread comment notifications
  useEffect(() => {
    if (lastCheckTimeRef.current && commentNotifications.length > 0) {
      const hasNew = commentNotifications.some((notif) => {
        const isUnread = !notif.is_read && !readNotificationIds.has(notif.id);
        if (!isUnread) return false;
        const notifTime = new Date(notif.commented_at || notif.created_at).getTime();
        const lastCheck = lastCheckTimeRef.current?.getTime();
        if (!lastCheck) return true;
        return notifTime > lastCheck;
      });
      setHasNewComments(hasNew);
    } else if (commentNotifications.length > 0) {
      const hasUnread = commentNotifications.some(
        (n) => !n.is_read && !readNotificationIds.has(n.id)
      );
      setHasNewComments(hasUnread);
    } else {
      setHasNewComments(false);
    }
  }, [commentNotifications, readNotificationIds]);

  // Unread badge count — comment notifications only
  const localUnreadCount = useMemo(() => {
    return commentNotifications.filter(
      (n) => n.is_read !== true && !readNotificationIds.has(n.id)
    ).length;
  }, [commentNotifications, readNotificationIds]);

  // Mark a single comment notification as read
  const handleMarkAsRead = useCallback(
    async (notificationId) => {
      if (!currentUser?.id) return;
      const newReadIds = new Set(readNotificationIds);
      newReadIds.add(notificationId);
      setReadNotificationIds(newReadIds);
      const readKey = `notifications_read_${currentUser.id}`;
      localStorage.setItem(readKey, JSON.stringify(Array.from(newReadIds)));
      try {
        await dispatch(markNotificationAsRead(notificationId)).unwrap();
      } catch (error) {
        console.error("Failed to mark comment notification as read:", error);
      }
    },
    [dispatch, readNotificationIds, currentUser?.id]
  );

  // Mark all comment notifications as read
  const handleMarkAllAsRead = useCallback(async () => {
    if (!currentUser?.id) return;
    const allIds = new Set(commentNotifications.map((n) => n.id));
    setReadNotificationIds((prev) => new Set([...prev, ...allIds]));
    setHasNewComments(false);
    const readKey = `notifications_read_${currentUser.id}`;
    const merged = new Set([...readNotificationIds, ...allIds]);
    localStorage.setItem(readKey, JSON.stringify(Array.from(merged)));
    const key = getLastCheckKey();
    if (key) {
      lastCheckTimeRef.current = new Date();
      localStorage.setItem(key, lastCheckTimeRef.current.toISOString());
    }
    try {
      await dispatch(markAllNotificationsAsRead()).unwrap();
    } catch (error) {
      console.error("Failed to mark all comment notifications as read:", error);
    }
  }, [dispatch, commentNotifications, readNotificationIds, currentUser?.id, getLastCheckKey]);

  // Toggle dropdown open/close
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev && currentUser?.id) {
        // Update last check time when opening
        const key = getLastCheckKey();
        if (key) {
          lastCheckTimeRef.current = new Date();
          localStorage.setItem(key, lastCheckTimeRef.current.toISOString());
        }
        setHasNewComments(false);
      }
      return !prev;
    });
  }, [currentUser?.id, getLastCheckKey]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Format comment notification text
  const formatCommentDescription = useCallback((notification) => {
    const commenter = notification.comment_user_name || notification.user_name || "Someone";
    if (notification.comment_text) {
      const preview =
        notification.comment_text.length > 80
          ? notification.comment_text.substring(0, 80) + "..."
          : notification.comment_text;
      return `${commenter}: ${preview}`;
    }
    if (notification.description) return notification.description;
    return `${commenter} added a comment`;
  }, []);

  // Only show for users who have view_order permission
  if (!hasPermission(allowedPermissions, "view_order")) {
    return null;
  }

  return (
    <li
      className={`dropdown notification-dropdown ${isOpen ? "show" : ""}`}
      ref={dropdownRef}
    >
      <span
        className="nav-link notification-toggle nav-link-lg"
        onClick={handleToggle}
        title="Comments"
      >
        <CommentBirdIcon
          className={`feather bell bird-icon ${hasNewComments ? "has-new" : ""}`}
        />
        {localUnreadCount > 0 && (
          <span className="notification-badge">
            {localUnreadCount > 99 ? "99+" : localUnreadCount}
          </span>
        )}
      </span>
      <div
        className={`dropdown-menu dropdown-list dropdown-menu-right pullDown ${
          isOpen ? "show" : ""
        }`}
      >
        <div className="dropdown-header">
          <span>Comments</span>
          {localUnreadCount > 0 && (
            <button
              className="mark-all-read-btn"
              onClick={handleMarkAllAsRead}
              title="Mark all as read"
            >
              Mark All As Read
            </button>
          )}
        </div>
        <div className="notification-list">
          {loading ? (
            <div className="notification-item notification-loading">
              <p>Loading...</p>
            </div>
          ) : commentNotifications.length === 0 ? (
            <div className="notification-item notification-empty">
              <p>No comment notifications</p>
            </div>
          ) : (
            commentNotifications.map((notification) => {
              const isRead =
                notification.is_read === true ||
                readNotificationIds.has(notification.id);
              const orderId = notification.order_id || notification.orderId;
              const orderNumber =
                notification.order_number || `Order #${orderId}`;

              return (
                <div
                  key={notification.id}
                  className={`notification-item ${isRead ? "read" : "unread"}`}
                  onClick={() => {
                    if (!isRead) handleMarkAsRead(notification.id);
                  }}
                  style={{ cursor: isRead ? "default" : "pointer" }}
                >
                  {!isRead && <span className="unread-dot"></span>}
                  <div className="notification-content">
                    <div className="notification-header">
                      <Link
                        to={`/orders/${orderId}/details`}
                        className="notification-order-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOpen(false);
                          if (!isRead) handleMarkAsRead(notification.id);
                        }}
                      >
                        {orderNumber}
                      </Link>
                      {!isRead && (
                        <button
                          className="mark-read-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          title="Mark as read"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <p className="notification-description">
                      {formatCommentDescription(notification)}
                    </p>
                    <p className="notification-time">
                      {formatActivityTime(
                        notification.commented_at || notification.created_at
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </li>
  );
}

export default CommentNotificationDropdown;
