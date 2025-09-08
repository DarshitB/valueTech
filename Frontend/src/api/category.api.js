// API utility functions for Cities
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/categories"; // Base endpoint for all state-related requests

export const getCategories = () => axios.get(ENDPOINT); // Fetch all category
export const getCategoryById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get category by ID
export const createCategory = (data) => axios.post(ENDPOINT, data); // Add new category
export const updateCategory = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update existing category
export const deleteCategory = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a category by ID
