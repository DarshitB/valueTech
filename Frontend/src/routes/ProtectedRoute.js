import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

/**
 * ProtectedRoute ensures:
 * - User is logged in
 * - User has required permission
 * - User has verified OTP if they have "need_otp_access" permission (except developer_admin)
 *
 * @param {string} permission - Required permission name (optional)
 * @param {JSX.Element} children - Component to render if allowed
 */
const ProtectedRoute = ({ permission, children }) => {
  const { token, user, otpVerified } = useSelector((state) => state.auth);

  // Show nothing while auth is being initialized (optional)
  if (!user && token) {
    // Still fetching user via /auth/me, wait...
    return null; // or return <Loading /> component
  }

  // Not logged in → go to login
  if (!token) return <Navigate to="/login" />;

  // Check OTP verification requirement
  if (user) {
    const userRole = user?.role?.name || "";
    const needsOtp =
      user?.permissions?.includes("need_otp_access") &&
      userRole.toLowerCase() !== "developer_admin";

    // If user needs OTP but hasn't verified, redirect to OTP page
    if (needsOtp && !otpVerified) {
      return <Navigate to="/otp-verify" replace />;
    }
  }

  // Logged in but lacks required permission → redirect to home/dashboard
  if (permission && !user?.permissions?.includes(permission)) {
    return <Navigate to="/" />;
  }

  // All good → render child component
  return children;
};

export default ProtectedRoute;
