import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../api/axios";
import { toast } from "react-toastify";

// Login
/* export const login = createAsyncThunk(
  "auth/login",
  async (payload, thunkAPI) => {
    try {
      const res = await axios.post("/auth/login", payload);
      localStorage.setItem("token", res.data.token);
      toast.success("Login successful");
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Login failed"
      );
    }
  }
); */
export const login = createAsyncThunk(
  "auth/login",
  async (payload, thunkAPI) => {
    try {
      // 1. Login to get token
      const res = await axios.post("/api/auth/login", payload);
      const token = res.data.token;

      // 2. Save token to localStorage so axios interceptor uses it
      localStorage.setItem("token", token);

      // 3. Fetch user data from /api/auth/me
      const userRes = await axios.get("/api/auth/me");
      const user = userRes.data;

      // 4. Save user to localStorage for persistence
      localStorage.setItem("user", JSON.stringify(user));

      toast.success("Login successful");
      return { token, user };
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Login failed"
      );
    }
  }
);

// Logout (also logs activity in backend)
export const logout = createAsyncThunk("auth/logout", async (_, thunkAPI) => {
  try {
    await axios.post("/api/auth/logout");
    localStorage.removeItem("token");
    toast.success("Logged out successfully");
    return true;
  } catch (err) {
    toast.error("Logout failed");
    return thunkAPI.rejectWithValue("Logout failed");
  }
});

//get logged in user data
export const fetchCurrentUser = createAsyncThunk(
  "auth/fetchCurrentUser",
  async (_, thunkAPI) => {
    try {
      const res = await axios.get("/api/auth/me");
      const user = res.data;
      localStorage.setItem("user", JSON.stringify(user));
      return user;
    } catch (err) {
      toast.error("Failed to fetch user data");
      return thunkAPI.rejectWithValue("Failed to fetch user");
    }
  }
);

const initialState = {
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token"),
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      localStorage.setItem("user", JSON.stringify(action.payload));
    },
  },
  extraReducers: (builder) => {
    builder
      // login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // logout
      .addCase(logout.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      })

      // fetchCurrentUser
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.token = null;
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        toast.error("Session expired. Please login again.");
      });
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
