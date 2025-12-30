// API utility functions for notifications
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/notifications"; // Base endpoint for all notification-related requests

/**
 * Fetch notifications for the current user
 * @param {Object} params - Query parameters
 * @param {string} params.last_check - ISO 8601 datetime string of user's last check
 * @param {number} params.limit - Maximum number of notifications to return (default: 50)
 * @param {number} params.offset - Offset for pagination (default: 0)
 * @returns {Promise} Axios response
 */
export const getNotifications = (params = {}) => {
  const queryParams = new URLSearchParams();
  
  if (params.last_check) {
    queryParams.append("last_check", params.last_check);
  }
  if (params.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params.offset) {
    queryParams.append("offset", params.offset.toString());
  }
  
  const queryString = queryParams.toString();
  const url = queryString ? `${ENDPOINT}?${queryString}` : ENDPOINT;
  
  return axios.get(url).then((response) => {
    // Debug: Log the raw response
    console.log("Raw notification API response:", response);
    console.log("Response data:", response.data);
    return response;
  }).catch((error) => {
    console.error("Notification API error:", error);
    console.error("Error response:", error.response);
    throw error;
  });
};

/**
 * Mark a notification as read
 * @param {string|number} notificationId - ID of the notification to mark as read
 * @returns {Promise} Axios response
 */
export const markNotificationAsRead = (notificationId) => {
  return axios.post(`${ENDPOINT}/${notificationId}/read`);
};

/**
 * Mark all notifications as read for the current user
 * @returns {Promise} Axios response
 */
export const markAllNotificationsAsRead = () => {
  return axios.post(`${ENDPOINT}/read-all`);
};

