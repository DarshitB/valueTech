const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mobileAuth = require("../../models/fieldVerifier/mobile_auth");
const {
  NotFoundError,
  BadRequestError,
  ConflictError,
} = require("../../utils/customErrors");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE_HOURS = 3; // fixed 3 hours

const mobileAuthController = {
  // LOGIN handler
  async login(req, res, next) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        throw new BadRequestError("username and password are required.");
      }

      const verifier = await mobileAuth.findByMobileOrUsername(username);

      if (!verifier) {
        throw new NotFoundError("User not found.");
      }

      if (!verifier.is_active) {
        throw new ConflictError(
          "Contact your admin. You are not allowed to login for now."
        );
      }

      const isMatch = await bcrypt.compare(password, verifier.password);
      if (!isMatch) {
        throw new BadRequestError("Invalid password");
      }

      const expiresAt = new Date(
        Date.now() + JWT_EXPIRE_HOURS * 60 * 60 * 1000
      );
      const token = jwt.sign({ id: verifier.id }, JWT_SECRET, {
        expiresIn: `${JWT_EXPIRE_HOURS}h`,
      });

      const loginData = {
        field_verifier_id: verifier.id,
        token,
        login_at: new Date(),
        expires_at: expiresAt,
        ip_address: req.ip,
        device_info: req.headers["user-agent"],
      };

      const [session] = await mobileAuth.logLogin(loginData);

      return res.status(200).json({
        message: "Login successful",
        token,
        verifier_id: verifier.id,
        login_at: session.login_at,
        expires_at: session.expires_at,
      });
    } catch (error) {
      /* console.error("Login error:", error); */
      next(err);
      return res.status(500).json({ message: "Something went wrong." });
    }
  },

  // LOGOUT handler
  async logout(req, res) {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) throw new NotFoundError("Token missing.");
      /* console.log("TOKEN:", token); */

      const session = await mobileAuth.findValidSession(token);
      /* console.log("SESSION FOUND:", session); */
      if (!session)
        return res.status(401).json({ message: "Invalid or expired token." });

      await mobileAuth.logoutById(session.id);

      return res.status(200).json({ message: "Logout successful." });
    } catch (error) {
      console.error("Logout error:", error);
      return res.status(500).json({ message: "Something went wrong." });
    }
  },

  async getMe(req, res, next) {
    try {
      /* const { id } = req.params; */
      const id = req.verifier?.id; // comes from decoded token in auth middleware

      const verifier = await mobileAuth.findById(id);
      if (!verifier) throw new NotFoundError("Verifier not found");

      res.json({
        id: verifier.id,
        name: verifier.name,
        username: verifier.username,
        mobile: verifier.mobile,
        city_id: verifier.city_id,
        city_name: verifier.city_name,
        state_id: verifier.state_id,
        state_name: verifier.state_name,
        is_active: verifier.is_active,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = mobileAuthController;
