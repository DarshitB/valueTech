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

export const fetchBreaksByUserId = createAsyncThunk(
  "attendance/fetchBreaksByUserId",
  async (userId, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.getBreaksByUserId(userId);
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

export const updateAttendanceLunchIn = createAsyncThunk(
  "attendance/lunchIn",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.lunchInAttendance(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateAttendanceLunchOut = createAsyncThunk(
  "attendance/lunchOut",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.lunchOutAttendance(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateAttendanceBreakIn = createAsyncThunk(
  "attendance/breakIn",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.breakInAttendance(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateAttendanceBreakOut = createAsyncThunk(
  "attendance/breakOut",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.breakOutAttendance(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const applyLastRecordPayload = (state, payload) => {
  if (!payload?.id) return;
  const index = state.list.findIndex((record) => record.id === payload.id);
  if (index !== -1) {
    state.list[index] = payload;
  }
  if (state.lastRecord && state.lastRecord.id === payload.id) {
    state.lastRecord = payload;
  } else if (!state.lastRecord) {
    state.lastRecord = payload;
  }
};

// Initial state
const initialState = {
  list: [],
  breaks: [],
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

      .addCase(fetchBreaksByUserId.fulfilled, (state, action) => {
        state.breaks = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchBreaksByUserId.rejected, (state, action) => {
        state.error = action.payload;
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
        applyLastRecordPayload(state, action.payload);
        toast.success("Check-out successful");
      })
      .addCase(updateAttendanceCheckout.rejected, (state, action) => {
        toast.error(`Check-out failed: ${action.payload}`);
      })

      .addCase(updateAttendanceLunchIn.fulfilled, (state, action) => {
        applyLastRecordPayload(state, action.payload);
        toast.success("Lunch in recorded");
      })
      .addCase(updateAttendanceLunchIn.rejected, (state, action) => {
        toast.error(`Lunch in failed: ${action.payload}`);
      })

      .addCase(updateAttendanceLunchOut.fulfilled, (state, action) => {
        applyLastRecordPayload(state, action.payload);
        toast.success("Lunch out recorded");
      })
      .addCase(updateAttendanceLunchOut.rejected, (state, action) => {
        toast.error(`Lunch out failed: ${action.payload}`);
      })

      .addCase(updateAttendanceBreakIn.fulfilled, (state, action) => {
        applyLastRecordPayload(state, action.payload);
        if (action.payload?.open_break) {
          state.breaks = [...state.breaks, action.payload.open_break];
        }
        toast.success("Break in recorded");
      })
      .addCase(updateAttendanceBreakIn.rejected, (state, action) => {
        toast.error(`Break in failed: ${action.payload}`);
      })

      .addCase(updateAttendanceBreakOut.fulfilled, (state, action) => {
        applyLastRecordPayload(state, {
          ...action.payload,
          open_break: null,
        });
        const closed = action.payload?.closed_break;
        if (closed?.id) {
          const idx = state.breaks.findIndex((b) => b.id === closed.id);
          if (idx !== -1) {
            state.breaks[idx] = closed;
          } else {
            state.breaks.push(closed);
          }
        }
        toast.success("Break out recorded");
      })
      .addCase(updateAttendanceBreakOut.rejected, (state, action) => {
        toast.error(`Break out failed: ${action.payload}`);
      });
  },
});

export default attendanceSlice.reducer;
