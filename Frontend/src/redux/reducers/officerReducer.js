import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as officerApi from "../../api/officers.api";
import { toast } from "react-toastify";

// Fetch all officers (optional bankId for order mail modal — same-bank officers)
export const fetchOfficers = createAsyncThunk(
  "officers/fetchAll",
  async (params = {}) => {
    const res = await officerApi.getOfficers(params);
    return res.data;
  }
);

// Fetch officer by ID
export const fetchOfficerById = createAsyncThunk("officers/fetchById", async (id) => {
  const res = await officerApi.getOfficerById(id);
  return res.data;
});

// Add new officer
export const addOfficer = createAsyncThunk(
  "officers/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await officerApi.createOfficer(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit officer
export const editOfficer = createAsyncThunk(
  "officers/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await officerApi.updateOfficer(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete officer
export const removeOfficer = createAsyncThunk(
  "officers/delete",
  async (id, { rejectWithValue }) => {
    try {
      await officerApi.deleteOfficer(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  list: [],
  loading: false,
  error: null,
  selected: null,
};

// Slice
const officerSlice = createSlice({
  name: "officers",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all officers
      .addCase(fetchOfficers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOfficers.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchOfficers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch officers: ${action.error.message}`);
      })

      // Fetch officer by ID
      .addCase(fetchOfficerById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add officer
      .addCase(addOfficer.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Officer added successfully");
      })
      .addCase(addOfficer.rejected, (state, action) => {
        toast.error(`Failed to add officer: ${action.payload}`);
      })

      // Edit officer
      .addCase(editOfficer.fulfilled, (state, action) => {
        const index = state.list.findIndex((o) => o.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Officer updated successfully");
      })
      .addCase(editOfficer.rejected, (state, action) => {
        toast.error(`Failed to update officer: ${action.payload}`);
      })

      // Delete officer
      .addCase(removeOfficer.fulfilled, (state, action) => {
        state.list = state.list.filter((o) => o.id !== action.payload);
        toast.success("Officer deleted successfully");
      })
      .addCase(removeOfficer.rejected, (state, action) => {
        toast.error(`Failed to delete officer: ${action.payload}`);
      });
  },
});

export default officerSlice.reducer;
