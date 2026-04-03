// API utility functions for Cities
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/subcategories"; // Base endpoint for all state-related requests

export const getSubCategories = () => axios.get(ENDPOINT); // Fetch all sub category
export const getSubCategoryById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get sub category by ID
export const addSubCategory = (data) => axios.post(ENDPOINT, data); // Add new sub category
export const editSubCategory = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update existing sub category
export const removeSubCategory = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a sub category by ID
