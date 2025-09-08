import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as orderReportApi from "../../api/orderReport.api"; // API functions for order reports
import { toast } from "react-toastify";

// Async action: Fetch order report by order ID and report type
export const fetchOrderReport = createAsyncThunk(
  "orderReports/fetchReport",
  async ({ orderId, reportType }, { rejectWithValue }) => {
    try {
      const res = await orderReportApi.getOrderReport(orderId, reportType);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Generate/Create order report
export const generateOrderReport = createAsyncThunk(
  "orderReports/generateReport", 
  async ({ orderId, data }, { rejectWithValue }) => {
    try {
      const res = await orderReportApi.generateOrderReport(orderId, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  currentReport: null,     // Currently selected/fetched report data
  generatedReport: null,   // Generated report response (with download URL)
  loading: false,          // Loading state for fetch operations
  generating: false,       // Loading state for generate operations
  error: null,            // Error message for fetch operations
  generateError: null,    // Error message for generate operations
};

// Order Report slice
const orderReportSlice = createSlice({
  name: "orderReports",
  initialState,
  reducers: {
    // Clear current report data
    clearCurrentReport: (state) => {
      state.currentReport = null;
      state.error = null;
    },
    // Clear generated report data
    clearGeneratedReport: (state) => {
      state.generatedReport = null;
      state.generateError = null;
    },
    // Clear all errors
    clearErrors: (state) => {
      state.error = null;
      state.generateError = null;
    },
  }, 

  extraReducers: (builder) => {
    builder
      // Fetch order report
      .addCase(fetchOrderReport.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrderReport.fulfilled, (state, action) => {
        state.loading = false;
        state.currentReport = action.payload.data;
        // Optional: Show success toast
        // toast.success(action.payload.message || "Report fetched successfully");
      })
      .addCase(fetchOrderReport.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch report: ${action.payload}`);
      })

      // Generate order report
      .addCase(generateOrderReport.pending, (state) => {
        state.generating = true;
        state.generateError = null;
      })
      .addCase(generateOrderReport.fulfilled, (state, action) => {
        state.generating = false;
        state.generatedReport = action.payload.data;
        toast.success(action.payload.message || "Report generated successfully");
      })
      .addCase(generateOrderReport.rejected, (state, action) => {
        state.generating = false;
        state.generateError = action.payload;
        toast.error(`Failed to generate report: ${action.payload}`);
      });
  },
});

// Export actions
export const { clearCurrentReport, clearGeneratedReport, clearErrors } = orderReportSlice.actions;

// Export reducer
export default orderReportSlice.reducer;
