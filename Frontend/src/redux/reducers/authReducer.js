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

      // 5. Check if user needs OTP verification
      // Exempt developer_admin role from OTP requirement
      const userRole = user?.role?.name || "";
      const needsOtp =
        user?.permissions?.includes("need_otp_access") &&
        userRole.toLowerCase() !== "developer_admin";

      // 6. If user needs OTP, generate it before redirecting
      // Store password temporarily in Redux (in-memory only, not localStorage) for resend OTP
      let tempPassword = null;
      if (needsOtp) {
        try {
          await axios.post("/api/auth/generate-otp", {
            username: payload.username,
            password: payload.password,
          });
          // Store password temporarily in Redux state (in-memory only) for resend OTP
          tempPassword = payload.password;
          // Clear any previous OTP verification status
          localStorage.removeItem("otpVerified");
        } catch (otpErr) {
          // If OTP generation fails, still allow login but user will need to request OTP again
          console.error("Login Code generation failed:", otpErr);
        }
      } else {
        // If user doesn't need OTP, mark as verified
        localStorage.setItem("otpVerified", "true");
      }

      toast.success("Login successful");
      return { token, user, needsOtp, tempPassword };
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

// Generate OTP
export const generateOtp = createAsyncThunk(
  "auth/generateOtp",
  async (payload, thunkAPI) => {
    try {
      const res = await axios.post("/api/auth/generate-otp", payload);
      toast.success(res.data.message || "Login Code generated successfully");
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to generate Login Code");
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Failed to generate Login Code"
      );
    }
  }
);

// Verify OTP
export const verifyOtp = createAsyncThunk(
  "auth/verifyOtp",
  async (payload, thunkAPI) => {
    try {
      const res = await axios.post("/api/auth/verify-otp", payload);
      toast.success(res.data.message || "Login Code verified successfully");
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.message || "Login Code verification failed");
      return thunkAPI.rejectWithValue(
        err.response?.data?.message || "Login Code verification failed"
      );
    }
  }
);

const initialState = {
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token"),
  loading: false,
  error: null,
  otpLoading: false,
  otpError: null,
  otpVerified: localStorage.getItem("otpVerified") === "true",
  tempPassword: null, // Temporary password for resend OTP (in-memory only, never in localStorage)
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      localStorage.setItem("user", JSON.stringify(action.payload));
    },
    setOtpVerified: (state, action) => {
      state.otpVerified = action.payload;
      if (action.payload) {
        localStorage.setItem("otpVerified", "true");
      } else {
        localStorage.removeItem("otpVerified");
      }
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
        // Store temp password only if user needs OTP (in-memory only)
        if (action.payload.needsOtp && action.payload.tempPassword) {
          state.tempPassword = action.payload.tempPassword;
        }
        // Reset OTP verification status on new login
        state.otpVerified = false;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // logout
      .addCase(logout.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.otpVerified = false;
        state.tempPassword = null; // Clear temp password on logout
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("otpVerified");
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
      })

      // generateOtp
      .addCase(generateOtp.pending, (state) => {
        state.otpLoading = true;
        state.otpError = null;
      })
      .addCase(generateOtp.fulfilled, (state, action) => {
        state.otpLoading = false;
        state.otpError = null;
        // If password was provided in payload, store it temporarily for future resend
        if (action.meta.arg?.password) {
          state.tempPassword = action.meta.arg.password;
        }
      })
      .addCase(generateOtp.rejected, (state, action) => {
        state.otpLoading = false;
        state.otpError = action.payload;
      })

      // verifyOtp
      .addCase(verifyOtp.pending, (state) => {
        state.otpLoading = true;
        state.otpError = null;
        state.otpVerified = false;
      })
      .addCase(verifyOtp.fulfilled, (state) => {
        state.otpLoading = false;
        state.otpError = null;
        state.otpVerified = true;
        // Clear temp password after successful verification (security)
        state.tempPassword = null;
        localStorage.setItem("otpVerified", "true");
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.otpLoading = false;
        state.otpError = action.payload;
        state.otpVerified = false;
      });
  },
});

export const { setUser, setOtpVerified } = authSlice.actions;
export default authSlice.reducer;
