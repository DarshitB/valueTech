import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as permissionApi from "../../api/permission.api";
import { toast } from "react-toastify";

// Fetch all individual permissions
export const fetchAllPermissions = createAsyncThunk(
  "permissions/fetchAll",
  async () => {
    const res = await permissionApi.getAllPermissions();
    return res.data;
  }
);

// Fetch role-wise grouped permissions
export const fetchRoleWisePermissions = createAsyncThunk(
  "permissions/fetchRoleWise",
  async () => {
    const res = await permissionApi.getRoleWisePermissions();
    return res.data;
  }
);

// Bulk update permissions per role
export const updateRolePermissions = createAsyncThunk(
  "permissions/updateBulk",
  async (payload) => {
    const res = await permissionApi.updatePermissionsInBulk(payload);
    /* console.log("res", res); */
    return res.data;
  }
);

// Initial state
const initialState = {
  all: [], // All available permissions (flat list)
  roleWise: [], // Role-permission map
  loading: false,
  error: null,
};

// Slice
const permissionSlice = createSlice({
  name: "permissions",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all permissions
      .addCase(fetchAllPermissions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAllPermissions.fulfilled, (state, action) => {
        state.all = action.payload;
        state.loading = false;
      })
      .addCase(fetchAllPermissions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch permissions: ${action.error.message}`);
      })

      // Fetch role-wise permissions
      .addCase(fetchRoleWisePermissions.fulfilled, (state, action) => {
        state.roleWise = action.payload;
      })
      .addCase(fetchRoleWisePermissions.rejected, (state, action) => {
        toast.error(
          `Failed to fetch role-wise permissions: ${action.error.message}`
        );
      })

      // Update role permissions in bulk
      .addCase(updateRolePermissions.fulfilled, (state) => {
        toast.success("Permissions updated successfully");
      })
      .addCase(updateRolePermissions.rejected, (state, action) => {
        toast.error(`Failed to update permissions: ${action.error.message}`);
      });
  },
});

export default permissionSlice.reducer;
