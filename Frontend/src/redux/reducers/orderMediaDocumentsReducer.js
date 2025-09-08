import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as orderMediaDocumentsApi from "../../api/orderMediaDocuments.api"; // API functions for order media documents
import { toast } from "react-toastify";

// Async action: Fetch order media documents by order ID
export const fetchOrderMediaDocuments = createAsyncThunk(
  "orderMediaDocuments/fetchByOrderId",
  async (orderId, { rejectWithValue }) => {
    try {
      const res = await orderMediaDocumentsApi.getOrderMediaDocuments(orderId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Upload order media documents
export const uploadOrderMediaDocuments = createAsyncThunk(
  "orderMediaDocuments/upload",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await orderMediaDocumentsApi.uploadOrderMediaDocuments(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Delete order media documents
export const deleteOrderMediaDocuments = createAsyncThunk(
  "orderMediaDocuments/delete",
  async (documentId, { rejectWithValue }) => {
    try {
      await orderMediaDocumentsApi.deleteOrderMediaDocuments(documentId);
      return documentId; // Return ID to remove it from local state
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  documents: null,        // Order media documents data
  loading: false,         // Loading state
  error: null,            // Error message
  uploadLoading: false,   // Upload loading state
  uploadError: null,      // Upload error state
  deleteLoading: false,   // Delete loading state
  deleteError: null,      // Delete error state
};

// Order media documents slice
const orderMediaDocumentsSlice = createSlice({
  name: "orderMediaDocuments",
  initialState,
  reducers: {}, // No synchronous reducers yet

  extraReducers: (builder) => {
    builder
      // Fetch order media documents by order ID
      .addCase(fetchOrderMediaDocuments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrderMediaDocuments.fulfilled, (state, action) => {
        // Store the data property since API returns {success: true, data: {...}}
        // Handle both possible response structures
        state.documents = action.payload.data || action.payload;
        state.loading = false;
      })
      .addCase(fetchOrderMediaDocuments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch order media documents: ${action.payload}`);
      })

      // Upload order media documents
      .addCase(uploadOrderMediaDocuments.pending, (state) => {
        state.uploadLoading = true;
        state.uploadError = null;
      })
      .addCase(uploadOrderMediaDocuments.fulfilled, (state, action) => {
        // Add the newly uploaded documents to the existing documents array
        if (state.documents && state.documents.documents && action.payload && action.payload.documents) {
          if (Array.isArray(action.payload.documents)) {
            state.documents.documents.push(...action.payload.documents);
          } else {
            state.documents.documents.push(action.payload.documents);
          }
        }
        state.uploadLoading = false;
        toast.success(action.payload?.message || "Documents uploaded successfully");
      })
      .addCase(uploadOrderMediaDocuments.rejected, (state, action) => {
        state.uploadLoading = false;
        state.uploadError = action.payload;
        toast.error(`Failed to upload documents: ${action.payload}`);
      })

      // Delete order media documents
      .addCase(deleteOrderMediaDocuments.pending, (state) => {
        state.deleteLoading = true;
        state.deleteError = null;
      })
      .addCase(deleteOrderMediaDocuments.fulfilled, (state, action) => {
        // Remove the deleted document from the documents array
        if (state.documents && state.documents.documents) {
          state.documents.documents = state.documents.documents.filter(
            (doc) => doc.id !== action.payload
          );
        }
        state.deleteLoading = false;
        toast.success("Document deleted successfully");
      })
      .addCase(deleteOrderMediaDocuments.rejected, (state, action) => {
        state.deleteLoading = false;
        state.deleteError = action.payload;
        toast.error(`Failed to delete document: ${action.payload}`);
      });
  },
});

export default orderMediaDocumentsSlice.reducer;
