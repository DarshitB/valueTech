import React, { useEffect, useState } from "react";
import "./order.scss";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchOrders,
  addOrder,
  editOrder,
  removeOrder,
  updateOrderAttributes,
} from "../../redux/reducers/orderReducer";
import { fetchUsers } from "../../redux/reducers/userReducer";
import { fetchOfficers } from "../../redux/reducers/officerReducer";
import {
  fetchChildCategories,
  fetchChildCategoriesByCategoryName,
} from "../../redux/reducers/childCategoryReducer";
import { fetchFieldVerifiers } from "../../redux/reducers/fieldVerifierReducer";
import CustomDataTable from "../../components/CustomDataTable";
import { DeleteIcon, EditIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";

function Orders() {
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

  // console.log("officers", officers);
  /* console.log("orders", orders); */
  // Fetch everything on mount
  useEffect(() => {
    dispatch(fetchOrders());
    dispatch(fetchOfficers());
    dispatch(fetchUsers());
    dispatch(fetchChildCategories());
    dispatch(fetchFieldVerifiers());
  }, [dispatch]);
  /* console.log("allChildCategories", allChildCategories); */
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

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // State for filtered child categories for Bank Officers
  const [filteredChildCategories, setFilteredChildCategories] = useState([]);

  // State for order attributes modal
  const [showAttributesModal, setShowAttributesModal] = useState(false);
  const [attributesOrderId, setAttributesOrderId] = useState(null);
  const [attributesFormData, setAttributesFormData] = useState({
    order_priority: "",
    order_type: "",
  });

  // State for order type filter
  const [selectedOrderType, setSelectedOrderType] = useState("");

  // State for priority filter
  const [selectedPriority, setSelectedPriority] = useState("");

  // Check if current user is TELECALLER (case-insensitive) - matches any role containing "TELECALLER"
  const isTelecaller = currentUser?.role.name?.toUpperCase().includes("TELECALLER");
  /* console.log("isTelecaller", currentUser?.role.name); */

  // Check if current user is Bank Officer (case-insensitive)
  const isBankOfficer =
    currentUser?.role.name?.toUpperCase() === "BANK OFFICER";
  /* console.log("isBankOfficer", currentUser?.role.name); */

  // Check if current user is MANAGER (case-insensitive)
  const isManager = currentUser?.role.name?.toUpperCase() === "MANAGER";
  /* console.log("isManager", currentUser?.role.name); */

  // Check if current user is Super Admin (case-insensitive)
  const isSuperAdmin = currentUser?.role.name?.toUpperCase() === "SUPER ADMIN";
  /* console.log("isSuperAdmin", currentUser?.role.name); */

  // Filter users by role for officer and manager selection
  const bankOfficers = officers.filter(
    (officer) =>
      officer.role_name.toUpperCase() === "BANK OFFICER" ||
      officer.role_name.toUpperCase() === "BANK AUTHORITY"
  );

  const managers = users.filter(
    (user) => user.role_name.toUpperCase() === "MANAGER"
  );

  // Fields allowed for TELECALLER role
  const telecallerAllowedFields = [
    "contact",
    "alternative_contact",
    "supervisor_number",
    "driver_number",
    "place_of_inspection",
  ];
  // console.log("isBankOfficer", isBankOfficer);
  // console.log("currentUser", currentUser);
  // console.log("departments", currentUser?.departments);
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

      // console.log("currentOfficer", currentOfficer);

      if (
        currentOfficer?.departments &&
        currentOfficer.departments.length > 0
      ) {
        // Extract department names and create comma-separated string
        const categoryNames = currentOfficer.departments
          .map((dept) => dept.name)
          .join(",");

        // console.log("categoryNames", categoryNames);

        // Fetch child categories based on department names
        dispatch(fetchChildCategoriesByCategoryName({ categoryNames }))
          .unwrap()
          .then((data) => {
            // console.log("data", data);
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

  // Open Add Order Form
  const openAddModal = () => {
    setIsEdit(false);

    // Find PAN INDIA manager (case-insensitive) for pre-selection
    const panIndiaManager = managers.find(
      (manager) => manager.name?.toUpperCase() === "PAN INDIA"
    );

    /* console.log("PAN INDIA MANAGER found:", panIndiaManager); */

    // Pre-select PAN INDIA manager if user has access to manager field and manager exists
    const preSelectedManagerId =
      hasPermission(allowedPermissions, "view_order_add_edit_manager_filed") &&
      !isManager &&
      panIndiaManager
        ? panIndiaManager.id
        : null;

    /* console.log("Pre-selected MANAGER ID:", preSelectedManagerId); */

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
      manager_id: preSelectedManagerId,
      field_verifier_id: null,
    });
    setShowFormModal(true);
  };

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

  // Submit Add/Edit
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

    // No validation needed - field verifier is optional

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

    if (isEdit) {
      dispatch(editOrder({ id: editOrderId, data: payload }));
    } else {
      dispatch(addOrder(payload));
    }

    // Close modal after submit
    setShowFormModal(false);
  };

  // Confirm delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeOrder(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  // Open Order Attributes Modal
  const openAttributesModal = (order) => {
    setAttributesOrderId(order.id);
    setAttributesFormData({
      order_priority: order.order_priority || "",
      order_type: order.order_type || "",
    });
    setShowAttributesModal(true);
  };

  // Handle Order Attributes Submit
  const handleAttributesSubmit = async () => {
    // Check if at least one field has a value
    if (!attributesFormData.order_priority && !attributesFormData.order_type) {
      toast.error("Please select at least one attribute to update.");
      return;
    }

    // Build payload with only the fields that have values
    const payload = {};
    if (attributesFormData.order_priority) {
      payload.order_priority = attributesFormData.order_priority;
    }
    if (attributesFormData.order_type) {
      payload.order_type = attributesFormData.order_type;
    }

    try {
      await dispatch(
        updateOrderAttributes({ id: attributesOrderId, data: payload })
      ).unwrap();
      // Refetch orders to get updated data from server
      dispatch(fetchOrders());
      setShowAttributesModal(false);
    } catch (error) {
      // Error is already handled by the reducer
      console.error("Failed to update order attributes:", error);
    }
  };
  return (
    <div className="height-full-occupied order-data-container">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <CustomDataTable>
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
                {hasPermission(allowedPermissions, "add_order") && (
                  <button className="btn" onClick={openAddModal}>
                    Add Order
                  </button>
                )}
              </div>
            ),
            header: (
              <tr>
                <th style={{ width: "150px" }}>Order Number</th>
                <th style={{ width: "150px" }}>Officer</th>
                <th style={{ width: "200px" }}>Registration Number</th>
                <th style={{ width: "120px" }}>Bank</th>
                <th style={{ width: "120px" }}>Created By</th>
                <th>Updated By</th>
                <th style={{ width: "120px" }}>Type</th>
                <th style={{ width: "120px" }}>Priority</th>
                <th style={{ width: "175px" }}>Status</th>
                <th style={{ textAlign: "center", width: "200px" }}>Action</th>
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
              .map((order) => (
                <tr
                  key={order.id}
                  className={
                    hasPermission(allowedPermissions, "view_order_details")
                      ? "clickable-row"
                      : ""
                  }
                  onClick={() => {
                    if (
                      hasPermission(allowedPermissions, "view_order_details")
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
                      hasPermission(allowedPermissions, "view_order_details")
                        ? "get-me-inside"
                        : ""
                    }
                  >
                    {order.order_number}
                  </td>
                  <td>{order.officer_name || "-"}</td>
                  <td>{order.registration_number || "-"}</td>
                  <td>{order.bank_name || "-"}</td>

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
                    {hasPermission(allowedPermissions, "edit_order") && (
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
                    {hasPermission(allowedPermissions, "delete_order") && (
                      <button
                        className="action-icons"
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(order.id, order.customer_name);
                        }}
                      >
                        <DeleteIcon />
                      </button>
                    )}
                    {hasPermission(
                      allowedPermissions,
                      "edit_order_priority_and_type"
                    ) && (
                      <button
                        className="action-icons"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAttributesModal(order);
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

      {/* 👤 Form Modal (Add/Edit) */}
      {showFormModal && (
        <FormModel>
          {{
            title: isEdit ? "Edit Order" : "Add Order",
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
                      {isEdit ? "Update" : "Add"}
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

      {/* ❗ Delete Confirm Modal */}
      {confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete <span class="danger">${confirmDeleteName}</span>?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {/* 📝 Order Attributes Modal */}
      {showAttributesModal && (
        <FormModel>
          {{
            title: "Update Order Attributes",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault(); // prevent full page reload
                  handleAttributesSubmit();
                }}
              >
                <div className="body-form-box">
                  <div className="form-group">
                    <label>Order Priority</label>
                    <div className="radio-group">
                      {["High", "Medium", "Low"].map((priority) => (
                        <label
                          key={priority}
                          className={`radio-label ${
                            attributesFormData.order_priority === priority
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="order_priority"
                            value={priority}
                            checked={
                              attributesFormData.order_priority === priority
                            }
                            onChange={(e) =>
                              setAttributesFormData({
                                ...attributesFormData,
                                order_priority: e.target.value,
                              })
                            }
                          />
                          {priority}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="orderType">Order Type</label>
                    <SingleSearchSelect
                      id="orderType"
                      className="search-selector"
                      options={[
                        { value: "VKA1", label: "VKA1" },
                        { value: "VKA2", label: "VKA2" },
                      ]}
                      value={attributesFormData.order_type}
                      onChange={(val) =>
                        setAttributesFormData({
                          ...attributesFormData,
                          order_type: val,
                        })
                      }
                      placeholder="Select Type"
                    />
                  </div>
                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Update Attributes
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowAttributesModal(false);
              setAttributesOrderId(null);
              setAttributesFormData({
                order_priority: "",
                order_type: "",
              });
            },
          }}
        </FormModel>
      )}
    </div>
  );
}

export default Orders;
