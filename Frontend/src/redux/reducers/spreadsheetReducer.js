import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as spreadsheetApi from "../../api/spreadsheet.api";
import { toast } from "react-toastify";

// Fetch all spreadsheets
export const fetchSpreadsheets = createAsyncThunk(
  "spreadsheets/fetchAll",
  async () => {
    const res = await spreadsheetApi.getSpreadsheets();
    return res.data.data;
  }
);

// Fetch spreadsheet by ID
export const fetchSpreadsheetById = createAsyncThunk(
  "spreadsheets/fetchById",
  async (id, { rejectWithValue }) => {
    try {
      const res = await spreadsheetApi.getSpreadsheetById(id);
      return res.data.data;
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.message || err.message,
        status: err.response?.status,
      });
    }
  }
);

// Create new spreadsheet
export const addSpreadsheet = createAsyncThunk(
  "spreadsheets/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await spreadsheetApi.createSpreadsheet(data);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Update spreadsheet metadata
export const editSpreadsheet = createAsyncThunk(
  "spreadsheets/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await spreadsheetApi.updateSpreadsheet(id, data);
      return res.data.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Soft delete spreadsheet
export const removeSpreadsheet = createAsyncThunk(
  "spreadsheets/delete",
  async (id, { rejectWithValue }) => {
    try {
      await spreadsheetApi.deleteSpreadsheet(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Save spreadsheet workbook snapshot
export const saveSpreadsheetById = createAsyncThunk(
  "spreadsheets/saveById",
  async ({ id, workbook_data }, { rejectWithValue }) => {
    try {
      const res = await spreadsheetApi.saveSpreadsheet(id, { workbook_data });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const spreadsheetSlice = createSlice({
  name: "spreadsheets",
  initialState: {
    list: [], // All spreadsheets
    selected: null, // Selected spreadsheet for editor view
    loading: false, // Loading state for list fetch
    detailLoading: false, // Loading state for single spreadsheet fetch
    saving: false, // Loading state for create
    editorSaving: false, // Loading state for manual save from editor
    error: null, // List fetch error message
    detailError: null, // Detail fetch error
  },
  reducers: {
    clearSelectedSpreadsheet: (state) => {
      state.selected = null;
      state.detailError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchSpreadsheets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSpreadsheets.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchSpreadsheets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch spreadsheets: ${action.error.message}`);
      })

      // Fetch by ID
      .addCase(fetchSpreadsheetById.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
        state.selected = null;
      })
      .addCase(fetchSpreadsheetById.fulfilled, (state, action) => {
        state.selected = action.payload;
        state.detailLoading = false;
      })
      .addCase(fetchSpreadsheetById.rejected, (state, action) => {
        state.detailLoading = false;
        state.detailError = action.payload;
        state.selected = null;

        if (action.payload?.status !== 404) {
          toast.error(
            `Failed to load spreadsheet: ${action.payload?.message || "Unknown error"}`
          );
        }
      })

      // Create
      .addCase(addSpreadsheet.pending, (state) => {
        state.saving = true;
      })
      .addCase(addSpreadsheet.fulfilled, (state) => {
        state.saving = false;
        toast.success("Spreadsheet created successfully");
      })
      .addCase(addSpreadsheet.rejected, (state, action) => {
        state.saving = false;
        toast.error(`Failed to create spreadsheet: ${action.payload}`);
      })

      // Update metadata
      .addCase(editSpreadsheet.pending, (state) => {
        state.saving = true;
      })
      .addCase(editSpreadsheet.fulfilled, (state, action) => {
        state.saving = false;
        const index = state.list.findIndex((item) => item.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Spreadsheet updated successfully");
      })
      .addCase(editSpreadsheet.rejected, (state, action) => {
        state.saving = false;
        toast.error(`Failed to update spreadsheet: ${action.payload}`);
      })

      // Soft delete
      .addCase(removeSpreadsheet.fulfilled, (state, action) => {
        state.list = state.list.filter((item) => item.id !== action.payload);
        toast.success("Spreadsheet deleted successfully");
      })
      .addCase(removeSpreadsheet.rejected, (state, action) => {
        toast.error(`Failed to delete spreadsheet: ${action.payload}`);
      })

      // Save workbook snapshot
      .addCase(saveSpreadsheetById.pending, (state) => {
        state.editorSaving = true;
      })
      .addCase(saveSpreadsheetById.fulfilled, (state) => {
        state.editorSaving = false;
      })
      .addCase(saveSpreadsheetById.rejected, (state) => {
        state.editorSaving = false;
      });
  },
});

export const { clearSelectedSpreadsheet } = spreadsheetSlice.actions;
export default spreadsheetSlice.reducer;
