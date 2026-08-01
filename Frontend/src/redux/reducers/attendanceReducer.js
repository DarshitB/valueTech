import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as attendanceApi from "../../api/attendance.api";
import { toast } from "react-toastify";

// Fetch attendance records for a specific user (optional { from, to })
export const fetchAttendanceByUserId = createAsyncThunk(
  "attendance/fetchByUserId",
  async (arg, { rejectWithValue }) => {
    try {
      const userId = typeof arg === "object" ? arg.userId : arg;
      const params =
        typeof arg === "object"
          ? { from: arg.from, to: arg.to }
          : undefined;
      const res = await attendanceApi.getAttendanceByUserId(userId, params);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const fetchBreaksByUserId = createAsyncThunk(
  "attendance/fetchBreaksByUserId",
  async (arg, { rejectWithValue }) => {
    try {
      const userId = typeof arg === "object" ? arg.userId : arg;
      const params =
        typeof arg === "object"
          ? { from: arg.from, to: arg.to }
          : undefined;
      const res = await attendanceApi.getBreaksByUserId(userId, params);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Attendance Date page: all users for one working date
export const fetchAttendanceByWorkingDate = createAsyncThunk(
  "attendance/fetchByWorkingDate",
  async (workingDate, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.getAttendanceByWorkingDate(workingDate);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Attendance detail: one user + one working date
export const fetchAttendanceDetail = createAsyncThunk(
  "attendance/fetchDetail",
  async ({ userId, workingDate }, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.getAttendanceDetail(userId, workingDate);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateAttendanceWorkTimes = createAsyncThunk(
  "attendance/updateWorkTimes",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.updateAttendanceWorkTimes(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateBreakWorkTimes = createAsyncThunk(
  "attendance/updateBreakWorkTimes",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.updateBreakWorkTimes(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const updateAttendanceCheckoutRemarks = createAsyncThunk(
  "attendance/updateCheckoutRemarks",
  async (data, { rejectWithValue }) => {
    try {
      const res = await attendanceApi.updateAttendanceCheckoutRemarks(data);
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
  byDateList: [],
  byDateBreaks: [],
  byDateLeaves: [],
  byDateLoading: false,
  detail: null,
  detailBreaks: [],
  detailActivities: [],
  detailLoading: false,
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

      .addCase(fetchAttendanceByWorkingDate.pending, (state) => {
        state.byDateLoading = true;
        state.error = null;
      })
      .addCase(fetchAttendanceByWorkingDate.fulfilled, (state, action) => {
        const payload = action.payload || {};
        state.byDateList = Array.isArray(payload.attendance)
          ? payload.attendance
          : [];
        state.byDateBreaks = Array.isArray(payload.breaks) ? payload.breaks : [];
        state.byDateLeaves = Array.isArray(payload.leaves) ? payload.leaves : [];
        state.byDateLoading = false;
      })
      .addCase(fetchAttendanceByWorkingDate.rejected, (state, action) => {
        state.byDateLoading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch attendance by date: ${action.payload}`);
      })

      .addCase(fetchAttendanceDetail.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchAttendanceDetail.fulfilled, (state, action) => {
        state.detail = action.payload?.attendance || null;
        state.detailBreaks = Array.isArray(action.payload?.breaks)
          ? action.payload.breaks
          : [];
        state.detailActivities = Array.isArray(action.payload?.activities)
          ? action.payload.activities
          : [];
        state.detailLoading = false;
      })
      .addCase(fetchAttendanceDetail.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch attendance detail: ${action.payload}`);
      })

      .addCase(updateAttendanceWorkTimes.fulfilled, (state, action) => {
        state.detail = action.payload?.attendance || state.detail;
        state.detailBreaks = Array.isArray(action.payload?.breaks)
          ? action.payload.breaks
          : state.detailBreaks;
        toast.success("Attendance times updated");
      })
      .addCase(updateAttendanceWorkTimes.rejected, (state, action) => {
        toast.error(`Failed to update attendance times: ${action.payload}`);
      })

      .addCase(updateAttendanceCheckoutRemarks.fulfilled, (state, action) => {
        if (action.payload?.attendance) {
          state.detail = {
            ...(state.detail || {}),
            ...action.payload.attendance,
          };
        }
        toast.success("Day out remark saved");
      })
      .addCase(updateAttendanceCheckoutRemarks.rejected, (state, action) => {
        toast.error(`Failed to save day out remark: ${action.payload}`);
      })

      .addCase(updateBreakWorkTimes.fulfilled, (state, action) => {
        const updated = action.payload;
        if (updated?.id) {
          const idx = state.detailBreaks.findIndex((b) => b.id === updated.id);
          if (idx !== -1) {
            state.detailBreaks[idx] = updated;
          }
        }
        toast.success("Break times updated");
      })
      .addCase(updateBreakWorkTimes.rejected, (state, action) => {
        toast.error(`Failed to update break times: ${action.payload}`);
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
