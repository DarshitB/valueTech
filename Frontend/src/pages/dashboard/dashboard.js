import React, { useEffect, useState, useMemo, useRef } from "react";
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
  updateAttendanceLunchIn,
  updateAttendanceLunchOut,
  updateAttendanceBreakIn,
  updateAttendanceBreakOut,
} from "../../redux/reducers/attendanceReducer";
import { fetchUserLeavesByUserId } from "../../redux/reducers/userLeaveReducer";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { hasPermission } from "../../utils/permissionUtils";
import { toast } from "react-toastify";
import { searchOrdersByRegistration } from "../../api/order.api";
import { useUppercaseField } from "../../utils/useUppercaseField";
import CustomDataTable from "../../components/CustomDataTable";
import "./dashboard.scss";
import {
  DayInIcon,
  DayOutIcon,
  LunchInIcon,
  LunchOutIcon,
  BreakInIcon,
  BreakOutIcon,
} from "../../components/icons/Icons";
import { DeleteIcon, EditIcon, MoreIcon } from "../../components/icons";
import ConfirmationModal from "../../components/ConfirmationModal";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const SUMMARY_CARD_TABLE_FILTER = {
  TODAY_ORDERS: "today_orders",
  ORDER_CREATED: "order_created",
  PHOTO_PENDING: "photo_pending",
  DETAILS_PENDING: "details_pending",
  PRICE_PENDING: "price_pending",
  MAIL_PENDING: "mail_pending",
  DISCARD: "discard",
};

const isSameOrderDay = (d1, d2) =>
  d1 &&
  d2 &&
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const getOrderCreatedDate = (order) => {
  const value = order?.created_at;
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date) ? null : date;
};

