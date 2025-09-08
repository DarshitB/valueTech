import axios from 'axios'

/* console.log("base url:", process.env.REACT_APP_API_BASE_URL); */

// Create axios instance
const instance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000',
})

// Attach token from localStorage (for every request)
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Global response handler for 401 error (unauthorized)
instance.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login"; // Redirect to login page
    }
    return Promise.reject(error);
  }
);
export default instance
