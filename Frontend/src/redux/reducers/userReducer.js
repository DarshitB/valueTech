import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as userApi from "../../api/user.api";
import { toast } from "react-toastify";

// Fetch all users
export const fetchUsers = createAsyncThunk("users/fetchAll", async () => {
  const res = await userApi.getUsers();
  return res.data;
});

// Fetch single user by ID
export const fetchUserById = createAsyncThunk("users/fetchById", async (id) => {
  const res = await userApi.getUsersById(id);
  return res.data;
});

// Check if mobile exists
export const checkUserByMobile = createAsyncThunk(
  "users/checkMobile",
  async (mobile, { rejectWithValue }) => {
    try {
      const res = await userApi.getUsersByMobile(mobile);
      return res.data; // adjust depending on backend response
    } catch (err) {
      return rejectWithValue(
        err.response?.data?.message || "Mobile check failed"
      );
    }
  }
);

// Check if email exists
export const checkEmailExist = createAsyncThunk(
  "users/checkEmailExist",
  async (email, { rejectWithValue }) => {
    try {
      const res = await userApi.getUsersByEmail(email); // res.data = { exists: true/false }
      return res.data;
    } catch (err) {
      // Show toast and reject
      toast.error(
        err.response?.data?.message || "Failed to check email existence"
      );
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

// Add new user
/* export const addUser = createAsyncThunk("users/add", async (payload) => {
  const res = await userApi.createUsers(payload);
  return res.data;
}); */
export const addUser = createAsyncThunk(
  "users/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await userApi.createUsers(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit user
/* export const editUser = createAsyncThunk("users/edit", async ({ id, data }) => {
  const res = await userApi.updateUsers(id, data);
  return res.data;
}); */
export const editUser = createAsyncThunk(
  "users/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await userApi.updateUsers(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete user
/* export const removeUser = createAsyncThunk("users/delete", async (id) => {
  await userApi.deleteUsers(id); // 204 No Content
  return id;
}); */
export const removeUser = createAsyncThunk(
  "users/delete",
  async (id, { rejectWithValue }) => {
    try {
      await userApi.deleteUsers(id);
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
  checkResult: null,
};

// Slice
const userSlice = createSlice({
  name: "users",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all users
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch users: ${action.error.message}`);
      })

      // Fetch user by ID
      .addCase(fetchUserById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Check mobile
      .addCase(checkUserByMobile.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.checkResult = null;
      })
      .addCase(checkUserByMobile.fulfilled, (state, action) => {
        state.loading = false;
        state.checkResult = action.payload;
      })
      .addCase(checkUserByMobile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Mobile check failed: ${action.payload}`);
      })

      // Check email
      .addCase(checkEmailExist.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(checkEmailExist.fulfilled, (state, action) => {
        state.loading = false;
        state.emailExists = action.payload.exists;
      })
      .addCase(checkEmailExist.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(`Email check failed: ${action.payload}`);
      })

      // Add user
      .addCase(addUser.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("User added successfully");
      })
      .addCase(addUser.rejected, (state, action) => {
        toast.error(`Failed to add user: ${action.payload}`);
      })

      // Edit user
      .addCase(editUser.fulfilled, (state, action) => {
        const index = state.list.findIndex((u) => u.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("User updated successfully");
      })
      .addCase(editUser.rejected, (state, action) => {
        toast.error(`Failed to update user: ${action.payload}`);
      })

      // Delete user
      .addCase(removeUser.fulfilled, (state, action) => {
        state.list = state.list.filter((u) => u.id !== action.payload);
        toast.success("User deleted successfully");
      })
      .addCase(removeUser.rejected, (state, action) => {
        toast.error(`Failed to delete user: ${action.error.message}`);
      });
  },
});

export default userSlice.reducer;
