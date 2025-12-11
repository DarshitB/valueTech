import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as orderMediaDocumentsApi from "../../api/orderMediaDocuments.api"; // API functions for order media documents
import * as orderReportsCollagesApi from "../../api/orderReportsCollages.api"; // API functions for order reports/collages upload
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

// Async action: Fetch approved order media documents by order ID
export const fetchApprovedOrderMediaDocuments = createAsyncThunk(
  "orderMediaDocuments/fetchApproved",
  async (orderId, { rejectWithValue }) => {
    try {
      const res = await orderMediaDocumentsApi.getApprovedOrderMediaDocuments(orderId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Approve order media documents
export const approveOrderMediaDocuments = createAsyncThunk(
  "orderMediaDocuments/approve",
  async ({ orderId, documentIds }, { rejectWithValue }) => {
    try {
      const payload = { document_ids: documentIds };
      const res = await orderMediaDocumentsApi.approveOrderMediaDocuments(orderId, payload);
      return { ...res.data, approvedIds: documentIds };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Upload single report or collage
export const uploadOrderReportCollage = createAsyncThunk(
  "orderMediaDocuments/uploadReportCollage",
  async (formData, { rejectWithValue }) => {
    try {
      const res = await orderReportsCollagesApi.uploadOrderReportCollage(formData);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Upload multiple reports or collages
export const uploadMultipleOrderReportsCollages = createAsyncThunk(
  "orderMediaDocuments/uploadMultipleReportsCollages",
  async (formData, { rejectWithValue }) => {
    try {
      const res = await orderReportsCollagesApi.uploadMultipleOrderReportsCollages(formData);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  documents: null,              // Order media documents data
  loading: false,               // Loading state
  error: null,                  // Error message
  uploadLoading: false,         // Upload loading state
  uploadError: null,            // Upload error state
  deleteLoading: false,         // Delete loading state
  deleteError: null,            // Delete error state
  approvedDocuments: null,      // Approved documents data
  approvedLoading: false,       // Approved documents loading state
  approvedError: null,          // Approved documents error state
  approveLoading: false,        // Approve documents loading state
  approveError: null,           // Approve documents error state
  reportCollageUploadLoading: false, // Report/Collage upload loading state
  reportCollageUploadError: null,    // Report/Collage upload error state
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
      })

      // Fetch approved order media documents by order ID
      .addCase(fetchApprovedOrderMediaDocuments.pending, (state) => {
        state.approvedLoading = true;
        state.approvedError = null;
      })
      .addCase(fetchApprovedOrderMediaDocuments.fulfilled, (state, action) => {
        // Store the data property since API returns {success: true, data: [...]}
        state.approvedDocuments = action.payload.data || action.payload;
        state.approvedLoading = false;
      })
      .addCase(fetchApprovedOrderMediaDocuments.rejected, (state, action) => {
        state.approvedLoading = false;
        state.approvedError = action.payload;
        toast.error(`Failed to fetch approved documents: ${action.payload}`);
      })

      // Approve order media documents
      .addCase(approveOrderMediaDocuments.pending, (state) => {
        state.approveLoading = true;
        state.approveError = null;
      })
      .addCase(approveOrderMediaDocuments.fulfilled, (state, action) => {
        // Update the documents' approval status if we have the documents in state
        if (state.documents && state.documents.documents && action.payload.approvedIds) {
          state.documents.documents = state.documents.documents.map((doc) => {
            if (action.payload.approvedIds.includes(doc.id)) {
              return { ...doc, status: "approved" };
            }
            return doc;
          });
        }
        state.approveLoading = false;
        toast.success(action.payload?.message || "Documents approved successfully");
      })
      .addCase(approveOrderMediaDocuments.rejected, (state, action) => {
        state.approveLoading = false;
        state.approveError = action.payload;
        toast.error(`Failed to approve documents: ${action.payload}`);
      })

      // Upload single report or collage
      .addCase(uploadOrderReportCollage.pending, (state) => {
        state.reportCollageUploadLoading = true;
        state.reportCollageUploadError = null;
      })
      .addCase(uploadOrderReportCollage.fulfilled, (state, action) => {
        // Add the newly uploaded document to the existing documents array
        if (state.documents && state.documents.documents && action.payload && action.payload.data) {
          const newDoc = action.payload.data;
          if (Array.isArray(state.documents.documents)) {
            state.documents.documents.push(newDoc);
          } else {
            state.documents.documents = [newDoc];
          }
        }
        state.reportCollageUploadLoading = false;
        toast.success(action.payload?.message || "File uploaded successfully");
      })
      .addCase(uploadOrderReportCollage.rejected, (state, action) => {
        state.reportCollageUploadLoading = false;
        state.reportCollageUploadError = action.payload;
        toast.error(`Failed to upload file: ${action.payload}`);
      })

      // Upload multiple reports or collages
      .addCase(uploadMultipleOrderReportsCollages.pending, (state) => {
        state.reportCollageUploadLoading = true;
        state.reportCollageUploadError = null;
      })
      .addCase(uploadMultipleOrderReportsCollages.fulfilled, (state, action) => {
        // Add the newly uploaded documents to the existing documents array
        if (state.documents && state.documents.documents && action.payload && action.payload.data && action.payload.data.documents) {
          const newDocs = action.payload.data.documents;
          if (Array.isArray(state.documents.documents)) {
            state.documents.documents.push(...newDocs);
          } else {
            state.documents.documents = newDocs;
          }
        }
        state.reportCollageUploadLoading = false;
        toast.success(action.payload?.message || "Files uploaded successfully");
      })
      .addCase(uploadMultipleOrderReportsCollages.rejected, (state, action) => {
        state.reportCollageUploadLoading = false;
        state.reportCollageUploadError = action.payload;
        toast.error(`Failed to upload files: ${action.payload}`);
      });
  },
});

export default orderMediaDocumentsSlice.reducer;
