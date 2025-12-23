import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
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
import {
  fetchLastAttendanceByUserId,
  addAttendance,
  updateAttendanceCheckout,
} from "../../redux/reducers/attendanceReducer";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import CustomDataTable from "../../components/CustomDataTable";
import "./dashboard.scss";
import { DashboardIcon, CheckinIcon } from "../../components/icons/Icons";
import { DeleteIcon, EditIcon, MoreIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";

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
  const { lastRecord: lastAttendance, loading: attendanceLoading } =
    useSelector((state) => state.attendance);

  // Fetch everything on mount
  useEffect(() => {
    dispatch(fetchOrders());
    dispatch(fetchOfficers());
    dispatch(fetchUsers());
    dispatch(fetchChildCategories());
    dispatch(fetchFieldVerifiers());
  }, [dispatch]);

  // Fetch last attendance record on mount
  useEffect(() => {
    if (currentUser?.id) {
      dispatch(fetchLastAttendanceByUserId(currentUser.id));
    }
  }, [dispatch, currentUser?.id]);

  // Check if current user is TELECALLER (case-insensitive) - matches any role containing "TELECALLER"
  const isTelecaller = currentUser?.role.name
    ?.toUpperCase()
    .includes("TELECALLER");

  // Check if current user is Bank Officer (case-insensitive) - matches any role containing "BANK OFFICER"
  const isBankOfficer = currentUser?.role.name
    ?.toUpperCase()
    .includes("BANK OFFICER");

  // Check if current user is Bank Authority (case-insensitive) - matches any role containing "BANK AUTHORITY"
  const isBankAuthority = currentUser?.role.name
    ?.toUpperCase()
    .includes("BANK AUTHORITY");

  // Check if current user is MANAGER (case-insensitive) - matches any role containing "MANAGER"
  const isManager = currentUser?.role.name?.toUpperCase().includes("MANAGER");

  // Check if current user is Super Admin (case-insensitive) - matches any role containing "SUPER ADMIN"
  const isSuperAdmin = currentUser?.role.name
    ?.toUpperCase()
    .includes("SUPER ADMIN");

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

  // State for filtered child categories for Bank Officers
  const [filteredChildCategories, setFilteredChildCategories] = useState([]);

  // State for order type filter - load from localStorage (shared with Orders)
  const [selectedOrderType, setSelectedOrderType] = useState(() => {
    const saved = localStorage.getItem("filter_orderType");
    return saved || "";
  });

  // State for priority filter - load from localStorage (shared with Orders)
  const [selectedPriority, setSelectedPriority] = useState(() => {
    const saved = localStorage.getItem("filter_priority");
    return saved || "";
  });

  // State for additional filters - load from localStorage (shared with Orders)
  const [selectedBank, setSelectedBank] = useState(() => {
    const saved = localStorage.getItem("filter_bank");
    return saved || "";
  });

  const [selectedBranch, setSelectedBranch] = useState(() => {
    const saved = localStorage.getItem("filter_branch");
    return saved || "";
  });

  const [selectedOfficer, setSelectedOfficer] = useState(() => {
    const saved = localStorage.getItem("filter_officer");
    return saved || "";
  });

  const [selectedManager, setSelectedManager] = useState(() => {
    const saved = localStorage.getItem("filter_manager");
    return saved || "";
  });

  const [selectedFieldVerifier, setSelectedFieldVerifier] = useState(() => {
    const saved = localStorage.getItem("filter_fieldVerifier");
    return saved || "";
  });

  const [selectedValuerName, setSelectedValuerName] = useState(() => {
    const saved = localStorage.getItem("filter_valuerName");
    return saved || "";
  });

  const [selectedOrderStatus, setSelectedOrderStatus] = useState(() => {
    const saved = localStorage.getItem("filter_orderStatus");
    return saved || "";
  });

  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState(() => {
    const saved = localStorage.getItem("filter_paymentStatus");
    return saved || "";
  });

  const [selectedCategory, setSelectedCategory] = useState(() => {
    const saved = localStorage.getItem("filter_category");
    return saved || "";
  });

  const [selectedAssetCategory, setSelectedAssetCategory] = useState(() => {
    const saved = localStorage.getItem("filter_assetCategory");
    return saved || "";
  });

  const [selectedSubCategory, setSelectedSubCategory] = useState(() => {
    const saved = localStorage.getItem("filter_subCategory");
    return saved || "";
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

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // State for checkout remarks modal
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutRemark, setCheckoutRemark] = useState("");

  // State for order attributes modal
  const [showAttributesModal, setShowAttributesModal] = useState(false);
  const [attributesOrderId, setAttributesOrderId] = useState(null);
  const [attributesFormData, setAttributesFormData] = useState({
    order_priority: "",
    order_type: "",
    valuer_name: "",
    admin_user_ids: [],
  });

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

  // Calculate pending orders (orders with status_id < 5)
  const pendingOrdersCount = (orders || []).filter((order) => {
    const statusId = order.current_status_id;
    return statusId && statusId < 6;
  }).length;

  // Calculate ongoing orders (orders with status_id >= 5)
  const ongoingOrdersCount = (orders || []).filter((order) => {
    const statusId = order.current_status_id;
    return statusId && statusId >= 6;
  }).length;

  // Calculate completed orders
  const completedOrdersCount = (orders || []).filter(
    (order) => order.current_status_name?.toLowerCase() === "completed"
  ).length;

  // Calculate active field verifiers
  const activeFieldVerifiersCount = (fieldVerifiers || []).filter(
    (verifier) => verifier.is_active === true
  ).length;

  // Calculate inactive field verifiers
  const inactiveFieldVerifiersCount = (fieldVerifiers || []).filter(
    (verifier) => verifier.is_active === false
  ).length;

  const formatTwoDigits = (num) => String(num ?? 0).padStart(2, "0");

  // Format attendance date and time
  const formatAttendanceDateTime = (dateString) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const formattedTime = `${String(displayHours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")} ${ampm}`;

    const weekdays = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const weekday = weekdays[date.getDay()];

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    // Add ordinal suffix to day (1st, 2nd, 3rd, 4th, etc.)
    const getOrdinalSuffix = (d) => {
      if (d > 3 && d < 21) return "th";
      switch (d % 10) {
        case 1:
          return "st";
        case 2:
          return "nd";
        case 3:
          return "rd";
        default:
          return "th";
      }
    };

    const formattedDate = `${day}${getOrdinalSuffix(day)}-${String(
      month
    ).padStart(2, "0")}-${year}`;

    return `${formattedTime} ${weekday}, ${formattedDate}`;
  };

  // Format checkout time only (without date)
  const formatCheckoutTime = (dateString) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )} ${ampm}`;
  };

  // Determine if check-in button should be disabled
  const isCheckInDisabled = () => {
    // Check-in is disabled ONLY if checkin time is set but checkout time is not set
    if (
      lastAttendance &&
      lastAttendance.checkin_time &&
      !lastAttendance.checkout_time
    ) {
      return true;
    }
    // Otherwise, check-in is enabled (no record, or both times set, or checkout set but not checkin)
    return false;
  };

  // Determine if check-out button should be disabled
  const isCheckOutDisabled = () => {
    // Check-out is disabled if: 1) no record found, or 2) checkout time is already set
    if (!lastAttendance) {
      return true;
    }
    if (lastAttendance.checkout_time) {
      return true;
    }
    // Otherwise, check-out is enabled (record exists, checkin is set, checkout is not set)
    return false;
  };

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

  // Confirm delete
  const confirmDelete = (id, name) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmDelete = () => {
    dispatch(removeOrder(confirmDeleteId));
    setConfirmDeleteId(null);
  };

  // Handle Check-in
  const handleCheckIn = async () => {
    if (!currentUser?.id) {
      toast.error("User ID not found");
      return;
    }

    try {
      await dispatch(
        addAttendance({
          user_id: currentUser.id,
          checkin_via: "Portal",
        })
      ).unwrap();
      // Success toast is shown in the reducer
    } catch (error) {
      // Error toast is shown in the reducer
    }
  };

  // Handle Check-out button click - opens modal
  const handleCheckOut = () => {
    setCheckoutRemark("");
    setShowCheckoutModal(true);
  };

  // Submit Check-out with optional remarks
  const handleCheckOutSubmit = async () => {
    if (!currentUser?.id) {
      toast.error("User ID not found");
      return;
    }

    const payload = { user_id: currentUser.id };
    if (checkoutRemark.trim()) {
      payload.checkout_remarks = checkoutRemark.trim();
    }

    try {
      await dispatch(updateAttendanceCheckout(payload)).unwrap();
      setShowCheckoutModal(false);
      setCheckoutRemark("");
      // Success toast is shown in the reducer
    } catch (error) {
      // Error toast is shown in the reducer
    }
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
      "edit_order_priority_db"
    );
    const canEditType = hasPermission(allowedPermissions, "edit_order_type_db");
    const canEditValuerName = hasPermission(
      allowedPermissions,
      "edit_valuer_name_to_order_db"
    );
    const canAssignUsers = hasPermission(
      allowedPermissions,
      "assign_user_to_order_db"
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

  // Submit Add/Edit
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

    // Clear from localStorage
    localStorage.removeItem("filter_orderType");
    localStorage.removeItem("filter_priority");
    localStorage.removeItem("filter_bank");
    localStorage.removeItem("filter_branch");
    localStorage.removeItem("filter_officer");
    localStorage.removeItem("filter_manager");
    localStorage.removeItem("filter_fieldVerifier");
    localStorage.removeItem("filter_valuerName");
    localStorage.removeItem("filter_orderStatus");
    localStorage.removeItem("filter_paymentStatus");
    localStorage.removeItem("filter_category");
    localStorage.removeItem("filter_assetCategory");
    localStorage.removeItem("filter_subCategory");
  };

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
      selectedSubCategory !== ""
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
  ]);

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
    <div className="dashboard-container height-full-occupied">
      {/* Manager dashboard */}
      {isManager && (
        <div className="manager-dashboard">
          <div className="row">
            <div className="col-md-6">
              <div className="manager-dashboard-card blue-card">
                <div className="manager-dashboard-card-header">
                  <h2>Total Orders</h2>
                  <p>{formatTwoDigits(orders.length)}</p>
                </div>
                <div className="manager-dashboard-card-body">
                  <div className="row w-100 m-0 p-0">
                    <div className="col-md-6 p-0">
                      <div className="manager-dashboard-card-body-item border-right border-bottom">
                        <span>Today's Orders</span>
                        <p>{formatTwoDigits(todaysOrdersCount)}</p>
                      </div>
                    </div>
                    <div className="col-md-6 p-0">
                      <div className="manager-dashboard-card-body-item border-bottom">
                        <span>Pending Orders</span>
                        <p>{formatTwoDigits(pendingOrdersCount)}</p>
                      </div>
                    </div>
                    <div className="col-md-6 p-0">
                      <div className="manager-dashboard-card-body-item border-right">
                        <span>Ongoing Orders</span>
                        <p>{formatTwoDigits(ongoingOrdersCount)}</p>
                      </div>
                    </div>
                    <div className="col-md-6 p-0">
                      <div className="manager-dashboard-card-body-item">
                        <span>Completed Orders</span>
                        <p>{formatTwoDigits(completedOrdersCount)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="manager-dashboard-card green-card">
                <div className="manager-dashboard-card-header">
                  <h2>Filed Verifier</h2>
                </div>
                <div className="manager-dashboard-card-body">
                  <div className="row w-100 m-0 p-0">
                    <div className="col-md-4">
                      <div className="manager-dashboard-card-body-item border-right">
                        <span>Total Filed Verifier</span>
                        <p>{formatTwoDigits(fieldVerifiers.length)}</p>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="manager-dashboard-card-body-item border-right">
                        <span>Active Filed Verifier</span>
                        <p>{formatTwoDigits(activeFieldVerifiersCount)}</p>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="manager-dashboard-card-body-item">
                        <span>Inactive Filed Verifier</span>
                        <p>{formatTwoDigits(inactiveFieldVerifiersCount)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* End of Manager dashboard */}
      <div className="dashboard-container-sneak-peek">
        {!hasAnyDashboardPermission && !isTelecaller && !isManager ? (
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
                    {isBankAuthority ? (
                      <>
                        <div className="col-xl-2 col-lg-2 col-md-4 col-sm-12 col-xs-12">
                          <div className="padding-top-bottom">
                            <div className="sneak-peek-card today-orders">
                              <DashboardIcon className="sneak-peek-card-icon" />
                              <h3>Today's Orders</h3>
                              <p>{formatTwoDigits(todaysOrdersCount)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-5 col-lg-6 col-md-8 col-sm-12 col-xs-12">
                          <div className="row">
                            {/* For Bank Authority and Bank Officer users - custom layout */}
                            {isBankAuthority || isBankOfficer ? (
                              <>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status ongoing-orders">
                                      <h3>Total Orders</h3>
                                      <p>{formatTwoDigits(orders.length)}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status re-validate-orders">
                                      <h3>Ongoing</h3>
                                      <p>
                                        {formatTwoDigits(
                                          orders.filter((order) => {
                                            const status =
                                              order.current_status_name?.toLowerCase();
                                            // Count orders that are not "submitted" or "completed"
                                            return (
                                              status &&
                                              status !== "submitted" &&
                                              status !== "completed"
                                            );
                                          }).length
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status submitted-orders">
                                      <h3>Document Submitted</h3>
                                      <p>-</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status validate-orders">
                                      <h3>Completed</h3>
                                      <p>-</p>
                                    </div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              /* For other users - original layout */
                              <>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status ongoing-orders">
                                      <h3>Ongoing</h3>
                                      <p>
                                        {formatTwoDigits(
                                          orders.filter(
                                            (order) =>
                                              order.current_status_id < 7
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
                                              order.current_status_id === 7
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
                                              order.current_status_id === 8
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
                                              order.has_rejected_media ===
                                                true ||
                                              order.has_rejected_images === true
                                          ).length
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="col-xl-2 col-lg-2 col-md-4 col-sm-12 col-xs-12">
                          <div className="padding-top-bottom">
                            <div className="sneak-peek-card today-orders">
                              <DashboardIcon className="sneak-peek-card-icon" />
                              <h3>Total Officer</h3>
                              <p>{formatTwoDigits(officers.length)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-3 col-lg-2 col-md-4 col-sm-12 col-xs-12">
                          <div className="row">
                            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                              <div className="padding-top-bottom">
                                <div className="sneak-peek-card order-status ongoing-orders">
                                  <h3>Active Officer</h3>
                                  <p>-</p>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                              <div className="padding-top-bottom">
                                <div className="sneak-peek-card order-status submitted-orders">
                                  <h3>Inactive Officer</h3>
                                  <p>-</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
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
                            {/* For Bank Authority and Bank Officer users - custom layout */}
                            {isBankAuthority || isBankOfficer ? (
                              <>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status ongoing-orders">
                                      <h3>Total Orders</h3>
                                      <p>{formatTwoDigits(orders.length)}</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status re-validate-orders">
                                      <h3>Ongoing</h3>
                                      <p>
                                        {formatTwoDigits(
                                          orders.filter((order) => {
                                            const status =
                                              order.current_status_name?.toLowerCase();
                                            // Count orders that are not "submitted" or "completed"
                                            return (
                                              status &&
                                              status !== "submitted" &&
                                              status !== "completed"
                                            );
                                          }).length
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status submitted-orders">
                                      <h3>Document Submitted</h3>
                                      <p>-</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status validate-orders">
                                      <h3>Completed</h3>
                                      <p>-</p>
                                    </div>
                                  </div>
                                </div>
                              </>
                            ) : (
                              /* For other users - original layout */
                              <>
                                <div className="col-xl-6 col-lg-6 col-md-6 col-sm-6 col-xs-6">
                                  <div className="padding-top-bottom">
                                    <div className="sneak-peek-card order-status ongoing-orders">
                                      <h3>Ongoing</h3>
                                      <p>
                                        {formatTwoDigits(
                                          orders.filter(
                                            (order) =>
                                              order.current_status_id < 7
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
                                              order.current_status_id === 7
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
                                              order.current_status_id === 8
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
                                              order.has_rejected_media ===
                                                true ||
                                              order.has_rejected_images === true
                                          ).length
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {hasCheckinPermission && (
              <div className="col-xl-5 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                {/* <div className="attendance-card-container">
                  <div className="attendance-card">
                    <div className="attendance-card-buttons-container">
                      <button
                        className="attendance-card-button check-in-button"
                        onClick={handleCheckIn}
                        disabled={attendanceLoading || isCheckInDisabled()}
                      >
                        <DashboardIcon /> Checkin
                      </button>
                      <button
                        className="attendance-card-button check-out-button"
                        onClick={handleCheckOut}
                        disabled={attendanceLoading || isCheckOutDisabled()}
                      >
                        <DashboardIcon /> Checkout
                      </button>
                    </div>
                    <div className="attendance-card-checkin-time">
                      {lastAttendance?.checkin_time && !lastAttendance?.checkout_time ? (
                        <>
                          <p>Your Current Checkin Time was</p>
                          <h4>{formatAttendanceDateTime(lastAttendance.checkin_time)}</h4>
                        </>
                      ) : lastAttendance?.checkout_time ? (
                        <>
                          <p>You checked out at</p>
                          <h4 style={{ color: "#dc3545" }}>{formatCheckoutTime(lastAttendance.checkout_time)}</h4>
                        </>
                      ) : (
                        <>
                          <p>Your Current Checkin Time was</p>
                          <h4>No check-in recorded</h4>
                        </>
                      )}
                    </div>
                  </div>
                </div> */}
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
                <div className="orders-container dashboard-order-table">
                  {loading ? (
                    <p>Loading...</p>
                  ) : (
                    <CustomDataTable
                      showEntriesSelector={true}
                      showFooter={true}
                    >
                      {{
                        filters: (
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              flexWrap: "wrap",
                            }}
                          >
                            {hasPermission(
                              allowedPermissions,
                              "view_order_type_filter_db"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedOrderType}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedOrderType(value);
                                  localStorage.setItem("filter_orderType", value);
                                }}
                              >
                                <option value="">All Types</option>
                                <option value="VKA1">VKA1</option>
                                <option value="VKA2">VKA2</option>
                                <option value="VKA3">VKA3</option>
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_priority_filter_db"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedPriority}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedPriority(value);
                                  localStorage.setItem("filter_priority", value);
                                }}
                              >
                                <option value="">All Priorities</option>
                                <option value="High">High</option>
                                <option value="Low">Low</option>
                              </select>
                            )}
                            {hasPermission(allowedPermissions, "view_category_filter") && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedCategory}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedCategory(value);
                                  localStorage.setItem("filter_category", value);
                                }}
                              >
                                <option value="">All Categories</option>
                                {distinctCategories.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(allowedPermissions, "view_asset_category_filter") && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedAssetCategory}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedAssetCategory(value);
                                  localStorage.setItem("filter_assetCategory", value);
                                }}
                              >
                                <option value="">All Asset Categories</option>
                                {distinctAssetCategories.map((assetCategory) => (
                                  <option key={assetCategory} value={assetCategory}>
                                    {assetCategory}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(allowedPermissions, "view_sub_category_filter") && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedSubCategory}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedSubCategory(value);
                                  localStorage.setItem("filter_subCategory", value);
                                }}
                              >
                                <option value="">All Sub Categories</option>
                                {distinctSubCategories.map((subCategory) => (
                                  <option key={subCategory} value={subCategory}>
                                    {subCategory}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(allowedPermissions, "view_bank_filter") && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedBank}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedBank(value);
                                  localStorage.setItem("filter_bank", value);
                                }}
                              >
                                <option value="">All Banks</option>
                                {distinctBanks.map((bank) => (
                                  <option key={bank} value={bank}>
                                    {bank}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_bank_branch_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedBranch}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedBranch(value);
                                  localStorage.setItem("filter_branch", value);
                                }}
                              >
                                <option value="">All Branches</option>
                                {distinctBranches.map((branch) => (
                                  <option key={branch} value={branch}>
                                    {branch}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_branch_officer_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedOfficer}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedOfficer(value);
                                  localStorage.setItem("filter_officer", value);
                                }}
                              >
                                <option value="">All Officers</option>
                                {distinctOfficers.map((officer) => (
                                  <option key={officer} value={officer}>
                                    {officer}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_manager_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedManager}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedManager(value);
                                  localStorage.setItem("filter_manager", value);
                                }}
                              >
                                <option value="">All Managers</option>
                                {distinctManagers.map((manager) => (
                                  <option key={manager} value={manager}>
                                    {manager}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_field_verifier_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedFieldVerifier}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedFieldVerifier(value);
                                  localStorage.setItem(
                                    "filter_fieldVerifier",
                                    value
                                  );
                                }}
                              >
                                <option value="">All Field Verifiers</option>
                                {distinctFieldVerifiers.map((fieldVerifier) => (
                                  <option key={fieldVerifier} value={fieldVerifier}>
                                    {fieldVerifier}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_valuer_name_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedValuerName}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedValuerName(value);
                                  localStorage.setItem("filter_valuerName", value);
                                }}
                              >
                                <option value="">All Valuers</option>
                                {distinctValuerNames.map((valuer) => (
                                  <option key={valuer} value={valuer}>
                                    {valuer}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_status_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedOrderStatus}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedOrderStatus(value);
                                  localStorage.setItem("filter_orderStatus", value);
                                }}
                              >
                                <option value="">All Statuses</option>
                                {distinctOrderStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_payment_status_filter"
                            ) && (
                              <select
                                className="form-field type-priority-selector"
                                value={selectedPaymentStatus}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSelectedPaymentStatus(value);
                                  localStorage.setItem(
                                    "filter_paymentStatus",
                                    value
                                  );
                                }}
                              >
                                <option value="">All Payment Statuses</option>
                                {distinctPaymentStatuses.map((paymentStatus) => (
                                  <option key={paymentStatus} value={paymentStatus}>
                                    {paymentStatus}
                                  </option>
                                ))}
                              </select>
                            )}
                            {hasActiveFilters && (
                              <button
                                className="btn"
                                onClick={handleClearFilters}
                                style={{
                                  marginLeft: "10px",
                                }}
                              >
                                Clear Filters
                              </button>
                            )}
                          </div>
                        ),
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
                            {hasPermission(
                              allowedPermissions,
                              "add_order_db"
                            ) && (
                              <button className="btn" onClick={openAddModal}>
                                Add Order
                              </button>
                            )}
                            {/* {hasPermission(
                              allowedPermissions,
                              "view_order"
                            ) && (
                              <Link className="btn" to="/orders">
                                See All
                              </Link>
                            )} */}
                          </div>
                        ),
                        header: (
                          <tr>
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_order_number_db"
                            ) && (
                              <th style={{ width: "150px" }}>Order Number</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_category_db"
                            ) && <th style={{ width: "150px" }}>Category</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_asset_category_db"
                            ) && (
                              <th style={{ width: "150px" }}>Asset Category</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_sub_category_db"
                            ) && (
                              <th style={{ width: "150px" }}>Subcategory</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_manager_db"
                            ) && <th style={{ width: "150px" }}>Manager</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_field_verifier_db"
                            ) && (
                              <th style={{ width: "150px" }}>Field Verifier</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_Bank_db"
                            ) && <th style={{ width: "150px" }}>Bank</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_Bank_Branch_db"
                            ) && <th style={{ width: "150px" }}>Branch</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_Branch_Officer_db"
                            ) && <th style={{ width: "150px" }}>Officer</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_registration_number_db"
                            ) && (
                              <th style={{ width: "200px" }}>
                                Registration Number
                              </th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_payment_status_db"
                            ) && (
                              <th style={{ width: "200px" }}>Payment Status</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_payment_amount_db"
                            ) && (
                              <th style={{ width: "200px" }}>Payment Amount</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_created_by_db"
                            ) && <th style={{ width: "120px" }}>Created By</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_updated_by_db"
                            ) && <th>Updated By</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_priority_db"
                            ) && <th style={{ width: "120px" }}>Priority</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_type_db"
                            ) && <th style={{ width: "120px" }}>Type</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_valuer_name_db"
                            ) && (
                              <th style={{ width: "120px" }}>Valuer Name</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_status_db"
                            ) && <th style={{ width: "175px" }}>Status</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_action_db"
                            ) && (
                              <th
                                style={{ textAlign: "center", width: "200px" }}
                              >
                                Action
                              </th>
                            )}
                          </tr>
                        ),
                        rows: [...orders]
                          .reverse()
                          .filter((order) => {
                            // Filter by order type if selected
                            const typeMatch =
                              !selectedOrderType ||
                              order.order_type === selectedOrderType;

                            // Filter by priority if selected
                            const priorityMatch =
                              !selectedPriority ||
                              order.order_priority === selectedPriority;

                            // Filter by bank if selected
                            const bankMatch =
                              !selectedBank || order.bank_name === selectedBank;

                            // Filter by branch if selected
                            const branchMatch =
                              !selectedBranch ||
                              order.branch_name === selectedBranch;

                            // Filter by officer if selected
                            const officerMatch =
                              !selectedOfficer ||
                              order.officer_name === selectedOfficer;

                            // Filter by manager if selected
                            const managerMatch =
                              !selectedManager ||
                              order.manager_name === selectedManager;

                            // Filter by field verifier if selected
                            const fieldVerifierMatch =
                              !selectedFieldVerifier ||
                              order.field_verifier_name === selectedFieldVerifier;

                            // Filter by valuer name if selected
                            const valuerMatch =
                              !selectedValuerName ||
                              order.valuer_name === selectedValuerName;

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

                            // Show order only if all filters match (or no filter is selected)
                            return (
                              typeMatch &&
                              priorityMatch &&
                              categoryMatch &&
                              assetCategoryMatch &&
                              subCategoryMatch &&
                              bankMatch &&
                              branchMatch &&
                              officerMatch &&
                              managerMatch &&
                              fieldVerifierMatch &&
                              valuerMatch &&
                              statusMatch &&
                              paymentStatusMatch
                            );
                          })
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
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_order_number_db"
                              ) && (
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
                              )}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_category_db"
                              ) && <td>{order.category_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_asset_category_db"
                              ) && <td>{order.sub_category_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_sub_category_db"
                              ) && <td>{order.child_category_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_manager_db"
                              ) && <td>{order.manager_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_field_verifier_db"
                              ) && <td>{order.field_verifier_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_Bank_db"
                              ) && <td>{order.bank_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_Bank_Branch_db"
                              ) && <td>{order.branch_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_Branch_Officer_db"
                              ) && <td>{order.officer_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_registration_number_db"
                              ) && <td>{order.registration_number || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_payment_status_db"
                              ) && <td>{order.payment_status || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_payment_amount_db"
                              ) && <td>{order.payment_amount || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_created_by_db"
                              ) && <td>{order.created_by}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_updated_by_db"
                              ) && <td>{order.updated_by || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_priority_db"
                              ) && (
                                <td>
                                  <span
                                    className={`priority-badge priority-${
                                      order.order_priority?.toLowerCase() ||
                                      "none"
                                    }`}
                                  >
                                    {order.order_priority || "-"}
                                  </span>
                                </td>
                              )}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_type_db"
                              ) && <td>{order.order_type || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_valuer_name_db"
                              ) && <td>{order.valuer_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_status_db"
                              ) && (
                                <td>
                                  <p className="status-state order-state">
                                    {order.current_status_name}
                                  </p>
                                </td>
                              )}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_action_db"
                              ) && (
                                <td style={{ textAlign: "center" }}>
                                  {hasPermission(
                                    allowedPermissions,
                                    "edit_order_db"
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
                                  {hasPermission(
                                    allowedPermissions,
                                    "delete_order_db"
                                  ) && (
                                    <button
                                      className="action-icons"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmDelete(
                                          order.id,
                                          order.customer_name
                                        );
                                      }}
                                    >
                                      <DeleteIcon />
                                    </button>
                                  )}
                                  {(hasPermission(
                                    allowedPermissions,
                                    "edit_order_priority_db"
                                  ) ||
                                    hasPermission(
                                      allowedPermissions,
                                      "edit_order_type_db"
                                    ) ||
                                    hasPermission(
                                      allowedPermissions,
                                      "edit_valuer_name_to_order_db"
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
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* just for telecoller */}
      {/* Telecaller with permission - show order cards */}
      {isTelecaller &&
        hasPermission(
          allowedPermissions,
          "view_dashboard_order_cards_telecaller"
        ) && (
          <div className="telecoller-dashboard">
            {loading ? (
              <div className="loading-message">
                <p>Loading orders...</p>
              </div>
            ) : orders && orders.length > 0 ? (
              orders.map((order) => (
                <div
                  key={order.id}
                  className={`telecoller-dashboard-order-card clickable-card ${
                    order.current_status_id === 5
                      ? "reassign-order"
                      : order.current_status_id >= 7
                      ? "complete-order"
                      : ""
                  }`}
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
      {/* End of Telecaller dashboard */}

      {/* Telecaller without permission - show welcome message only */}
      {isTelecaller &&
        !hasPermission(
          allowedPermissions,
          "view_dashboard_order_cards_telecaller"
        ) && (
          <div className="welcome-message-container">
            <div className="welcome-message">
              <h2>Welcome {currentUser?.name || "User"}</h2>
              <p>Hope you are doing well</p>
            </div>
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
                  {hasPermission(
                    allowedPermissions,
                    "edit_order_priority_db"
                  ) && (
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

                  {hasPermission(allowedPermissions, "edit_order_type_db") && (
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
                    "edit_valuer_name_to_order_db"
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
                    "assign_user_to_order_db"
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

      {/* Checkout Remarks Modal */}
      {showCheckoutModal && (
        <FormModel>
          {{
            title: "Check Out",
            body: (
              <form
                className="body-form-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCheckOutSubmit();
                }}
              >
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="checkoutRemark">Remark</label>
                    <textarea
                      className="form-field"
                      id="checkoutRemark"
                      name="checkoutRemark"
                      rows="4"
                      value={checkoutRemark}
                      onChange={(e) => setCheckoutRemark(e.target.value)}
                      placeholder="Enter remarks (optional)"
                    />
                  </div>
                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Check Out
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowCheckoutModal(false);
              setCheckoutRemark("");
            },
          }}
        </FormModel>
      )}
    </div>
  );
}

export default Dashboard;
