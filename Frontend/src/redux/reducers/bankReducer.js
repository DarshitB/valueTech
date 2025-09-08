import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as bankApi from "../../api/bank.api"; // Update path as per your structure
import { toast } from "react-toastify";

// sync action to fetch all banks
export const fetchBanks = createAsyncThunk("banks/fetchAll", async () => {
  const res = await bankApi.getBanks();
  return res.data;
});

// Fetch single bank by ID
export const fetchBankById = createAsyncThunk("banks/fetchById", async (id) => {
  const res = await bankApi.getBankById(id);
  return res.data;
});

// Add new bank
export const addBank = createAsyncThunk(
  "banks/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await bankApi.createBank(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit existing bank
export const editBank = createAsyncThunk(
  "banks/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await bankApi.updateBank(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete a bank
export const removeBank = createAsyncThunk(
  "banks/delete",
  async (id, { rejectWithValue }) => {
    try {
      await bankApi.deleteBank(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Slice
const bankSlice = createSlice({
  name: "banks",
  initialState: {
    list: [], // all banks
    loading: false, // loading flag
    error: null, // error message
    selected: null, // single state object (for edit)
  },
  reducers: {
    // Clears the selected state (e.g., when switching from edit to add)
    clearSelectedBank: (state) => {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchBanks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBanks.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchBanks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch banks: ${action.error.message}`);
      })

      // Fetch by ID
      .addCase(fetchBankById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add new
      .addCase(addBank.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Bank added successfully");
      })
      .addCase(addBank.rejected, (state, action) => {
        toast.error(`Failed to add bank: ${action.payload}`);
      })

      // Update
      .addCase(editBank.fulfilled, (state, action) => {
        const index = state.list.findIndex((b) => b.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Bank updated successfully");
      })
      .addCase(editBank.rejected, (state, action) => {
        toast.error(`Failed to update bank: ${action.payload}`);
      })

      // Delete
      .addCase(removeBank.fulfilled, (state, action) => {
        state.list = state.list.filter((b) => b.id !== action.payload);
        toast.success("Bank deleted successfully");
      })
      .addCase(removeBank.rejected, (state, action) => {
        toast.error(`Failed to delete bank: ${action.payload}`);
      });
  },
});

export const { clearSelectedBank } = bankSlice.actions;
export default bankSlice.reducer;
