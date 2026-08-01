import axios from "./axios"; // Importing axios instance (preconfigured with base URL and interceptors)

const ENDPOINT = "/api/attendance"; // Base endpoint for all attendance-related requests

export const getAttendanceByUserId = (userId, params) =>
  axios.get(`${ENDPOINT}/user/${userId}`, { params }); // Fetch attendance (optional from/to)
export const getLastAttendanceByUserId = (userId) => axios.get(`${ENDPOINT}/last/${userId}`); // Fetch the last attendance record for a user
export const createAttendance = (data) => axios.post(ENDPOINT, data); // Create a new attendance record (check-in)
export const updateAttendance = (data) => axios.put(ENDPOINT, data); // Update attendance record (check-out)
export const lunchInAttendance = (data) => axios.put(`${ENDPOINT}/lunch-in`, data);
export const lunchOutAttendance = (data) => axios.put(`${ENDPOINT}/lunch-out`, data);
// UI Break In = start break; UI Break Out = end break
export const breakInAttendance = (data) => axios.put(`${ENDPOINT}/break-in`, data);
export const breakOutAttendance = (data) => axios.put(`${ENDPOINT}/break-out`, data);
export const getBreaksByUserId = (userId, params) =>
  axios.get(`${ENDPOINT}/breaks/user/${userId}`, { params });
// All users for one working date (attendance + breaks + leaves)
export const getAttendanceByWorkingDate = (workingDate) =>
  axios.get(`${ENDPOINT}/by-date/${workingDate}`);
// Detail: one user + one working date
export const getAttendanceDetail = (userId, workingDate) =>
  axios.get(`${ENDPOINT}/user/${userId}/date/${workingDate}`);
// Manual edit Day In / Day Out / Lunch In / Lunch Out
export const updateAttendanceWorkTimes = (data) =>
  axios.put(`${ENDPOINT}/work-times`, data);
// Manual edit Break In / Break Out (partial) — id = attendance_breaks.id
export const updateBreakWorkTimes = (id, data) =>
  axios.put(`${ENDPOINT}/breaks/${id}/work-times`, data);
// Add/update day-out remarks (own attendance OR permission)
export const updateAttendanceCheckoutRemarks = (data) =>
  axios.put(`${ENDPOINT}/checkout-remarks`, data);

