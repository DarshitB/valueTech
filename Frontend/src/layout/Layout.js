import React, { useState } from "react";
import "./Layout.scss";
import { Link, Outlet, useLocation } from "react-router-dom";

/* =====  images =====  */
import profile from "../assets/images/user.png";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../redux/reducers/authReducer";
import {
  BankIcon,
  CategoryIcon,
  DashboardIcon,
  FieldVerifierIcon,
  LocationIcon,
  NotificationBellIcon,
  OfficerIcon,
  OrderHistoryIcon,
  OrderIcon,
  PermissionIcon,
  UsersIcon,
} from "../components/icons";
import {
  selectPermissions,
  selectUser,
} from "../redux/selectors/authSelectors";
import { hasPermission } from "../utils/permissionUtils";
import {
  AlignJustify,
  Hamburger,
  HamburgerIcon,
  LucideHamburger,
} from "lucide-react";
import { usePageTitle } from "../context/PageTitleContext";
import NotificationDropdown from "../components/NotificationDropdown";
import CommentNotificationDropdown from "../components/CommentNotificationDropdown";
import MediaNotificationDropdown from "../components/MediaNotificationDropdown";

function Layout() {
  /* start get location for add active class */
  const location = useLocation();
  /* end get location for add active class */

  /*get page title to add */
  const { title } = usePageTitle();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);
  /* get logged user */
  const LoggedInUser = useSelector(selectUser);

  /* ===== get file name =====*/
  // Get pathname (e.g., "/dashboard/order-history")
  const pathname = location.pathname;
  // Get last segment (e.g., "order-history")
  const lastSegment = pathname.split("/").filter(Boolean).pop();
  // Convert to readable form (e.g., "Order History")
  const pageTitle = lastSegment
    ? lastSegment
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : "Dashboard";
  /* ===================*/

  /* ====useStates=======*/
  const [userProfile, setUserProfile] = useState(false); // Toggle for user profile dropdown

  const [sidebarOpen, setSidebarOpen] = useState(false); // Toggle for sidebar

  const dispatch = useDispatch(); // Function to handle logout
  const handleLogout = () => {
    dispatch(logout());
  };

  const isSpreadsheetRoute =
    location.pathname.startsWith("/spreadsheet/") &&
    location.pathname.length > "/spreadsheet/".length;

  return (
    <>
      <div className="main-wrapper main-wrapper-1">
        <nav className="navbar navbar-expand-lg main-navbar sticky">
          <div className="form-inline mr-auto">
            <button
              className="btn hamburger"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <AlignJustify size={20} />
            </button>
            <h1 className="page-title-heading">{title || pageTitle}</h1>
          </div>
          <ul className="navbar-nav navbar-right">
            {hasPermission(allowedPermissions, "view_notification") && (
              <NotificationDropdown />
            )}
            {hasPermission(
              allowedPermissions,
              "view_comment_notifications"
            ) && <CommentNotificationDropdown />}
            {hasPermission(allowedPermissions, "view_media_notifications") && (
              <MediaNotificationDropdown />
            )}
            <li className={`dropdown ${userProfile ? "show" : ""}`}>
              <span
                data-toggle="dropdown"
                className="nav-link dropdown-toggle nav-link-lg nav-link-user"
              >
                <img
                  src={profile}
                  className="user-img-radious-style"
                  alt="profile images"
                  onClick={() => setUserProfile((prev) => !prev)}
                />
                <span className="d-sm-none d-lg-inline-block"></span>
                <div
                  className={`dropdown-menu dropdown-menu-right pullDown ${
                    userProfile ? "show" : ""
                  }`}
                >
                  <div className="dropdown-title">
                    Hello {LoggedInUser.name}
                  </div>

                  <div className="dropdown-divider"></div>
                  <button
                    href="auth-login.html"
                    className="dropdown-item has-icon text-danger"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              </span>
            </li>
          </ul>
        </nav>
        <div
          className={`main-sidebar sidebar-style-2 ${
            sidebarOpen ? "open" : ""
          }`}
        >
          <aside id="sidebar-wrapper">
            <div className="sidebar-brand">
              <Link to="/dashboard" className="sidebar-brand-link">Valuetech Solutions</Link>
            </div>
            <ul className="sidebar-menu">
              <li className="menu-header">&nbsp;</li>
              <li
                className={`${
                  location.pathname === "/dashboard" ? "active" : ""
                } dropdown`}
              >
                <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
                  <DashboardIcon className="feather feather-monitor" />
                  Dashboard
                </Link>
              </li>
              {hasPermission(allowedPermissions, "view_order") && (
                <li
                  className={`${
                    location.pathname.startsWith("/orders-history") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="orders-history" onClick={() => setSidebarOpen(false)}>
                    <OrderIcon className="feather feather-monitor" />
                    Orders History
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_order_history") && (
                <li
                  className={`${
                    location.pathname.startsWith("/order-history")
                      ? "active"
                      : ""
                  } dropdown`}
                >
                  <Link
                    to="order-history"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <OrderHistoryIcon className="feather feather-monitor" />
                    Order History
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_field_verifier") && (
                <li
                  className={`${
                    location.pathname.startsWith("/field-verifier")
                      ? "active"
                      : ""
                  } dropdown`}
                >
                  <Link
                    to="field-verifier"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <FieldVerifierIcon className="feather feather-monitor" />
                    Field Verifier
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_user") && (
                <li
                  className={`${
                    location.pathname.startsWith("/users") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="users" onClick={() => setSidebarOpen(false)}>
                    <UsersIcon className="feather feather-monitor" />
                    Users
                  </Link>
                </li>
              )}
              {/* {hasPermission(allowedPermissions, "view_dashboard_checkin_checkout") &&
                LoggedInUser?.role?.name?.toUpperCase() !== "DEVELOPER_ADMIN" && (
                <li
                  className={`${
                    location.pathname.startsWith("/attendance") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="attendance" onClick={() => setSidebarOpen(false)}>
                    <DashboardIcon className="feather feather-monitor" />
                    Attendance
                  </Link>
                </li>
              )} */}
              {hasPermission(allowedPermissions, "view_permission") && (
                <li
                  className={`${
                    location.pathname.startsWith("/permissions") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="permissions" onClick={() => setSidebarOpen(false)}>
                    <PermissionIcon className="feather feather-monitor" />
                    Permissions
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_bank") && (
                <li
                  className={`${
                    location.pathname.startsWith("/banks") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="banks" onClick={() => setSidebarOpen(false)}>
                    <BankIcon className="feather feather-monitor" />
                    Banks
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_branch_officer") && (
                <li
                  className={`${
                    location.pathname.startsWith("/officers") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="officers" onClick={() => setSidebarOpen(false)}>
                    <OfficerIcon className="feather feather-monitor" />
                    Officers
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_category") && (
                <li
                  className={`${
                    location.pathname.startsWith("/categories") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="categories" onClick={() => setSidebarOpen(false)}>
                    <CategoryIcon className="feather feather-monitor" />
                    Categories
                  </Link>
                </li>
              )}
              {hasPermission(allowedPermissions, "view_state") && (
                <li
                  className={`${
                    location.pathname.startsWith("/states") ? "active" : ""
                  } dropdown`}
                >
                  <Link to="states" onClick={() => setSidebarOpen(false)}>
                    <LocationIcon className="feather feather-monitor" />
                    Locations
                  </Link>
                </li>
              )}
            </ul>
          </aside>
        </div>
        {sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          className={`main-content${
            isSpreadsheetRoute ? " main-content--no-zoom" : ""
          }`}
        >
          <Outlet />
        </div>
      </div>
    </>
  );
}

export default Layout;