const matchesSummaryCardTableFilter = (order, filterKey) => {
  if (!filterKey) return true;
  const statusId = order?.current_status_id;
  switch (filterKey) {
    case SUMMARY_CARD_TABLE_FILTER.TODAY_ORDERS:
      return isSameOrderDay(getOrderCreatedDate(order), new Date());
    case SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED:
      return statusId != null && statusId <= 2;
    case SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING:
      return [4, 5, 6].includes(statusId);
    case SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING:
      return [7, 8].includes(statusId);
    case SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING:
      return statusId === 10;
    case SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING:
      return statusId === 12;
    case SUMMARY_CARD_TABLE_FILTER.DISCARD:
      return statusId === 11;
    default:
      return true;
  }
};

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
    (state) => state.childCategories,
  );
  const { list: fieldVerifiers } = useSelector((state) => state.fieldVerifier);
  const { lastRecord: lastAttendance, loading: attendanceLoading } =
    useSelector((state) => state.attendance);
  const { list: userLeaves } = useSelector((state) => state.userLeaves);

  /*  console.log("orders", orders); */

  // Fetch everything on mount - always fetch orders when Dashboard component mounts
  // This ensures we get the correct data even if Orders' finalized orders are in the store
  useEffect(() => {
    // Always fetch orders when Dashboard component mounts
    dispatch(fetchOrders());

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

  // Fetch last attendance + leaves for today's leave-block on punch buttons
  useEffect(() => {
    if (currentUser?.id) {
      dispatch(fetchLastAttendanceByUserId(currentUser.id));
      dispatch(fetchUserLeavesByUserId({ userId: currentUser.id }));
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
      hasPermission(allowedPermissions, permission),
    );
  }, [allowedPermissions]);

  // Accordion state for Advanced Filters
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);

  // Filter users by role for officer, manager and telecaller selection
  const bankOfficers = officers.filter(
    (officer) =>
      officer.role_name.toUpperCase().includes("BANK OFFICER") ||
      officer.role_name.toUpperCase().includes("BANK AUTHORITY") ||
      officer.role_name.toUpperCase().includes("CREDIT HEAD"),
  );

  const managers = users.filter((user) =>
    user.role_name.toUpperCase().includes("MANAGER"),
  );

  const telecallers = users.filter((user) =>
    String(user.role_name || "")
      .toUpperCase()
      .includes("TELECALLER"),
  );

  // Fields allowed for TELECALLER role
  const telecallerAllowedFields = [
    "contact",
    "alternative_contact",
    "supervisor_number",
    "driver_number",
    "place_of_inspection",
  ];

  // Permission: can telecaller see customer name in edit modal
  const canTelecallerSeeCustomerName = hasPermission(
    allowedPermissions,
    "show_customer_name_to_telecaller",
  );

  // State for filtered child categories for Bank Officers
  const [filteredChildCategories, setFilteredChildCategories] = useState([]);

  // State for order type filter - load from localStorage (shared with Orders)
  const [selectedOrderType, setSelectedOrderType] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_orderType");
    return saved || "";
  });

  // State for priority filter - load from localStorage (shared with Orders)
  const [selectedPriority, setSelectedPriority] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_priority");
    return saved || "";
  });

  // State for additional filters - load from localStorage (shared with Orders)
  const [selectedBank, setSelectedBank] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_bank");
    return saved || "";
  });

  const [selectedBranch, setSelectedBranch] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_branch");
    return saved || "";
  });

  const [selectedOfficer, setSelectedOfficer] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_officer");
    return saved || "";
  });

  const [selectedManager, setSelectedManager] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_manager");
    return saved || "";
  });

  const [selectedFieldVerifier, setSelectedFieldVerifier] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_fieldVerifier");
    return saved || "";
  });

  const [selectedValuerName, setSelectedValuerName] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_valuerName");
    return saved || "";
  });

  const [selectedOrderStatus, setSelectedOrderStatus] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_orderStatus");
    return saved || "";
  });

  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_paymentStatus");
    return saved || "";
  });

  const [selectedCategory, setSelectedCategory] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_category");
    return saved || "";
  });

  const [selectedAssetCategory, setSelectedAssetCategory] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_assetCategory");
    return saved || "";
  });

  const [selectedSubCategory, setSelectedSubCategory] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_subCategory");
    return saved || "";
  });

  const [selectedCreatedBy, setSelectedCreatedBy] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_createdBy");
    return saved || "";
  });

  const [selectedUserAssigned, setSelectedUserAssigned] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_userAssigned");
    return saved || "";
  });

  // State for date filter
  const [selectedDatePreset, setSelectedDatePreset] = useState(() => {
    const saved = localStorage.getItem("filter_dashboard_datePreset");
    return saved || "";
  });

  const [selectedDateRange, setSelectedDateRange] = useState(() => {
    const savedStart = localStorage.getItem("filter_dashboard_dateRangeStart");
    const savedEnd = localStorage.getItem("filter_dashboard_dateRangeEnd");
    return {
      start: savedStart ? new Date(savedStart) : null,
      end: savedEnd ? new Date(savedEnd) : null,
    };
  });

  // Ephemeral table filter from summary cards (not persisted)
  const [summaryCardTableFilter, setSummaryCardTableFilter] = useState(null);

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

  // Fetch filtered child categories for Bank Officers based on their departments
  useEffect(() => {
    if (isBankOfficer && officers.length > 0) {
      // Find the officer record that matches the current user
      const currentOfficer = officers.find(
        (officer) =>
          officer.user_id === currentUser?.id ||
          officer.name === currentUser?.name ||
          officer.email === currentUser?.email,
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
    customer_name_2: "",
    contact: "",
    alternative_contact: "",
    supervisor_number: "",
    driver_number: "",
    child_category_id: "",
    registration_number: "",
    place_of_inspection: "",
    number_of_order_duplication: "",
    officer_id: null,
    manager_id: null,
    telecaller_id: null,
    field_verifier_id: null,
    created_at: null,
  });

  const [isEdit, setIsEdit] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [registrationMatches, setRegistrationMatches] = useState([]);
  const [showRegistrationMatchModal, setShowRegistrationMatchModal] =
    useState(false);
  const registrationSearchSeq = useRef(0);
  const {
    inputRef: registrationInputRef,
    applyUppercaseChange: applyRegistrationUppercase,
  } = useUppercaseField(formData.registration_number);

  // Helper: is current user a MANAGER editing an existing order?
  const isManagerEditing = isManager && isEdit;

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
  const isSameDay = isSameOrderDay;

  const getCreatedDate = getOrderCreatedDate;

  const todaysOrdersCount = (orders || []).filter((o) =>
    isSameDay(getCreatedDate(o), new Date()),
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
    (order) => order.current_status_name?.toLowerCase() === "completed",
  ).length;

  // Calculate active field verifiers
  const activeFieldVerifiersCount = (fieldVerifiers || []).filter(
    (verifier) => verifier.is_active === true,
  ).length;

  // Calculate inactive field verifiers
  const inactiveFieldVerifiersCount = (fieldVerifiers || []).filter(
    (verifier) => verifier.is_active === false,
  ).length;

  const formatTwoDigits = (num) => String(num ?? 0).padStart(2, "0");

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

  // Same late buffer as Attendance page: Day In after day_start + 15 min → red
  const LATE_DAY_IN_BUFFER_MINUTES = 15;

  const parseTimeToMinutes = (timeValue) => {
    if (timeValue == null || timeValue === "") return null;
    if (timeValue instanceof Date && !Number.isNaN(timeValue.getTime())) {
      return timeValue.getHours() * 60 + timeValue.getMinutes();
    }
    const match = String(timeValue).match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  const attendanceScheduleUser =
    (Array.isArray(users) ? users : []).find(
      (user) => String(user.id) === String(currentUser?.id),
    ) || currentUser;

  const isDayInLate = (checkinTime) => {
    if (!checkinTime) return false;

    const scheduledStartMinutes = parseTimeToMinutes(
      attendanceScheduleUser?.day_start,
    );
    if (scheduledStartMinutes == null) return false;

    const checkin = new Date(checkinTime);
    const checkinMinutes = checkin.getHours() * 60 + checkin.getMinutes();
    const lateBy = checkinMinutes - scheduledStartMinutes;

    return lateBy > LATE_DAY_IN_BUFFER_MINUTES;
  };

  // Format attendance date and time
  const formatAttendanceDateTime = (dateString) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const formattedTime = `${String(displayHours).padStart(2, "0")}:${String(
      minutes,
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
      month,
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
      "0",
    )} ${ampm}`;
  };

  // Determine if check-in button should be disabled
  const toDateOnlyString = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      const plain = value.trim().match(/^(\d{4}-\d{2}-\d{2})$/);
      if (plain) return plain[1];
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Paid leave / leave for current user today → block all punch buttons (holiday unchanged)
  const isAttendanceBlockedByLeaveToday = () => {
    const todayKey = toDateOnlyString(new Date());
    if (!todayKey) return false;

    return (userLeaves || []).some((leave) => {
      if (leave.leave_type !== "paid_leave" && leave.leave_type !== "leave") {
        return false;
      }
      const start = toDateOnlyString(leave.start_date);
      const end = toDateOnlyString(leave.end_date) || start;
      if (!start) return false;
      return todayKey >= start && todayKey <= end;
    });
  };

  const isCheckInDisabled = () => {
    if (isAttendanceBlockedByLeaveToday()) return true;
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

  const hasOpenBreak = () => !!lastAttendance?.open_break;
  const isLunchInProgress = () =>
    !!(lastAttendance?.lunch_in && !lastAttendance?.lunch_out);

  // Determine if check-out button should be disabled
  const isCheckOutDisabled = () => {
    if (isAttendanceBlockedByLeaveToday()) return true;
    if (!lastAttendance) {
      return true;
    }
    if (lastAttendance.checkout_time) {
      return true;
    }
    if (!lastAttendance.checkin_time) {
      return true;
    }
    // Block day out while lunch is open (lunch_in set, lunch_out missing)
    if (isLunchInProgress()) {
      return true;
    }
    // Block day out while personal break is open
    if (hasOpenBreak()) {
      return true;
    }
    return false;
  };

  const isLunchInDisabled = () => {
    if (isAttendanceBlockedByLeaveToday()) return true;
    if (!lastAttendance?.checkin_time || lastAttendance?.checkout_time) {
      return true;
    }
    if (lastAttendance.lunch_in) {
      return true;
    }
    // Mutual exclusion: lunch off while break is open
    if (hasOpenBreak()) {
      return true;
    }
    return false;
  };

  const isLunchOutDisabled = () => {
    if (isAttendanceBlockedByLeaveToday()) return true;
    if (!lastAttendance?.checkin_time || lastAttendance?.checkout_time) {
      return true;
    }
    if (!lastAttendance.lunch_in || lastAttendance.lunch_out) {
      return true;
    }
    // Mutual exclusion: lunch off while break is open
    if (hasOpenBreak()) {
      return true;
    }
    return false;
  };

  // Break In = start break (needs Day In; blocked mid-lunch or if break already open)
  const isBreakInDisabled = () => {
    if (isAttendanceBlockedByLeaveToday()) return true;
    if (!lastAttendance?.checkin_time || lastAttendance?.checkout_time) {
      return true;
    }
    if (isLunchInProgress()) return true;
    if (hasOpenBreak()) return true;
    return false;
  };

  // Break Out = end break (only when a break is open)
  const isBreakOutDisabled = () => {
    if (isAttendanceBlockedByLeaveToday()) return true;
    if (!lastAttendance?.checkin_time || lastAttendance?.checkout_time) {
      return true;
    }
    if (isLunchInProgress()) return true;
    if (!hasOpenBreak()) return true;
    return false;
  };

  const resetRegistrationMatchState = () => {
    registrationSearchSeq.current += 1;
    setRegistrationMatches([]);
    setShowRegistrationMatchModal(false);
  };

  const searchRegistrationMatches = async (
    rawValue,
    { excludeOrderId = null, openModal = false } = {}
  ) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      setRegistrationMatches([]);
      setShowRegistrationMatchModal(false);
      return;
    }

    const excludeId = excludeOrderId ?? editOrderId;
    const seq = ++registrationSearchSeq.current;
    try {
      const response = await searchOrdersByRegistration(value);
      if (seq !== registrationSearchSeq.current) return;
      const list = (
        Array.isArray(response?.data?.data) ? response.data.data : []
      ).filter((order) => Number(order.id) !== Number(excludeId));
      setRegistrationMatches(list);
      setShowRegistrationMatchModal(openModal && list.length > 0);
    } catch {
      if (seq !== registrationSearchSeq.current) return;
      setRegistrationMatches([]);
      setShowRegistrationMatchModal(false);
    }
  };

  // Open Add Order Form
  const openAddModal = () => {
    setIsEdit(false);
    setEditOrderId(null);
    resetRegistrationMatchState();

    setFormData({
      customer_name: "",
      customer_name_2: "",
      contact: "",
      alternative_contact: "",
      supervisor_number: "",
      driver_number: "",
      child_category_id: "",
      registration_number: "",
      place_of_inspection: "",
      number_of_order_duplication: "",
      officer_id: null,
      manager_id: null,
      telecaller_id: null,
      field_verifier_id: null,
      created_at: null,
    });
    setShowFormModal(true);
  };

  // Open Edit Modal
  const openEditModal = (order) => {
    setIsEdit(true);
    setEditOrderId(order.id);
    resetRegistrationMatchState();

    setFormData({
      customer_name: order.customer_name || "",
      customer_name_2: order.customer_name_2 || "",
      contact: order.contact || "",
      alternative_contact: order.alternative_contact || "",
      supervisor_number: order.supervisor_number || "",
      driver_number: order.driver_number || "",
      child_category_id: order.child_category_id || "",
      registration_number: order.registration_number || "",
      place_of_inspection: order.place_of_inspection || "",
      number_of_order_duplication: "",
      officer_id: order.officer_id || null,
      manager_id: order.manager_id || null,
      telecaller_id: order.telecaller_id || null,
      field_verifier_id: order.field_verifier_id || null,
      created_at: order.created_at ? new Date(order.created_at) : null,
    });
    setShowFormModal(true);
    searchRegistrationMatches(order.registration_number, {
      excludeOrderId: order.id,
      openModal: false,
    });
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
        }),
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

  const handleLunchIn = async () => {
    if (!currentUser?.id) {
      toast.error("User ID not found");
      return;
    }

    try {
      await dispatch(
        updateAttendanceLunchIn({ user_id: currentUser.id }),
      ).unwrap();
    } catch (error) {
      // Error toast is shown in the reducer
    }
  };

  const handleLunchOut = async () => {
    if (!currentUser?.id) {
      toast.error("User ID not found");
      return;
    }

    try {
      await dispatch(
        updateAttendanceLunchOut({ user_id: currentUser.id }),
      ).unwrap();
    } catch (error) {
      // Error toast is shown in the reducer
    }
  };

  const handleBreakIn = async () => {
    if (!currentUser?.id) {
      toast.error("User ID not found");
      return;
    }

    try {
      await dispatch(
        updateAttendanceBreakIn({ user_id: currentUser.id }),
      ).unwrap();
    } catch (error) {
      // Error toast is shown in the reducer
    }
  };

  const handleBreakOut = async () => {
    if (!currentUser?.id) {
      toast.error("User ID not found");
      return;
    }

    try {
      await dispatch(
        updateAttendanceBreakOut({ user_id: currentUser.id }),
      ).unwrap();
    } catch (error) {
      // Error toast is shown in the reducer
    }
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

  const renderAttendanceCard = () => (
    <div className="attendance-card">
      <div className="attendance-card-actions">
        {(canAttendanceDayIn ||
          canAttendanceLunchIn ||
          canAttendanceLunchOut ||
          canAttendanceDayOut) && (
          <div className="attendance-card-buttons-container">
            {canAttendanceDayIn && (
              <button
                type="button"
                className="attendance-card-button check-in-button"
                onClick={handleCheckIn}
                disabled={attendanceLoading || isCheckInDisabled()}
              >
                <DayInIcon /> Day In
              </button>
            )}
            {canAttendanceLunchIn && (
              <button
                type="button"
                className="attendance-card-button lunch-in-button"
                onClick={handleLunchIn}
                disabled={attendanceLoading || isLunchInDisabled()}
              >
                <LunchInIcon /> Lunch In
              </button>
            )}
            {canAttendanceLunchOut && (
              <button
                type="button"
                className="attendance-card-button lunch-out-button"
                onClick={handleLunchOut}
                disabled={attendanceLoading || isLunchOutDisabled()}
              >
                <LunchOutIcon /> Lunch Out
              </button>
            )}
            {canAttendanceDayOut && (
              <button
                type="button"
                className="attendance-card-button check-out-button"
                onClick={handleCheckOut}
                disabled={attendanceLoading || isCheckOutDisabled()}
              >
                <DayOutIcon /> Day Out
              </button>
            )}
          </div>
        )}
        {(canAttendanceBreakIn || canAttendanceBreakOut) && (
          <div className="attendance-card-buttons-container attendance-card-buttons-container--breaks">
            {canAttendanceBreakIn && (
              <button
                type="button"
                className="attendance-card-button break-in-button"
                onClick={handleBreakIn}
                disabled={attendanceLoading || isBreakInDisabled()}
              >
                <BreakInIcon /> Break In
              </button>
            )}
            {canAttendanceBreakOut && (
              <button
                type="button"
                className="attendance-card-button break-out-button"
                onClick={handleBreakOut}
                disabled={attendanceLoading || isBreakOutDisabled()}
              >
                <BreakOutIcon /> Break Out
              </button>
            )}
          </div>
        )}
      </div>
      <div className="attendance-card-checkin-time">
        {lastAttendance?.checkin_time && !lastAttendance?.checkout_time ? (
          <>
            <p>Your Current Checkin Time was</p>
            <h4
              className={
                isDayInLate(lastAttendance.checkin_time)
                  ? "tooltip-link"
                  : undefined
              }
              title={
                isDayInLate(lastAttendance.checkin_time)
                  ? "Late Day In"
                  : undefined
              }
              style={
                isDayInLate(lastAttendance.checkin_time)
                  ? { color: "#dc3545", fontWeight: 600 }
                  : undefined
              }
            >
              {formatAttendanceDateTime(lastAttendance.checkin_time)}
            </h4>
          </>
        ) : lastAttendance?.checkout_time ? (
          <>
            <p>You checked out at</p>
            <h4 style={{ color: "#dc3545" }}>
              {formatCheckoutTime(lastAttendance.checkout_time)}
            </h4>
          </>
        ) : (
          <>
            <p>Your Current Checkin Time was</p>
            <h4>No check-in recorded</h4>
          </>
        )}
      </div>
    </div>
  );

  // Open Order Attributes Modal
  const openAttributesModal = (order) => {
    setAttributesOrderId(order.id);

    // Map assigned_users to admin_user_ids for pre-selection (exclude deleted/unassignable users)
    const assignableUserIds = new Set(
      (Array.isArray(users) ? users : [])
        .filter((u) => {
          const roleName = String(u.role_name || "").toUpperCase();
          const excludedRoles = [
            "DEVELOPER_ADMIN",
            "SUPER ADMIN",
            "MANAGER",
            "TELECALLER",
            "BANK AUTHORITY",
            "BANK OFFICER",
          ];
          return !excludedRoles.some((excludedRole) => {
            const normalizedRoleName = roleName.replace(/\s+/g, "");
            const normalizedExcludedRole = excludedRole.replace(/\s+/g, "");
            return normalizedRoleName.includes(normalizedExcludedRole);
          });
        })
        .map((u) => u.id),
    );
    const assignedUserIds = (order.assigned_users || [])
      .map((user) => user.id)
      .filter((id) => assignableUserIds.has(id));

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
      "edit_order_priority_db",
    );
    const canEditType = hasPermission(allowedPermissions, "edit_order_type_db");
    const canEditValuerName = hasPermission(
      allowedPermissions,
      "edit_valuer_name_to_order_db",
    );
    const canAssignUsers = hasPermission(
      allowedPermissions,
      "assign_user_to_order_db",
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
        updateOrderAttributes({ id: attributesOrderId, data: payload }),
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
        typeof err === "string" ? err : "Failed to update attributes",
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
    setSelectedCreatedBy("");
    setSelectedUserAssigned("");
    setSelectedDatePreset("");
    setSelectedDateRange({ start: null, end: null });

    // Clear from localStorage
    localStorage.removeItem("filter_dashboard_orderType");
    localStorage.removeItem("filter_dashboard_priority");
    localStorage.removeItem("filter_dashboard_bank");
    localStorage.removeItem("filter_dashboard_branch");
    localStorage.removeItem("filter_dashboard_officer");
    localStorage.removeItem("filter_dashboard_manager");
    localStorage.removeItem("filter_dashboard_fieldVerifier");
    localStorage.removeItem("filter_dashboard_valuerName");
    localStorage.removeItem("filter_dashboard_orderStatus");
    localStorage.removeItem("filter_dashboard_paymentStatus");
    localStorage.removeItem("filter_dashboard_category");
    localStorage.removeItem("filter_dashboard_assetCategory");
    localStorage.removeItem("filter_dashboard_subCategory");
    localStorage.removeItem("filter_dashboard_createdBy");
    localStorage.removeItem("filter_dashboard_userAssigned");
    localStorage.removeItem("filter_dashboard_datePreset");
    localStorage.removeItem("filter_dashboard_dateRangeStart");
    localStorage.removeItem("filter_dashboard_dateRangeEnd");
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

  // Count of orders shown in the table (same filters as table rows)
  const filteredTableOrdersCount = useMemo(() => {
    if (!orders || !Array.isArray(orders)) return 0;
    return orders.filter((order) => {
      const typeMatch =
        !selectedOrderType || order.order_type === selectedOrderType;
      const priorityMatch =
        !selectedPriority || order.order_priority === selectedPriority;
      const bankMatch = !selectedBank || order.bank_name === selectedBank;
      const branchMatch =
        !selectedBranch || order.branch_name === selectedBranch;
      const officerMatch =
        !selectedOfficer || order.officer_name === selectedOfficer;
      const managerMatch =
        !selectedManager || order.manager_name === selectedManager;
      const fieldVerifierMatch =
        !selectedFieldVerifier ||
        order.field_verifier_name === selectedFieldVerifier;
      const valuerMatch =
        !selectedValuerName || order.valuer_name === selectedValuerName;
      const statusMatch =
        !selectedOrderStatus ||
        order.current_status_name === selectedOrderStatus;
      const paymentStatusMatch =
        !selectedPaymentStatus ||
        order.payment_status === selectedPaymentStatus;
      const categoryMatch =
        !selectedCategory || order.category_name === selectedCategory;
      const assetCategoryMatch =
        !selectedAssetCategory ||
        order.sub_category_name === selectedAssetCategory;
      const subCategoryMatch =
        !selectedSubCategory ||
        order.child_category_name === selectedSubCategory;
      const createdByMatch =
        !selectedCreatedBy || order.created_by === selectedCreatedBy;
      const userAssignedMatch =
        !selectedUserAssigned ||
        (order.assigned_users &&
          order.assigned_users.some(
            (user) => user.name === selectedUserAssigned,
          ));
      const dateMatch = matchesDateFilter(order);
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
    }).length;
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

  const handleSubmit = () => {
    const canEditRegistration = hasPermission(
      allowedPermissions,
      "edit_order_registration_number",
    );

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
      if (formData.customer_name_2 !== (currentOrder.customer_name_2 || "")) {
        payload.customer_name_2 = formData.customer_name_2.trim() || null;
      }

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
        canEditRegistration &&
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
      if (
        hasPermission(allowedPermissions, "edit_order_created_at") &&
        formData.created_at
      ) {
        const currentCreatedAt = currentOrder.created_at
          ? new Date(currentOrder.created_at)
          : null;
        const newCreatedAt = formData.created_at;

        // Only add if changed
        if (
          !currentCreatedAt ||
          currentCreatedAt.getTime() !== newCreatedAt.getTime()
        ) {
          payload.created_at = newCreatedAt.toISOString();
        }
      }
    } else {
      // For add mode, include all fields
      payload = {
        customer_name: formData.customer_name.trim(),
        customer_name_2: formData.customer_name_2.trim() || null,
        contact: formData.contact.trim(),
        alternative_contact: formData.alternative_contact.trim() || null,
        supervisor_number: formData.supervisor_number.trim() || null,
        driver_number: formData.driver_number.trim() || null,
        child_category_id: formData.child_category_id,
        place_of_inspection: formData.place_of_inspection.trim() || null,
      };

      if (canEditRegistration) {
        payload.registration_number =
          formData.registration_number.trim() || null;
      }

      // Add number_of_order_duplication only if user has permission and has entered a value (add order only)
      if (
        hasPermission(
          allowedPermissions,
          "view_order_add_number_of_order_duplication",
        )
      ) {
        const dupVal = (formData.number_of_order_duplication || "")
          .toString()
          .trim();
        if (dupVal !== "") {
          const parsed = parseInt(dupVal, 10);
          if (!Number.isNaN(parsed)) {
            payload.number_of_order_duplication = parsed;
          }
        }
      }

      // Add created_at only if user has permission and value is set
      if (
        hasPermission(allowedPermissions, "add_order_created_at") &&
        formData.created_at
      ) {
        payload.created_at = formData.created_at.toISOString();
      }
    }

    // Handle officer_id, manager_id, and field_verifier_id based on permissions and user role
    let newOfficerId = null;
    let newManagerId = null;
    let newTelecallerId = null;
    let newFieldVerifierId = null;

    // Officer ID handling - Bank Officers get their own officer ID automatically
    if (isBankOfficer) {
      // For Bank Officer users, find their officer record and use the officer's ID
      const currentOfficer = officers.find(
        (officer) => officer.user_id === currentUser?.id,
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

    // TELECALLER ID handling - use form data when user has permission
    if (
      hasPermission(allowedPermissions, "view_order_add_edit_telecaller_filed")
    ) {
      newTelecallerId = formData.telecaller_id;
    }

    // Field Verifier for Super Admin - can assign field verifier even without manager
    if (isSuperAdmin && formData.field_verifier_id) {
      newFieldVerifierId = formData.field_verifier_id;
    }

    // Determine who can actually change each field
    const canChangeOfficer =
      isBankOfficer ||
      hasPermission(allowedPermissions, "view_order_add_edit_officer_filed");
    const canChangeManager =
      isManager ||
      hasPermission(allowedPermissions, "view_order_add_edit_manager_filed");
    const canChangeTelecaller = hasPermission(
      allowedPermissions,
      "view_order_add_edit_telecaller_filed",
    );
    const canChangeFieldVerifier =
      isManager ||
      isSuperAdmin ||
      hasPermission(allowedPermissions, "view_order_add_edit_manager_filed");

    // For edit mode, only include these fields if they have changed AND user can change them
    if (isEdit) {
      const currentOrder = orders.find((order) => order.id === editOrderId);

      if (
        canChangeOfficer &&
        newOfficerId !== (currentOrder.officer_id || null)
      ) {
        payload.officer_id = newOfficerId;
      }

      if (
        canChangeManager &&
        newManagerId !== (currentOrder.manager_id || null)
      ) {
        payload.manager_id = newManagerId;
      }

      if (
        canChangeTelecaller &&
        newTelecallerId !== (currentOrder.telecaller_id || null)
      ) {
        payload.telecaller_id = newTelecallerId;
      }

      if (
        canChangeFieldVerifier &&
        newFieldVerifierId !== (currentOrder.field_verifier_id || null)
      ) {
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
      if (newTelecallerId !== null) {
        payload.telecaller_id = newTelecallerId;
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
    resetRegistrationMatchState();
  };

  // Check if user has any dashboard permissions
  const hasStatisticsPermission = hasPermission(
    allowedPermissions,
    "view_dashboard_statistics",
  );
  const canAttendanceDayIn = hasPermission(
    allowedPermissions,
    "attendance_day_in",
  );
  const canAttendanceLunchIn = hasPermission(
    allowedPermissions,
    "attendance_lunch_in",
  );
  const canAttendanceLunchOut = hasPermission(
    allowedPermissions,
    "attendance_lunch_out",
  );
  const canAttendanceDayOut = hasPermission(
    allowedPermissions,
    "attendance_day_out",
  );
  const canAttendanceBreakIn = hasPermission(
    allowedPermissions,
    "attendance_break_in",
  );
  const canAttendanceBreakOut = hasPermission(
    allowedPermissions,
    "attendance_break_out",
  );
  // Show attendance card if user has any of the action-button permissions
  const hasCheckinPermission =
    canAttendanceDayIn ||
    canAttendanceLunchIn ||
    canAttendanceLunchOut ||
    canAttendanceDayOut ||
    canAttendanceBreakIn ||
    canAttendanceBreakOut;
  const hasOrderTablePermission = hasPermission(
    allowedPermissions,
    "view_dashboard_order_table",
  );
  const hasAnyDashboardPermission =
    hasStatisticsPermission || hasCheckinPermission || hasOrderTablePermission;

  // Keep attendance UI hidden for developer admins (same rule as Layout menu)
  const isDeveloperAdmin =
    currentUser?.role?.name?.toUpperCase() === "DEVELOPER_ADMIN";

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

  // Determine which manager is currently selected for assigning a field verifier
  const selectedManagerIdForFieldVerifier =
    formData.manager_id || (isManager ? currentUser?.id : null);

  // Filter field verifiers to only those created by the selected manager
  const fieldVerifiersForSelectedManager = useMemo(() => {
    if (!selectedManagerIdForFieldVerifier) return [];
    if (!Array.isArray(fieldVerifiers) || !Array.isArray(users)) return [];

    const managerUser = users.find(
      (u) => u.id === selectedManagerIdForFieldVerifier,
    );
    if (!managerUser) return [];

    const managerName = managerUser.name;
    if (!managerName) return [];

    return fieldVerifiers.filter(
      (verifier) => verifier.created_by === managerName,
    );
  }, [selectedManagerIdForFieldVerifier, fieldVerifiers, users]);

  return (
    <div className="dashboard-container height-full-occupied">
      {/* Manager dashboard */}
      {isManager && hasStatisticsPermission && (
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
            {hasStatisticsPermission && !isTelecaller && !isManager && (
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="left-part-of-sneak-peek">
                  <div
                    className={`row dashboard-order-summary-row${
                      hasCheckinPermission
                        ? " dashboard-order-summary-row--with-attendance"
                        : ""
                    }`}
                  >
                    {isBankAuthority ? (
                      hasCheckinPermission ? (
                        <>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom sneak-peek-stacked">
                              <div className="sneak-peek-card order-status today-orders-card sneak-peek-card-inline">
                                <h3>Today's Orders</h3>
                                <p>{formatTwoDigits(todaysOrdersCount)}</p>
                              </div>
                              <div className="sneak-peek-card order-status validate-orders sneak-peek-card-inline">
                                <h3>Completed</h3>
                                <p>{formatTwoDigits(completedOrdersCount)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom sneak-peek-stacked">
                              <div className="sneak-peek-card order-status ongoing-orders sneak-peek-card-inline">
                                <h3>Total Orders</h3>
                                <p>{formatTwoDigits(orders.length)}</p>
                              </div>
                              <div className="sneak-peek-card order-status today-orders-card sneak-peek-card-inline">
                                <h3>Total Officer</h3>
                                <p>{formatTwoDigits(officers.length)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom sneak-peek-stacked">
                              <div className="sneak-peek-card order-status re-validate-orders sneak-peek-card-inline">
                                <h3>Ongoing</h3>
                                <p>
                                  {formatTwoDigits(
                                    orders.filter((order) => {
                                      const status =
                                        order.current_status_name?.toLowerCase();
                                      return (
                                        status &&
                                        status !== "submitted" &&
                                        status !== "completed"
                                      );
                                    }).length,
                                  )}
                                </p>
                              </div>
                              <div className="sneak-peek-card order-status ongoing-orders sneak-peek-card-inline">
                                <h3>Active Officer</h3>
                                <p>-</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom sneak-peek-stacked">
                              <div className="sneak-peek-card order-status submitted-orders sneak-peek-card-inline">
                                <h3>Document Submitted</h3>
                                <p>
                                  {formatTwoDigits(
                                    orders.filter(
                                      (order) => order.current_status_id === 7,
                                    ).length,
                                  )}
                                </p>
                              </div>
                              <div className="sneak-peek-card order-status submitted-orders sneak-peek-card-inline">
                                <h3>Inactive Officer</h3>
                                <p>-</p>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status today-orders-card">
                                <h3>Today's Orders</h3>
                                <p>{formatTwoDigits(todaysOrdersCount)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status ongoing-orders">
                                <h3>Total Orders</h3>
                                <p>{formatTwoDigits(orders.length)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
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
                                    }).length,
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status submitted-orders">
                                <h3>Document Submitted</h3>
                                <p>
                                  {formatTwoDigits(
                                    orders.filter(
                                      (order) => order.current_status_id === 7,
                                    ).length,
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status validate-orders">
                                <h3>Completed</h3>
                                <p>{formatTwoDigits(completedOrdersCount)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status today-orders-card">
                                <h3>Total Officer</h3>
                                <p>{formatTwoDigits(officers.length)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status ongoing-orders">
                                <h3>Active Officer</h3>
                                <p>-</p>
                              </div>
                            </div>
                          </div>
                          <div className="col-xl-4 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                            <div className="padding-top-bottom">
                              <div className="sneak-peek-card order-status submitted-orders">
                                <h3>Inactive Officer</h3>
                                <p>-</p>
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    ) : (
                      <>
                        <div className="col-xl-2 col-lg-4 col-md-4 col-sm-12 col-xs-12">
                          <div className="padding-top-bottom sneak-peek-stacked">
                            <div
                              className={`sneak-peek-card order-status total-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                summaryCardTableFilter === null
                                  ? " is-active"
                                  : ""
                              }`}
                            >
                              <button
                                type="button"
                                className="sneak-peek-card-action"
                                onClick={() => setSummaryCardTableFilter(null)}
                                aria-pressed={summaryCardTableFilter === null}
                              >
                                <h3>Total Orders</h3>
                                <p>
                                  {formatTwoDigits(filteredTableOrdersCount)}
                                </p>
                              </button>
                            </div>
                            <div
                              className={`sneak-peek-card order-status today-orders-card sneak-peek-card-inline sneak-peek-card-clickable${
                                summaryCardTableFilter ===
                                SUMMARY_CARD_TABLE_FILTER.TODAY_ORDERS
                                  ? " is-active"
                                  : ""
                              }`}
                            >
                              <button
                                type="button"
                                className="sneak-peek-card-action"
                                onClick={() =>
                                  setSummaryCardTableFilter(
                                    SUMMARY_CARD_TABLE_FILTER.TODAY_ORDERS,
                                  )
                                }
                                aria-pressed={
                                  summaryCardTableFilter ===
                                  SUMMARY_CARD_TABLE_FILTER.TODAY_ORDERS
                                }
                              >
                                <h3>Today's Orders</h3>
                                <p>{formatTwoDigits(todaysOrdersCount)}</p>
                              </button>
                            </div>
                          </div>
                        </div>
                        {isBankAuthority || isBankOfficer ? (
                          <>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div className="sneak-peek-card order-status ongoing-orders">
                                  <h3>Total Orders</h3>
                                  <p>{formatTwoDigits(orders.length)}</p>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div className="sneak-peek-card order-status re-validate-orders">
                                  <h3>Ongoing</h3>
                                  <p>
                                    {formatTwoDigits(
                                      orders.filter((order) => {
                                        const status =
                                          order.current_status_name?.toLowerCase();
                                        return (
                                          status &&
                                          status !== "submitted" &&
                                          status !== "completed"
                                        );
                                      }).length,
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div className="sneak-peek-card order-status submitted-orders">
                                  <h3>Document Submitted</h3>
                                  {formatTwoDigits(
                                    orders.filter(
                                      (order) => order.current_status_id === 7,
                                    ).length,
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div className="sneak-peek-card order-status validate-orders">
                                  <h3>Completed</h3>
                                  <p>-</p>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : hasCheckinPermission && !isDeveloperAdmin ? (
                          <>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom sneak-peek-stacked">
                                <div
                                  className={`sneak-peek-card order-status ongoing-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED
                                    }
                                  >
                                    <h3>Order Created</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id != null &&
                                            order.current_status_id <= 2,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                                <div
                                  className={`sneak-peek-card order-status submitted-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING
                                    }
                                  >
                                    <h3>Photo Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter((order) =>
                                          matchesSummaryCardTableFilter(
                                            order,
                                            SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING,
                                          ),
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom sneak-peek-stacked">
                                <div
                                  className={`sneak-peek-card order-status validate-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING
                                    }
                                  >
                                    <h3>Details Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter((order) =>
                                          [7, 8].includes(
                                            order.current_status_id,
                                          ),
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                                <div
                                  className={`sneak-peek-card order-status price-pending-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING
                                    }
                                  >
                                    <h3>Price Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id === 10,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom sneak-peek-stacked">
                                <div
                                  className={`sneak-peek-card order-status re-validate-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING
                                    }
                                  >
                                    <h3>Mail Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id === 12,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                                <div
                                  className={`sneak-peek-card order-status discard-orders sneak-peek-card-inline sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.DISCARD
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.DISCARD,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.DISCARD
                                    }
                                  >
                                    <h3>Discard</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id === 11,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div
                                  className={`sneak-peek-card order-status ongoing-orders sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.ORDER_CREATED
                                    }
                                  >
                                    <h3>Order Created</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id != null &&
                                            order.current_status_id <= 2,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div
                                  className={`sneak-peek-card order-status submitted-orders sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING
                                    }
                                  >
                                    <h3>Photo Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter((order) =>
                                          matchesSummaryCardTableFilter(
                                            order,
                                            SUMMARY_CARD_TABLE_FILTER.PHOTO_PENDING,
                                          ),
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div
                                  className={`sneak-peek-card order-status validate-orders sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.DETAILS_PENDING
                                    }
                                  >
                                    <h3>Details Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter((order) =>
                                          [7, 8].includes(
                                            order.current_status_id,
                                          ),
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div
                                  className={`sneak-peek-card order-status price-pending-orders sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.PRICE_PENDING
                                    }
                                  >
                                    <h3>Price Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id === 10,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div
                                  className={`sneak-peek-card order-status re-validate-orders sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.MAIL_PENDING
                                    }
                                  >
                                    <h3>Mail Pending</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id === 12,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="col-xl-2 col-lg-4 col-md-4 col-sm-6 col-xs-12">
                              <div className="padding-top-bottom">
                                <div
                                  className={`sneak-peek-card order-status discard-orders sneak-peek-card-clickable${
                                    summaryCardTableFilter ===
                                    SUMMARY_CARD_TABLE_FILTER.DISCARD
                                      ? " is-active"
                                      : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sneak-peek-card-action"
                                    onClick={() =>
                                      setSummaryCardTableFilter(
                                        SUMMARY_CARD_TABLE_FILTER.DISCARD,
                                      )
                                    }
                                    aria-pressed={
                                      summaryCardTableFilter ===
                                      SUMMARY_CARD_TABLE_FILTER.DISCARD
                                    }
                                  >
                                    <h3>Discard</h3>
                                    <p>
                                      {formatTwoDigits(
                                        orders.filter(
                                          (order) =>
                                            order.current_status_id === 11,
                                        ).length,
                                      )}
                                    </p>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                    {hasCheckinPermission && !isDeveloperAdmin && (
                      <div className="col-xl-3 col-lg-4 col-md-6 col-sm-12 col-xs-12 attendance-summary-col">
                        <div className="padding-top-bottom">
                          {renderAttendanceCard()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {hasCheckinPermission &&
              !isDeveloperAdmin &&
              !(hasStatisticsPermission && !isTelecaller && !isManager) && (
                <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                  <div className="attendance-card-container attendance-card-container--standalone">
                    {renderAttendanceCard()}
                  </div>
                </div>
              )}
            {hasOrderTablePermission && (
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                {/* Filter Container - Outside dashboard-order-table */}
                {hasAnyFilterPermission && (
                  <div className="filter-container-card">
                    {/* Top Row Filters */}
                    <div className="filter-row">
                      {hasPermission(
                        allowedPermissions,
                        "view_order_type_filter",
                      ) && (
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
                            localStorage.setItem(
                              "filter_dashboard_orderType",
                              val,
                            );
                          }}
                          placeholder="All Types"
                        />
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_order_priority_filter",
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
                            localStorage.setItem(
                              "filter_dashboard_priority",
                              val,
                            );
                          }}
                          placeholder="All Priorities"
                        />
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_status_filter",
                      ) && (
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
                            localStorage.setItem(
                              "filter_dashboard_orderStatus",
                              val,
                            );
                          }}
                          placeholder="All Status"
                        />
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_date_filter",
                      ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_datePreset",
                                val,
                              );
                              // Clear date range when changing from "fromTo" to another preset or empty
                              if (
                                previousValue === "fromTo" &&
                                val !== "fromTo"
                              ) {
                                setSelectedDateRange({
                                  start: null,
                                  end: null,
                                });
                                localStorage.removeItem(
                                  "filter_dashboard_dateRangeStart",
                                );
                                localStorage.removeItem(
                                  "filter_dashboard_dateRangeEnd",
                                );
                              }
                              // Clear date range when preset is selected (except for fromTo)
                              if (val && val !== "fromTo") {
                                setSelectedDateRange({
                                  start: null,
                                  end: null,
                                });
                                localStorage.removeItem(
                                  "filter_dashboard_dateRangeStart",
                                );
                                localStorage.removeItem(
                                  "filter_dashboard_dateRangeEnd",
                                );
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
                                        "filter_dashboard_dateRangeStart",
                                        date.toISOString(),
                                      );
                                    } else {
                                      localStorage.removeItem(
                                        "filter_dashboard_dateRangeStart",
                                      );
                                    }
                                    // Set preset to fromTo if dates are manually selected
                                    if (
                                      !selectedDatePreset &&
                                      (date || selectedDateRange.end)
                                    ) {
                                      setSelectedDatePreset("fromTo");
                                      localStorage.setItem(
                                        "filter_dashboard_datePreset",
                                        "fromTo",
                                      );
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
                                        "filter_dashboard_dateRangeEnd",
                                        date.toISOString(),
                                      );
                                    } else {
                                      localStorage.removeItem(
                                        "filter_dashboard_dateRangeEnd",
                                      );
                                    }
                                    // Set preset to fromTo if dates are manually selected
                                    if (
                                      !selectedDatePreset &&
                                      (selectedDateRange.start || date)
                                    ) {
                                      setSelectedDatePreset("fromTo");
                                      localStorage.setItem(
                                        "filter_dashboard_datePreset",
                                        "fromTo",
                                      );
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
                        onClick={() =>
                          setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)
                        }
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
                        {hasPermission(
                          allowedPermissions,
                          "view_category_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_category",
                                val,
                              );
                            }}
                            placeholder="All Categories"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_asset_category_filter",
                        ) && (
                          <SingleSearchSelect
                            className="search-selector"
                            options={[
                              { value: "", label: "All Asset Categories" },
                              ...distinctAssetCategories.map(
                                (assetCategory) => ({
                                  value: assetCategory,
                                  label: assetCategory,
                                }),
                              ),
                            ]}
                            value={selectedAssetCategory || null}
                            onChange={(value) => {
                              const val = value || "";
                              setSelectedAssetCategory(val);
                              localStorage.setItem(
                                "filter_dashboard_assetCategory",
                                val,
                              );
                            }}
                            placeholder="All Asset Categories"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_sub_category_filter",
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
                              localStorage.setItem(
                                "filter_dashboard_subCategory",
                                val,
                              );
                            }}
                            placeholder="All Sub Categories"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_valuer_name_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_valuerName",
                                val,
                              );
                            }}
                            placeholder="All Valuers"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_manager_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_manager",
                                val,
                              );
                            }}
                            placeholder="All Managers"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_bank_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_bank",
                                val,
                              );
                            }}
                            placeholder="All Banks"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_bank_branch_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_branch",
                                val,
                              );
                            }}
                            placeholder="All Branches"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_branch_officer_filter",
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
                              localStorage.setItem(
                                "filter_dashboard_officer",
                                val,
                              );
                            }}
                            placeholder="All Officers"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_field_verifier_filter",
                        ) && (
                          <SingleSearchSelect
                            className="search-selector"
                            options={[
                              { value: "", label: "All Field Verifiers" },
                              ...distinctFieldVerifiers.map(
                                (fieldVerifier) => ({
                                  value: fieldVerifier,
                                  label: fieldVerifier,
                                }),
                              ),
                            ]}
                            value={selectedFieldVerifier || null}
                            onChange={(value) => {
                              const val = value || "";
                              setSelectedFieldVerifier(val);
                              localStorage.setItem(
                                "filter_dashboard_fieldVerifier",
                                val,
                              );
                            }}
                            placeholder="All Field Verifiers"
                          />
                        )}

                        {hasPermission(
                          allowedPermissions,
                          "view_payment_status_filter",
                        ) && (
                          <SingleSearchSelect
                            className="search-selector"
                            options={[
                              { value: "", label: "All Payment Statuses" },
                              ...distinctPaymentStatuses.map(
                                (paymentStatus) => ({
                                  value: paymentStatus,
                                  label: paymentStatus,
                                }),
                              ),
                            ]}
                            value={selectedPaymentStatus || null}
                            onChange={(value) => {
                              const val = value || "";
                              setSelectedPaymentStatus(val);
                              localStorage.setItem(
                                "filter_dashboard_paymentStatus",
                                val,
                              );
                            }}
                            placeholder="All Payment Statuses"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_created_by_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_createdBy",
                                val,
                              );
                            }}
                            placeholder="All Created By"
                          />
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "view_user_assigned_filter",
                        ) && (
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
                              localStorage.setItem(
                                "filter_dashboard_userAssigned",
                                val,
                              );
                            }}
                            placeholder="All Users Assigned"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Table Container */}
                <div className="orders-container dashboard-order-table">
                  {loading ? (
                    <p>Loading...</p>
                  ) : (
                    <CustomDataTable
                      showEntriesSelector={true}
                      showFooter={true}
                    >
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
                            {hasPermission(
                              allowedPermissions,
                              "add_order_db",
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
                              "view_order_table_order_number_db",
                            ) && (
                              <th style={{ width: "150px" }}>Order Number</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_ref_id_db",
                            ) && <th style={{ width: "150px" }}>Ref ID</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_category_db",
                            ) && <th style={{ width: "150px" }}>Category</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_asset_category_db",
                            ) && (
                              <th style={{ width: "150px" }}>Asset Category</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_sub_category_db",
                            ) && (
                              <th style={{ width: "150px" }}>Subcategory</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_manager_db",
                            ) && <th style={{ width: "150px" }}>Manager</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_field_verifier_db",
                            ) && (
                              <th style={{ width: "150px" }}>Field Verifier</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_Bank_db",
                            ) && <th style={{ width: "150px" }}>Bank</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_Bank_Branch_db",
                            ) && <th style={{ width: "150px" }}>Branch</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_Branch_Officer_db",
                            ) && <th style={{ width: "150px" }}>Officer</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_contact_person_name_db",
                            ) && (
                              <th style={{ width: "200px" }}>
                                Contact Person Name
                              </th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_customer_name_db",
                            ) && (
                              <th style={{ width: "200px" }}>Customer Name</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_registration_number_db",
                            ) && (
                              <th style={{ width: "200px" }}>
                                Registration Number
                              </th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_payment_status_db",
                            ) && (
                              <th style={{ width: "200px" }}>Payment Status</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_payment_amount_db",
                            ) && (
                              <th style={{ width: "200px" }}>Payment Amount</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_created_at_db",
                            ) && <th style={{ width: "180px" }}>Created At</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_created_by_db",
                            ) && <th style={{ width: "120px" }}>Created By</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_updated_by_db",
                            ) && <th>Updated By</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_priority_db",
                            ) && <th style={{ width: "120px" }}>Priority</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_type_db",
                            ) && <th style={{ width: "120px" }}>Type</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_valuer_name_db",
                            ) && (
                              <th style={{ width: "120px" }}>Valuer Name</th>
                            )}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_status_db",
                            ) && <th style={{ width: "175px" }}>Status</th>}
                            {hasPermission(
                              allowedPermissions,
                              "view_order_table_action_db",
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
                              order.field_verifier_name ===
                                selectedFieldVerifier;

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
                              !selectedCategory ||
                              order.category_name === selectedCategory;

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
                              !selectedCreatedBy ||
                              order.created_by === selectedCreatedBy;

                            // Filter by user assigned if selected
                            const userAssignedMatch =
                              !selectedUserAssigned ||
                              (order.assigned_users &&
                                order.assigned_users.some(
                                  (user) => user.name === selectedUserAssigned,
                                ));

                            // Filter by date if selected
                            const dateMatch = matchesDateFilter(order);
                            const summaryCardMatch =
                              matchesSummaryCardTableFilter(
                                order,
                                summaryCardTableFilter,
                              );

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
                              dateMatch &&
                              summaryCardMatch
                            );
                          })
                          .map((order) => (
                            <tr
                              key={order.id}
                              className={
                                hasPermission(
                                  allowedPermissions,
                                  "view_order_details",
                                )
                                  ? "clickable-row"
                                  : ""
                              }
                              onClick={(e) => {
                                if (
                                  hasPermission(
                                    allowedPermissions,
                                    "view_order_details",
                                  )
                                ) {
                                  const path = `/orders/${order.id}/details`;
                                  if (e.ctrlKey || e.metaKey) {
                                    window.open(
                                      path,
                                      "_blank",
                                      "noopener,noreferrer",
                                    );
                                  } else {
                                    navigate(path);
                                  }
                                }
                              }}
                              style={{
                                cursor: hasPermission(
                                  allowedPermissions,
                                  "view_order_details",
                                )
                                  ? "pointer"
                                  : "default",
                              }}
                            >
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_order_number_db",
                              ) && (
                                <td
                                  className={
                                    hasPermission(
                                      allowedPermissions,
                                      "view_order_details",
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
                                "view_order_table_ref_id_db",
                              ) && <td>{order.ref_no_id || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_category_db",
                              ) && <td>{order.category_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_asset_category_db",
                              ) && <td>{order.sub_category_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_sub_category_db",
                              ) && <td>{order.child_category_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_manager_db",
                              ) && <td>{order.manager_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_field_verifier_db",
                              ) && <td>{order.field_verifier_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_Bank_db",
                              ) && <td>{order.bank_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_Bank_Branch_db",
                              ) && <td>{order.branch_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_Branch_Officer_db",
                              ) && <td>{order.officer_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_contact_person_name_db",
                              ) && <td>{order.customer_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_customer_name_db",
                              ) && <td>{order.customer_name_2 || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_registration_number_db",
                              ) && <td>{order.registration_number || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_payment_status_db",
                              ) && <td>{order.payment_status || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_payment_amount_db",
                              ) && <td>{order.payment_amount || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_created_at_db",
                              ) && <td>{formatDate(order.created_at)}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_created_by_db",
                              ) && <td>{order.created_by}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_updated_by_db",
                              ) && <td>{order.updated_by || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_priority_db",
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
                                "view_order_table_type_db",
                              ) && <td>{order.order_type || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_valuer_name_db",
                              ) && <td>{order.valuer_name || "-"}</td>}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_status_db",
                              ) && (
                                <td>
                                  <p className="status-state order-state">
                                    {order.current_status_name}
                                  </p>
                                </td>
                              )}
                              {hasPermission(
                                allowedPermissions,
                                "view_order_table_action_db",
                              ) && (
                                <td style={{ textAlign: "center" }}>
                                  {hasPermission(
                                    allowedPermissions,
                                    "edit_order_db",
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
                                    "delete_order_db",
                                  ) && (
                                    <button
                                      className="action-icons"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        confirmDelete(
                                          order.id,
                                          order.customer_name,
                                        );
                                      }}
                                    >
                                      <DeleteIcon />
                                    </button>
                                  )}
                                  {(hasPermission(
                                    allowedPermissions,
                                    "edit_order_priority_db",
                                  ) ||
                                    hasPermission(
                                      allowedPermissions,
                                      "edit_order_type_db",
                                    ) ||
                                    hasPermission(
                                      allowedPermissions,
                                      "edit_valuer_name_to_order_db",
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
          "view_dashboard_order_cards_telecaller",
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
                    <h3>Order ID - {order.order_number || "-----"}</h3>
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
                    {hasPermission(
                      allowedPermissions,
                      "show_customer_name_to_telecaller",
                    ) && (
                      <div className="telecoller-dashboard-order-card-body-item">
                        <span>Client Name</span>
                        <p>{order.customer_name || "-----"}</p>
                      </div>
                    )}
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
                    {(hasPermission(
                      allowedPermissions,
                      "show_bank_to_telelcaller",
                    ) ||
                      hasPermission(
                        allowedPermissions,
                        "show_officer_to_telecaller",
                      )) && (
                      <div className="telecoller-dashboard-order-card-body-item two-rows">
                        {hasPermission(
                          allowedPermissions,
                          "show_bank_to_telelcaller",
                        ) && (
                          <div className="telecoller-dashboard-order-card-body-item-inner">
                            <span>Bank</span>
                            <p>{order.bank_name || "-----"}</p>
                          </div>
                        )}
                        {hasPermission(
                          allowedPermissions,
                          "show_officer_to_telecaller",
                        ) && (
                          <div className="telecoller-dashboard-order-card-body-item-inner">
                            <span>Officer</span>
                            <p>{order.officer_name || "-----"}</p>
                          </div>
                        )}
                      </div>
                    )}
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
          "view_dashboard_order_cards_telecaller",
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
                  {(!isTelecaller || canTelecallerSeeCustomerName) && (
                    <div className="form-group-row">
                      <div className="form-group">
                        <label htmlFor="nameField">Contact Person Name *</label>
                        <input
                          className="form-field"
                          id="nameField"
                          name="nameField"
                          value={formData.customer_name}
                          onChange={(e) => {
                            if (isManagerEditing) return;
                            if (!isTelecaller) {
                              const customer_name =
                                e.target.value.toUpperCase();
                              setFormData({
                                ...formData,
                                customer_name,
                              });
                            }
                          }}
                          disabled={isTelecaller || isManagerEditing}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="customerName2Field">
                          Customer Name
                        </label>
                        <input
                          className="form-field"
                          id="customerName2Field"
                          name="customer_name_2"
                          value={formData.customer_name_2}
                          onChange={(e) => {
                            if (isManagerEditing) return;
                            if (!isTelecaller) {
                              const customer_name_2 =
                                e.target.value.toUpperCase();
                              setFormData({
                                ...formData,
                                customer_name_2,
                              });
                            }
                          }}
                          disabled={isTelecaller || isManagerEditing}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  )}
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
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            supervisor_number: e.target.value,
                          });
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
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            driver_number: e.target.value,
                          });
                        }}
                        disabled={false}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="registrationNumber">
                      Registration Number
                    </label>
                    <div className="registration-number-row">
                      <input
                        className="form-field"
                        id="registrationNumber"
                        name="registrationNumber"
                        ref={registrationInputRef}
                        value={formData.registration_number}
                        onChange={(e) => {
                          const canEditRegistrationField = hasPermission(
                            allowedPermissions,
                            "edit_order_registration_number",
                          );

                          if (!canEditRegistrationField) return;

                          applyRegistrationUppercase(e, (registration_number) => {
                            setFormData((prev) => ({
                              ...prev,
                              registration_number,
                            }));
                            if (registrationMatches.length > 0) {
                              setRegistrationMatches([]);
                              setShowRegistrationMatchModal(false);
                            }
                          });
                        }}
                        onBlur={(e) => {
                          searchRegistrationMatches(e.target.value, {
                            openModal: true,
                          });
                        }}
                        disabled={
                          !hasPermission(
                            allowedPermissions,
                            "edit_order_registration_number",
                          )
                        }
                      />
                      {registrationMatches.length > 0 && (
                        <button
                          type="button"
                          className="registration-match-btn"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowRegistrationMatchModal(true)}
                        >
                          Previous orders ({registrationMatches.length})
                        </button>
                      )}
                    </div>
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

                  {!isEdit &&
                    hasPermission(
                      allowedPermissions,
                      "view_order_add_number_of_order_duplication",
                    ) && (
                      <div className="form-group">
                        <label htmlFor="numberOfOrderDuplication">
                          Number of order duplication
                        </label>
                        <input
                          className="form-field"
                          id="numberOfOrderDuplication"
                          name="numberOfOrderDuplication"
                          type="text"
                          inputMode="numeric"
                          value={formData.number_of_order_duplication}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^\d*$/.test(value)) {
                              setFormData({
                                ...formData,
                                number_of_order_duplication: value,
                              });
                            }
                          }}
                          placeholder="Enter number (integer only)"
                        />
                      </div>
                    )}

                  {/* Created At field - Show based on permission (managers cannot edit) */}
                  {!isManager &&
                    ((isEdit &&
                      hasPermission(
                        allowedPermissions,
                        "edit_order_created_at",
                      )) ||
                      (!isEdit &&
                        hasPermission(
                          allowedPermissions,
                          "add_order_created_at",
                        ))) && (
                      <div className="form-group">
                        <label htmlFor="createdAt">Created At</label>
                        <DatePicker
                          id="createdAt"
                          selected={formData.created_at}
                          onChange={(date) =>
                            setFormData({ ...formData, created_at: date })
                          }
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
                    "view_order_add_edit_subcategory_filed",
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
                          }),
                        )}
                        value={formData.child_category_id}
                        onChange={(val) => {
                          if (isManagerEditing) return;
                          // Only allow TELECALLER to change this field if they have permission
                          if (!isTelecaller) {
                            setFormData({
                              ...formData,
                              child_category_id: val,
                            });
                          }
                        }}
                        placeholder="Select Subcategory"
                        disabled={isTelecaller || isManagerEditing}
                      />
                    </div>
                  )}
                  {/* Telecaller field - Show based on permission */}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_add_edit_telecaller_filed",
                  ) && (
                    <div className="form-group">
                      <label htmlFor="telecallerField">Telecaller</label>
                      <SingleSearchSelect
                        id="telecallerField"
                        className="search-selector"
                        options={telecallers.map((user) => ({
                          value: user.id,
                          label: `${user.name} (${user.role_name})`,
                        }))}
                        value={formData.telecaller_id}
                        onChange={(val) => {
                          setFormData({
                            ...formData,
                            telecaller_id: val,
                          });
                        }}
                        placeholder="Select telecaller"
                      />
                    </div>
                  )}

                  {/* Officer field - Show based on permission but hidden for Bank Officers */}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_add_edit_officer_filed",
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
                            if (isManagerEditing) return;
                            // Only allow TELECALLER to change this field if they have permission
                            if (!isTelecaller) {
                              setFormData({ ...formData, officer_id: val });
                            }
                          }}
                          placeholder="Select officer"
                          disabled={isTelecaller || isManagerEditing}
                        />
                      </div>
                    )}

                  {/* MANAGER field - Show based on permission but hidden for MANAGER users */}
                  {hasPermission(
                    allowedPermissions,
                    "view_order_add_edit_manager_filed",
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
                            setFormData({
                              ...formData,
                              manager_id: val,
                              // Clear field verifier whenever manager changes
                              field_verifier_id: null,
                            });
                          }}
                          placeholder="Select manager"
                          disabled={false}
                        />
                      </div>
                    )}

                  {/* Field Verifier - Show only when a manager is selected (or current user is MANAGER/SUPER ADMIN) and user has permission (but not Bank Officer) */}
                  {selectedManagerIdForFieldVerifier &&
                    hasPermission(
                      allowedPermissions,
                      "view_order_add_edit_manager_filed",
                    ) && (
                      <div className="form-group">
                        <label htmlFor="fieldVerifierField">
                          Field Verifier
                        </label>
                        <SingleSearchSelect
                          id="fieldVerifierField"
                          className="search-selector"
                          options={fieldVerifiersForSelectedManager.map(
                            (verifier) => ({
                              value: verifier.id,
                              label: verifier.name,
                            }),
                          )}
                          value={formData.field_verifier_id}
                          onChange={(val) => {
                            setFormData({
                              ...formData,
                              field_verifier_id: val,
                            });
                          }}
                          placeholder="Select field verifier"
                          disabled={false}
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
              resetRegistrationMatchState();

              // Reset form data (will be properly initialized when opening again)
              setFormData({
                customer_name: "",
                customer_name_2: "",
                contact: "",
                alternative_contact: "",
                supervisor_number: "",
                driver_number: "",
                child_category_id: "",
                registration_number: "",
                place_of_inspection: "",
                number_of_order_duplication: "",
                officer_id: null,
                manager_id: null,
                telecaller_id: null,
                field_verifier_id: null,
                created_at: null,
              });
            },
          }}
        </FormModel>
      )}

      {showFormModal && showRegistrationMatchModal && (
        <FormModel className="stacked-modal" size="xl">
          {{
            title: "Previous orders with this registration number",
            body: (
              <div className="registration-match-modal-body">
                {registrationMatches.length === 0 ? (
                  <p>No matching orders found.</p>
                ) : (
                  <div className="registration-match-table-wrap">
                    <table className="registration-match-table">
                      <thead>
                        <tr>
                          <th>Order Number</th>
                          <th>Date of Creation</th>
                          <th>Registration Number</th>
                          <th>Customer Name</th>
                          <th>Bank</th>
                          <th>Officer</th>
                          <th>Order Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrationMatches.map((order) => (
                          <tr key={order.id}>
                            <td>
                              {hasPermission(
                                allowedPermissions,
                                "view_order_details",
                              ) ? (
                                <Link
                                  className="get-me-inside"
                                  to={`/orders/${order.id}/details`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {order.order_number || "-"}
                                </Link>
                              ) : (
                                order.order_number || "-"
                              )}
                            </td>
                            <td>{formatDate(order.created_at)}</td>
                            <td>{order.registration_number || "-"}</td>
                            <td>{order.customer_name_2 || "-"}</td>
                            <td>{order.bank_name || "-"}</td>
                            <td>{order.officer_name || "-"}</td>
                            <td>{order.current_status_name || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ),
            onClose: () => setShowRegistrationMatchModal(false),
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
                    "edit_order_priority_db",
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
                    "edit_valuer_name_to_order_db",
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
                    "assign_user_to_order_db",
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
        <FormModel size="lg">
          {{
            title: "Day Out",
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
                      Day Out
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
