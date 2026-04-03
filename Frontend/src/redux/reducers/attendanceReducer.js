import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as attendanceApi from "../../api/attendance.api";
import { toast } from "react-toastify";

// Fetch attendance records for a specific user
export const fetchAttendanceByUserId = createAsyncThunk(
  "attendance/fetchByUserId",
  async (userId, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.getAttendanceByUserId(userId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Fetch the last attendance record for a user
export const fetchLastAttendanceByUserId = createAsyncThunk(
  "attendance/fetchLastByUserId",
  async (userId, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.getLastAttendanceByUserId(userId);
      // Handle two response formats:
      // 1. Direct record: { id, user_id, checkin_time, ... }
      // 2. Wrapped response: { message: "...", data: null }
      const responseData = res.data;
      if (responseData && responseData.data === null) {
        return null; // No record found
      }
      // Check if it's a direct record (has id property)
      if (responseData && responseData.id) {
        return responseData;
      }
      // If data exists, return it
      return responseData.data || responseData;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Create a new attendance record (check-in)
export const addAttendance = createAsyncThunk(
  "attendance/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.createAttendance(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Update attendance record (check-out)
export const updateAttendanceCheckout = createAsyncThunk(
  "attendance/checkout",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.updateAttendance(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  list: [],
  loading: false,
  error: null,
  lastRecord: null,
};

// Slice
const attendanceSlice = createSlice({
  name: "attendance",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch attendance by user ID
      .addCase(fetchAttendanceByUserId.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAttendanceByUserId.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchAttendanceByUserId.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch attendance: ${action.payload}`);
      })

      // Fetch last attendance by user ID
      .addCase(fetchLastAttendanceByUserId.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLastAttendanceByUserId.fulfilled, (state, action) => {
        state.lastRecord = action.payload;
        state.loading = false;
      })
      .addCase(fetchLastAttendanceByUserId.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Add attendance (check-in)
      .addCase(addAttendance.fulfilled, (state, action) => {
        state.list.unshift(action.payload); // Add to beginning of list
        state.lastRecord = action.payload; // Update last record
        toast.success("Check-in successful");
      })
      .addCase(addAttendance.rejected, (state, action) => {
        toast.error(`Check-in failed: ${action.payload}`);
      })

      // Update attendance (check-out)
      .addCase(updateAttendanceCheckout.fulfilled, (state, action) => {
        // Update the record in the list if it exists
        const index = state.list.findIndex(
          (record) => record.id === action.payload.id
        );
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        // Update last record
        if (state.lastRecord && state.lastRecord.id === action.payload.id) {
          state.lastRecord = action.payload;
        }
        toast.success("Check-out successful");
      })
      .addCase(updateAttendanceCheckout.rejected, (state, action) => {
        toast.error(`Check-out failed: ${action.payload}`);
      });
  },
});

export default attendanceSlice.reducer;

