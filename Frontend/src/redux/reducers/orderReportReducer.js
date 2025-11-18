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

// Async action: Generate custom report with content structure
export const generateCustomReport = createAsyncThunk(
  "orderReports/generateCustomReport",
  async ({ orderId, content }, { rejectWithValue }) => {
    try {
      const res = await orderReportApi.generateCustomReport(orderId, content);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Save order report data
export const saveOrderReport = createAsyncThunk(
  "orderReports/saveReport",
  async ({ orderId, reportData }, { rejectWithValue }) => {
    try {
      const res = await orderReportApi.saveOrderReport(orderId, reportData);
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
  customReportGenerating: false, // Loading state for custom report generation
  customReportError: null,       // Error state for custom report generation
  customReportData: null,        // Generated custom report data
  saving: false,          // Loading state for save operations
  saveError: null,        // Error message for save operations
  savedReport: null,      // Saved report response
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
        // Allow silent fetches (e.g., when missing report should not toast)
        const isSilent = Boolean(action.meta?.arg?.silent);
        if (!isSilent) {
          toast.error(`Failed to fetch report: ${action.payload}`);
        }
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
      })

      // Generate custom report
      .addCase(generateCustomReport.pending, (state) => {
        state.customReportGenerating = true;
        state.customReportError = null;
        state.customReportData = null;
      })
      .addCase(generateCustomReport.fulfilled, (state, action) => {
        state.customReportGenerating = false;
        state.customReportError = null;
        state.customReportData = action.payload;
        toast.success("Custom report generated successfully!");
      })
      .addCase(generateCustomReport.rejected, (state, action) => {
        state.customReportGenerating = false;
        state.customReportError = action.payload;
        state.customReportData = null;
        toast.error(`Failed to generate custom report: ${action.payload}`);
      })

      // Save order report
      .addCase(saveOrderReport.pending, (state) => {
        state.saving = true;
        state.saveError = null;
      })
      .addCase(saveOrderReport.fulfilled, (state, action) => {
        state.saving = false;
        state.savedReport = action.payload.data;
        // Also update currentReport so the component knows data exists
        state.currentReport = action.payload.data;
        toast.success(action.payload.message || "Report saved successfully");
      })
      .addCase(saveOrderReport.rejected, (state, action) => {
        state.saving = false;
        state.saveError = action.payload;
        toast.error(`Failed to save report: ${action.payload}`);
      });
  },
});

// Export actions
export const { clearCurrentReport, clearGeneratedReport, clearErrors } = orderReportSlice.actions;

// Export reducer
export default orderReportSlice.reducer;
