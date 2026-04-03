import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as subcategoryApi from "../../api/subcategory.api";
import { toast } from "react-toastify";

// Async: Fetch all subcategories
export const fetchSubCategories = createAsyncThunk(
  "subcategories/fetchAll",
  async () => {
    const res = await subcategoryApi.getSubCategories();
    return res.data;
  }
);

// Async: Fetch subcategory by ID
export const fetchSubCategoryById = createAsyncThunk(
  "subcategories/fetchById",
  async (id) => {
    const res = await subcategoryApi.getSubCategoryById(id);
    return res.data;
  }
);

// Async: Add new subcategory
export const addSubCategory = createAsyncThunk(
  "subcategories/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await subcategoryApi.addSubCategory(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async: Edit subcategory
export const editSubCategory = createAsyncThunk(
  "subcategories/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await subcategoryApi.editSubCategory(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async: Delete subcategory
export const removeSubCategory = createAsyncThunk(
  "subcategories/delete",
  async (id, { rejectWithValue }) => {
    try {
      await subcategoryApi.removeSubCategory(id);
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

// Subcategory slice
const subcategorySlice = createSlice({
  name: "subcategories",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchSubCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSubCategories.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchSubCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch subcategories: ${action.payload}`);
      })

      // Fetch one
      .addCase(fetchSubCategoryById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add
      .addCase(addSubCategory.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Asset Category added successfully");
      })
      .addCase(addSubCategory.rejected, (state, action) => {
        toast.error(`Failed to add subcategory: ${action.payload}`);
      })

      // Edit
      .addCase(editSubCategory.fulfilled, (state, action) => {
        const index = state.list.findIndex((s) => s.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Asset Category updated successfully");
      })
      .addCase(editSubCategory.rejected, (state, action) => {
        toast.error(`Failed to update subcategory: ${action.payload}`);
      })

      // Delete
      .addCase(removeSubCategory.fulfilled, (state, action) => {
        state.list = state.list.filter((s) => s.id !== action.payload);
        toast.success("Asset Category deleted successfully");
      })
      .addCase(removeSubCategory.rejected, (state, action) => {
        toast.error(`Failed to delete subcategory: ${action.payload}`);
      });
  },
});

export default subcategorySlice.reducer;
