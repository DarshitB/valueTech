import axios from "./axios"; // Importing axios instance (preconfigured with base URL and interceptors)

const ENDPOINT = "/api/states"; // Base endpoint for all state-related requests

export const getStates = () => axios.get(ENDPOINT); // Fetch all states
export const getStateById = (id) => axios.get(`${ENDPOINT}/${id}`); // Fetch a single state by its ID
export const createState = (data) => axios.post(ENDPOINT, data); // Add a new state
export const updateState = (id, payload) => axios.put(`${ENDPOINT}/${id}`, payload); // Update an existing state
export const deleteState = (id) => axios.delete(`${ENDPOINT}/${id}`); // Delete a state by ID
