/**
 * Socket.IO authentication middleware.
 * Reuses the same JWT + active_token checks as REST auth middleware.
 *
 * Token is accepted from:
 *   - handshake.auth.token
 *   - Authorization: Bearer <token> header
 */

const jwt = require("jsonwebtoken");
const User = require("../models/user/user");

function extractToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (authToken && typeof authToken === "string") {
    return authToken.startsWith("Bearer ")
      ? authToken.slice(7)
      : authToken;
  }

  const header = socket.handshake.headers?.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.split(" ")[1];
  }

  return null;
}

module.exports = async function socketAuth(socket, next) {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error("No token provided"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.deleted_at) {
      return next(new Error("Invalid user"));
    }

    // Single-session login — reject if token is no longer active
    if (user.active_token && user.active_token !== token) {
      return next(
        new Error("Session expired. You have been logged in from another device")
      );
    }

    socket.user = {
      id: user.id,
      name: user.name,
      role_id: user.role_id,
      role_name: user.role_name,
      email: user.email,
    };

    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
};
