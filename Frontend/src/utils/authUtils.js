import { jwtDecode } from "jwt-decode";

// Checks if token is expired
export const isTokenExpired = (token) => {
  try {
    const decoded = jwtDecode(token);
    const now = Date.now() / 1000; // current time in seconds
    return decoded.exp < now;
  } catch (err) {
    return true; // If decode fails, treat as expired
  }
};