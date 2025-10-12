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
import { DeleteIcon, EditIcon, MoreIcon } from "../../components/icons";
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
    valuer_name: "",
    admin_user_ids: [],
  });

  // State for order type filter
  const [selectedOrderType, setSelectedOrderType] = useState("");

  // State for priority filter
  const [selectedPriority, setSelectedPriority] = useState("");

  // Check if current user is TELECALLER (case-insensitive) - matches any role containing "TELECALLER"
  const isTelecaller = currentUser?.role.name
    ?.toUpperCase()
    .includes("TELECALLER");
  /* console.log("isTelecaller", currentUser?.role.name); */

  // Check if current user is Bank Officer (case-insensitive) - matches any role containing "BANK OFFICER"
  const isBankOfficer = currentUser?.role.name
    ?.toUpperCase()
    .includes("BANK OFFICER");
  /* console.log("isBankOfficer", currentUser?.role.name); */

  // Check if current user is MANAGER (case-insensitive) - matches any role containing "MANAGER"
  const isManager = currentUser?.role.name?.toUpperCase().includes("MANAGER");
  /* console.log("isManager", currentUser?.role.name); */

  // Check if current user is Super Admin (case-insensitive) - matches any role containing "SUPER ADMIN"
  const isSuperAdmin = currentUser?.role.name
    ?.toUpperCase()
    .includes("SUPER ADMIN");
  /* console.log("isSuperAdmin", currentUser?.role.name); */

  // Filter users by role for officer and manager selection
  const bankOfficers = officers.filter(
    (officer) =>
      officer.role_name.toUpperCase().includes("BANK OFFICER") ||
      officer.role_name.toUpperCase().includes("BANK AUTHORITY")
  );

  const managers = users.filter((user) =>
    user.role_name.toUpperCase().includes("MANAGER")
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

    // Build payload based on add vs edit mode
    let payload = {};

    if (isEdit) {
      // For edit mode, only include changed fields
      const currentOrder = orders.find((order) => order.id === editOrderId);

      // Always include required fields for edit
      payload.customer_name = formData.customer_name.trim();
      payload.contact = formData.contact.trim();

      // Only include other fields if they have changed
      if (
        formData.alternative_contact !==
        (currentOrder.alternative_contact || "")
      ) {
        payload.alternative_contact =
          formData.alternative_contact.trim() || null;
      }

      if (
        formData.supervisor_number !== (currentOrder.supervisor_number || "")
      ) {
        payload.supervisor_number = formData.supervisor_number.trim() || null;
      }

      if (formData.driver_number !== (currentOrder.driver_number || "")) {
        payload.driver_number = formData.driver_number.trim() || null;
      }

      if (
        formData.child_category_id !== (currentOrder.child_category_id || "")
      ) {
        payload.child_category_id = formData.child_category_id;
      }

      if (
        formData.registration_number !==
        (currentOrder.registration_number || "")
      ) {
        payload.registration_number =
          formData.registration_number.trim() || null;
      }

      if (
        formData.place_of_inspection !==
        (currentOrder.place_of_inspection || "")
      ) {
        payload.place_of_inspection =
          formData.place_of_inspection.trim() || null;
      }
    } else {
      // For add mode, include all fields
      payload = {
        customer_name: formData.customer_name.trim(),
        contact: formData.contact.trim(),
        alternative_contact: formData.alternative_contact.trim() || null,
        supervisor_number: formData.supervisor_number.trim() || null,
        driver_number: formData.driver_number.trim() || null,
        child_category_id: formData.child_category_id,
        registration_number: formData.registration_number.trim() || null,
        place_of_inspection: formData.place_of_inspection.trim() || null,
      };
    }

    // Handle officer_id, manager_id, and field_verifier_id based on permissions and user role
    let newOfficerId = null;
    let newManagerId = null;
    let newFieldVerifierId = null;

    // Officer ID handling - Bank Officers get their own officer ID automatically
    if (isBankOfficer) {
      // For Bank Officer users, find their officer record and use the officer's ID
      const currentOfficer = officers.find(
        (officer) => officer.user_id === currentUser?.id
      );

      if (currentOfficer) {
        // Use the officer's ID, not the user's ID
        newOfficerId = currentOfficer.id;
      }
    } else if (
      hasPermission(allowedPermissions, "view_order_add_edit_officer_filed")
    ) {
      // For other users, use form data if they have permission
      newOfficerId = formData.officer_id;
    }

    // MANAGER ID handling - MANAGER users get their own user ID automatically
    if (isManager) {
      // For MANAGER users, use their own user ID as manager_id
      newManagerId = currentUser?.id;

      // Field Verifier - only include if manager is assigned (which it will be for MANAGER users)
      if (newManagerId) {
        newFieldVerifierId = formData.field_verifier_id;
      }
    } else if (
      hasPermission(allowedPermissions, "view_order_add_edit_manager_filed")
    ) {
      // For other users, use form data if they have permission
      newManagerId = formData.manager_id;

      // Field Verifier - only include if manager is assigned and user has manager permission
      if (formData.manager_id) {
        newFieldVerifierId = formData.field_verifier_id;
      }
    }

    // Field Verifier for Super Admin - can assign field verifier even without manager
    if (isSuperAdmin && formData.field_verifier_id) {
      newFieldVerifierId = formData.field_verifier_id;
    }

    // For edit mode, only include these fields if they have changed
    if (isEdit) {
      const currentOrder = orders.find((order) => order.id === editOrderId);

      if (newOfficerId !== (currentOrder.officer_id || null)) {
        payload.officer_id = newOfficerId;
      }

      if (newManagerId !== (currentOrder.manager_id || null)) {
        payload.manager_id = newManagerId;
      }

      if (newFieldVerifierId !== (currentOrder.field_verifier_id || null)) {
        payload.field_verifier_id = newFieldVerifierId;
      }
    } else {
      // For add mode, include these fields
      if (newOfficerId !== null) {
        payload.officer_id = newOfficerId;
      }
      if (newManagerId !== null) {
        payload.manager_id = newManagerId;
      }
      if (newFieldVerifierId !== null) {
        payload.field_verifier_id = newFieldVerifierId;
      }
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

    // Map assigned_users to admin_user_ids for pre-selection
    const assignedUserIds = order.assigned_users
      ? order.assigned_users.map((user) => user.id)
      : [];

    setAttributesFormData({
      order_priority: order.order_priority || "",
      order_type: order.order_type || "",
      valuer_name: order.valuer_name || "",
      admin_user_ids: assignedUserIds,
    });
    setShowAttributesModal(true);
  };

  // Handle Order Attributes Submit
  const handleAttributesSubmit = async () => {
    const canEditPriority = hasPermission(
      allowedPermissions,
      "edit_order_priority"
    );
    const canEditType = hasPermission(allowedPermissions, "edit_order_type");
    const canEditValuerName = hasPermission(
      allowedPermissions,
      "edit_valuer_name_to_order"
    );

    // Build payload with only the fields that user has permission to edit and have values
    const payload = {};

    if (canEditPriority && attributesFormData.order_priority) {
      payload.order_priority = attributesFormData.order_priority;
    }

    if (canEditType && attributesFormData.order_type) {
      payload.order_type = attributesFormData.order_type;
    }

    if (canEditValuerName && attributesFormData.valuer_name) {
      payload.valuer_name = attributesFormData.valuer_name;
    }

    // Always include user_ids array (even if empty) to handle user removal from backend
    if (Array.isArray(attributesFormData.admin_user_ids)) {
      // Always send as array - empty array to clear assignments, populated array to set assignments
      payload.user_ids = attributesFormData.admin_user_ids
        .map((id) => Number(id))
        .filter((n) => !Number.isNaN(n));
    }

    // Check if at least one field has a value that user can edit
    // Note: user_ids is always an array (empty array clears assignments), so it's always considered a valid field
    const hasValidFields = Object.keys(payload).some((key) => {
      if (key === "user_ids") {
        return true; // user_ids field is always valid (even if empty array)
      }
      return (
        payload[key] !== null &&
        payload[key] !== undefined &&
        payload[key] !== ""
      );
    });

    if (!hasValidFields) {
      const availableFields = [];
      if (canEditPriority) availableFields.push("priority");
      if (canEditType) availableFields.push("type");
      if (canEditValuerName) availableFields.push("valuer name");

      toast.error(`Please select ${availableFields.join(" or ")} to update.`);
      return;
    }

    try {
      await dispatch(
        updateOrderAttributes({ id: attributesOrderId, data: payload })
      ).unwrap();
      setShowAttributesModal(false);
      setAttributesOrderId(null);
      setAttributesFormData({
        order_priority: "",
        order_type: "",
        valuer_name: "",
        admin_user_ids: [],
      });
    } catch (err) {
      toast.error(
        typeof err === "string" ? err : "Failed to update attributes"
      );
    }
  };

  // Compute users options (show all users except specific roles)
  const adminUsersOptions = React.useMemo(() => {
    if (!Array.isArray(users)) return [];

    // Define excluded roles (case-insensitive)
    const excludedRoles = [
      "DEVELOPER_ADMIN",
      "SUPER ADMIN",
      "MANAGER",
      "TELECALLER",
      "BANK AUTHORITY",
      "BANK OFFICER",
    ];

    return users
      .filter((u) => {
        const roleName = String(u.role_name || "").toUpperCase();

        // Check if role includes any excluded role (case-insensitive, space-agnostic)
        const isExcluded = excludedRoles.some((excludedRole) => {
          // Remove spaces and normalize both role names for comparison
          const normalizedRoleName = roleName.replace(/\s+/g, "");
          const normalizedExcludedRole = excludedRole.replace(/\s+/g, "");
          return normalizedRoleName.includes(normalizedExcludedRole);
        });

        return !isExcluded;
      })
      .map((u) => ({ value: u.id, label: `${u.name} (${u.role_name})` }));
  }, [users]);
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
                {hasPermission(
                  allowedPermissions,
                  "view_order_type_filter"
                ) && (
                  <select
                    className="form-field type-priority-selector"
                    value={selectedOrderType}
                    onChange={(e) => setSelectedOrderType(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="VKA1">VKA1</option>
                    <option value="VKA2">VKA2</option>
                    <option value="VKA3">VKA3</option>
                  </select>
                )}
                {hasPermission(
                  allowedPermissions,
                  "view_order_priority_filter"
                ) && (
                  <select
                    className="form-field type-priority-selector"
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                  >
                    <option value="">All Priorities</option>
                    <option value="High">High</option>
                    <option value="Average">Average</option>
                    <option value="Low">Low</option>
                  </select>
                )}
                {hasPermission(allowedPermissions, "add_order") && (
                  <button className="btn" onClick={openAddModal}>
                    Add Order
                  </button>
                )}
              </div>
            ),
            header: (
              <tr>
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_order_number"
                ) && <th style={{ width: "150px" }}>Order Number</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_category"
                ) && <th style={{ width: "150px" }}>Category</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_asset_category"
                ) && <th style={{ width: "150px" }}>Asset Category</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_sub_category"
                ) && <th style={{ width: "150px" }}>Subcategory</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_manager"
                ) && <th style={{ width: "150px" }}>Manager</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_field_verifier"
                ) && <th style={{ width: "150px" }}>Field Verifier</th>}
                {hasPermission(allowedPermissions, "view_order_table_Bank") && (
                  <th style={{ width: "150px" }}>Bank</th>
                )}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_Bank_Branch"
                ) && <th style={{ width: "150px" }}>Branch</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_Branch_Officer"
                ) && <th style={{ width: "150px" }}>Officer</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_registration_number"
                ) && <th style={{ width: "200px" }}>Registration Number</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_created_by"
                ) && <th style={{ width: "120px" }}>Created By</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_updated_by"
                ) && <th>Updated By</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_priority"
                ) && <th style={{ width: "120px" }}>Priority</th>}
                {hasPermission(allowedPermissions, "view_order_table_type") && (
                  <th style={{ width: "120px" }}>Type</th>
                )}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_valuer_name"
                ) && <th style={{ width: "120px" }}>Valuer Name</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_status"
                ) && <th style={{ width: "175px" }}>Status</th>}
                {hasPermission(
                  allowedPermissions,
                  "view_order_table_action"
                ) && (
                  <th style={{ textAlign: "center", width: "200px" }}>
                    Action
                  </th>
                )}
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
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_order_number"
                  ) && (
                    <td
                      className={
                        hasPermission(allowedPermissions, "view_order_details")
                          ? "get-me-inside"
                          : ""
                      }
                    >
                      {order.order_number}
                    </td>
                  )}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_category"
                  ) && <td>{order.category_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_asset_category"
                  ) && <td>{order.sub_category_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_sub_category"
                  ) && <td>{order.child_category_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_manager"
                  ) && <td>{order.manager_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_field_verifier"
                  ) && <td>{order.field_verifier_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_Bank"
                  ) && <td>{order.bank_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_Bank_Branch"
                  ) && <td>{order.branch_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_Branch_Officer"
                  ) && <td>{order.officer_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_registration_number"
                  ) && <td>{order.registration_number || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_created_by"
                  ) && <td>{order.created_by}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_updated_by"
                  ) && <td>{order.updated_by || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_priority"
                  ) && (
                    <td>
                      <span
                        className={`priority-badge priority-${
                          order.order_priority?.toLowerCase() || "none"
                        }`}
                      >
                        {order.order_priority || "-"}
                      </span>
                    </td>
                  )}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_type"
                  ) && <td>{order.order_type || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_valuer_name"
                  ) && <td>{order.valuer_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_status"
                  ) && (
                    <td>
                      <p className="status-state order-state">
                        {order.current_status_name}
                      </p>
                    </td>
                  )}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_action"
                  ) && (
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
                      {(hasPermission(
                        allowedPermissions,
                        "edit_order_priority"
                      ) ||
                        hasPermission(allowedPermissions, "edit_order_type") ||
                        hasPermission(
                          allowedPermissions,
                          "edit_valuer_name_to_order"
                        )) && (
                        <button
                          className="action-icons"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAttributesModal(order);
                          }}
                        >
                          <MoreIcon />
                        </button>
                      )}
                    </td>
                  )}
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
                    !isBankOfficer &&
                    (isManager ||
                      hasPermission(
                        allowedPermissions,
                        "view_order_add_edit_manager_filed"
                      )) && (
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
                  {hasPermission(allowedPermissions, "edit_order_priority") && (
                    <div className="form-group order-priority-radio-group">
                      <label>Order Priority</label>
                      <div className="radio-group three-items">
                        {["Low", "Average", "High"].map((priority) => (
                          <label
                            key={priority}
                            className={`radio-label ${priority.toLowerCase()} ${
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
                  )}

                  {hasPermission(allowedPermissions, "edit_order_type") && (
                    <div className="form-group">
                      <label>Order Type</label>
                      <div className="radio-group three-items">
                        {["VKA1", "VKA2", "VKA3"].map((type) => (
                          <label
                            key={type}
                            className={`radio-label ${
                              attributesFormData.order_type === type
                                ? "selected"
                                : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="order_type"
                              value={type}
                              checked={attributesFormData.order_type === type}
                              onChange={(e) =>
                                setAttributesFormData({
                                  ...attributesFormData,
                                  order_type: e.target.value,
                                })
                              }
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasPermission(
                    allowedPermissions,
                    "edit_valuer_name_to_order"
                  ) && (
                    <div className="form-group">
                      <label>Valuer Name</label>
                      <SingleSearchSelect
                        className="search-selector"
                        options={[
                          {
                            value: "V.K. ASSOCIATES",
                            label: "V.K. ASSOCIATES",
                          },
                          {
                            value: "VALUETECH SOLUTIONS",
                            label: "VALUETECH SOLUTIONS",
                          },
                          {
                            value: "VISHAL D. KOTHARI",
                            label: "VISHAL D. KOTHARI",
                          },
                        ]}
                        value={attributesFormData.valuer_name}
                        onChange={(value) =>
                          setAttributesFormData({
                            ...attributesFormData,
                            valuer_name: value,
                          })
                        }
                        placeholder="Select valuer name"
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Users assigned</label>
                    <SingleSearchSelect
                      className="search-selector"
                      options={adminUsersOptions}
                      value={attributesFormData.admin_user_ids}
                      onChange={(values) =>
                        setAttributesFormData({
                          ...attributesFormData,
                          admin_user_ids: values || [],
                        })
                      }
                      placeholder="Select users..."
                      isMulti={true}
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
                valuer_name: "",
                admin_user_ids: [],
              });
            },
          }}
        </FormModel>
      )}
    </div>
  );
}

export default Orders;
