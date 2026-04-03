import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as categoryApi from "../../api/category.api"; // API functions for category
import { toast } from "react-toastify";

// Async action: Fetch all categories
export const fetchCategories = createAsyncThunk(
  "categories/fetchAll",
  async () => {
    const res = await categoryApi.getCategories();
    return res.data;
  }
);

// Async action: Fetch a single category by ID
/* export const fetchCategoryById = createAsyncThunk("categories/fetchById", async (id, { rejectWithValue }) => {
  try {
    const res = await categoryApi.getCategoryById(id);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
}); */
export const fetchCategoryById = createAsyncThunk(
  "categories/fetchById",
  async (id) => {
    const res = await categoryApi.getCategoryById(id);
    return res.data;
  }
);

// Async action: Create a new category
export const addCategory = createAsyncThunk("categories/add", async (data, { rejectWithValue }) => {
  try {
    const res = await categoryApi.createCategory(data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Async action: Update an existing category
export const editCategory = createAsyncThunk("categories/edit", async ({ id, data }, { rejectWithValue }) => {
  try {
    const res = await categoryApi.updateCategory(id, data);
    return res.data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Async action: Soft delete a category
export const removeCategory = createAsyncThunk("categories/delete", async (id, { rejectWithValue }) => {
  try {
    await categoryApi.deleteCategory(id);
    return id; // Return ID to remove it from local state
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || err.message);
  }
});

// Initial state
const initialState = {
  list: [],        // All categories
  selected: null,  // Selected category (for view/edit)
  loading: false,  // Loading state
  error: null,     // Error message
};

// Category slice
const categorySlice = createSlice({
  name: "categories",
  initialState,
  reducers: {}, // No synchronous reducers yet

  extraReducers: (builder) => {
    builder
      // Fetch all categories
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Failed to fetch categories: ${action.payload}`);
      })

      // Fetch category by ID
      .addCase(fetchCategoryById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add new category
      .addCase(addCategory.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Category added successfully");
      })
      .addCase(addCategory.rejected, (state, action) => {
        toast.error(`Failed to add category: ${action.payload}`);
      })

      // Edit existing category
      .addCase(editCategory.fulfilled, (state, action) => {
        const index = state.list.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Category updated successfully");
      })
      .addCase(editCategory.rejected, (state, action) => {
        toast.error(`Failed to update category: ${action.payload}`);
      })

      // Delete category
      .addCase(removeCategory.fulfilled, (state, action) => {
        state.list = state.list.filter((c) => c.id !== action.payload);
        toast.success("Category deleted successfully");
      })
      .addCase(removeCategory.rejected, (state, action) => {
        toast.error(`Failed to delete category: ${action.payload}`);
      });
  },
});

export default categorySlice.reducer;
