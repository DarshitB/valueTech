import React, { useEffect, useState, useMemo } from "react";
import "./order.scss";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchOrdersWithWoStatus,
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
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

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
  /*   console.log("orders", orders); */
  // Fetch everything on mount - always fetch WO status orders (status 13 and 14) when component mounts
  // This ensures we get the correct data even if Dashboard's orders are in the store
  useEffect(() => {
    // Always fetch WO status orders when Orders component mounts
    dispatch(fetchOrdersWithWoStatus());

    // Only fetch other data if not already loaded
    if (!officers || officers.length === 0) {
      dispatch(fetchOfficers());
    }
    if (!users || users.length === 0) {
      dispatch(fetchUsers());
    }
    if (!allChildCategories || allChildCategories.length === 0) {
      dispatch(fetchChildCategories());
    }
    if (!fieldVerifiers || fieldVerifiers.length === 0) {
      dispatch(fetchFieldVerifiers());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]); // Only run on mount
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
    created_at: null,
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // Accordion state for Advanced Filters
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);

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

  // Check if user has any filter permission
  const hasAnyFilterPermission = React.useMemo(() => {
    const filterPermissions = [
      "view_order_type_filter",
      "view_order_priority_filter",
      "view_status_filter",
      "view_bank_filter",
      "view_bank_branch_filter",
      "view_asset_category_filter",
      "view_sub_category_filter",
      "view_manager_filter",
      "view_branch_officer_filter",
      "view_field_verifier_filter",
      "view_valuer_name_filter",
      "view_payment_status_filter",
      "view_category_filter",
      "view_date_filter",
      "view_created_by_filter",
      "view_user_assigned_filter",
    ];
    return filterPermissions.some((permission) =>
      hasPermission(allowedPermissions, permission)
    );
  }, [allowedPermissions]);

  // State for order type filter - load from localStorage (shared with Dashboard)
  const [selectedOrderType, setSelectedOrderType] = useState(() => {
    const saved = localStorage.getItem("filter_orders_orderType");
    return saved || "";
  });

  // State for priority filter - load from localStorage (shared with Dashboard)
  const [selectedPriority, setSelectedPriority] = useState(() => {
    const saved = localStorage.getItem("filter_orders_priority");
    return saved || "";
  });

  // State for additional filters - load from localStorage (shared with Dashboard)
  const [selectedBank, setSelectedBank] = useState(() => {
    const saved = localStorage.getItem("filter_orders_bank");
    return saved || "";
  });

  const [selectedBranch, setSelectedBranch] = useState(() => {
    const saved = localStorage.getItem("filter_orders_branch");
    return saved || "";
  });

  const [selectedOfficer, setSelectedOfficer] = useState(() => {
    const saved = localStorage.getItem("filter_orders_officer");
    return saved || "";
  });

  const [selectedManager, setSelectedManager] = useState(() => {
    const saved = localStorage.getItem("filter_orders_manager");
    return saved || "";
  });

  const [selectedFieldVerifier, setSelectedFieldVerifier] = useState(() => {
    const saved = localStorage.getItem("filter_orders_fieldVerifier");
    return saved || "";
  });

  const [selectedValuerName, setSelectedValuerName] = useState(() => {
    const saved = localStorage.getItem("filter_orders_valuerName");
    return saved || "";
  });

  const [selectedOrderStatus, setSelectedOrderStatus] = useState(() => {
    const saved = localStorage.getItem("filter_orders_orderStatus");
    return saved || "";
  });

  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState(() => {
    const saved = localStorage.getItem("filter_orders_paymentStatus");
    return saved || "";
  });

  const [selectedCategory, setSelectedCategory] = useState(() => {
    const saved = localStorage.getItem("filter_orders_category");
    return saved || "";
  });

  const [selectedAssetCategory, setSelectedAssetCategory] = useState(() => {
    const saved = localStorage.getItem("filter_orders_assetCategory");
    return saved || "";
  });

  const [selectedSubCategory, setSelectedSubCategory] = useState(() => {
    const saved = localStorage.getItem("filter_orders_subCategory");
    return saved || "";
  });

  const [selectedCreatedBy, setSelectedCreatedBy] = useState(() => {
    const saved = localStorage.getItem("filter_orders_createdBy");
    return saved || "";
  });

  const [selectedUserAssigned, setSelectedUserAssigned] = useState(() => {
    const saved = localStorage.getItem("filter_orders_userAssigned");
    return saved || "";
  });

  // State for date filter
  const [selectedDatePreset, setSelectedDatePreset] = useState(() => {
    const saved = localStorage.getItem("filter_orders_datePreset");
    return saved || "";
  });

  const [selectedDateRange, setSelectedDateRange] = useState(() => {
    const savedStart = localStorage.getItem("filter_orders_dateRangeStart");
    const savedEnd = localStorage.getItem("filter_orders_dateRangeEnd");
    return {
      start: savedStart ? new Date(savedStart) : null,
      end: savedEnd ? new Date(savedEnd) : null,
    };
  });

  // Get distinct filter values from orders
  const distinctBanks = useMemo(() => {
    const banks = orders
      .map((order) => order.bank_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(banks)].sort();
  }, [orders]);

  const distinctBranches = useMemo(() => {
    const branches = orders
      .map((order) => order.branch_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(branches)].sort();
  }, [orders]);

  const distinctOfficers = useMemo(() => {
    const officers = orders
      .map((order) => order.officer_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(officers)].sort();
  }, [orders]);

  const distinctManagers = useMemo(() => {
    const managers = orders
      .map((order) => order.manager_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(managers)].sort();
  }, [orders]);

  const distinctFieldVerifiers = useMemo(() => {
    const fieldVerifiers = orders
      .map((order) => order.field_verifier_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(fieldVerifiers)].sort();
  }, [orders]);

  const distinctValuerNames = useMemo(() => {
    const valuerNames = orders
      .map((order) => order.valuer_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(valuerNames)].sort();
  }, [orders]);

  const distinctOrderStatuses = useMemo(() => {
    const statuses = orders
      .map((order) => order.current_status_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(statuses)].sort();
  }, [orders]);

  const distinctPaymentStatuses = useMemo(() => {
    const paymentStatuses = orders
      .map((order) => order.payment_status)
      .filter((status) => status && status.trim() !== "");
    return [...new Set(paymentStatuses)].sort();
  }, [orders]);

  const distinctCategories = useMemo(() => {
    const categories = orders
      .map((order) => order.category_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(categories)].sort();
  }, [orders]);

  const distinctAssetCategories = useMemo(() => {
    const assetCategories = orders
      .map((order) => order.sub_category_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(assetCategories)].sort();
  }, [orders]);

  const distinctSubCategories = useMemo(() => {
    const subCategories = orders
      .map((order) => order.child_category_name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(subCategories)].sort();
  }, [orders]);

  const distinctCreatedBy = useMemo(() => {
    const createdByValues = orders
      .map((order) => order.created_by)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(createdByValues)].sort();
  }, [orders]);

  const distinctUserAssigned = useMemo(() => {
    const assignedUserNames = orders
      .flatMap((order) => order.assigned_users || [])
      .map((user) => user.name)
      .filter((name) => name && name.trim() !== "");
    return [...new Set(assignedUserNames)].sort();
  }, [orders]);

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
      created_at: null,
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
      created_at: order.created_at ? new Date(order.created_at) : null,
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

      // Add created_at only if user has permission and value is set and changed
      if (hasPermission(allowedPermissions, "edit_order_created_at") && formData.created_at) {
        const currentCreatedAt = currentOrder.created_at ? new Date(currentOrder.created_at) : null;
        const newCreatedAt = formData.created_at;
        
        // Only add if changed
        if (!currentCreatedAt || currentCreatedAt.getTime() !== newCreatedAt.getTime()) {
          payload.created_at = newCreatedAt.toISOString();
        }
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

      // Add created_at only if user has permission and value is set
      if (hasPermission(allowedPermissions, "add_order_created_at") && formData.created_at) {
        payload.created_at = formData.created_at.toISOString();
      }
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
    const canAssignUsers = hasPermission(
      allowedPermissions,
      "assign_user_to_order"
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

    // Include user_ids array only if user has permission (even if empty) to handle user removal from backend
    if (canAssignUsers && Array.isArray(attributesFormData.admin_user_ids)) {
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

  // Function to clear all filters
  const handleClearFilters = () => {
    setSelectedOrderType("");
    setSelectedPriority("");
    setSelectedBank("");
    setSelectedBranch("");
    setSelectedOfficer("");
    setSelectedManager("");
    setSelectedFieldVerifier("");
    setSelectedValuerName("");
    setSelectedOrderStatus("");
    setSelectedPaymentStatus("");
    setSelectedCategory("");
    setSelectedAssetCategory("");
    setSelectedSubCategory("");
    setSelectedCreatedBy("");
    setSelectedUserAssigned("");
    setSelectedDatePreset("");
    setSelectedDateRange({ start: null, end: null });

    // Clear from localStorage
    localStorage.removeItem("filter_orders_orderType");
    localStorage.removeItem("filter_orders_priority");
    localStorage.removeItem("filter_orders_bank");
    localStorage.removeItem("filter_orders_branch");
    localStorage.removeItem("filter_orders_officer");
    localStorage.removeItem("filter_orders_manager");
    localStorage.removeItem("filter_orders_fieldVerifier");
    localStorage.removeItem("filter_orders_valuerName");
    localStorage.removeItem("filter_orders_orderStatus");
    localStorage.removeItem("filter_orders_paymentStatus");
    localStorage.removeItem("filter_orders_category");
    localStorage.removeItem("filter_orders_assetCategory");
    localStorage.removeItem("filter_orders_subCategory");
    localStorage.removeItem("filter_orders_createdBy");
    localStorage.removeItem("filter_orders_userAssigned");
    localStorage.removeItem("filter_orders_datePreset");
    localStorage.removeItem("filter_orders_dateRangeStart");
    localStorage.removeItem("filter_orders_dateRangeEnd");
  };

  // Helper function to get date range based on preset
  const getDateRangeFromPreset = (preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    switch (preset) {
      case "today":
        return { start: today, end: endDate };
      case "thisWeek": {
        const startOfWeek = new Date(today);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday
        startOfWeek.setDate(diff);
        return { start: startOfWeek, end: endDate };
      }
      case "thisMonth": {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: startOfMonth, end: endDate };
      }
      default:
        return null;
    }
  };

  // Check if order date matches filter
  const matchesDateFilter = (order) => {
    if (
      !selectedDatePreset &&
      !selectedDateRange.start &&
      !selectedDateRange.end
    ) {
      return true;
    }

    if (!order.created_at) return false;

    const orderDate = new Date(order.created_at);
    orderDate.setHours(0, 0, 0, 0);

    // Check preset first (but not "fromTo" which uses date range)
    if (selectedDatePreset && selectedDatePreset !== "fromTo") {
      const range = getDateRangeFromPreset(selectedDatePreset);
      if (range) {
        return orderDate >= range.start && orderDate <= range.end;
      }
    }

    // Check date range (for "fromTo" preset or manual date range)
    if (
      selectedDatePreset === "fromTo" ||
      selectedDateRange.start ||
      selectedDateRange.end
    ) {
      const startDate = selectedDateRange.start
        ? new Date(selectedDateRange.start)
        : null;
      const endDate = selectedDateRange.end
        ? new Date(selectedDateRange.end)
        : null;

      if (startDate) startDate.setHours(0, 0, 0, 0);
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      if (startDate && endDate) {
        return orderDate >= startDate && orderDate <= endDate;
      } else if (startDate) {
        return orderDate >= startDate;
      } else if (endDate) {
        return orderDate <= endDate;
      }
    }

    return true;
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 10;
    const endYear = currentYear + 10;
    const years = [];
    for (let y = startYear; y <= endYear; y += 1) {
      years.push(y);
    }
    return years;
  }, []);

  const renderDatePickerHeader = ({
    date,
    changeYear,
    changeMonth,
    decreaseMonth,
    increaseMonth,
  }) => (
    <div className="dp-header">
      <button
        type="button"
        className="dp-nav dp-prev"
        onClick={decreaseMonth}
        aria-label="Previous Month"
      >
        ‹
      </button>
      <div className="dp-month-year">
        <select
          value={date.getFullYear()}
          onChange={(e) => changeYear(Number(e.target.value))}
          aria-label="Select year"
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={date.getMonth()}
          onChange={(e) => changeMonth(Number(e.target.value))}
          aria-label="Select month"
        >
          {monthNames.map((month, idx) => (
            <option key={month} value={idx}>
              {month}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="dp-nav dp-next"
        onClick={increaseMonth}
        aria-label="Next Month"
      >
        ›
      </button>
    </div>
  );

  // Memoize filtered orders to avoid recalculating on every render
  const filteredOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    return orders.filter((order) => {
      // Filter by order type if selected
      const typeMatch =
        !selectedOrderType || order.order_type === selectedOrderType;

      // Filter by priority if selected
      const priorityMatch =
        !selectedPriority || order.order_priority === selectedPriority;

      // Filter by bank if selected
      const bankMatch = !selectedBank || order.bank_name === selectedBank;

      // Filter by branch if selected
      const branchMatch =
        !selectedBranch || order.branch_name === selectedBranch;

      // Filter by officer if selected
      const officerMatch =
        !selectedOfficer || order.officer_name === selectedOfficer;

      // Filter by manager if selected
      const managerMatch =
        !selectedManager || order.manager_name === selectedManager;

      // Filter by field verifier if selected
      const fieldVerifierMatch =
        !selectedFieldVerifier ||
        order.field_verifier_name === selectedFieldVerifier;

      // Filter by valuer name if selected
      const valuerMatch =
        !selectedValuerName || order.valuer_name === selectedValuerName;

      // Filter by order status if selected
      const statusMatch =
        !selectedOrderStatus ||
        order.current_status_name === selectedOrderStatus;

      // Filter by payment status if selected
      const paymentStatusMatch =
        !selectedPaymentStatus ||
        order.payment_status === selectedPaymentStatus;

      // Filter by category if selected
      const categoryMatch =
        !selectedCategory || order.category_name === selectedCategory;

      // Filter by asset category if selected
      const assetCategoryMatch =
        !selectedAssetCategory ||
        order.sub_category_name === selectedAssetCategory;

      // Filter by sub category if selected
      const subCategoryMatch =
        !selectedSubCategory ||
        order.child_category_name === selectedSubCategory;

      // Filter by created by if selected
      const createdByMatch =
        !selectedCreatedBy || order.created_by === selectedCreatedBy;

      // Filter by user assigned if selected
      const userAssignedMatch =
        !selectedUserAssigned ||
        (order.assigned_users &&
          order.assigned_users.some((user) => user.name === selectedUserAssigned));

      // Filter by date if selected
      const dateMatch = matchesDateFilter(order);

      // Show order only if all filters match (or no filter is selected)
      return (
        typeMatch &&
        priorityMatch &&
        categoryMatch &&
        assetCategoryMatch &&
        subCategoryMatch &&
        createdByMatch &&
        userAssignedMatch &&
        bankMatch &&
        branchMatch &&
        officerMatch &&
        managerMatch &&
        fieldVerifierMatch &&
        valuerMatch &&
        statusMatch &&
        paymentStatusMatch &&
        dateMatch
      );
    });
  }, [
    orders,
    selectedOrderType,
    selectedPriority,
    selectedBank,
    selectedBranch,
    selectedOfficer,
    selectedManager,
    selectedFieldVerifier,
    selectedValuerName,
    selectedOrderStatus,
    selectedPaymentStatus,
    selectedCategory,
    selectedAssetCategory,
    selectedSubCategory,
    selectedCreatedBy,
    selectedUserAssigned,
    selectedDatePreset,
    selectedDateRange,
  ]);

  // Memoize reversed orders (only reverse after filtering)
  const reversedFilteredOrders = useMemo(() => {
    return [...filteredOrders].reverse();
  }, [filteredOrders]);

  // Check if any filter is set
  const hasActiveFilters = useMemo(() => {
    return (
      selectedOrderType !== "" ||
      selectedPriority !== "" ||
      selectedBank !== "" ||
      selectedBranch !== "" ||
      selectedOfficer !== "" ||
      selectedManager !== "" ||
      selectedFieldVerifier !== "" ||
      selectedValuerName !== "" ||
      selectedOrderStatus !== "" ||
      selectedPaymentStatus !== "" ||
      selectedCategory !== "" ||
      selectedAssetCategory !== "" ||
      selectedSubCategory !== "" ||
      selectedCreatedBy !== "" ||
      selectedUserAssigned !== "" ||
      selectedDatePreset !== "" ||
      selectedDateRange.start !== null ||
      selectedDateRange.end !== null
    );
  }, [
    selectedOrderType,
    selectedPriority,
    selectedBank,
    selectedBranch,
    selectedOfficer,
    selectedManager,
    selectedFieldVerifier,
    selectedValuerName,
    selectedOrderStatus,
    selectedPaymentStatus,
    selectedCategory,
    selectedAssetCategory,
    selectedSubCategory,
    selectedCreatedBy,
    selectedUserAssigned,
    selectedDatePreset,
    selectedDateRange,
  ]);

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

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "-";

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-";

      return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch (error) {
      console.warn("Date formatting error:", error);
      return "-";
    }
  };
  return (
    <div className="height-full-occupied order-data-container">
      {/* Filter Container - Outside dataTable-container */}
      {hasAnyFilterPermission && (
        <div className="filter-container-card">
          {/* Top Row Filters */}
          <div className="filter-row">
            {hasPermission(allowedPermissions, "view_order_type_filter") && (
              <SingleSearchSelect
                className="search-selector"
                options={[
                  { value: "", label: "All Types" },
                  { value: "VKA1", label: "VKA1" },
                  { value: "VKA2", label: "VKA2" },
                  { value: "VKA3", label: "VKA3" },
                ]}
                value={selectedOrderType || null}
                onChange={(value) => {
                  const val = value || "";
                  setSelectedOrderType(val);
                  localStorage.setItem("filter_orders_orderType", val);
                }}
                placeholder="All Types"
              />
            )}
            {hasPermission(
              allowedPermissions,
              "view_order_priority_filter"
            ) && (
              <SingleSearchSelect
                className="search-selector"
                options={[
                  { value: "", label: "All Priorities" },
                  { value: "High", label: "High" },
                  { value: "Low", label: "Low" },
                ]}
                value={selectedPriority || null}
                onChange={(value) => {
                  const val = value || "";
                  setSelectedPriority(val);
                  localStorage.setItem("filter_orders_priority", val);
                }}
                placeholder="All Priorities"
              />
            )}
            {hasPermission(allowedPermissions, "view_status_filter") && (
              <SingleSearchSelect
                className="search-selector"
                options={[
                  { value: "", label: "All Status" },
                  ...distinctOrderStatuses.map((status) => ({
                    value: status,
                    label: status,
                  })),
                ]}
                value={selectedOrderStatus || null}
                onChange={(value) => {
                  const val = value || "";
                  setSelectedOrderStatus(val);
                  localStorage.setItem("filter_orders_orderStatus", val);
                }}
                placeholder="All Status"
              />
            )}
            {hasPermission(allowedPermissions, "view_date_filter") && (
              <>
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "Date Preset" },
                    { value: "today", label: "Today" },
                    { value: "thisWeek", label: "This Week" },
                    { value: "thisMonth", label: "This Month" },
                    { value: "fromTo", label: "From-To Date" },
                  ]}
                  value={selectedDatePreset || null}
                  onChange={(value) => {
                    const val = value || "";
                    const previousValue = selectedDatePreset;
                    setSelectedDatePreset(val);
                    localStorage.setItem("filter_orders_datePreset", val);
                    // Clear date range when changing from "fromTo" to another preset or empty
                    if (previousValue === "fromTo" && val !== "fromTo") {
                      setSelectedDateRange({ start: null, end: null });
                      localStorage.removeItem("filter_orders_dateRangeStart");
                      localStorage.removeItem("filter_orders_dateRangeEnd");
                    }
                    // Clear date range when preset is selected (except for fromTo)
                    if (val && val !== "fromTo") {
                      setSelectedDateRange({ start: null, end: null });
                      localStorage.removeItem("filter_orders_dateRangeStart");
                      localStorage.removeItem("filter_orders_dateRangeEnd");
                    }
                  }}
                  placeholder="Date Preset"
                />
                {selectedDatePreset === "fromTo" && (
                  <>
                    <div className="date-picker-wrapper">
                      <DatePicker
                        selected={selectedDateRange.start}
                        onChange={(date) => {
                          setSelectedDateRange((prev) => ({
                            ...prev,
                            start: date,
                          }));
                          if (date) {
                            localStorage.setItem(
                              "filter_orders_dateRangeStart",
                              date.toISOString()
                            );
                          } else {
                            localStorage.removeItem("filter_orders_dateRangeStart");
                          }
                          // Set preset to fromTo if dates are manually selected
                          if (
                            !selectedDatePreset &&
                            (date || selectedDateRange.end)
                          ) {
                            setSelectedDatePreset("fromTo");
                            localStorage.setItem("filter_orders_datePreset", "fromTo");
                          }
                        }}
                        selectsStart
                        startDate={selectedDateRange.start}
                        endDate={selectedDateRange.end}
                        placeholderText="Start Date"
                        className="form-field search-selector"
                      dateFormat="d MMM yyyy"
                        renderCustomHeader={renderDatePickerHeader}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                      />
                    </div>
                    <div className="date-picker-wrapper">
                      <DatePicker
                        selected={selectedDateRange.end}
                        onChange={(date) => {
                          setSelectedDateRange((prev) => ({
                            ...prev,
                            end: date,
                          }));
                          if (date) {
                            localStorage.setItem(
                              "filter_orders_dateRangeEnd",
                              date.toISOString()
                            );
                          } else {
                            localStorage.removeItem("filter_orders_dateRangeEnd");
                          }
                          // Set preset to fromTo if dates are manually selected
                          if (
                            !selectedDatePreset &&
                            (selectedDateRange.start || date)
                          ) {
                            setSelectedDatePreset("fromTo");
                            localStorage.setItem("filter_orders_datePreset", "fromTo");
                          }
                        }}
                        selectsEnd
                        startDate={selectedDateRange.start}
                        endDate={selectedDateRange.end}
                        minDate={selectedDateRange.start}
                        placeholderText="End Date"
                        className="form-field search-selector"
                      dateFormat="d MMM yyyy"
                        renderCustomHeader={renderDatePickerHeader}
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                      />
                    </div>
                  </>
                )}
              </>
            )}
            {hasActiveFilters && (
              <button
                className="btn clear-filters-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearFilters();
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Advanced Filters Section */}
          <div
            className={`advanced-filters-section ${
              isAdvancedFiltersOpen ? "open" : ""
            }`}
          >
            <div
              className="advanced-filters-header"
              onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
              style={{ cursor: "pointer" }}
            >
              <span
                className={`advanced-filters-title ${
                  isAdvancedFiltersOpen ? "open" : ""
                }`}
              >
                Advanced Filters
              </span>
            </div>
            <div className="filter-row advanced-filters-content">
              {hasPermission(allowedPermissions, "view_category_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Categories" },
                    ...distinctCategories.map((category) => ({
                      value: category,
                      label: category,
                    })),
                  ]}
                  value={selectedCategory || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedCategory(val);
                    localStorage.setItem("filter_orders_category", val);
                  }}
                  placeholder="All Categories"
                />
              )}
              {hasPermission(
                allowedPermissions,
                "view_asset_category_filter"
              ) && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Asset Categories" },
                    ...distinctAssetCategories.map((assetCategory) => ({
                      value: assetCategory,
                      label: assetCategory,
                    })),
                  ]}
                  value={selectedAssetCategory || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedAssetCategory(val);
                    localStorage.setItem("filter_orders_assetCategory", val);
                  }}
                  placeholder="All Asset Categories"
                />
              )}
              {hasPermission(
                allowedPermissions,
                "view_sub_category_filter"
              ) && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Sub Categories" },
                    ...distinctSubCategories.map((subCategory) => ({
                      value: subCategory,
                      label: subCategory,
                    })),
                  ]}
                  value={selectedSubCategory || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedSubCategory(val);
                    localStorage.setItem("filter_orders_subCategory", val);
                  }}
                  placeholder="All Sub Categories"
                />
              )}

              {hasPermission(allowedPermissions, "view_valuer_name_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Valuers" },
                    ...distinctValuerNames.map((valuer) => ({
                      value: valuer,
                      label: valuer,
                    })),
                  ]}
                  value={selectedValuerName || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedValuerName(val);
                    localStorage.setItem("filter_orders_valuerName", val);
                  }}
                  placeholder="All Valuers"
                />
              )}
              {hasPermission(allowedPermissions, "view_manager_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Managers" },
                    ...distinctManagers.map((manager) => ({
                      value: manager,
                      label: manager,
                    })),
                  ]}
                  value={selectedManager || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedManager(val);
                    localStorage.setItem("filter_orders_manager", val);
                  }}
                  placeholder="All Managers"
                />
              )}

              {hasPermission(allowedPermissions, "view_bank_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Banks" },
                    ...distinctBanks.map((bank) => ({
                      value: bank,
                      label: bank,
                    })),
                  ]}
                  value={selectedBank || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedBank(val);
                    localStorage.setItem("filter_orders_bank", val);
                  }}
                  placeholder="All Banks"
                />
              )}
              {hasPermission(allowedPermissions, "view_bank_branch_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Branches" },
                    ...distinctBranches.map((branch) => ({
                      value: branch,
                      label: branch,
                    })),
                  ]}
                  value={selectedBranch || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedBranch(val);
                    localStorage.setItem("filter_orders_branch", val);
                  }}
                  placeholder="All Branches"
                />
              )}
              {hasPermission(
                allowedPermissions,
                "view_branch_officer_filter"
              ) && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Officers" },
                    ...distinctOfficers.map((officer) => ({
                      value: officer,
                      label: officer,
                    })),
                  ]}
                  value={selectedOfficer || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedOfficer(val);
                    localStorage.setItem("filter_orders_officer", val);
                  }}
                  placeholder="All Officers"
                />
              )}
              {hasPermission(
                allowedPermissions,
                "view_field_verifier_filter"
              ) && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Field Verifiers" },
                    ...distinctFieldVerifiers.map((fieldVerifier) => ({
                      value: fieldVerifier,
                      label: fieldVerifier,
                    })),
                  ]}
                  value={selectedFieldVerifier || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedFieldVerifier(val);
                    localStorage.setItem("filter_orders_fieldVerifier", val);
                  }}
                  placeholder="All Field Verifiers"
                />
              )}
              {hasPermission(
                allowedPermissions,
                "view_payment_status_filter"
              ) && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Payment Statuses" },
                    ...distinctPaymentStatuses.map((paymentStatus) => ({
                      value: paymentStatus,
                      label: paymentStatus,
                    })),
                  ]}
                  value={selectedPaymentStatus || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedPaymentStatus(val);
                    localStorage.setItem("filter_orders_paymentStatus", val);
                  }}
                  placeholder="All Payment Statuses"
                />
              )}
              {hasPermission(allowedPermissions, "view_created_by_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Created By" },
                    ...distinctCreatedBy.map((createdBy) => ({
                      value: createdBy,
                      label: createdBy,
                    })),
                  ]}
                  value={selectedCreatedBy || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedCreatedBy(val);
                    localStorage.setItem("filter_orders_createdBy", val);
                  }}
                  placeholder="All Created By"
                />
              )}
              {hasPermission(allowedPermissions, "view_user_assigned_filter") && (
                <SingleSearchSelect
                  className="search-selector"
                  options={[
                    { value: "", label: "All Users Assigned" },
                    ...distinctUserAssigned.map((userName) => ({
                      value: userName,
                      label: userName,
                    })),
                  ]}
                  value={selectedUserAssigned || null}
                  onChange={(value) => {
                    const val = value || "";
                    setSelectedUserAssigned(val);
                    localStorage.setItem("filter_orders_userAssigned", val);
                  }}
                  placeholder="All Users Assigned"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table Container */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CustomDataTable>
            {{
              buttons: (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {/* {hasPermission(allowedPermissions, "add_order") && (
                    <button className="btn" onClick={openAddModal}>
                      Add Order
                    </button>
                  )} */}
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
                    "view_order_table_ref_id"
                  ) && <th style={{ width: "150px" }}>Ref ID</th>}
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
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_Bank"
                  ) && <th style={{ width: "150px" }}>Bank</th>}
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
                    "view_order_table_customer_name"
                  ) && <th style={{ width: "200px" }}>Customer Name</th>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_registration_number"
                  ) && <th style={{ width: "200px" }}>Registration Number</th>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_created_at"
                  ) && <th style={{ width: "180px" }}>Created At</th>}
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
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_type"
                  ) && <th style={{ width: "120px" }}>Type</th>}
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
              rows: reversedFilteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className={
                    hasPermission(allowedPermissions, "view_order_details")
                      ? "clickable-row"
                      : ""
                  }
                  onClick={(e) => {
                    if (
                      hasPermission(allowedPermissions, "view_order_details")
                    ) {
                      const path = `/orders/${order.id}/details`;
                      if (e.ctrlKey || e.metaKey) {
                        window.open(path, "_blank", "noopener,noreferrer");
                      } else {
                        navigate(path);
                      }
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
                    "view_order_table_ref_id"
                  ) && <td>{order.ref_no_id || "-"}</td>}
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
                    "view_order_table_customer_name"
                  ) && <td>{order.customer_name || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_registration_number"
                  ) && <td>{order.registration_number || "-"}</td>}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_table_created_at"
                  ) && <td>{formatDate(order.created_at)}</td>}
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
        </div>
      )}

      {/* 👤 Form Modal (Add/Edit) */}
      {showFormModal && (
        <FormModel>
          {{
            title: isEdit
              ? `Edit Order - ${
                  orders.find((order) => order.id === editOrderId)
                    ?.order_number || "N/A"
                }`
              : "Add Order",
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

                  {/* Created At field - Show based on permission */}
                  {((isEdit && hasPermission(allowedPermissions, "edit_order_created_at")) ||
                    (!isEdit && hasPermission(allowedPermissions, "add_order_created_at"))) && (
                    <div className="form-group">
                      <label htmlFor="createdAt">Created At</label>
                      <DatePicker
                        id="createdAt"
                        selected={formData.created_at}
                        onChange={(date) => setFormData({ ...formData, created_at: date })}
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        dateFormat="d MMM yyyy h:mm aa"
                        placeholderText="Select date and time (optional)"
                        className="form-field"
                        renderCustomHeader={renderDatePickerHeader}
                        isClearable
                      />
                    </div>
                  )}

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
                created_at: null,
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
                      <div className="radio-group two-items">
                        {["Low", "High"].map((priority) => (
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

                  {hasPermission(
                    allowedPermissions,
                    "assign_user_to_order"
                  ) && (
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
                  )}
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
