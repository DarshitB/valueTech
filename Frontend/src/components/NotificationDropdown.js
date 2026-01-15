import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { NotificationBellIcon } from "./icons";
import {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../redux/reducers/notificationReducer";
import { selectPermissions, selectUser } from "../redux/selectors/authSelectors";
import { hasPermission } from "../utils/permissionUtils";
import "./NotificationDropdown.scss";

// Utility: Format date for notifications (same as OrderDetails)
function formatActivityTime(dateString) {
  if (!dateString) return "-";
  
  const date = new Date(dateString);
  const now = new Date();
  
  // Reset time to compare dates only
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  // Format time (12-hour format with AM/PM)
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const minutesStr = minutes.toString().padStart(2, "0");
  const timeStr = `${hours}:${minutesStr} ${ampm}`;
  
  // Month abbreviations
  const monthAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  // Check if today
  if (activityDate.getTime() === today.getTime()) {
    return `Today at ${timeStr}`;
  }
  
  // Check if yesterday
  if (activityDate.getTime() === yesterday.getTime()) {
    return `Yesterday at ${timeStr}`;
  }
  
  // For older dates: "15 Dec at 7:30 PM"
  const day = date.getDate();
  const month = monthAbbr[date.getMonth()];
  return `${day} ${month} at ${timeStr}`;
}

// Get localStorage key for last notification check (user-specific)
function getLastCheckKey(userId) {
  return `notifications_last_check_${userId}`;
}

function NotificationDropdown() {
  const dispatch = useDispatch();
  const notifications = useSelector((state) => state.notifications.list);
  const loading = useSelector((state) => state.notifications.loading);
  const unreadCount = useSelector((state) => state.notifications.unreadCount);
  const allowedPermissions = useSelector(selectPermissions);
  const currentUser = useSelector(selectUser);
  
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState(new Set());
  const dropdownRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const lastCheckTimeRef = useRef(null);

  // Get last check time from localStorage
  const getLastCheckTime = useCallback(() => {
    if (!currentUser?.id) return null;
    const lastCheckKey = getLastCheckKey(currentUser.id);
    const lastCheck = localStorage.getItem(lastCheckKey);
    return lastCheck ? new Date(lastCheck).toISOString() : null;
  }, [currentUser?.id]);

  // Load last check time on mount
  useEffect(() => {
    if (currentUser?.id) {
      const lastCheck = getLastCheckTime();
      if (lastCheck) {
        lastCheckTimeRef.current = new Date(lastCheck);
      } else {
        // First time - set to 24 hours ago to get recent notifications
        const yesterday = new Date();
        yesterday.setHours(yesterday.getHours() - 24);
        lastCheckTimeRef.current = yesterday;
      }
    }
  }, [currentUser?.id, getLastCheckTime]);

  // Load read notification IDs from localStorage
  useEffect(() => {
    if (currentUser?.id) {
      const readKey = `notifications_read_${currentUser.id}`;
      const savedReadIds = localStorage.getItem(readKey);
      if (savedReadIds) {
        try {
          const parsed = JSON.parse(savedReadIds);
          setReadNotificationIds(new Set(parsed));
        } catch (e) {
          console.error("Error parsing read notifications:", e);
        }
      }
    }
  }, [currentUser?.id]);

  // Fetch notifications function
  // Note: Backend handles all permission-based filtering (same as order list)
  // Frontend just displays what backend returns - no additional filtering needed
  const fetchNotificationsData = useCallback(() => {
    if (!currentUser?.id || !hasPermission(allowedPermissions, "view_order")) {
      return;
    }

    const lastCheck = getLastCheckTime();
    dispatch(
      fetchNotifications({
        last_check: lastCheck,
        limit: 50,
      })
    ).catch((error) => {
      // Silently handle errors - don't disrupt UX
      console.error("Error fetching notifications:", error);
    });
  }, [dispatch, currentUser?.id, allowedPermissions, getLastCheckTime]);

  // Initial fetch on mount
  useEffect(() => {
    fetchNotificationsData();
  }, [fetchNotificationsData]);

  // Set up polling for new notifications (every 30 seconds)
  useEffect(() => {
    if (!currentUser?.id || !hasPermission(allowedPermissions, "view_order")) {
      return;
    }

    // Poll every 30 seconds for new notifications
    pollingIntervalRef.current = setInterval(() => {
      fetchNotificationsData();
    }, 30000); // 30 seconds

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [currentUser?.id, allowedPermissions, fetchNotificationsData]);

  // Check for new notifications (compare with last check time)
  useEffect(() => {
    if (lastCheckTimeRef.current && notifications.length > 0) {
      // Check if there are any unread notifications that are new (after last check)
      const hasNew = notifications.some((notif) => {
        // Must be unread (not marked as read in backend or locally)
        const isUnread = !notif.is_read && !readNotificationIds.has(notif.id);
        if (!isUnread) return false;
        
        // Must be after last check time
        const notifTime = new Date(notif.changed_at || notif.created_at).getTime();
        const lastCheckTime = lastCheckTimeRef.current?.getTime();
        if (!lastCheckTime) return true;
        return notifTime > lastCheckTime;
      });
      setHasNewNotifications(hasNew);
    } else if (notifications.length > 0) {
      // Check if there are any unread notifications (regardless of time)
      const hasUnread = notifications.some((notif) => 
        !notif.is_read && !readNotificationIds.has(notif.id)
      );
      setHasNewNotifications(hasUnread);
    } else {
      setHasNewNotifications(false);
    }
  }, [notifications, readNotificationIds]);

  // Calculate local unread count (only count truly unread notifications)
  const localUnreadCount = useMemo(() => {
    // Count notifications that are:
    // 1. Not marked as read in backend (is_read === false)
    // 2. Not marked as read locally (not in readNotificationIds)
    const unreadNotifications = notifications.filter((notif) => {
      const isReadInBackend = notif.is_read === true;
      const isReadLocally = readNotificationIds.has(notif.id);
      return !isReadInBackend && !isReadLocally;
    });
    
    return unreadNotifications.length;
  }, [notifications, readNotificationIds]);

  // Mark notification as read (but keep it visible - don't remove)
  const handleMarkAsRead = useCallback(
    async (notificationId) => {
      if (!currentUser?.id) return;

      // Optimistically update UI immediately
      const newReadIds = new Set(readNotificationIds);
      newReadIds.add(notificationId);
      setReadNotificationIds(newReadIds);

      // Save to localStorage immediately
      const readKey = `notifications_read_${currentUser.id}`;
      localStorage.setItem(readKey, JSON.stringify(Array.from(newReadIds)));

      // Call API to mark as read on backend
      try {
        await dispatch(markNotificationAsRead(notificationId)).unwrap();
      } catch (error) {
        // Log error but keep local state - notification stays marked as read
        console.error("Failed to mark notification as read on backend:", error);
      }
    },
    [dispatch, readNotificationIds, currentUser?.id]
  );

  // Mark all as read
  const handleMarkAllAsRead = useCallback(async () => {
    if (!currentUser?.id) return;

    // Get all notification IDs (both read and unread)
    const allIds = new Set(notifications.map((n) => n.id));
    
    // Optimistically update UI immediately
    setReadNotificationIds(allIds);
    setHasNewNotifications(false);

    // Save to localStorage immediately
    const readKey = `notifications_read_${currentUser.id}`;
    localStorage.setItem(readKey, JSON.stringify(Array.from(allIds)));

    // Update last check time to now (so future notifications are considered "new")
    const lastCheckKey = getLastCheckKey(currentUser.id);
    lastCheckTimeRef.current = new Date();
    localStorage.setItem(lastCheckKey, lastCheckTimeRef.current.toISOString());

    // Call API to mark all as read on backend
    try {
      await dispatch(markAllNotificationsAsRead()).unwrap();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
      // Keep local state - notifications stay marked as read locally
    }
  }, [dispatch, notifications, currentUser?.id]);

  // Handle dropdown toggle
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        // Opening dropdown - update last check time
        if (currentUser?.id) {
          const lastCheckKey = getLastCheckKey(currentUser.id);
          lastCheckTimeRef.current = new Date();
          localStorage.setItem(lastCheckKey, lastCheckTimeRef.current.toISOString());
          setHasNewNotifications(false);
          
          // Refresh notifications to get latest
          fetchNotificationsData();
        }
      }
      return !prev;
    });
  }, [currentUser?.id, fetchNotificationsData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Format notification description (exactly like OrderDetails component)
  const formatNotificationDescription = useCallback((notification) => {
    // Use description if provided by backend
    if (notification.description) {
      return notification.description;
    }
    
    // Format exactly like OrderDetails component (lines 2258-2270)
    const showValue = (val) => val || "";
    
    // Get user name - prefer user_name from API, fallback to changed_by_name
    const userName = notification.user_name || notification.changed_by_name || "";
    
    if (notification.status_name && notification.activity_extra) {
      return `${showValue(notification.status_name)} by ${showValue(userName)} [ ${showValue(notification.activity_extra)} ]`;
    } else if (notification.status_name) {
      return `${showValue(notification.status_name)} by ${showValue(userName)}`;
    } else if (notification.activity_extra) {
      return `${showValue(notification.activity_extra)} by ${showValue(userName)}`;
    }
    
    return "New activity";
  }, []);

  // Don't render if user doesn't have permission
  if (!hasPermission(allowedPermissions, "view_order")) {
    return null;
  }

  return (
    <li className={`dropdown notification-dropdown ${isOpen ? "show" : ""}`} ref={dropdownRef}>
      <span
        className="nav-link notification-toggle nav-link-lg"
        onClick={handleToggle}
        title="Notifications"
      >
        <NotificationBellIcon className={`feather feather-bell bell ${hasNewNotifications ? "has-new" : ""}`} />
        {localUnreadCount > 0 && (
          <span className="notification-badge">{localUnreadCount > 99 ? "99+" : localUnreadCount}</span>
        )}
      </span>
      <div className={`dropdown-menu dropdown-list dropdown-menu-right pullDown ${isOpen ? "show" : ""}`}>
        <div className="dropdown-header">
          <span>Notifications</span>
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
              <p>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notification-item notification-empty">
              <p>No notifications</p>
             {/*  {process.env.NODE_ENV === 'development' && (
                <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem', textAlign: 'left' }}>
                  <p>Debug Info:</p>
                  <p>• unreadCount: {localUnreadCount}</p>
                  <p>• notifications.length: {notifications.length}</p>
                  <p>• Check console for detailed logs</p>
                </div>
              )} */}
            </div>
          ) : (
            notifications.map((notification) => {
              // Check if read: use backend is_read field OR local readNotificationIds
              const isRead = notification.is_read === true || readNotificationIds.has(notification.id);
              const orderId = notification.order_id || notification.orderId;
              const orderNumber = notification.order_number || `Order #${orderId}`;
              
              return (
                <div
                  key={notification.id}
                  className={`notification-item ${isRead ? "read" : "unread"}`}
                  onClick={() => {
                    // Mark as read when clicking anywhere on notification (if unread)
                    if (!isRead) {
                      handleMarkAsRead(notification.id);
                    }
                  }}
                  style={{ cursor: isRead ? 'default' : 'pointer' }}
                >
                  {!isRead && <span className="unread-dot"></span>}
                  <div className="notification-content">
                    <div className="notification-header">
                      <Link
                        to={`/orders/${orderId}/details`}
                        className="notification-order-link"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent marking as read when clicking link
                          setIsOpen(false);
                          // Mark as read when navigating to order
                          if (!isRead) {
                            handleMarkAsRead(notification.id);
                          }
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
                      {formatNotificationDescription(notification)}
                    </p>
                    <p className="notification-time">
                      {formatActivityTime(notification.changed_at || notification.created_at)}
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

export default NotificationDropdown;
