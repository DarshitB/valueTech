import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";

/**
 * ProtectedRoute ensures:
 * - User is logged in
 * - User has required permission
 *
 * @param {string} permission - Required permission name (optional)
 * @param {JSX.Element} children - Component to render if allowed
 */
const ProtectedRoute = ({ permission, children }) => {
  const { token, user } = useSelector((state) => state.auth);

  // Show nothing while auth is being initialized (optional)
  if (!user && token) {
    // Still fetching user via /auth/me, wait...
    return null; // or return <Loading /> component
  }

  // Not logged in → go to login
  if (!token) return <Navigate to="/login" />;

  // Logged in but lacks required permission → redirect to home/dashboard
  if (permission && !user?.permissions?.includes(permission)) {
    return <Navigate to="/" />;
  }

  // All good → render child component
  return children;
};

export default ProtectedRoute;
