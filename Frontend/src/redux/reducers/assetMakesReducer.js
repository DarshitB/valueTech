import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as orderApi from "../../api/order.api";
import { toast } from "react-toastify";

// Async action: Fetch asset makes for specific report type
export const fetchAssetMakesForReports = createAsyncThunk(
  "assetMakes/fetchByOrderType",
  async (orderType, { rejectWithValue }) => {
    try {
      const res = await orderApi.getAssetMakesForReports(orderType);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  list: [],           // List of asset makes
  loading: false,     // Loading state
  error: null,        // Error message
  orderType: null,    // Current order type
  total: 0,          // Total number of records
};

// Asset makes slice
const assetMakesSlice = createSlice({
  name: "assetMakes",
  initialState,
  reducers: {
    clearAssetMakes: (state) => {
      state.list = [];
      state.orderType = null;
      state.total = 0;
    },
  },

  extraReducers: (builder) => {
    builder
      // Fetch asset makes by order type
      .addCase(fetchAssetMakesForReports.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAssetMakesForReports.fulfilled, (state, action) => {
        // Handle the nested response structure
        const response = action.payload;
        state.list = response.data || [];
        state.orderType = response.order_type;
        state.total = response.total || 0;
        state.loading = false;
        
        // Only show success message if explicitly needed
        // toast.success(response.message);
      })
      .addCase(fetchAssetMakesForReports.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch asset makes: ${action.payload}`);
      });
  },
});

export const { clearAssetMakes } = assetMakesSlice.actions;
export default assetMakesSlice.reducer;
