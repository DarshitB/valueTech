const jwt = require("jsonwebtoken");
const User = require("../models/user/user");

module.exports = async function (req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" }); // Check if the Authorization header is present and starts with "Bearer "

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the JWT token
    const user = await User.findById(decoded.userId); // Find user by ID from the token
    if (!user || user.deleted_at)
      return res.status(401).json({ message: "Invalid user" }); // Check if user exists and is not deleted

    req.user = {
      id: user.id,
      role_id: user.role_id,
      role_name: user.role_name,
      email: user.email,
    }; // Attach user info to request

    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}; // Middleware to authenticate requests using JWT
