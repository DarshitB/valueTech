import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import * as cityApi from "../../api/city.api";
import { toast } from "react-toastify";

// Async action: fetch all cities
export const fetchCities = createAsyncThunk("cities/fetchAll", async () => {
  const res = await cityApi.getCities();
  return res.data;
});

// Async action: fetch a single city by ID
export const fetchCityById = createAsyncThunk(
  "cities/fetchById",
  async (id) => {
    const res = await cityApi.getCityById(id);
    return res.data;
  }
);

// Add new city
/* export const addCity = createAsyncThunk("cities/add", async (payload) => {
  const res = await cityApi.createCity(payload);
  return res.data;
}); */
export const addCity = createAsyncThunk(
  "cities/add",
  async (data, { rejectWithValue }) => {
    try {
      const res = await cityApi.createCity(data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Edit city
/* export const editCity = createAsyncThunk(
  "cities/edit",
  async ({ id, data }) => {
    const res = await cityApi.updateCity(id, data);
    return res.data;
  }
); */
export const editCity = createAsyncThunk(
  "cities/edit",
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const res = await cityApi.updateCity(id, data);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Delete city
/* export const removeCity = createAsyncThunk("cities/delete", async (id) => {
  await cityApi.deleteCity(id); // No response body (204)
  return id; // Return deleted ID to remove from state
}); */
export const removeCity = createAsyncThunk(
  "cities/delete",
  async (id, { rejectWithValue }) => {
    try {
      await cityApi.deleteCity(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

// Initial Redux state
const initialState = {
  list: [],
  loading: false,
  error: null,
};

// Slice
const citySlice = createSlice({
  name: "cities",
  initialState,
  reducers: {},

  extraReducers: (builder) => {
    builder
      // Fetch all cities
      .addCase(fetchCities.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCities.fulfilled, (state, action) => {
        state.list = action.payload;
        state.loading = false;
      })
      .addCase(fetchCities.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
        toast.error(`Failed to fetch cities: ${action.error.message}`);
      })

      // Fetch by ID
      .addCase(fetchCityById.fulfilled, (state, action) => {
        state.selected = action.payload;
      })

      // Add city
      .addCase(addCity.fulfilled, (state, action) => {
        state.list.push(action.payload);
        toast.success("City added successfully");
      })
      .addCase(addCity.rejected, (state, action) => {
        toast.error(`Failed to add city: ${action.payload}`);
      })
      /* .addCase(addCity.fulfilled, (state, action) => {
        state.list.push(action.payload);
      }) */

      // Edit city
      .addCase(editCity.fulfilled, (state, action) => {
        const index = state.list.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          state.list[index] = action.payload;
        }
        toast.success("City updated successfully");
      })
      .addCase(editCity.rejected, (state, action) => {
        toast.error(`Failed to update city: ${action.payload}`);
      })

      // Delete city
      .addCase(removeCity.fulfilled, (state, action) => {
        state.list = state.list.filter((c) => c.id !== action.payload);
        toast.success("City deleted successfully");
      })
      .addCase(removeCity.rejected, (state, action) => {
        toast.error(`Failed to delete city: ${action.payload}`);
      });
  },
});

export default citySlice.reducer;
