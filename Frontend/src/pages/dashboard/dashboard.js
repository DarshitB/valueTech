import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { fetchOrders, editOrder } from "../../redux/reducers/orderReducer";
import { fetchUsers } from "../../redux/reducers/userReducer";
import { fetchOfficers } from "../../redux/reducers/officerReducer";
import {
  fetchChildCategories,
  fetchChildCategoriesByCategoryName,
} from "../../redux/reducers/childCategoryReducer";
import { fetchFieldVerifiers } from "../../redux/reducers/fieldVerifierReducer";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import CustomDataTable from "../../components/CustomDataTable";
import "./dashboard.scss";
import { DashboardIcon, CheckinIcon } from "../../components/icons/Icons";
import { EditIcon } from "../../components/icons";

function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  /* get current user data */
  const currentUser = useSelector((state) => state.auth.user);

  // Redux data
  const { list: orders, loading } = useSelector((state) => state.orders);
  const { list: officers } = useSelector((state) => state.officers);
  const { list: users } = useSelector((state) => state.users);
  const { list: allChildCategories } = useSelector(
    (state) => state.childCategories
  );
  const { list: fieldVerifiers } = useSelector((state) => state.fieldVerifier);

  // Fetch everything on mount
  useEffect(() => {
    dispatch(fetchOrders());
    dispatch(fetchOfficers());
    dispatch(fetchUsers());
    dispatch(fetchChildCategories());
    dispatch(fetchFieldVerifiers());
  }, [dispatch]);

  // Check if current user is TELECALLER (case-insensitive) - matches any role containing "TELECALLER"
  const isTelecaller = currentUser?.role.name?.toUpperCase().includes("TELECALLER");

  // Check if current user is Bank Officer (case-insensitive) - matches any role containing "BANK OFFICER"
  const isBankOfficer =
    currentUser?.role.name?.toUpperCase().includes("BANK OFFICER");

  // Check if current user is MANAGER (case-insensitive) - matches any role containing "MANAGER"
  const isManager = currentUser?.role.name?.toUpperCase().includes("MANAGER");

  // Check if current user is Super Admin (case-insensitive) - matches any role containing "SUPER ADMIN"
  const isSuperAdmin = currentUser?.role.name?.toUpperCase().includes("SUPER ADMIN");

  // Filter users by role for officer and manager selection
  const bankOfficers = officers.filter(
    (officer) =>
      officer.role_name.toUpperCase().includes("BANK OFFICER") ||
      officer.role_name.toUpperCase().includes("BANK AUTHORITY")
  );

  const managers = users.filter(
    (user) => user.role_name.toUpperCase().includes("MANAGER")
  );

  // Fields allowed for TELECALLER role
  const telecallerAllowedFields = [
    "contact",
    "alternative_contact",
    "supervisor_number",
    "driver_number",
    "place_of_inspection",
  ];

  // State for filtered child categories for Bank Officers
  const [filteredChildCategories, setFilteredChildCategories] = useState([]);

  // State for order type filter
  const [selectedOrderType, setSelectedOrderType] = useState("");
  
  // State for priority filter
  const [selectedPriority, setSelectedPriority] = useState("");

  // Fetch filtered child categories for Bank Officers based on their departments
  useEffect(() => {
    if (isBankOfficer && officers.length > 0) {
      // Find the officer record that matches the current user
      const currentOfficer = officers.find(
        (officer) =>
          officer.user_id === currentUser?.id ||
          officer.name === currentUser?.name ||
          officer.email === currentUser?.email
      );

      if (
        currentOfficer?.departments &&
        currentOfficer.departments.length > 0
      ) {
        // Extract department names and create comma-separated string
        const categoryNames = currentOfficer.departments
          .map((dept) => dept.name)
          .join(",");

        // Fetch child categories based on department names
        dispatch(fetchChildCategoriesByCategoryName({ categoryNames }))
          .unwrap()
          .then((data) => {
            setFilteredChildCategories(data);
          })
          .catch((error) => {
            console.error("Failed to fetch filtered child categories:", error);
            setFilteredChildCategories([]);
          });
      } else {
        // If no departments found, use all child categories
        setFilteredChildCategories(allChildCategories);
      }
    } else {
      // For non-Bank Officers, use all child categories
      setFilteredChildCategories(allChildCategories);
    }
  }, [isBankOfficer, currentUser, officers, allChildCategories, dispatch]);

  // New/Edit Order State
  const [formData, setFormData] = useState({
    customer_name: "",
    contact: "",
    alternative_contact: "",
    supervisor_number: "",
    driver_number: "",
    child_category_id: "",
    registration_number: "",
    place_of_inspection: "",
    officer_id: null,
    manager_id: null,
    field_verifier_id: null,
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  // Helper: count today's orders (by created date)
  const isSameDay = (d1, d2) =>
    d1 &&
    d2 &&
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const getCreatedDate = (order) => {
    const value = order?.created_at; // API provides created_at
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date) ? null : date;
  };

  const todaysOrdersCount = (orders || []).filter((o) =>
    isSameDay(getCreatedDate(o), new Date())
  ).length;

  const formatTwoDigits = (num) => String(num ?? 0).padStart(2, "0");

  // Open Edit Modal
  const openEditModal = (order) => {
    setIsEdit(true);
    setEditOrderId(order.id);
    setFormData({
      customer_name: order.customer_name || "",
      contact: order.contact || "",
      alternative_contact: order.alternative_contact || "",
      supervisor_number: order.supervisor_number || "",
      driver_number: order.driver_number || "",
      child_category_id: order.child_category_id || "",
      registration_number: order.registration_number || "",
      place_of_inspection: order.place_of_inspection || "",
      officer_id: order.officer_id || null,
      manager_id: order.manager_id || null,
      field_verifier_id: order.field_verifier_id || null,
    });
    setShowFormModal(true);
  };

  // Submit Edit
  const handleSubmit = () => {
    // Collect all validation errors
    if (!formData.customer_name.trim()) {
      toast.error("Name is required.");
      return;
    }

    if (!formData.contact.trim()) {
      toast.error("Contact number is required.");
      return;
    }

    // All validations passed — build payload
    const payload = {
      customer_name: formData.customer_name.trim(),
      contact: formData.contact.trim(),
      alternative_contact: formData.alternative_contact.trim() || null,
      supervisor_number: formData.supervisor_number.trim() || null,
      driver_number: formData.driver_number.trim() || null,
      child_category_id: formData.child_category_id,
      registration_number: formData.registration_number.trim() || null,
      place_of_inspection: formData.place_of_inspection.trim() || null,
    };

    // Handle officer_id, manager_id, and field_verifier_id based on permissions and user role

    // Officer ID handling - Bank Officers get their own officer ID automatically
    if (isBankOfficer) {
      // For Bank Officer users, find their officer record and use the officer's ID
      const currentOfficer = officers.find(
        (officer) => officer.user_id === currentUser?.id
      );

      if (currentOfficer) {
        // Use the officer's ID, not the user's ID
        payload.officer_id = currentOfficer.id;
      }
    } else if (
      hasPermission(allowedPermissions, "view_order_add_edit_officer_filed")
    ) {
      // For other users, use form data if they have permission
      payload.officer_id = formData.officer_id;
    }

    // MANAGER ID handling - MANAGER users get their own user ID automatically
    if (isManager) {
      // For MANAGER users, use their own user ID as manager_id
      payload.manager_id = currentUser?.id;

      // Field Verifier - only include if manager is assigned (which it will be for MANAGER users)
      if (payload.manager_id) {
        payload.field_verifier_id = formData.field_verifier_id;
      }
    } else if (
      hasPermission(allowedPermissions, "view_order_add_edit_manager_filed")
    ) {
      // For other users, use form data if they have permission
      payload.manager_id = formData.manager_id;

      // Field Verifier - only include if manager is assigned and user has manager permission
      if (formData.manager_id) {
        payload.field_verifier_id = formData.field_verifier_id;
      }
    }

    // Field Verifier for Super Admin - can assign field verifier even without manager
    if (isSuperAdmin && formData.field_verifier_id) {
      payload.field_verifier_id = formData.field_verifier_id;
    }

    dispatch(editOrder({ id: editOrderId, data: payload }));

    // Close modal after submit
    setShowFormModal(false);
  };

  // Check if user has any dashboard permissions
  const hasStatisticsPermission = hasPermission(
    allowedPermissions,
    "view_dashboard_statistics"
  );
  const hasCheckinPermission = hasPermission(
    allowedPermissions,
    "view_dashboard_checkin_checkout"
  );
  const hasOrderTablePermission = hasPermission(
    allowedPermissions,
    "view_dashboard_order_table"
  );
  const hasAnyDashboardPermission =
    hasStatisticsPermission || hasCheckinPermission || hasOrderTablePermission;

  return (
    <div className="dashboard-container height-full-occupied">
      <div className="dashboard-container-sneak-peek">
        {!hasAnyDashboardPermission && !isTelecaller ? (
          <div className="welcome-message-container">
            <div className="welcome-message">
              <h2>Welcome {currentUser?.name || "User"}</h2>
              <p>Hope you are doing well</p>
            </div>
          </div>
        ) : (
          <div className="row">
            {hasStatisticsPermission && (
              <div
                className={`${
                  hasPermission(
                    allowedPermissions,
                    "view_dashboard_checkin_checkout"
                  )
                    ? "col-xl-7"
                    : "col-xl-12"
                } col-lg-12 col-md-12 col-sm-12 col-xs-12`}
              >
                <div className="left-part-of-sneak-peek">
                  <div className="row">
                    <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                      <div className="padding-top-bottom">
                        <div className="sneak-peek-card today-orders">
                          <DashboardIcon className="sneak-peek-card-icon" />
                          <h3>Today's Orders</h3>
                          <p>{formatTwoDigits(todaysOrdersCount)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-xl-8 col-lg-8 col-md-8 col-sm-12 col-xs-12">
                      <div className="row">
                        <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                          <div className="padding-top-bottom">
                            <div className="sneak-peek-card order-status ongoing-orders">
                              <h3>Ongoing</h3>
                              <p>
                                {formatTwoDigits(
                                  orders.filter(
                                    (order) =>
                                      order.current_status_name === "Ongoing"
                                  ).length
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                          <div className="padding-top-bottom">
                            <div className="sneak-peek-card order-status submitted-orders">
                              <h3>Submitted</h3>
                              <p>
                                {formatTwoDigits(
                                  orders.filter(
                                    (order) =>
                                      order.current_status_name === "Submitted"
                                  ).length
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                          <div className="padding-top-bottom">
                            <div className="sneak-peek-card order-status validate-orders">
                              <h3>Validate</h3>
                              <p>
                                {formatTwoDigits(
                                  orders.filter(
                                    (order) =>
                                      order.current_status_name === "Validate"
                                  ).length
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                          <div className="padding-top-bottom">
                            <div className="sneak-peek-card order-status re-validate-orders">
                              <h3>re-validate</h3>
                              <p>
                                {formatTwoDigits(
                                  orders.filter(
                                    (order) =>
                                      order.current_status_name ===
                                      "re-validate"
                                  ).length
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {hasCheckinPermission && (
              <div className="col-xl-5 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="attendance-card-container">
                  <div className="attendance-card">
                    <div className="attendance-card-buttons-container">
                      <button className="attendance-card-button check-in-button">
                        <DashboardIcon /> Checkin
                      </button>
                      <button className="attendance-card-button check-out-button">
                        <DashboardIcon /> Checkout
                      </button>
                    </div>
                    <div className="attendance-card-checkin-time">
                      <p>Your Current Checkin Time was</p>
                      <h4>09:35 AM Monday, 15th-09-2025</h4>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {hasOrderTablePermission && (
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="orders-container">
                  {loading ? (
                    <p>Loading...</p>
                  ) : (
                    <CustomDataTable
                      showEntriesSelector={false}
                      showFooter={false}
                    >
                      {{
                        buttons: (
                          <div
                            style={{ display: "flex", gap: "10px", alignItems: "center" }}
                          >
                            <select
                              className="form-field type-priority-selector"
                              value={selectedOrderType}
                              onChange={(e) => setSelectedOrderType(e.target.value)}
                            >
                              <option value="">All Types</option>
                              <option value="VKA1">VKA1</option>
                              <option value="VKA2">VKA2</option>
                            </select>
                            <select
                              className="form-field type-priority-selector"
                              value={selectedPriority}
                              onChange={(e) => setSelectedPriority(e.target.value)}
                            >
                              <option value="">All Priorities</option>
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                            {hasPermission(
                              allowedPermissions,
                              "add_order"
                            ) && (
                              <Link className="btn" to="/orders">
                                See All
                              </Link>
                            )}
                          </div>
                        ),
                        header: (
                          <tr>
                            <th style={{ width: "150px" }}>Order Number</th>
                            <th style={{ width: "200px" }}>
                              Registration Number
                            </th>
                            <th style={{ width: "150px" }}>Bank</th>
                            <th style={{ width: "150px" }}>Officer</th>
                            <th style={{ width: "120px" }}>Created By</th>
                            <th>Updated By</th>
                            <th style={{ width: "120px" }}>Type</th>
                            <th style={{ width: "120px" }}>Priority</th>
                            <th style={{ width: "175px" }}>Status</th>
                            <th style={{ textAlign: "center", width: "100px" }}>
                              Action
                            </th>
                          </tr>
                        ),
                        rows: orders
                          .filter((order) => {
                            // Filter by order type if selected
                            const typeMatch =
                              !selectedOrderType || order.order_type === selectedOrderType;

                            // Filter by priority if selected
                            const priorityMatch =
                              !selectedPriority ||
                              order.order_priority === selectedPriority;

                            // Show order only if both filters match (or no filter is selected)
                            return typeMatch && priorityMatch;
                          })
                          .slice(0, 9)
                          .map((order) => (
                          <tr
                            key={order.id}
                            className={
                              hasPermission(
                                allowedPermissions,
                                "view_order_details"
                              )
                                ? "clickable-row"
                                : ""
                            }
                            onClick={() => {
                              if (
                                hasPermission(
                                  allowedPermissions,
                                  "view_order_details"
                                )
                              ) {
                                navigate(`/orders/${order.id}/details`);
                              }
                            }}
                            style={{
                              cursor: hasPermission(
                                allowedPermissions,
                                "view_order_details"
                              )
                                ? "pointer"
                                : "default",
                            }}
                          >
                            <td
                              className={
                                hasPermission(
                                  allowedPermissions,
                                  "view_order_details"
                                )
                                  ? "get-me-inside"
                                  : ""
                              }
                            >
                              {order.order_number}
                            </td>
                            <td>{order.registration_number || "-"}</td>
                            <td>{order.bank_name || "-"}</td>
                            <td>{order.officer_name || "-"}</td>
                            <td>{order.created_by}</td>
                            <td>{order.updated_by || "-"}</td>
                            <td>{order.order_type || "-"}</td>
                            <td>
                              <span
                                className={`priority-badge priority-${
                                  order.order_priority?.toLowerCase() || "none"
                                }`}
                              >
                                {order.order_priority || "-"}
                              </span>
                            </td>
                            <td>
                              <p className="status-state order-state">
                                {order.current_status_name}
                              </p>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {hasPermission(
                                allowedPermissions,
                                "edit_order"
                              ) && (
                                <button
                                  className="action-icons"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(order);
                                  }}
                                >
                                  <EditIcon />
                                </button>
                              )}
                            </td>
                          </tr>
                        )),
                      }}
                    </CustomDataTable>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* just for telecoller */}
      {isTelecaller && hasPermission(allowedPermissions, "view_dashboard_order_cards_telecaller") && (
        <div className="telecoller-dashboard">
          {loading ? (
            <div className="loading-message">
              <p>Loading orders...</p>
            </div>
          ) : orders && orders.length > 0 ? (
            orders.map((order) => (
              <div
                key={order.id}
                className="telecoller-dashboard-order-card clickable-card"
                onClick={() => openEditModal(order)}
                style={{ cursor: "pointer" }}
              >
                <div className="telecoller-dashboard-order-card-header">
                  <h3>Order ID {order.order_number || "-----"}</h3>
                </div>
                <div className="telecoller-dashboard-order-card-body">
                  <div className="telecoller-dashboard-order-card-body-item">
                    <span>Category</span>
                    <p>{order.child_category_name || "-----"}</p>
                  </div>
                  <div className="telecoller-dashboard-order-card-body-item">
                    <span>Asset Regn No.</span>
                    <p>{order.registration_number || "-----"}</p>
                  </div>
                  <div className="telecoller-dashboard-order-card-body-item">
                    <span>Client Name</span>
                    <p>{order.customer_name || "-----"}</p>
                  </div>
                  <div className="telecoller-dashboard-order-card-body-item two-rows">
                    <div className="telecoller-dashboard-order-card-body-item-inner">
                      <span>Contact Number</span>
                      <p>{order.contact || "-----"}</p>
                    </div>
                    <div className="telecoller-dashboard-order-card-body-item-inner">
                      <span>Alternative Contact Number</span>
                      <p>{order.alternative_contact || "-----"}</p>
                    </div>
                  </div>
                  <div className="telecoller-dashboard-order-card-body-item two-rows">
                    <div className="telecoller-dashboard-order-card-body-item-inner">
                      <span>Supervisor Number</span>
                      <p>{order.supervisor_number || "-----"}</p>
                    </div>
                    <div className="telecoller-dashboard-order-card-body-item-inner">
                      <span>Driver Number</span>
                      <p>{order.driver_number || "-----"}</p>
                    </div>
                  </div>
                  <div className="telecoller-dashboard-order-card-body-item two-rows">
                    <div className="telecoller-dashboard-order-card-body-item-inner">
                      <span>Bank</span>
                      <p>{order.bank_name || "-----"}</p>
                    </div>
                    <div className="telecoller-dashboard-order-card-body-item-inner">
                      <span>Officer</span>
                      <p>{order.officer_name || "-----"}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-orders-message">
              <p>No orders found</p>
            </div>
          )}
        </div>
      )}

      {/* 👤 Form Modal (Edit) */}
      {showFormModal && (
        <FormModel>
          {{
            title: `Edit Order - ${
              orders.find((order) => order.id === editOrderId)?.order_number ||
              "N/A"
            }`,
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault(); // prevent full page reload
                  handleSubmit();
                }}
              >
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="nameField">Name *</label>
                    <input
                      className="form-field"
                      id="nameField"
                      name="nameField"
                      value={formData.customer_name}
                      onChange={(e) => {
                        // Only allow TELECALLER to change this field if they have permission
                        if (!isTelecaller) {
                          const customer_name = e.target.value.toUpperCase();
                          setFormData({
                            ...formData,
                            customer_name,
                          });
                        }
                      }}
                      disabled={isTelecaller}
                    />
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="contactNumber">Contact Number *</label>
                      <input
                        className="form-field"
                        id="contactNumber"
                        name="contactNumber"
                        value={formData.contact}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({ ...formData, contact: value });
                          }
                        }}
                        disabled={false}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="alternativeContact">
                        Alternative Contact Number
                      </label>
                      <input
                        className="form-field"
                        id="alternativeContact"
                        name="alternativeContact"
                        value={formData.alternative_contact}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({
                              ...formData,
                              alternative_contact: value,
                            });
                          }
                        }}
                        disabled={false}
                      />
                    </div>
                  </div>
                  <div className="form-group-row">
                    <div className="form-group">
                      <label htmlFor="supervisor_number">
                        Supervisor Number
                      </label>
                      <input
                        className="form-field"
                        id="supervisor_number"
                        name="supervisor_number"
                        value={formData.supervisor_number}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({
                              ...formData,
                              supervisor_number: value,
                            });
                          }
                        }}
                        disabled={false}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="driver_number">Driver Number</label>
                      <input
                        className="form-field"
                        id="driver_number"
                        name="driver_number"
                        value={formData.driver_number}
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow only numeric input
                          if (/^\d*$/.test(value)) {
                            setFormData({
                              ...formData,
                              driver_number: value,
                            });
                          }
                        }}
                        disabled={false}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="registrationNumber">
                      Registration Number
                    </label>
                    <input
                      className="form-field"
                      id="registrationNumber"
                      name="registrationNumber"
                      value={formData.registration_number}
                      onChange={(e) => {
                        // Only allow TELECALLER to change this field if they have permission
                        if (!isTelecaller) {
                          const registration_number =
                            e.target.value.toUpperCase();
                          setFormData({
                            ...formData,
                            registration_number,
                          });
                        }
                      }}
                      disabled={isTelecaller}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="placeOfInspection">
                      Place of Inspection
                    </label>
                    <input
                      className="form-field"
                      id="placeOfInspection"
                      name="placeOfInspection"
                      value={formData.place_of_inspection}
                      onChange={(e) => {
                        // TELECALLER is allowed to change this field
                        const place_of_inspection =
                          e.target.value.toUpperCase();
                        setFormData({
                          ...formData,
                          place_of_inspection,
                        });
                      }}
                      disabled={false}
                    />
                  </div>

                  {/* Subcategory field - Show based on permission */}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_add_edit_subcategory_filed"
                  ) && (
                    <div className="form-group">
                      <label htmlFor="Subcategory">Subcategory</label>
                      <SingleSearchSelect
                        id="Subcategory"
                        className="search-selector"
                        options={filteredChildCategories.map(
                          (childCategory) => ({
                            value: childCategory.id,
                            label: `${childCategory.name}`,
                          })
                        )}
                        value={formData.child_category_id}
                        onChange={(val) => {
                          // Only allow TELECALLER to change this field if they have permission
                          if (!isTelecaller) {
                            setFormData({
                              ...formData,
                              child_category_id: val,
                            });
                          }
                        }}
                        placeholder="Select Subcategory"
                        disabled={isTelecaller}
                      />
                    </div>
                  )}
                  {/* Officer field - Show based on permission but hidden for Bank Officers */}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_add_edit_officer_filed"
                  ) &&
                    !isBankOfficer && (
                      <div className="form-group">
                        <label htmlFor="officerField">Officer</label>
                        <SingleSearchSelect
                          id="officerField"
                          className="search-selector"
                          options={bankOfficers.map((user) => ({
                            value: user.id,
                            label: `${user.name} (${user.role_name})`,
                          }))}
                          value={formData.officer_id}
                          onChange={(val) => {
                            // Only allow TELECALLER to change this field if they have permission
                            if (!isTelecaller) {
                              setFormData({ ...formData, officer_id: val });
                            }
                          }}
                          placeholder="Select officer"
                          disabled={isTelecaller}
                        />
                      </div>
                    )}

                  {/* MANAGER field - Show based on permission but hidden for MANAGER users */}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_add_edit_manager_filed"
                  ) &&
                    !isManager && (
                      <div className="form-group">
                        <label htmlFor="managerField">Manager</label>
                        <SingleSearchSelect
                          id="managerField"
                          className="search-selector"
                          options={managers.map((user) => ({
                            value: user.id,
                            label: user.name,
                          }))}
                          value={formData.manager_id}
                          onChange={(val) => {
                            // Only allow TELECALLER to change this field if they have permission
                            if (!isTelecaller) {
                              setFormData({
                                ...formData,
                                manager_id: val,
                                // Clear field verifier when manager is removed
                                field_verifier_id: val
                                  ? formData.field_verifier_id
                                  : null,
                              });
                            }
                          }}
                          placeholder="Select manager"
                          disabled={isTelecaller}
                        />
                      </div>
                    )}

                  {/* Field Verifier - Show when manager is assigned, user is MANAGER, or user has permission to edit manager field (but not Bank Officer) */}
                  {(formData.manager_id || isManager || isSuperAdmin) &&
                    hasPermission(
                      allowedPermissions,
                      "view_order_add_edit_manager_filed"
                    ) &&
                    !isBankOfficer && (
                      <div className="form-group">
                        <label htmlFor="fieldVerifierField">
                          Field Verifier
                        </label>
                        <SingleSearchSelect
                          id="fieldVerifierField"
                          className="search-selector"
                          options={fieldVerifiers.map((verifier) => ({
                            value: verifier.id,
                            label: verifier.name,
                          }))}
                          value={formData.field_verifier_id}
                          onChange={(val) => {
                            // Only allow TELECALLER to change this field if they have permission
                            if (!isTelecaller) {
                              setFormData({
                                ...formData,
                                field_verifier_id: val,
                              });
                            }
                          }}
                          placeholder="Select field verifier"
                          disabled={isTelecaller}
                        />
                      </div>
                    )}

                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Update
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowFormModal(false);
              setIsEdit(false);
              setEditOrderId(null);

              // Reset form data (will be properly initialized when opening again)
              setFormData({
                customer_name: "",
                contact: "",
                alternative_contact: "",
                supervisor_number: "",
                driver_number: "",
                child_category_id: "",
                registration_number: "",
                place_of_inspection: "",
                officer_id: null,
                manager_id: null,
                field_verifier_id: null,
              });
            },
          }}
        </FormModel>
      )}
    </div>
  );
}

export default Dashboard;
