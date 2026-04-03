import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as stateApi from "../../api/state.api";
import { toast } from "react-toastify";

// sync action to fetch all states
export const fetchStates = createAsyncThunk("states/fetchAll", async () => {
  const res = await stateApi.getStates();
  return res.data;
});

// Fetch single state by ID (for edit view)
export const fetchStateById = createAsyncThunk("states/fetchById", async (id) => {
  const res = await stateApi.getStateById(id);
  return res.data;
});

// Add new state
export const addState = createAsyncThunk(
  "states/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await stateApi.createState(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit existing state
export const editState = createAsyncThunk(
  "states/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await stateApi.updateState(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete a state
export const removeState = createAsyncThunk(
  "states/delete",
  async (id, { rejectWithValue }) => {
    try {
      await stateApi.deleteState(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state for Redux store
const stateSlice = createSlice({
  name: "states",
  initialState: {
    list: [],       // all states
    loading: false, // loading flag
    error: null,    // error message
    selected: null, // single state object (for edit)
  },
  reducers: {
    // Clears the selected state (e.g., when switching from edit to add)
    clearSelected: (state) => {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchStates.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStates.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchStates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch states: ${action.error.message}`);
      })

      // Fetch by ID
      .addCase(fetchStateById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add new
      .addCase(addState.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("State added successfully");
      })
      .addCase(addState.rejected, (state, action) => {
        toast.error(`Failed to add state: ${action.payload}`);
      })

      // Update
      .addCase(editState.fulfilled, (state, action) => {
        const index = state.list.findIndex((s) => s.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("State updated successfully");
      })
      .addCase(editState.rejected, (state, action) => {
        toast.error(`Failed to update state: ${action.payload}`);
      })

      // Delete
      .addCase(removeState.fulfilled, (state, action) => {
        state.list = state.list.filter((s) => s.id !== action.payload);
        toast.success("State deleted successfully");
      })
      .addCase(removeState.rejected, (state, action) => {
        toast.error(`Failed to delete state: ${action.payload}`);
      });
  },
});

// Export the clear action
export const { clearSelected } = stateSlice.actions;

// Export the reducer to use in store
export default stateSlice.reducer;
