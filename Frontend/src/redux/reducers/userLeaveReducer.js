import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as userLeaveApi from "../../api/userLeave.api";
import { toast } from "react-toastify";

export const fetchUserLeavesByUserId = createAsyncThunk(
  "userLeaves/fetchByUserId",
  async ({ userId, params }, { rejectWithValue }) => {
    try {
      const res = await userLeaveApi.getUserLeavesByUserId(userId, params);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const addUserLeave = createAsyncThunk(
  "userLeaves/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await userLeaveApi.createUserLeave(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const initialState = {
  list: [],
  loading: false,
  error: null,
};

const userLeaveSlice = createSlice({
  name: "userLeaves",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserLeavesByUserId.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserLeavesByUserId.fulfilled, (state, action) => {
        state.list = action.payload || [];
        state.loading = false;
      })
      .addCase(fetchUserLeavesByUserId.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch leaves: ${action.payload}`);
      })
      .addCase(addUserLeave.fulfilled, (state, action) => {
        const leave = action.payload;
        const idx = state.list.findIndex((l) => l.id === leave.id);
        if (idx >= 0) {
          state.list[idx] = leave;
        } else {
          state.list.push(leave);
        }
        toast.success(
          leave?.updated
            ? "Leave updated successfully"
            : "Leave added successfully"
        );
      })
      .addCase(addUserLeave.rejected, (state, action) => {
        toast.error(`Failed to save leave: ${action.payload}`);
      });
  },
});

export default userLeaveSlice.reducer;
