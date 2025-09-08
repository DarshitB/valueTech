import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as childCategoryApi from "../../api/childCategory.api";
import { toast } from "react-toastify";

// Async: Fetch all child categories
export const fetchChildCategories = createAsyncThunk(
  "childcategories/fetchAll",
  async (subCategoryId, { rejectWithValue }) => {
    try {
      const res = await childCategoryApi.getChildCategories(subCategoryId);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async: Fetch child category by ID
export const fetchChildCategoryById = createAsyncThunk(
  "childcategories/fetchById",
  async (id) => {
    const res = await childCategoryApi.getChildCategoryById(id);
    return res.data;
  }
);

// Async: Add new child category
export const addChildCategory = createAsyncThunk(
  "childcategories/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await childCategoryApi.createChildCategory(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async: Edit child category
export const editChildCategory = createAsyncThunk(
  "childcategories/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await childCategoryApi.updateChildCategory(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async: Delete child category
export const removeChildCategory = createAsyncThunk(
  "childcategories/delete",
  async (id, { rejectWithValue }) => {
    try {
      await childCategoryApi.deleteChildCategory(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  list: [],
  selected: null,
  loading: false,
  error: null,
};

// Child category slice
const childCategorySlice = createSlice({
  name: "childcategories",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchChildCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChildCategories.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchChildCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch Subcategory: ${action.payload}`);
      })

      // Fetch one
      .addCase(fetchChildCategoryById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add
      .addCase(addChildCategory.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Subcategory added successfully");
      })
      .addCase(addChildCategory.rejected, (state, action) => {
        toast.error(`Failed to add Subcategory: ${action.payload}`);
      })

      // Edit
      .addCase(editChildCategory.fulfilled, (state, action) => {
        const index = state.list.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Subcategory updated successfully");
      })
      .addCase(editChildCategory.rejected, (state, action) => {
        toast.error(`Failed to update Subcategory: ${action.payload}`);
      })

      // Delete
      .addCase(removeChildCategory.fulfilled, (state, action) => {
        state.list = state.list.filter((c) => c.id !== action.payload);
        toast.success("Subcategory deleted successfully");
      })
      .addCase(removeChildCategory.rejected, (state, action) => {
        toast.error(`Failed to delete Subcategory: ${action.payload}`);
      });
  },
});

export default childCategorySlice.reducer;
