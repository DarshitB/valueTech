import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as roleApi from "../../api/role.api";
import { toast } from "react-toastify";

// Async action: Fetch all roles
export const fetchRoles = createAsyncThunk("roles/fetchAll", async () => {
  const res = await roleApi.getRoles();
  return res.data;
});

// Fetch a single role by ID
export const fetchRoleById = createAsyncThunk("roles/fetchById", async (id) => {
  const res = await roleApi.getRoleById(id);
  return res.data;
});

// Add new role
export const addRole = createAsyncThunk("roles/add", async (payload) => {
  const res = await roleApi.createRole(payload);
  return res.data;
});

// Edit role
export const editRole = createAsyncThunk("roles/edit", async ({ id, data }) => {
  const res = await roleApi.updateRole(id, data);
  return res.data;
});

// Delete role
export const removeRole = createAsyncThunk("roles/delete", async (id) => {
  await roleApi.deleteRole(id); // 204 No Content
  return id; // Return the deleted ID
});

// Initial state
const initialState = {
  list: [],
  loading: false,
  error: null,
  selected: null,
};

// Slice
const roleSlice = createSlice({
  name: "roles",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all roles
      .addCase(fetchRoles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch roles: ${action.error.message}`);
      })

      // Fetch role by ID
      .addCase(fetchRoleById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add role
      .addCase(addRole.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("Role added successfully");
      })
      .addCase(addRole.rejected, (state, action) => {
        toast.error(`Failed to add role: ${action.error.message}`);
      })

      // Edit role
      .addCase(editRole.fulfilled, (state, action) => {
        const index = state.list.findIndex((r) => r.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("Role updated successfully");
      })
      .addCase(editRole.rejected, (state, action) => {
        toast.error(`Failed to update role: ${action.error.message}`);
      })

      // Delete role
      .addCase(removeRole.fulfilled, (state, action) => {
        state.list = state.list.filter((r) => r.id !== action.payload);
        toast.success("Role deleted successfully");
      })
      .addCase(removeRole.rejected, (state, action) => {
        toast.error(`Failed to delete role: ${action.error.message}`);
      });
  },
});

export default roleSlice.reducer;
