import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as fieldVerifierApi from "../../api/fieldVerifier.api"; // Adjust path as needed
import { toast } from "react-toastify";

// Fetch all field verifiers
export const fetchFieldVerifiers = createAsyncThunk(
  "fieldVerifiers/fetchAll",
  async () => {
    const res = await fieldVerifierApi.getFieldVerifiers();
    return res.data;
  }
);

// Fetch field verifier by ID
export const fetchFieldVerifierById = createAsyncThunk(
  "fieldVerifiers/fetchById",
  async (id) => {
    const res = await fieldVerifierApi.getFieldVerifierById(id);
    return res.data;
  }
);

// Check field verifier by mobile number
export const checkFieldVerifierByMobile = createAsyncThunk(
  "fieldVerifiers/checkMobile",
  async (mobile, { rejectWithValue }) => {
    try {
      const res = await fieldVerifierApi.getFieldVerifierByMobile(mobile);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Check field verifier by username
export const checkFieldVerifierByUsername = createAsyncThunk(
  "fieldVerifiers/checkUsername",
  async (username, { rejectWithValue }) => {
    try {
      const res = await fieldVerifierApi.getFieldVerifierByUsername(username);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Fetch all field verifier logins
export const fetchFieldVerifierLogins = createAsyncThunk(
  "fieldVerifiers/fetchLogins",
  async () => {
    const res = await fieldVerifierApi.getFieldVerifierLogins();
    return res.data;
  }
);

// Delete field verifier login by ID
export const removeFieldVerifierLogin = createAsyncThunk(
  "fieldVerifiers/deleteLogin",
  async (id, { rejectWithValue }) => {
    try {
      await fieldVerifierApi.deleteFieldVerifierLogins(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Add new field verifier
export const addFieldVerifier = createAsyncThunk(
  "fieldVerifiers/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await fieldVerifierApi.createFieldVerifier(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit field verifier
export const editFieldVerifier = createAsyncThunk(
  "fieldVerifiers/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await fieldVerifierApi.updateFieldVerifier(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Toggle is_active status
export const toggleFieldVerifierStatus = createAsyncThunk(
  "fieldVerifiers/toggleStatus",
  async (id, { rejectWithValue }) => {
    try {
      const res = await fieldVerifierApi.toggleFieldVerifierStatus(id);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete field verifier
export const removeFieldVerifier = createAsyncThunk(
  "fieldVerifiers/delete",
  async (id, { rejectWithValue }) => {
    try {
      await fieldVerifierApi.deleteFieldVerifier(id);
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
  logins: [],
  usernameCheckResult: null,
  mobileCheckResult: null,
};

// Slice
const fieldVerifierSlice = createSlice({
  name: "fieldVerifiers",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all
      .addCase(fetchFieldVerifiers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFieldVerifiers.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchFieldVerifiers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch field verifiers: ${action.error.message}`);
      })

      // Fetch by ID
      .addCase(fetchFieldVerifierById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Check mobile
      .addCase(checkFieldVerifierByMobile.fulfilled, (state, action) => {
        state.mobileCheckResult = action.payload;
      })
      .addCase(checkFieldVerifierByMobile.rejected, (state, action) => {
        toast.error(`Mobile check failed: ${action.payload}`);
      })

      // Check username
      .addCase(checkFieldVerifierByUsername.fulfilled, (state, action) => {
        state.usernameCheckResult = action.payload;
      })
      .addCase(checkFieldVerifierByUsername.rejected, (state, action) => {
        toast.error(`Username check failed: ${action.payload}`);
      })

      // Fetch logins
      .addCase(fetchFieldVerifierLogins.fulfilled, (state, action) => {
        state.logins = action.payload;
      })
      .addCase(fetchFieldVerifierLogins.rejected, (state, action) => {
        toast.error(`Failed to fetch logins: ${action.error.message}`);
      })

      // Delete login
      .addCase(removeFieldVerifierLogin.fulfilled, (state, action) => {
        state.logins = state.logins.filter(
          (item) => item.id !== action.payload
        );
        toast.success("Login deleted successfully");
      })
      .addCase(removeFieldVerifierLogin.rejected, (state, action) => {
        toast.error(`Failed to delete login: ${action.payload}`);
      })

      // Add
      .addCase(addFieldVerifier.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Field Verifier added successfully");
      })
      .addCase(addFieldVerifier.rejected, (state, action) => {
        toast.error(`Failed to add field verifier: ${action.payload}`);
      })

      // Edit
      .addCase(editFieldVerifier.fulfilled, (state, action) => {
        const index = state.list.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Field Verifier updated successfully");
      })
      .addCase(editFieldVerifier.rejected, (state, action) => {
        toast.error(`Failed to update field verifier: ${action.payload}`);
      })

      // Toggle active status
      .addCase(toggleFieldVerifierStatus.fulfilled, (state, action) => {
        const updated = action.payload;
        const index = state.list.findIndex((item) => item.id === updated.id);
        if (index !== -1) {
          state.list[index] = updated;
        }
        toast.success(
          `Field Verifier ${
            updated.is_active ? "activated" : "deactivated"
          } successfully`
        );
      })
      .addCase(toggleFieldVerifierStatus.rejected, (state, action) => {
        toast.error(`Failed to toggle status: ${action.payload}`);
      })
      
      // Delete
      .addCase(removeFieldVerifier.fulfilled, (state, action) => {
        state.list = state.list.filter((item) => item.id !== action.payload);
        toast.success("Field Verifier deleted successfully");
      })
      .addCase(removeFieldVerifier.rejected, (state, action) => {
        toast.error(`Failed to delete field verifier: ${action.payload}`);
      });
  },
});

export default fieldVerifierSlice.reducer;
