// API utility functions for Cities
import axios from "./axios"; // Axios instance configured with base URL

const ENDPOINT = "/api/cities"; // Base endpoint for all state-related requests

export const getCities = () => axios.get(ENDPOINT); // Fetch all cities
export const getCityById = (id) => axios.get(`${ENDPOINT}/${id}`); // Get city by ID
export const createCity = (data) => axios.post(ENDPOINT, data); // Add new city
export const updateCity = (id, payload) =>
  axios.put(`${ENDPOINT}/${id}`, payload); // Update existing city
export const deleteCity = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a city by ID
