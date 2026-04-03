import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as branchApi from "../../api/bankBranch.api"; // Update path as per your structure
import { toast } from "react-toastify";

// sync action to fetch all bank branches
export const fetchBranches = createAsyncThunk("branches/fetchAll", async () => {
  const res = await branchApi.getBranches();
  return res.data;
});

// Fetch single bank branch by ID
export const fetchBranchById = createAsyncThunk(
  "branches/fetchById",
  async (id) => {
    const res = await branchApi.getBranchById(id);
    return res.data;
  }
);

// Add new bank branch
export const addBranch = createAsyncThunk(
  "branches/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await branchApi.createBranch(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit existing bank branch
export const editBranch = createAsyncThunk(
  "branches/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await branchApi.updateBranch(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete a bank branch
export const removeBranch = createAsyncThunk(
  "branches/delete",
  async (id, { rejectWithValue }) => {
    try {
      await branchApi.deleteBranch(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Slice
const branchSlice = createSlice({
  name: "branches",
  initialState: {
    list: [], // all branches
    loading: false, // loading flag
    error: null, // error message
    selected: null, // single state object (for edit)
  },
  reducers: {
    clearSelectedBranch: (state) => {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBranches.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchBranches.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch branches: ${action.error.message}`);
      })

      .addCase(fetchBranchById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      .addCase(addBranch.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Branch added successfully");
      })
      .addCase(addBranch.rejected, (state, action) => {
        toast.error(`Failed to add branch: ${action.payload}`);
      })

      .addCase(editBranch.fulfilled, (state, action) => {
        const index = state.list.findIndex((b) => b.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Branch updated successfully");
      })
      .addCase(editBranch.rejected, (state, action) => {
        toast.error(`Failed to update branch: ${action.payload}`);
      })

      .addCase(removeBranch.fulfilled, (state, action) => {
        state.list = state.list.filter((b) => b.id !== action.payload);
        toast.success("Branch deleted successfully");
      })
      .addCase(removeBranch.rejected, (state, action) => {
        toast.error(`Failed to delete branch: ${action.payload}`);
      });
  },
});

export const { clearSelectedBranch } = branchSlice.actions;
export default branchSlice.reducer;
