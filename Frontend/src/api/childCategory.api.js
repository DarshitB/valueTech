// API utility functions for Cities
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/child-categories"; // Base endpoint for all state-related requests

export const getChildCategories = () => axios.get(ENDPOINT); // Fetch all category
export const getChildCategoryById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get category by ID
export const createChildCategory = (data) => axios.post(ENDPOINT, data); // Add new category
export const updateChildCategory = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update existing category
export const deleteChildCategory = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a category by ID
