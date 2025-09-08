const jwt = require("jsonwebtoken");
const mobileAuth = require("../models/fieldVerifier/mobile_auth");

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ message: "No token provided" }); // Check if the Authorization header is present and starts with "Bearer "

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token missing" });

    // 1. Verify JWT signature
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify the JWT token

    // 2. Check token validity in DB
    const session = await mobileAuth.findValidSession(token);
    if (!session) return res.status(401).json({ message: "Session expired or invalid" });

    const verifier = await mobileAuth.findById(decoded.id); // Find verifier by ID from the token
    /* console.log("verifier:", verifier); */
    if (!verifier || verifier.deleted_at)
      return res.status(401).json({ message: "Invalid verifier" }); // Check if verifier exists and is not deleted

    req.verifier = {
      id: verifier.id,
    }; // Attach user info to request

    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}; // Middleware to authenticate requests using JWT
