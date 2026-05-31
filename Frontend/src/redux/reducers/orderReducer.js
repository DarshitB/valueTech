import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as orderApi from "../../api/order.api"; // API functions for orders
import * as orderMediaApi from "../../api/orderMedia.api"; // API functions for order media
import { toast } from "react-toastify";

// Async action: Fetch all orders
export const fetchOrders = createAsyncThunk(
  "orders/fetchAll",
  async () => {
    const res = await orderApi.getOrders();
    return res.data;
  }
);

// Async action: Fetch orders with WO status (status 13 and 14)
export const fetchOrdersWithWoStatus = createAsyncThunk(
  "orders/fetchWoStatus",
  async (params, { rejectWithValue }) => {
    try {
      const res = await orderApi.getOrdersWithWoStatus(params);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Fetch finalized orders by child category ID
export const fetchFinalizedOrdersByChildCategory = createAsyncThunk(
  "orders/fetchFinalizedByChildCategory",
  async (childCategoryId, { rejectWithValue }) => {
    try {
      const res = await orderApi.getFinalizedOrdersByChildCategory(childCategoryId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Fetch a single order by ID
export const fetchOrderById = createAsyncThunk(
  "orders/fetchById",
  async (id) => {
    const res = await orderApi.getOrderById(id);
    return res.data;
  }
);

// Async action: Fetch order by order number (any status)
export const fetchOrderByOrderNumber = createAsyncThunk(
  "orders/fetchByOrderNumber",
  async (orderNumber, { rejectWithValue }) => {
    try {
      const res = await orderApi.getOrderByOrderNumber(orderNumber);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Create a new order
export const addOrder = createAsyncThunk("orders/add", async (data, { rejectWithValue }) => {
  try {
    const res = await orderApi.createOrder(data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Async action: Update an existing order
export const editOrder = createAsyncThunk("orders/edit", async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await orderApi.updateOrder(id, data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Async action: Delete an order
export const removeOrder = createAsyncThunk("orders/delete", async (id, { rejectWithValue }) => {
  try {
    await orderApi.deleteOrder(id);
    return id; // Return ID to remove it from local state
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Async action: Fetch all comments for an order
export const fetchComments = createAsyncThunk(
  "orders/fetchComments",
  async (id) => {
    const res = await orderApi.getComments(id);
    return res.data;
  }
);

// Async action: Create a new comment
export const addComment = createAsyncThunk("orders/addComment", async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await orderApi.addComment(id, data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Async action: Fetch order media
export const fetchOrderMedia = createAsyncThunk(
  "orders/fetchMedia",
  async (orderId) => {
    const res = await orderMediaApi.getOrderMedia(orderId);
    return res.data;
  }
);

// Async action: Fetch public order media (no authentication required, returns only approved media)
export const fetchPublicOrderMedia = createAsyncThunk(
  "orders/fetchPublicMedia",
  async (payload, { rejectWithValue }) => {
    try {
      const token =
        payload && typeof payload === "object" ? payload.token : null;
      const orderId =
        payload && typeof payload === "object" ? payload.orderId : payload;
      const res = token
        ? await orderMediaApi.getPublicOrderMediaByToken(token)
        : await orderMediaApi.getPublicOrderMedia(orderId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Update order media status
export const updateOrderMediaStatus = createAsyncThunk(
  "orders/updateMediaStatus",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await orderMediaApi.updateOrderMediaStatus(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Upload ZIP file containing images/videos
export const uploadZipFile = createAsyncThunk(
  "orders/uploadZip",
  async (formData, { rejectWithValue }) => {
    try {
      const res = await orderMediaApi.uploadZipFile(formData);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Soft delete order media by IDs
export const deleteOrderMedia = createAsyncThunk(
  "orders/deleteMedia",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await orderMediaApi.deleteOrderMedia(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Update payment status/details for an order
export const updatePaymentStatus = createAsyncThunk(
  "orders/updatePaymentStatus",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await orderApi.updatePaymentStatus(id, data);
      // Some APIs return { success, message, data }; normalize to res.data
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Update order attributes
export const updateOrderAttributes = createAsyncThunk(
  "orders/updateAttributes",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await orderApi.updateOrderAttributes(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Update order status to 9
export const updateOrderToStatus9 = createAsyncThunk(
  "orders/updateToStatus9",
  async (id, { rejectWithValue }) => {
    try {
      const res = await orderApi.updateOrderToStatus9(id);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Update order status directly (custom status + note)
export const updateOrderStatusDirect = createAsyncThunk(
  "orders/updateStatusDirect",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await orderApi.updateOrderStatusDirect(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Update order status after under review
export const updateStatusAfterUnderReview = createAsyncThunk(
  "orders/updateStatusAfterUnderReview",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await orderApi.updateStatusAfterUnderReview(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);


// Initial state
const initialState = {
  list: [],        // All orders
  selected: null,  // Selected order (for view/edit)
  loading: false,  // Loading state
  error: null,     // Error message
  media: null,     // Order media data
  mediaLoading: false, // Media loading state
  mediaError: null,    // Media error state
  zipUploading: false, // ZIP upload loading state
  zipUploadError: null, // ZIP upload error state
  zipUploadProgress: 0, // ZIP upload progress
  paymentUpdating: false, // Payment update loading
  paymentError: null,     // Payment update error
  attributesUpdating: false, // Attributes update loading
  attributesError: null,     // Attributes update error
  finalizedByChildCategory: null, // Finalized orders API response payload
  finalizedByChildCategoryLoading: false,
  finalizedByChildCategoryError: null,
  woStatusPagination: null,
  woStatusFilterOptions: null,
  orderByNumber: null, // Order resolved by order_number (summarized row fetch, etc.)
  orderByNumberLoading: false,
  orderByNumberError: null,
};

// Order slice
const orderSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    clearOrderByNumber: (state) => {
      state.orderByNumber = null;
      state.orderByNumberError = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // Fetch all orders
      .addCase(fetchOrders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch orders: ${action.payload}`);
      })

      // Fetch finalized orders
      .addCase(fetchOrdersWithWoStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrdersWithWoStatus.fulfilled, (state, action) => {
        const payload = action.payload;
        if (Array.isArray(payload)) {
          state.list = payload;
          state.woStatusPagination = null;
        } else if (payload && Array.isArray(payload.data)) {
          state.list = payload.data;
          state.woStatusPagination = payload.pagination || null;
          if (payload.filterOptions) {
            state.woStatusFilterOptions = payload.filterOptions;
          }
        } else {
          state.list = [];
          state.woStatusPagination = null;
        }
        state.loading = false;
      })
      .addCase(fetchOrdersWithWoStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch WO status orders: ${action.payload}`);
      })

      // Fetch finalized orders by child category ID
      .addCase(fetchFinalizedOrdersByChildCategory.pending, (state) => {
        state.finalizedByChildCategoryLoading = true;
        state.finalizedByChildCategoryError = null;
      })
      .addCase(fetchFinalizedOrdersByChildCategory.fulfilled, (state, action) => {
        state.finalizedByChildCategoryLoading = false;
        state.finalizedByChildCategory = action.payload?.data || null;
      })
      .addCase(fetchFinalizedOrdersByChildCategory.rejected, (state, action) => {
        state.finalizedByChildCategoryLoading = false;
        state.finalizedByChildCategoryError = action.payload;
        toast.error(`Failed to fetch finalized orders: ${action.payload}`);
      })

      // Fetch order by ID
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        toast.error(`Failed to fetch order: ${action.payload}`);
      })

      // Fetch order by order number
      .addCase(fetchOrderByOrderNumber.pending, (state) => {
        state.orderByNumberLoading = true;
        state.orderByNumberError = null;
      })
      .addCase(fetchOrderByOrderNumber.fulfilled, (state, action) => {
        state.orderByNumberLoading = false;
        state.orderByNumber = action.payload;
      })
      .addCase(fetchOrderByOrderNumber.rejected, (state, action) => {
        state.orderByNumberLoading = false;
        state.orderByNumberError = action.payload;
      })

      // Add new order (API may return single order object or array of orders when number_of_order_duplication > 1)
      .addCase(addOrder.fulfilled, (state, action) => {
        const orders = Array.isArray(action.payload) ? action.payload : [action.payload];
        state.list.push(...orders);
        if (orders.length > 1) {
          toast.success(`${orders.length} orders added successfully`);
        } else {
          toast.success(`Order added successfully: Order ID ${orders[0].order_number}`);
        }
      })
      .addCase(addOrder.rejected, (state, action) => {
        toast.error(`Failed to add order: ${action.payload}`);
      })

      // Edit existing order
      .addCase(editOrder.fulfilled, (state, action) => {
        const index = state.list.findIndex((o) => o.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Order updated successfully");
      })
      .addCase(editOrder.rejected, (state, action) => {
        toast.error(`Failed to update order: ${action.payload}`);
      })

      // Delete order
      .addCase(removeOrder.fulfilled, (state, action) => {
        state.list = state.list.filter((o) => o.id !== action.payload);
        toast.success("Order deleted successfully");
      })
      .addCase(removeOrder.rejected, (state, action) => {
        toast.error(`Failed to delete order: ${action.payload}`);
      })

      // Fetch all comments for an order
      .addCase(fetchComments.fulfilled, (state, action) => {
        state.comments = action.payload;
      })
      .addCase(fetchComments.rejected, (state, action) => {
        toast.error(`Failed to fetch comments: ${action.payload}`);
      })

      // Add a new comment
      .addCase(addComment.fulfilled, (state, action) => {
        state.comments.push(action.payload);
        toast.success("Comment added successfully");
      })
      .addCase(addComment.rejected, (state, action) => {
        toast.error(`Failed to add comment: ${action.payload}`);
      })

      // Fetch order media
      .addCase(fetchOrderMedia.pending, (state) => {
        state.mediaLoading = true;
        state.mediaError = null;
      })
      .addCase(fetchOrderMedia.fulfilled, (state, action) => {
        // Store the data property since API returns {success: true, data: {...}}
        state.media = action.payload.data;
        state.mediaLoading = false;
      })
      .addCase(fetchOrderMedia.rejected, (state, action) => {
        state.mediaLoading = false;
        state.mediaError = action.payload;
        toast.error(`Failed to fetch order media: ${action.payload}`);
      })

      // Fetch public order media (no authentication required)
      .addCase(fetchPublicOrderMedia.pending, (state) => {
        state.mediaLoading = true;
        state.mediaError = null;
      })
      .addCase(fetchPublicOrderMedia.fulfilled, (state, action) => {
        // Store the data property since API returns {success: true, data: {...}}
        // Backend already returns only approved media, so no filtering needed
        state.media = action.payload.data;
        state.mediaLoading = false;
      })
      .addCase(fetchPublicOrderMedia.rejected, (state, action) => {
        state.mediaLoading = false;
        state.mediaError = action.payload;
        // Don't show toast error for public access to avoid disrupting user experience
      })

      // Update order media status
      .addCase(updateOrderMediaStatus.fulfilled, (state, action) => {
        // Update the media status in the current media state
        if (state.media && state.media.media && action.payload && action.payload.updated_records) {
          const updatedRecords = action.payload.updated_records;
          if (Array.isArray(updatedRecords)) {
            updatedRecords.forEach((record) => {
              if (record && Array.isArray(record) && record[0]) {
                const mediaItem = state.media.media.find(item => item.id === record[0].id);
                if (mediaItem) {
                  mediaItem.status = record[0].status;
                  mediaItem.updated_at = record[0].updated_at;
                  mediaItem.updated_by = record[0].updated_by;
                }
              }
            });
          }
        }
        toast.success(action.payload?.message || "Media status updated successfully");
      })
      .addCase(updateOrderMediaStatus.rejected, (state, action) => {
        toast.error(`Failed to update media status: ${action.payload}`);
      })

      // Upload ZIP file
      .addCase(uploadZipFile.pending, (state) => {
        state.zipUploading = true;
        state.zipUploadError = null;
        state.zipUploadProgress = 0;
      })
      .addCase(uploadZipFile.fulfilled, (state, action) => {
        state.zipUploading = false;
        state.zipUploadProgress = 100;
        
        // Add the newly uploaded files to the existing media array
        if (state.media && state.media.media && action.payload && action.payload.data && action.payload.data.uploaded_files) {
          const uploadedFiles = action.payload.data.uploaded_files;
          if (Array.isArray(uploadedFiles)) {
            state.media.media.push(...uploadedFiles);
          }
        }
        
        toast.success(action.payload?.message || "ZIP file uploaded successfully");
      })
      .addCase(uploadZipFile.rejected, (state, action) => {
        state.zipUploading = false;
        state.zipUploadError = action.payload;
        state.zipUploadProgress = 0;
        toast.error(`Failed to upload ZIP file: ${action.payload}`);
      })

      // Delete order media (soft delete)
      .addCase(deleteOrderMedia.fulfilled, (state, action) => {
        const deletedIds = action.payload?.data?.deleted_ids;
        if (state.media?.media && Array.isArray(deletedIds) && deletedIds.length > 0) {
          state.media.media = state.media.media.filter((item) => !deletedIds.includes(item.id));
        }
        toast.success(action.payload?.message || "Media deleted successfully");
      })
      .addCase(deleteOrderMedia.rejected, (state, action) => {
        toast.error(`Failed to delete media: ${action.payload}`);
      })

      // Update payment status/details for an order
      .addCase(updatePaymentStatus.pending, (state) => {
        state.paymentUpdating = true;
        state.paymentError = null;
      })
      .addCase(updatePaymentStatus.fulfilled, (state, action) => {
        state.paymentUpdating = false;
        const updated = action.payload?.data || action.payload;
        if (updated && typeof updated === "object") {
          // Merge into selected order if it matches
          if (state.selected && state.selected.id === updated.id) {
            state.selected = { ...state.selected, ...updated };
          }
          // Merge into list if present
          const listIdx = state.list.findIndex((o) => o.id === updated.id);
          if (listIdx !== -1) {
            state.list[listIdx] = { ...state.list[listIdx], ...updated };
          }
        }
        toast.success(action.payload?.message || "Payment updated successfully");
      })
      .addCase(updatePaymentStatus.rejected, (state, action) => {
        state.paymentUpdating = false;
        state.paymentError = action.payload;
        toast.error(`Failed to update payment: ${action.payload}`);
      })

      // Update order attributes
      .addCase(updateOrderAttributes.pending, (state) => {
        state.attributesUpdating = true;
        state.attributesError = null;
      })
      .addCase(updateOrderAttributes.fulfilled, (state, action) => {
        state.attributesUpdating = false;
        
        // Handle the nested response structure: { success, message, data, updated_fields }
        const response = action.payload;
        const updated = response?.data;
        
        if (updated && typeof updated === "object") {
          // Merge into selected order if it matches
          if (state.selected && state.selected.id === updated.id) {
            state.selected = { ...state.selected, ...updated };
          }
          // Merge into list if present
          const listIdx = state.list.findIndex((o) => o.id === updated.id);
          if (listIdx !== -1) {
            state.list[listIdx] = { ...state.list[listIdx], ...updated };
          }
        }
        
        toast.success(response?.message || "Order attributes updated successfully");
      })
      .addCase(updateOrderAttributes.rejected, (state, action) => {
        state.attributesUpdating = false;
        state.attributesError = action.payload;
        toast.error(`Failed to update order attributes: ${action.payload}`);
      })

      // Update order status to 10
      .addCase(updateOrderToStatus9.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateOrderToStatus9.fulfilled, (state, action) => {
        state.loading = false;
        
        // Update the order status in both selected and list
        if (state.selected) {
          state.selected.current_status_id = 10;
        }
        
        const listIdx = state.list.findIndex((o) => o.id === action.meta.arg);
        if (listIdx !== -1) {
          state.list[listIdx].current_status_id = 10;
        }
        
        toast.success(action.payload?.message || "Order status updated to 10 successfully");
      })
      .addCase(updateOrderToStatus9.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to update order status: ${action.payload}`);
      })

      // Update order status directly
      .addCase(updateOrderStatusDirect.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateOrderStatusDirect.fulfilled, (state, action) => {
        state.loading = false;

        const response = action.payload;
        const orderId = response?.data?.order_id;
        const newStatusId = response?.data?.new_status_id;
        const statusName = response?.data?.status_name;

        if (state.selected && state.selected.id === orderId) {
          if (newStatusId !== undefined) state.selected.current_status_id = newStatusId;
          if (statusName !== undefined) state.selected.current_status_name = statusName;
        }

        const listIdx = state.list.findIndex((o) => o.id === orderId);
        if (listIdx !== -1) {
          if (newStatusId !== undefined) state.list[listIdx].current_status_id = newStatusId;
          if (statusName !== undefined) state.list[listIdx].current_status_name = statusName;
        }

        toast.success(response?.message || "Order status updated successfully");
      })
      .addCase(updateOrderStatusDirect.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload || "Failed to update order status");
      })

      // Update order status after under review
      .addCase(updateStatusAfterUnderReview.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateStatusAfterUnderReview.fulfilled, (state, action) => {
        state.loading = false;
        
        const response = action.payload;
        const orderId = response?.data?.order_id;
        const newStatusId = response?.data?.new_status_id;
        const statusName = response?.data?.status_name;

        // Update the order status in both selected and list
        if (state.selected && state.selected.id === orderId) {
          state.selected.current_status_id = newStatusId;
          state.selected.current_status_name = statusName;
        }
        
        const listIdx = state.list.findIndex((o) => o.id === orderId);
        if (listIdx !== -1) {
          state.list[listIdx].current_status_id = newStatusId;
          state.list[listIdx].current_status_name = statusName;
        }
        
        toast.success(response?.message || "Order status updated successfully");
      })
      .addCase(updateStatusAfterUnderReview.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to update order status: ${action.payload}`);
      });
  },
});

export const { clearOrderByNumber } = orderSlice.actions;
export default orderSlice.reducer;
