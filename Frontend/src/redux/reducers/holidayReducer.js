import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as holidayApi from "../../api/holiday.api";
import { toast } from "react-toastify";

export const fetchHolidays = createAsyncThunk(
  "holidays/fetchAll",
  async (params, { rejectWithValue }) => {
    try {
      const res = await holidayApi.getHolidays(params);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const addHoliday = createAsyncThunk(
  "holidays/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await holidayApi.createHoliday(data);
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

const holidaySlice = createSlice({
  name: "holidays",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHolidays.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHolidays.fulfilled, (state, action) => {
        state.list = action.payload || [];
        state.loading = false;
      })
      .addCase(fetchHolidays.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch holidays: ${action.payload}`);
      })
      .addCase(addHoliday.fulfilled, (state, action) => {
        const holiday = action.payload;
        const idx = state.list.findIndex((h) => h.id === holiday.id);
        if (idx >= 0) {
          state.list[idx] = holiday;
        } else {
          state.list.push(holiday);
        }
        toast.success(
          holiday?.updated
            ? "Holiday updated successfully"
            : "Holiday added successfully"
        );
      })
      .addCase(addHoliday.rejected, (state, action) => {
        toast.error(`Failed to save holiday: ${action.payload}`);
      });
  },
});

export default holidaySlice.reducer;
