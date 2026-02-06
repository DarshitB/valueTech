import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as collageApi from "../../api/orderCollage.api";
import { toast } from "react-toastify";

// Async action: Generate a new collage
export const generateCollage = createAsyncThunk(
  "collage/generate",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await collageApi.collageGenerator(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Async action: Generate text-image collage
export const generateTextImageCollage = createAsyncThunk(
  "collage/generateTextImage",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await collageApi.generateTextImageCollage(payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial state
const initialState = {
  generating: false,
  generatingTextImage: false,
  error: null,
};

// Collage slice
const collageSlice = createSlice({
  name: "collage",
  initialState,
  reducers: {
    // Clear errors
    clearErrors: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // Generate new collage
      .addCase(generateCollage.pending, (state) => {
        state.generating = true;
        state.error = null;
      })
      .addCase(generateCollage.fulfilled, (state) => {
        state.generating = false;
        toast.success("Collage generated successfully");
      })
      .addCase(generateCollage.rejected, (state, action) => {
        state.generating = false;
        state.error = action.payload;
        toast.error(`Failed to generate collage: ${action.payload}`);
      })
      // Generate text-image collage
      .addCase(generateTextImageCollage.pending, (state) => {
        state.generatingTextImage = true;
        state.error = null;
      })
      .addCase(generateTextImageCollage.fulfilled, (state) => {
        state.generatingTextImage = false;
        toast.success("Text collage image generated and saved to order media");
      })
      .addCase(generateTextImageCollage.rejected, (state, action) => {
        state.generatingTextImage = false;
        state.error = action.payload;
        toast.error(`Failed to generate text collage: ${action.payload}`);
      });
  },
});

// Export actions
export const { clearErrors } = collageSlice.actions;

export default collageSlice.reducer;