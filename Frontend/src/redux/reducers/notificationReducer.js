import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as notificationApi from "../../api/notification.api";
import { toast } from "react-toastify";

// Async action: Fetch notifications
export const fetchNotifications = createAsyncThunk(
  "notifications/fetchAll",
  async (params = {}, { rejectWithValue }) => {
    try {
      const res = await notificationApi.getNotifications(params);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Mark notification as read
export const markNotificationAsRead = createAsyncThunk(
  "notifications/markAsRead",
  async (notificationId, { rejectWithValue }) => {
    try {
      const res = await notificationApi.markNotificationAsRead(notificationId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Mark all notifications as read
export const markAllNotificationsAsRead = createAsyncThunk(
  "notifications/markAllAsRead",
  async (_, { rejectWithValue }) => {
    try {
      const res = await notificationApi.markAllNotificationsAsRead();
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  list: [], // All notifications
  loading: false, // Loading state
  error: null, // Error message
  lastCheck: null, // Last check timestamp
  unreadCount: 0, // Count of unread notifications
};

// Notification slice
const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    // Clear notifications
    clearNotifications: (state) => {
      state.list = [];
      state.unreadCount = 0;
    },
    // Update last check timestamp
    updateLastCheck: (state, action) => {
      state.lastCheck = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch notifications
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        const response = action.payload;
        
        // Debug: Log the response to help identify the issue
        /* console.log("Notification API Response:", response);
        console.log("Response.data:", response?.data);
        console.log("Response.data.notifications:", response?.data?.notifications);
        console.log("Response.data.unread_count:", response?.data?.unread_count);
        console.log("Is notifications array?", Array.isArray(response?.data?.notifications));
        console.log("Notifications length:", response?.data?.notifications?.length); */
        
        // Handle different response structures
        if (response?.data?.notifications) {
          // Standard structure: { data: { notifications: [...], unread_count: X } }
          state.list = Array.isArray(response.data.notifications) ? response.data.notifications : [];
          
          // Calculate actual unread count from notifications array (more reliable than backend count)
          const actualUnreadCount = state.list.filter((notif) => notif.is_read === false).length;
          
          // Use backend unread_count if it's provided, but also log actual count for debugging
          state.unreadCount = response.data.unread_count !== undefined ? response.data.unread_count : actualUnreadCount;
          
          if (response.data.last_check_timestamp) {
            state.lastCheck = response.data.last_check_timestamp;
          }
          /* console.log("Parsed notifications (standard structure):", state.list.length, "notifications");
          console.log("Backend unread_count:", response.data.unread_count);
          console.log("Actual unread count (from notifications array):", actualUnreadCount);
          console.log("Unread count set to:", state.unreadCount);
          console.log("Sample notification:", state.list[0]); */
        } else if (response?.notifications) {
          // Alternative structure: { notifications: [...], unread_count: X }
          state.list = Array.isArray(response.notifications) ? response.notifications : [];
          state.unreadCount = response.unread_count || 0;
         /*  console.log("Parsed notifications (alternative structure):", state.list.length, "notifications"); */
        } else if (Array.isArray(response)) {
          // Direct array response
          state.list = response;
          state.unreadCount = response.length;
          /* console.log("Parsed notifications (array structure):", state.list.length, "notifications"); */
        } else if (response?.data && Array.isArray(response.data)) {
          // { data: [...] }
          state.list = response.data;
          state.unreadCount = response.data.length;
          /* console.log("Parsed notifications (data array):", state.list.length, "notifications"); */
        } else {
          // Empty or unknown structure
          state.list = [];
          // Keep unread_count if it exists even if notifications array is missing
          if (response?.data?.unread_count !== undefined) {
            state.unreadCount = response.data.unread_count;
          } else if (response?.unread_count !== undefined) {
            state.unreadCount = response.unread_count;
          } else {
            state.unreadCount = 0;
          }
          console.warn("Unexpected notification response structure:", response);
          console.warn("Unread count from response:", state.unreadCount);
        }
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Don't show toast error for notifications to avoid disrupting UX
        console.error("Failed to fetch notifications:", action.payload);
      })

      // Mark notification as read
      .addCase(markNotificationAsRead.fulfilled, (state, action) => {
        const notificationId = action.meta.arg;
        const notification = state.list.find((n) => n.id === notificationId);
        if (notification) {
          notification.is_read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markNotificationAsRead.rejected, (state, action) => {
        console.error("Failed to mark notification as read:", action.payload);
      })

      // Mark all notifications as read
      .addCase(markAllNotificationsAsRead.fulfilled, (state) => {
        // Mark all notifications as read
        state.list.forEach((notification) => {
          notification.is_read = true;
        });
        // Reset unread count to 0
        state.unreadCount = 0;
        // Update last check timestamp
        state.lastCheck = new Date().toISOString();
      })
      .addCase(markAllNotificationsAsRead.rejected, (state, action) => {
        console.error("Failed to mark all notifications as read:", action.payload);
      });
  },
});

export const { clearNotifications, updateLastCheck } = notificationSlice.actions;
export default notificationSlice.reducer;

