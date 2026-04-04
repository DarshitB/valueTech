import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import Layout from "../layout/Layout";

/**
 * Root route behavior:
 * - Not logged in + exact `/`: show public intro (public/valuetech.html in a full-viewport iframe).
 * - Logged in + exact `/`: always redirect to `/dashboard`.
 * - Any other path: normal app shell; child routes render in Layout's `<Outlet />`.
 */
function RootLayoutGate() {
  const token = useSelector((state) => state.auth.token);
  const { pathname } = useLocation();

  if (token && pathname === "/") {
    return <Navigate to="/dashboard" replace />;
  }

  if (!token && pathname === "/") {
    const base = process.env.PUBLIC_URL || "";
    const src = `${base}/valuetech.html`;
    /*
     * Safari (WebKit): % height on iframe + shorthand inset can leave the iframe narrow or short.
     * Use explicit top/left/right/bottom on the shell and position:absolute + inset:0 on the iframe.
     */
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          margin: 0,
          padding: 0,
          zIndex: 1,
          background: "#f4f7fb",
          overflow: "hidden",
        }}
      >
        <iframe
          title="Valuetech Solutions"
          src={src}
          width="100%"
          height="100%"
          frameBorder={0}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: "100%",
            border: "none",
          }}
        />
      </div>
    );
  }

  return <Layout />;
}

export default RootLayoutGate;
