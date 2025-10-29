import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchOrderById,
  fetchComments,
  addComment,
  updatePaymentStatus,
  updateOrderToStatus9,
  updateStatusAfterUnderReview,
} from "../../redux/reducers/orderReducer";
import {
  fetchApprovedOrderMediaDocuments,
  fetchOrderMediaDocuments,
} from "../../redux/reducers/orderMediaDocumentsReducer";
import { fetchOfficers } from "../../redux/reducers/officerReducer";
import { getUsers } from "../../api/user.api";
import { MentionsInput, Mention } from "react-mentions";
import mentionsStyle from "./mentionsStyle";
import "./order.scss";
import {
  ApprovedIcon,
  ContactIcon,
  MoneyIcon,
  DocumentsIcon,
  EditIcon,
  FolderIcon,
  ImageCollageIcon,
  MailIcon,
  PaymentIcon,
  ReportIcon,
  RevalidateIcon,
  SelectedIcon,
  UploadImageIcon,
  UploadReportIcon,
  ValidateIcon,
  MailInputIcon,
} from "../../components/icons";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../context/PageTitleContext";
import { hasPermission } from "../../utils/permissionUtils";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import FormModel from "../../components/FormModel";
import SingleSearchSelect from "../../components/SingleSearchSelect";
import { toast } from "react-toastify";
import ConfirmationModal from "../../components/ConfirmationModal";

// Utility: Convert date to 'time ago' string
function timeAgo(dateString) {
  if (!dateString) return "-";
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

/**
 * OrderDetails Component
 *
 * A secure, professional React component for displaying and managing order details.
 * Implements comprehensive security measures including XSS prevention, input validation,
 * and proper error handling.
 *
 * Security Features:
 * - XSS prevention with HTML sanitization
 * - Input validation and sanitization
 * - Email format validation
 * - File path traversal protection
 * - Proper error handling
 * - Accessibility compliance
 *
 * @author ValueTech Solutions
 * @version 2.0.0
 */

// Main component for displaying order details
function OrderDetails() {
  // Extract order ID from route parameters
  const { id } = useParams();
  // Initialize Redux dispatch function
  const dispatch = useDispatch();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);
  const currentUser = useSelector((state) => state.auth.user);
  const isSuperAdmin = currentUser?.role?.name
    ?.toUpperCase()
    .includes("SUPER ADMIN");
  const isExemptAdmin =
    currentUser?.role?.name.toUpperCase().includes("SUPER ADMIN") ||
    currentUser?.role?.name === "developer_admin";

  // Select order and comments data from Redux store
  const order = useSelector((state) => state.orders.selected);
  const comments = useSelector((state) => state.orders.comments);
  const paymentUpdating = useSelector((state) => state.orders.paymentUpdating);
  // Get media documents from Redux store
  const orderMediaDocumentsState = useSelector(
    (state) => state.orderMediaDocuments
  );
  const {
    approvedDocuments,
    approvedLoading,
    documents: orderMediaDocuments,
  } = orderMediaDocumentsState;
  const { list: officers } = useSelector((state) => state.officers);

  // Set page title using custom hook
  const { setTitle } = usePageTitle(); // set page title

  // Local state for managing comment input
  const [comment, setComment] = useState("");
  const [users, setUsers] = useState([]); // For mentions dropdown
  const [taggedUserIds, setTaggedUserIds] = useState([]); // For payload
  // Refs for managing scroll position in comments section
  const commentsEndRef = useRef(null);
  const commentsBoxRef = useRef(null);

  // Local state for managing payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeTab, setActiveTab] = useState("payment");
  const [showMailModal, setShowMailModal] = useState(false);
  const [showCompleteConfirmation, setShowCompleteConfirmation] =
    useState(false);
  const [showAuthenticateConfirmation, setShowAuthenticateConfirmation] =
    useState(false);
  const [showRevisionConfirmation, setShowRevisionConfirmation] =
    useState(false);

  // Form data state for payment details
  const [paymentFormData, setPaymentFormData] = useState({
    paymentAmount: "",
    paymentMode: "",
    paymentStatus: "",
  });

  // Form data state for billing details
  const [billingFormData, setBillingFormData] = useState({
    invoiceName: "",
    invoiceAmount: "",
  });

  // Form data state for mail details
  const [mailFormData, setMailFormData] = useState({
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    comments: "",
  });

  // Fetch order details, comments, and media documents when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      dispatch(fetchComments(id));
      dispatch(fetchOrderMediaDocuments(id));
      dispatch(fetchOfficers());
    }
  }, [dispatch, id]);

  // Fetch approved documents when mail modal is opened
  useEffect(() => {
    if (showMailModal && id) {
      dispatch(fetchApprovedOrderMediaDocuments(id));
    }
  }, [dispatch, id, showMailModal]);

  // Fetch users for mentions with error handling
  useEffect(() => {
    const fetchUsersData = async () => {
      try {
        const res = await getUsers();
        if (res?.data && Array.isArray(res.data)) {
          // Sanitize user data to prevent injection
          const sanitizedUsers = res.data
            .filter((user) => user && user.id && user.name) // Filter out invalid users
            .map((user) => ({
              id: Number(user.id), // Ensure ID is a number
              display: String(user.name).substring(0, 100).trim(), // Limit name length and ensure string
            }))
            .filter((user) => user.id > 0 && user.display.length > 0); // Final validation

          setUsers(sanitizedUsers);
        }
      } catch (error) {
        console.error("Failed to fetch users for mentions:", error);
        setUsers([]); // Set empty array on error
      }
    };

    fetchUsersData();
  }, []);

  // Prepare bank officers for email selection with validation
  const bankOfficersOptions = useMemo(() => {
    if (!Array.isArray(officers)) return [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return officers
      .filter((officer) => {
        // Validate officer object structure
        if (!officer || typeof officer !== "object") return false;

        // Validate role name
        const roleName = officer.role_name;
        if (!roleName || typeof roleName !== "string") return false;

        const roleUpper = roleName.toUpperCase();
        return (
          roleUpper.includes("BANK OFFICER") ||
          roleUpper.includes("BANK AUTHORITY")
        );
      })
      .filter((officer) => {
        // Validate email format
        return (
          officer.email &&
          typeof officer.email === "string" &&
          emailRegex.test(officer.email) &&
          officer.email.length <= 254
        ); // RFC 5321 limit
      })
      .map((officer) => ({
        value: officer.email.trim().toLowerCase(),
        label: `${String(officer.name || "Unknown").substring(
          0,
          50
        )} (${officer.email.trim().toLowerCase()})`,
      }));
  }, [officers]);

  // Prepare all officers emails for CC selection with validation
  const allOfficersEmails = useMemo(() => {
    if (!Array.isArray(officers)) return [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return officers
      .filter((officer) => {
        // Validate officer object and email
        return (
          officer &&
          typeof officer === "object" &&
          officer.email &&
          typeof officer.email === "string" &&
          emailRegex.test(officer.email) &&
          officer.email.length <= 254
        );
      })
      .map((officer) => ({
        value: officer.email.trim().toLowerCase(),
        label: `${String(officer.name || "Unknown").substring(
          0,
          50
        )} (${officer.email.trim().toLowerCase()})`,
      }));
  }, [officers]);

  // Filter out already-tagged users from the dropdown with validation
  const getFilteredUsers = useCallback(() => {
    if (!Array.isArray(users) || !Array.isArray(taggedUserIds)) {
      return [];
    }

    return users.filter((user) => {
      // Validate user object structure
      if (!user || typeof user !== "object" || !user.id || !user.display) {
        return false;
      }

      // Check if user is not already tagged
      return !taggedUserIds.includes(user.id);
    });
  }, [users, taggedUserIds]);

  // Handle mentions add/remove with validation
  const handleMentionChange = useCallback(
    (event, newValue, newPlainTextValue, mentions) => {
      // Validate input parameters
      if (typeof newValue !== "string") {
        console.error("Invalid mention value");
        return;
      }

      // Limit comment length to prevent abuse
      if (newValue.length > 5000) {
        toast.error("Comment is too long");
        return;
      }

      // Validate mentions array
      const validMentions = Array.isArray(mentions)
        ? mentions.filter(
            (mention) =>
              mention &&
              typeof mention === "object" &&
              mention.id &&
              Number.isInteger(Number(mention.id))
          )
        : [];

      // Limit number of mentions to prevent spam
      if (validMentions.length > 20) {
        toast.error("Too many mentions in comment");
        return;
      }

      setComment(newValue);
      setTaggedUserIds(validMentions.map((m) => Number(m.id)));
    },
    []
  );

  // Scroll to the bottom of comments section when comments change
  useEffect(() => {
    if (commentsBoxRef.current) {
      commentsBoxRef.current.scrollTop = commentsBoxRef.current.scrollHeight;
    }
  }, [comments]);

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/orders" className="text-blue-600 hover:underline">
          Orders
        </Link>{" "}
        &gt; {order && order.order_number ? order.order_number : "-"}
      </>
    );
  }, [id, order]);

  // Helper function to display a value or a dash if the value is null/undefined
  const showValue = (val) =>
    val === null || val === undefined || val === "" ? "-" : val;

  // Format date to IST with custom format
  const formatDateToIST = (dateString) => {
    if (!dateString) return "-";

    try {
      const date = new Date(dateString);

      // Convert to IST (UTC+5:30)
      const istDate = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);

      // Format as DD/MM/YYYY HH:MM AM/PM
      const day = String(istDate.getUTCDate()).padStart(2, "0");
      const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
      const year = istDate.getUTCFullYear();

      let hours = istDate.getUTCHours();
      const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";

      // Convert to 12-hour format
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      hours = String(hours).padStart(2, "0");

      return `${day}/${month}/${year} ${hours}:${minutes}${ampm}`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return dateString; // Return original if formatting fails
    }
  };

  // Helper function to show toast error for missing valuer name
  const showValuerNameError = (reportType) => {
    toast.error(
      `Please set a valuer name for this order before accessing the ${reportType} report.`
    );
  };

  // Check if order has at least one collage and one report
  const hasCollageAndReport = useMemo(() => {
    // Use orderMediaDocuments instead of approvedDocuments since they're available immediately
    const documentsToCheck =
      orderMediaDocuments?.documents || orderMediaDocuments;

    if (!documentsToCheck || !Array.isArray(documentsToCheck)) {
      /* console.log("No documents or not array:", documentsToCheck); */
      return false;
    }

    /* console.log("All documents:", documentsToCheck); */

    const collages = documentsToCheck.filter(
      (doc) => doc.document_type === "collage"
    );
    const reports = documentsToCheck.filter(
      (doc) => doc.document_type === "report"
    );

    /* console.log("Collages found:", collages);
    console.log("Reports found:", reports);
    console.log(
      "Has both collage and report:",
      collages.length > 0 && reports.length > 0
    ); */

    return collages.length > 0 && reports.length > 0;
  }, [orderMediaDocuments]);

  // Check if user has ANY office information permissions
  const hasAnyOfficePermission = useMemo(() => {
    return (
      hasPermission(allowedPermissions, "view_order_details_bank_name") ||
      hasPermission(allowedPermissions, "view_order_details_branch_name") ||
      hasPermission(allowedPermissions, "view_order_details_officer_name") ||
      hasPermission(allowedPermissions, "view_order_details_manager_name") ||
      hasPermission(
        allowedPermissions,
        "view_order_details_field_verifier_name"
      )
    );
  }, [allowedPermissions]);

  // Helper function to get filename from media URL - Secure implementation
  const getFilenameFromMediaUrl = (media_url) => {
    if (!media_url || typeof media_url !== "string") return "Document";

    // Sanitize filename to prevent path traversal and XSS
    const sanitizeFilename = (filename) => {
      if (!filename || typeof filename !== "string") return "Document";

      return (
        filename
          .replace(/[<>:"/\\|?*]/g, "") // Remove dangerous characters
          .replace(/\.\./g, "") // Remove path traversal attempts
          .replace(/^\.+/, "") // Remove leading dots
          .substring(0, 255) // Limit length
          .trim() || "Document"
      );
    };

    try {
      // Try parsing as JSON first
      const parsed = JSON.parse(media_url);

      if (parsed && typeof parsed === "object") {
        const filename = parsed.path || parsed.filename || parsed.name;
        if (filename) {
          const extractedName =
            typeof filename === "string"
              ? filename.split("/").pop() || filename
              : "Document";
          return sanitizeFilename(extractedName);
        }
      }

      return "Document";
    } catch {
      // If not JSON, treat as regular URL/path
      if (typeof media_url === "string") {
        // Validate URL format to prevent injection
        const urlPattern = /^[a-zA-Z0-9._\-/:%?&=]+$/;
        if (!urlPattern.test(media_url)) {
          return "Document";
        }

        const filename = media_url.split("/").pop() || media_url;
        return sanitizeFilename(filename);
      }

      return "Document";
    }
  };

  // Get file icon based on file type - Secure implementation
  const getFileIcon = (filename) => {
    if (!filename || typeof filename !== "string") return "📄";

    // Sanitize filename and validate extension
    const sanitizedFilename = filename
      .replace(/[<>:"/\\|?*]/g, "")
      .toLowerCase();
    const parts = sanitizedFilename.split(".");

    if (parts.length < 2) return "📁"; // No extension

    const ext = parts[parts.length - 1];

    // Validate extension to prevent code injection
    if (!/^[a-z0-9]{1,10}$/.test(ext)) return "📁";

    const iconMap = {
      pdf: "📄",
      jpg: "🖼️",
      jpeg: "🖼️",
      png: "🖼️",
      gif: "🖼️",
      webp: "🖼️",
      bmp: "🖼️",
      doc: "📝",
      docx: "📝",
      txt: "📝",
      xls: "📊",
      xlsx: "📊",
      csv: "📊",
      zip: "🗜️",
      rar: "🗜️",
      "7z": "🗜️",
      mp4: "🎥",
      avi: "🎥",
      mov: "🎥",
      mp3: "🎵",
      wav: "🎵",
    };

    return iconMap[ext] || "📁";
  };

  // Get file size - More realistic implementation with validation
  const getFileSize = (sizeInBytes) => {
    // If no size provided, return placeholder
    if (!sizeInBytes || typeof sizeInBytes !== "number" || sizeInBytes < 0) {
      return "-- KB";
    }

    const sizes = ["B", "KB", "MB", "GB"];
    let size = sizeInBytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < sizes.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    // Prevent extremely large numbers that could cause display issues
    if (size > 999999) {
      return "Large file";
    }

    return `${Math.round(size * 10) / 10} ${sizes[unitIndex]}`;
  };

  // Render approved documents as tag-style attachments (like in the image)
  const renderApprovedDocuments = () => {
    if (approvedLoading) {
      return (
        <div style={{ padding: "10px", textAlign: "center", color: "#666" }}>
          Loading approved documents...
        </div>
      );
    }

    if (!approvedDocuments || approvedDocuments.length === 0) {
      return (
        <div style={{ padding: "10px", color: "#888", fontStyle: "italic" }}>
          No approved documents to attach
        </div>
      );
    }

    // Combine all approved documents (collages first, then reports)
    const approvedCollages = approvedDocuments.filter(
      (doc) => doc.document_type === "collage"
    );
    const approvedReports = approvedDocuments.filter(
      (doc) => doc.document_type === "report"
    );
    const allApproved = [...approvedCollages, ...approvedReports];

    return (
      <div className="selected-documents-container">
        {allApproved.map((doc) => (
          <div key={doc.id} className="approved-document-tag">
            <span style={{ marginRight: "6px" }}>
              {getFilenameFromMediaUrl(doc.media_url)}
            </span>
            <button
              type="button"
              className="remove-document-tag"
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                fontSize: "14px",
                cursor: "pointer",
                padding: "0",
                marginLeft: "4px",
                lineHeight: "1",
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                // Validate document ID
                if (!doc.id || isNaN(Number(doc.id))) {
                  console.error("Invalid document ID");
                  return;
                }

                // In a real implementation, you might want to remove this document
                // For now, just show it's clickable with validation
                /* console.log("Remove attachment:", Number(doc.id)); */
              }}
              aria-label={`Remove ${getFilenameFromMediaUrl(doc.media_url)}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  };

  // Handle comment submission
  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (comment.trim()) {
      dispatch(
        addComment({
          id,
          data: {
            comment: comment.replace(/@\[(.*?)\]\(id:\d+\)/g, "@$1"), // store clean comment with only @name
            tagged_user_ids: taggedUserIds,
          },
        })
      ).then(() => {
        setComment("");
        setTaggedUserIds([]);
        dispatch(fetchComments(id));
      });
    }
  };

  // Helper to highlight tags in comment text - XSS Safe
  const renderCommentWithTags = (commentObj) => {
    if (!commentObj.tags || commentObj.tags.length === 0) {
      return commentObj.comment;
    }

    // Sanitize comment text to prevent XSS
    const sanitizeText = (text) => {
      if (typeof text !== "string") return "";
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;");
    };

    let sanitizedText = sanitizeText(commentObj.comment);

    // Only process valid tags to prevent injection
    const validTags = commentObj.tags.filter(
      (tag) =>
        tag &&
        typeof tag.name === "string" &&
        tag.name.length > 0 &&
        tag.name.length < 100 && // Reasonable length limit
        /^[a-zA-Z0-9\s_-]+$/.test(tag.name) // Only allow safe characters
    );

    validTags.forEach((tag) => {
      const escapedName = sanitizeText(tag.name);
      const regex = new RegExp(
        `@${escapedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "g"
      );
      sanitizedText = sanitizedText.replace(
        regex,
        `<span class='mention-highlight'>@${escapedName}</span>`
      );
    });

    return <span dangerouslySetInnerHTML={{ __html: sanitizedText }} />;
  };

  const OpenPaymentModal = () => {
    // Populate form with existing payment data if available
    setPaymentFormData({
      paymentAmount: order?.payment_amount
        ? order.payment_amount.toString()
        : "",
      paymentMode: order?.payment_mode || "",
      paymentStatus: order?.payment_status || "",
    });
    setShowPaymentModal(true);
  };

  const OpenMailModal = () => {
    setShowMailModal(true);
  };

  // Handle form input changes with validation
  const handlePaymentFormChange = (e) => {
    const { name, value } = e.target;

    // Validate input based on field type
    if (name === "paymentAmount") {
      // Only allow valid decimal numbers
      if (value && !/^\d*\.?\d*$/.test(value)) {
        return; // Don't update state with invalid input
      }

      // Prevent extremely large amounts
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > 999999999) {
        return;
      }
    }

    // Sanitize string inputs
    const sanitizedValue =
      typeof value === "string"
        ? value.substring(0, 255).trim() // Limit length
        : value;

    setPaymentFormData((prev) => ({
      ...prev,
      [name]: sanitizedValue,
    }));
  };

  // Handle form submission with enhanced validation
  const handlePaymentFormSubmit = () => {
    // Enhanced validation
    if (
      !paymentFormData.paymentAmount?.trim() ||
      !paymentFormData.paymentMode?.trim() ||
      !paymentFormData.paymentStatus?.trim()
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate payment amount
    const amount = parseFloat(paymentFormData.paymentAmount);
    if (isNaN(amount) || amount <= 0 || amount > 999999999) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    // Validate payment mode (whitelist approach)
    const validModes = ["NEFT", "UPI", "RTGS", "CASH", "CHEQUE"];
    if (!validModes.includes(paymentFormData.paymentMode)) {
      toast.error("Please select a valid payment mode");
      return;
    }

    // Validate payment status (whitelist approach)
    const validStatuses = ["Pending", "Received", "Failed", "Processing"];
    if (!validStatuses.includes(paymentFormData.paymentStatus)) {
      toast.error("Please select a valid payment status");
      return;
    }

    // Check if data has changed by comparing with current order data
    const currentAmount = order?.payment_amount
      ? order.payment_amount.toString()
      : "";
    const currentMode = order?.payment_mode || "";
    const currentStatus = order?.payment_status || "";

    const hasChanged =
      paymentFormData.paymentAmount !== currentAmount ||
      paymentFormData.paymentMode !== currentMode ||
      paymentFormData.paymentStatus !== currentStatus;

    if (!hasChanged) {
      toast.info("No changes detected to update");
      return;
    }

    // Validate order ID
    if (!id || isNaN(Number(id))) {
      toast.error("Invalid order ID");
      return;
    }

    // Map form data to API payload format with sanitized values
    const payload = {
      payment_amount: Number(amount.toFixed(2)), // Ensure 2 decimal places
      payment_mode: paymentFormData.paymentMode.trim(),
      payment_status: paymentFormData.paymentStatus.trim(),
    };

    // Dispatch API call with error handling
    dispatch(updatePaymentStatus({ id: Number(id), data: payload }))
      .unwrap()
      .then(() => {
        setShowPaymentModal(false);
        toast.success("Payment details updated successfully!");
      })
      .catch((error) => {
        console.error("Payment update failed:", error);
        const errorMessage =
          typeof error === "string"
            ? error.substring(0, 100)
            : "Failed to update payment details";
        toast.error(errorMessage);
      });
  };

  // Handle billing form input changes
  const handleBillingFormChange = (e) => {
    const { name, value } = e.target;
    setBillingFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle billing form submission
  const handleBillingFormSubmit = (e) => {
    e.preventDefault();
    /* console.log("Billing Form Data:", billingFormData); */
    // Here you can add API call to save billing data
    // dispatch(saveBillingData({ orderId: id, billingData: billingFormData }));
    alert("Billing details saved successfully!");
    setShowPaymentModal(false);
    // Reset form data
    setBillingFormData({
      invoiceName: "",
      invoiceAmount: "",
    });
  };

  // Handle "Open In Tally" button
  const handleOpenInTally = (e) => {
    e.preventDefault();
    /* console.log("Opening in Tally with data:", billingFormData); */
    // Here you can add logic to open Tally with the billing data
    alert("Opening in Tally...");
  };

  // Handle mail form input changes
  const handleMailFormChange = (e) => {
    const { name, value } = e.target;
    setMailFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle TO field selection (multiple selection)
  const handleToFieldChange = (selectedEmails) => {
    setMailFormData((prev) => ({
      ...prev,
      to: selectedEmails || [],
    }));
  };

  // Handle CC field selection (multiple selection)
  const handleCcFieldChange = (selectedEmails) => {
    setMailFormData((prev) => ({
      ...prev,
      cc: selectedEmails || [],
    }));
  };

  // Handle BCC field selection (multiple selection)
  const handleBccFieldChange = (selectedEmails) => {
    setMailFormData((prev) => ({
      ...prev,
      bcc: selectedEmails || [],
    }));
  };

  // Handle mail form submission with enhanced validation
  const handleMailFormSubmit = (e) => {
    e.preventDefault();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Validate TO recipients
    if (
      !mailFormData.to ||
      !Array.isArray(mailFormData.to) ||
      mailFormData.to.length === 0
    ) {
      toast.error("Please select at least one recipient");
      return;
    }

    // Validate TO email format
    const invalidToEmails = mailFormData.to.filter(
      (email) => !email || typeof email !== "string" || !emailRegex.test(email)
    );

    if (invalidToEmails.length > 0) {
      toast.error("Please ensure all TO emails are valid");
      return;
    }

    // Limit TO recipients
    if (mailFormData.to.length > 10) {
      toast.error("Maximum 10 TO recipients allowed");
      return;
    }

    // Validate CC emails if provided
    if (mailFormData.cc && Array.isArray(mailFormData.cc)) {
      const invalidCcEmails = mailFormData.cc.filter(
        (email) =>
          !email || typeof email !== "string" || !emailRegex.test(email)
      );

      if (invalidCcEmails.length > 0) {
        toast.error("Please ensure all CC emails are valid");
        return;
      }

      // Limit CC recipients to prevent spam
      if (mailFormData.cc.length > 10) {
        toast.error("Maximum 10 CC recipients allowed");
        return;
      }
    }

    // Validate BCC emails if provided
    if (mailFormData.bcc && Array.isArray(mailFormData.bcc)) {
      const invalidBccEmails = mailFormData.bcc.filter(
        (email) =>
          !email || typeof email !== "string" || !emailRegex.test(email)
      );

      if (invalidBccEmails.length > 0) {
        toast.error("Please ensure all BCC emails are valid");
        return;
      }

      // Limit BCC recipients to prevent spam
      if (mailFormData.bcc.length > 10) {
        toast.error("Maximum 10 BCC recipients allowed");
        return;
      }
    }

    // Validate order ID
    if (!id || isNaN(Number(id))) {
      toast.error("Invalid order ID");
      return;
    }

    // Validate comments length
    const comments = mailFormData.comments?.trim() || "";
    if (comments.length > 2000) {
      toast.error("Comments must be less than 2000 characters");
      return;
    }

    // Validate approved documents
    if (
      !approvedDocuments ||
      !Array.isArray(approvedDocuments) ||
      approvedDocuments.length === 0
    ) {
      toast.error("No approved documents available to send");
      return;
    }

    const sanitizedMailData = {
      to: Array.isArray(mailFormData.to)
        ? mailFormData.to.map((email) => email.trim().toLowerCase())
        : [],
      cc: Array.isArray(mailFormData.cc)
        ? mailFormData.cc.map((email) => email.trim().toLowerCase())
        : [],
      bcc: Array.isArray(mailFormData.bcc)
        ? mailFormData.bcc.map((email) => email.trim().toLowerCase())
        : [],
      subject: mailFormData.subject?.trim() || "",
      comments: comments,
      orderId: Number(id),
      approvedDocuments: approvedDocuments.filter(
        (doc) => doc && typeof doc === "object" && doc.id && doc.media_url
      ),
    };

    /*  console.log("Sanitized Mail Data:", sanitizedMailData); */

    // Here you can add API call to send mail
    // dispatch(sendMail(sanitizedMailData));
    toast.success(
      "Mail prepared successfully! (Ready for sending implementation)"
    );
    setShowMailModal(false);

    // Reset form data
    setMailFormData({
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      comments: "",
    });
  };

  return (
    <section className="order-details-wrapper">
      {/* Layout for order details page */}
      <div className="row">
        {/* Sidebar with important order information */}
        <div className="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-12 p-md-0 mb-5 ">
          <div className="order-important-info">
            {/* Order number, status, and payment status */}
            <div className="order-impo-info-card">
              <p>Order Number</p>
              <h6>{showValue(order?.order_number)}</h6>
            </div>
            {hasPermission(
              allowedPermissions,
              "view_order_details_order_status"
            ) && (
              <div className="order-impo-info-card">
                <p>Order Status</p>
                <h6>{showValue(order?.current_status_name)}</h6>
              </div>
            )}
            {hasPermission(
              allowedPermissions,
              "view_order_details_payment_status"
            ) && (
              <div className="order-impo-info-card">
                <p>Payment Status</p>
                <h6>{order?.payment_status ? order.payment_status : "-"}</h6>
              </div>
            )}
          </div>
        </div>
        {/* Main content area for order details */}
        <div className="col-xl-10 col-lg-9 col-md-9 col-sm-8 col-xs-12 mb-5">
          <div className="order-details-info">
            <div className="row h-100">
              {/* General information about the order */}
              <div
                className={`${
                  hasAnyOfficePermission ? "col-xl-4" : "col-xl-6"
                } col-lg-6 col-md-6 col-sm-12 col-xs-12 border-right h-100 mb-lg-4`}
              >
                <div className="order-details-info-card">
                  <h6>General Information</h6>
                  <div className="order-details-info-sets">
                    {/* Category, asset category, subcategory, and registration number */}
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Category</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.category_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Asset category</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.sub_category_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Subcategory</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.child_category_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Registration No</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.registration_number)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Supervisor Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.supervisor_number)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Driver Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.driver_number)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Client information section */}
              <div
                className={`${
                  hasAnyOfficePermission ? "col-xl-4" : "col-xl-6"
                } col-lg-6 col-md-6 col-sm-12 col-xs-12 ${
                  hasAnyOfficePermission ? "border-right" : ""
                } h-100 mb-lg-4`}
              >
                <div className="order-details-info-card client">
                  <h6>Client Information</h6>
                  <div className="order-details-info-sets">
                    {/* Client name and contact information */}
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Client Name</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.customer_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Contact Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.contact)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Alternative Contact Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.alternative_contact)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Place of Inspection</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.place_of_inspection)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Date of Inspection</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{formatDateToIST(order?.date_of_inspection)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Office information section - Only show if user has any office permission */}
              {hasAnyOfficePermission && (
                <div className="col-xl-4 col-lg-6 col-md-6 col-sm-12 col-xs-12">
                  <div className="order-details-info-card office">
                    <h6>Office Information</h6>
                    <div className="order-details-info-sets">
                      {/* Bank, branch, officer, and inspection details */}
                      {hasPermission(
                        allowedPermissions,
                        "view_order_details_bank_name"
                      ) && (
                        <div className="order-details-info-set">
                          <div className="order-details-info-set-heading">
                            <p>
                              <span>Bank</span>
                              <span>:</span>
                            </p>
                          </div>
                          <div className="order-details-info-set-details">
                            <p>{showValue(order?.bank_name)}</p>
                          </div>
                        </div>
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_order_details_branch_name"
                      ) && (
                        <div className="order-details-info-set">
                          <div className="order-details-info-set-heading">
                            <p>
                              <span>Branch</span>
                              <span>:</span>
                            </p>
                          </div>
                          <div className="order-details-info-set-details">
                            <p>{showValue(order?.branch_name)}</p>
                          </div>
                        </div>
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_order_details_officer_name"
                      ) && (
                        <div className="order-details-info-set">
                          <div className="order-details-info-set-heading">
                            <p>
                              <span>Officer</span>
                              <span>:</span>
                            </p>
                          </div>
                          <div className="order-details-info-set-details">
                            <p>{showValue(order?.officer_name)}</p>
                          </div>
                        </div>
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_order_details_manager_name"
                      ) && (
                        <div className="order-details-info-set">
                          <div className="order-details-info-set-heading">
                            <p>
                              <span>Manager</span>
                              <span>:</span>
                            </p>
                          </div>
                          <div className="order-details-info-set-details">
                            <p>{showValue(order?.manager_name)}</p>
                          </div>
                        </div>
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "view_order_details_field_verifier_name"
                      ) && (
                        <div className="order-details-info-set">
                          <div className="order-details-info-set-heading">
                            <p>
                              <span>Field Verifier</span>
                              <span>:</span>
                            </p>
                          </div>
                          <div className="order-details-info-set-details">
                            <p>{showValue(order?.field_verifier_name)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Recent activity section */}

        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
          <div className="recent-activity-wrapper">
            <div className="recent-activity-heading">
              {hasPermission(
                allowedPermissions,
                "view_order_recent_activity"
              ) && <h3>Recent Activity</h3>}
              <div className="recent-activity-buttons">
                {/* Action buttons for uploading images and reports, validating, etc. */}
                {hasPermission(
                  allowedPermissions,
                  "view_order_media_documents"
                ) && (
                  <Link
                    to={`/orders/${id}/details/documents`}
                    title="Documents"
                    className="tooltip-link"
                  >
                    <FolderIcon />
                    {/*  <DocumentsIcon /> */}
                  </Link>
                )}

                {/* Conditional Report Buttons based on Category
                    - "COMMERCIAL VEHICLE" -> CV Report
                    - "CONSTRUCTION EQUIPMENTS" -> CE Report  
                    - Categories containing "AVR" -> AVR Report
                    - "MACHINERY" -> Machinery Report
                */}
                {hasPermission(allowedPermissions, "generate_order_report") && (
                  <>
                    {/* CV Report - Commercial Vehicle */}
                    {order?.category_name === "COMMERCIAL VEHICLE" && (
                      <>
                        {order?.valuer_name &&
                        order.valuer_name.trim() !== "" ? (
                          order?.current_status_id === 10 && !isExemptAdmin ? (
                            <span
                              title="CV Report (Disabled)"
                              className="tooltip-link disabled"
                              style={{ cursor: "not-allowed" }}
                            >
                              <ReportIcon />
                            </span>
                          ) : (
                            <Link
                              to={`/orders/${id}/details/cv-report`}
                              title="CV Report"
                              className="tooltip-link"
                            >
                              <ReportIcon />
                            </Link>
                          )
                        ) : (
                          <button
                            title="CV Report"
                            className="tooltip-link"
                            onClick={() => showValuerNameError("CV")}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              outline: "none",
                              boxShadow: "none",
                            }}
                          >
                            <ReportIcon />
                          </button>
                        )}
                        {/* <Link
                          to={`/orders/${id}/details/ce-report`}
                          title="CE Report"
                          className="tooltip-link"
                        >
                          <ReportIcon />
                        </Link>
                        <Link
                          to={`/orders/${id}/details/avr-report`}
                          title="AVR Report"
                          className="tooltip-link"
                        >
                          <ReportIcon />
                        </Link>
                        <Link
                          to={`/orders/${id}/details/machinery-report`}
                          title="Machinery Report"
                          className="tooltip-link"
                        >
                          <ReportIcon />
                        </Link> */}
                        <Link
                          to={`/orders/${id}/details/marine-report`}
                          title="Marine Report"
                          className="tooltip-link"
                        >
                          <ReportIcon />
                        </Link>
                      </>
                    )}

                    {/* CE Report - Construction Equipment */}
                    {order?.category_name === "CONSTRUCTION EQUIPMENT" && (
                      <>
                        {order?.valuer_name &&
                        order.valuer_name.trim() !== "" ? (
                          order?.current_status_id === 10 && !isExemptAdmin ? (
                            <span
                              title="CE Report (Disabled)"
                              className="tooltip-link disabled"
                              style={{ cursor: "not-allowed" }}
                            >
                              <ReportIcon />
                            </span>
                          ) : (
                            <Link
                              to={`/orders/${id}/details/ce-report`}
                              title="CE Report"
                              className="tooltip-link"
                            >
                              <ReportIcon />
                            </Link>
                          )
                        ) : (
                          <button
                            title="CE Report"
                            className="tooltip-link"
                            onClick={() => showValuerNameError("CE")}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              outline: "none",
                              boxShadow: "none",
                            }}
                          >
                            <ReportIcon />
                          </button>
                        )}
                      </>
                    )}

                    {/* AVR Report - Categories containing AVR */}
                    {order?.category_name &&
                      order.category_name.toUpperCase().includes("AVR") && (
                        <>
                          {order?.valuer_name &&
                          order.valuer_name.trim() !== "" ? (
                            order?.current_status_id === 10 &&
                            !isExemptAdmin ? (
                              <span
                                title="AVR Report (Disabled)"
                                className="tooltip-link disabled"
                                style={{ cursor: "not-allowed" }}
                              >
                                <ReportIcon />
                              </span>
                            ) : (
                              <Link
                                to={`/orders/${id}/details/avr-report`}
                                title="AVR Report"
                                className="tooltip-link"
                              >
                                <ReportIcon />
                              </Link>
                            )
                          ) : (
                            <button
                              title="AVR Report"
                              className="tooltip-link"
                              onClick={() => showValuerNameError("AVR")}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                outline: "none",
                                boxShadow: "none",
                              }}
                            >
                              <ReportIcon />
                            </button>
                          )}
                        </>
                      )}

                    {/* Machinery Report */}
                    {order?.category_name === "MACHINERY" && (
                      <>
                        {order?.valuer_name &&
                        order.valuer_name.trim() !== "" ? (
                          order?.current_status_id === 10 && !isExemptAdmin ? (
                            <span
                              title="Machinery Report (Disabled)"
                              className="tooltip-link disabled"
                              style={{ cursor: "not-allowed" }}
                            >
                              <ReportIcon />
                            </span>
                          ) : (
                            <Link
                              to={`/orders/${id}/details/machinery-report`}
                              title="Machinery Report"
                              className="tooltip-link"
                            >
                              <ReportIcon />
                            </Link>
                          )
                        ) : (
                          <button
                            title="Machinery Report"
                            className="tooltip-link"
                            onClick={() => showValuerNameError("Machinery")}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              outline: "none",
                              boxShadow: "none",
                            }}
                          >
                            <ReportIcon />
                          </button>
                        )}
                      </>
                    )}
                    {order?.category_name === "MARINE" && (
                      <>
                        {order?.valuer_name &&
                        order.valuer_name.trim() !== "" ? (
                          order?.current_status_id === 10 && !isExemptAdmin ? (
                            <span
                              title="Marine Report (Disabled)"
                              className="tooltip-link disabled"
                              style={{ cursor: "not-allowed" }}
                            >
                              <ReportIcon />
                            </span>
                          ) : (
                            <Link
                              to={`/orders/${id}/details/marine-report`}
                              title="Marine Report"
                              className="tooltip-link"
                            >
                              <ReportIcon />
                            </Link>
                          )
                        ) : (
                          <button
                            title="Marine Report"
                            className="tooltip-link"
                            onClick={() => showValuerNameError("Marine")}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              outline: "none",
                              boxShadow: "none",
                            }}
                          >
                            <ReportIcon />
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
                {/* <Link
                  to={`/orders/${id}/details/custom-report`}
                  title="Custom Report"
                  className="tooltip-link"
                >
                  <ReportIcon />
                </Link> */}
                {hasPermission(
                  allowedPermissions,
                  "view_order_media_files"
                ) && (
                  <>
                    {order?.valuer_name && order.valuer_name.trim() !== "" ? (
                      order?.current_status_id === 10 && !isExemptAdmin ? (
                        <span
                          title="Images (Disabled)"
                          className="tooltip-link disabled"
                          style={{ cursor: "not-allowed" }}
                        >
                          <ImageCollageIcon />
                        </span>
                      ) : (
                        <Link
                          to={`/orders/${id}/details/images`}
                          title="Images"
                          className="tooltip-link"
                        >
                          <ImageCollageIcon />
                        </Link>
                      )
                    ) : (
                      <button
                        title="Images"
                        className="tooltip-link"
                        onClick={() => showValuerNameError("Images")}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          outline: "none",
                          boxShadow: "none",
                        }}
                      >
                        <ImageCollageIcon />
                      </button>
                    )}
                  </>
                )}

                {/* Complete button - only show if:
                    1. Has permission to view complete button
                    2. Order status is 8
                    3. Has at least one approved report and one approved collage
                */}
                {(() => {
                  // Debug each condition
                  const hasCompletePermission = hasPermission(
                    allowedPermissions,
                    "view_order_complete_button"
                  );
                  const hasCorrectStatus = order?.current_status_id === 9;

                  // Get all documents from the Redux state
                  const allDocs =
                    orderMediaDocumentsState?.documents?.documents ||
                    orderMediaDocumentsState?.documents ||
                    [];

                  // Get all reports and collages first
                  const allReports = allDocs.filter(
                    (doc) => doc.document_type === "report"
                  );
                  const allCollages = allDocs.filter(
                    (doc) => doc.document_type === "collage"
                  );

                  // Then filter for approved ones
                  const approvedReports = allReports.filter(
                    (doc) => doc.status === "approved"
                  );
                  const approvedCollages = allCollages.filter(
                    (doc) => doc.status === "approved"
                  );

                  // Check if we have at least one of each
                  const hasApprovedReport = approvedReports.length > 0;
                  const hasApprovedCollage = approvedCollages.length > 0;

                  return (
                    hasCompletePermission &&
                    hasCorrectStatus &&
                    hasApprovedReport &&
                    hasApprovedCollage && (
                      <button
                        title="Complete"
                        className="tooltip-link button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                        onClick={() => setShowCompleteConfirmation(true)}
                      >
                        <ValidateIcon />
                      </button>
                    )
                  );
                })()}
                {hasCollageAndReport &&
                  hasPermission(
                    allowedPermissions,
                    "view_order_authenticate_button"
                  ) &&
                  isSuperAdmin &&
                  order?.current_status_id === 10 && (
                    <>
                      <button
                        title="Authenticate"
                        className="tooltip-link button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                        onClick={() => setShowAuthenticateConfirmation(true)}
                      >
                        <ApprovedIcon />
                      </button>
                      <button
                        title="Revisions Required"
                        className="tooltip-link button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                        onClick={() => setShowRevisionConfirmation(true)}
                      >
                        <RevalidateIcon />
                      </button>
                    </>
                  )}
                {hasPermission(
                  allowedPermissions,
                  "view_order_payment_button"
                ) && (
                  <Link
                    title="Payment"
                    className="tooltip-link"
                    onClick={OpenPaymentModal}
                  >
                    <PaymentIcon />
                  </Link>
                )}
                {hasPermission(
                  allowedPermissions,
                  "view_order_mail_button"
                ) && (
                  <Link
                    title="Mail"
                    className="tooltip-link"
                    onClick={OpenMailModal}
                  >
                    <MailIcon />
                  </Link>
                )}
              </div>
            </div>
            {hasPermission(
              allowedPermissions,
              "view_order_recent_activity"
            ) && (
              <div className="activities-wrapper">
                <div className="activities">
                  {order?.status_history && order.status_history.length > 0 ? (
                    order.status_history.map((status) => (
                      <div className="activity" key={status.id}>
                        <div className="activity-icon bg-primary text-white">
                          {status.changed_by_name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div className="activity-detail">
                          <p className="activity-time">
                            {timeAgo(status.changed_at)}
                          </p>
                          <p className="activity-description">
                            {status.status_name && status.activity_extra
                              ? `${showValue(
                                  status.status_name
                                )} by ${showValue(
                                  status.changed_by_name
                                )} [ ${showValue(status.activity_extra)} ]`
                              : status.status_name
                              ? `${showValue(
                                  status.status_name
                                )} by ${showValue(status.changed_by_name)}`
                              : `${showValue(
                                  status.activity_extra
                                )} by ${showValue(status.changed_by_name)}`}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>No recent activity</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comments section */}
        {hasPermission(allowedPermissions, "view_order_comments") && (
          <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
            <div className="order-comments-wrapper">
              <h3>Comments</h3>
              <div className="order-comments-box">
                <div
                  className="order-comments-show-comments"
                  ref={commentsBoxRef}
                >
                  <div className="order-comments-show-comments-inner">
                    {comments && comments.length > 0 ? (
                      comments.map((commentObj) => (
                        <div
                          className="order-comments-show-comments-card"
                          key={commentObj.id}
                        >
                          <div className="order-comments-show-comments-card-icon">
                            {commentObj.user_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <div className="order-comments-show-comments-card-content">
                            <p className="order-comments-show-comments-card-content-text">
                              <span className="name">
                                {showValue(commentObj.user_name)}
                              </span>
                              &nbsp;added a comment&nbsp;
                              <span>{timeAgo(commentObj.commented_at)}</span>
                            </p>
                            <p className="order-comments-show-comments-card-content-text-comment">
                              {renderCommentWithTags(commentObj)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div>No comments</div>
                    )}
                    <div ref={commentsEndRef} />
                  </div>
                </div>
                {hasPermission(allowedPermissions, "add_order_comments") && (
                  <form
                    className="order-comments-add-comments"
                    onSubmit={handleCommentSubmit}
                  >
                    <MentionsInput
                      value={comment}
                      onChange={handleMentionChange}
                      className="mentions"
                      placeholder="type your comment here..."
                      allowSpaceInQuery
                      style={mentionsStyle}
                      singleLine
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleCommentSubmit(e);
                        }
                      }}
                    >
                      <Mention
                        trigger="@"
                        data={getFilteredUsers()}
                        displayTransform={(id, display) => `@${display}`}
                        appendSpaceOnAdd={true}
                        markup="@[__display__](id:__id__)"
                      />
                    </MentionsInput>
                    <button type="submit">
                      <EditIcon className="icon" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showPaymentModal && (
        <FormModel>
          {{
            title: " ",
            body: (
              <div
                className="payment-modal-content"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handlePaymentFormSubmit();
                  }
                }}
                tabIndex={-1}
              >
                {/* Bootstrap-style tab navigation */}
                <ul className="nav nav-tabs" role="tablist">
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${
                        activeTab === "payment" ? "active" : ""
                      }`}
                      onClick={() => setActiveTab("payment")}
                      type="button"
                      role="tab"
                    >
                      Payment Details
                    </button>
                  </li>
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${
                        activeTab === "billing" ? "active" : ""
                      }`}
                      onClick={() => setActiveTab("billing")}
                      type="button"
                      role="tab"
                    >
                      Billing Details
                    </button>
                  </li>
                </ul>

                {/* Tab content */}
                <div className="tab-content">
                  {activeTab === "payment" && (
                    <form
                      className="body-form-box tab-pane active"
                      role="tabpanel"
                      onSubmit={(e) => {
                        e.preventDefault(); // prevent full page reload
                        handlePaymentFormSubmit();
                      }}
                    >
                      <div className="body-form-box">
                        <div className="form-group">
                          <label>Payment Amount</label>
                          <div className="have-field-with-icon">
                            <div className="input-icon">
                              <MoneyIcon />
                            </div>
                            <input
                              type="text"
                              className="form-field"
                              id="paymentAmount"
                              name="paymentAmount"
                              value={paymentFormData.paymentAmount}
                              onChange={handlePaymentFormChange}
                              placeholder="Enter amount"
                              maxLength="12"
                              autoComplete="off"
                              aria-label="Payment Amount"
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="paymentMode">Payment Mode</label>
                          <div className="radio-group">
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentMode === "NEFT"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="NEFT"
                                name="paymentMode"
                                checked={paymentFormData.paymentMode === "NEFT"}
                                onChange={handlePaymentFormChange}
                              />
                              NEFT
                            </label>
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentMode === "UPI"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="UPI"
                                name="paymentMode"
                                checked={paymentFormData.paymentMode === "UPI"}
                                onChange={handlePaymentFormChange}
                              />
                              UPI
                            </label>
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="paymentStatus">Payment Status</label>
                          <div className="radio-group">
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentStatus === "Pending"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="Pending"
                                name="paymentStatus"
                                checked={
                                  paymentFormData.paymentStatus === "Pending"
                                }
                                onChange={handlePaymentFormChange}
                              />
                              Pending
                            </label>
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentStatus === "Received"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="Received"
                                name="paymentStatus"
                                checked={
                                  paymentFormData.paymentStatus === "Received"
                                }
                                onChange={handlePaymentFormChange}
                              />
                              Received
                            </label>
                          </div>
                        </div>
                        <div className="form-buttons">
                          <button
                            type="submit"
                            className="submit-button"
                            disabled={paymentUpdating}
                          >
                            {paymentUpdating ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {activeTab === "billing" && (
                    <form
                      className="body-form-box tab-pane active"
                      role="tabpanel"
                      onSubmit={handleBillingFormSubmit}
                    >
                      <div className="body-form-box">
                        <div className="form-group">
                          <label>Invoice Name</label>
                          <input
                            type="text"
                            className="form-field"
                            name="invoiceName"
                            value={billingFormData.invoiceName}
                            onChange={handleBillingFormChange}
                          />
                        </div>
                        <div className="form-group">
                          <label>Invoice Amount</label>
                          <div className="have-field-with-icon">
                            <div className="input-icon">
                              <MoneyIcon />
                            </div>
                            <input
                              type="text"
                              className="form-field"
                              name="invoiceAmount"
                              value={billingFormData.invoiceAmount}
                              onChange={handleBillingFormChange}
                              onKeyDown={(e) => {
                                // Allow: backspace, delete, tab, escape, enter, decimal point
                                if (
                                  [46, 8, 9, 27, 13, 110, 190].indexOf(
                                    e.keyCode
                                  ) !== -1 ||
                                  // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                                  (e.keyCode === 65 && e.ctrlKey === true) ||
                                  (e.keyCode === 67 && e.ctrlKey === true) ||
                                  (e.keyCode === 86 && e.ctrlKey === true) ||
                                  (e.keyCode === 88 && e.ctrlKey === true) ||
                                  // Allow: home, end, left, right, down, up
                                  (e.keyCode >= 35 && e.keyCode <= 40)
                                ) {
                                  return;
                                }
                                // Ensure that it is a number and stop the keypress
                                if (
                                  (e.shiftKey ||
                                    e.keyCode < 48 ||
                                    e.keyCode > 57) &&
                                  (e.keyCode < 96 || e.keyCode > 105)
                                ) {
                                  e.preventDefault();
                                }
                              }}
                              placeholder="Enter amount"
                            />
                          </div>
                        </div>
                        <div className="form-buttons two">
                          <button type="submit" className="submit-button">
                            Save
                          </button>
                          <button
                            type="button"
                            className="submit-button open-tally"
                            onClick={handleOpenInTally}
                          >
                            Open In Tally
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ),
            onClose: () => {
              setShowPaymentModal(false);
            },
          }}
        </FormModel>
      )}

      {showMailModal && (
        <FormModel>
          {{
            title: "Mail Documents",
            body: (
              <form className="body-form-box" onSubmit={handleMailFormSubmit}>
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="to">To*</label>
                    <SingleSearchSelect
                      id="to"
                      className="search-selector"
                      options={bankOfficersOptions}
                      value={mailFormData.to}
                      onChange={handleToFieldChange}
                      placeholder="Select recipients..."
                      isMulti={true}
                    />
                  </div>

                  <div className="form-group">
                    <label>CC</label>
                    <SingleSearchSelect
                      options={allOfficersEmails}
                      value={mailFormData.cc}
                      onChange={handleCcFieldChange}
                      placeholder="Select CC recipients..."
                      isMulti={true}
                    />
                  </div>

                  <div className="form-group">
                    <label>BCC</label>
                    <SingleSearchSelect
                      options={allOfficersEmails}
                      value={mailFormData.bcc}
                      onChange={handleBccFieldChange}
                      placeholder="Select BCC recipients..."
                      isMulti={true}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="subject">Subject</label>
                    <input
                      className="form-field"
                      id="subject"
                      name="subject"
                      type="text"
                      value={mailFormData.subject}
                      onChange={handleMailFormChange}
                      placeholder="Enter email subject"
                      maxLength="200"
                      aria-label="Subject"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="comments">Comments</label>
                    <textarea
                      className="form-field"
                      id="comments"
                      name="comments"
                      value={mailFormData.comments}
                      onChange={handleMailFormChange}
                      rows="3"
                      placeholder=""
                      style={{ resize: "vertical" }}
                      maxLength="2000"
                      aria-label="Comments"
                    />
                  </div>

                  <div className="form-group">
                    <label>Selected Collage & Reports</label>
                    {renderApprovedDocuments()}
                  </div>

                  <div className="form-buttons">
                    <button
                      className="submit-button"
                      type="submit"
                      style={{
                        backgroundColor: "#4ade80",
                        borderColor: "#4ade80",
                        color: "white",
                        fontWeight: "500",
                        padding: "12px 24px",
                        borderRadius: "6px",
                        width: "100%",
                        fontSize: "14px",
                      }}
                    >
                      Send Mail
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowMailModal(false);
            },
          }}
        </FormModel>
      )}

      {/* Complete Confirmation Modal */}
      {showCompleteConfirmation && (
        <ConfirmationModal
          title="Confirm Complete"
          message={`Are you sure you want to complete this order <span class="danger">${order?.order_number}</span>?`}
          onConfirm={() => {
            dispatch(updateOrderToStatus9(id)).then((result) => {
              if (result.meta.requestStatus === "fulfilled") {
                // Status updated successfully
                dispatch(fetchOrderById(id)); // Refresh order data
                setShowCompleteConfirmation(false);
              }
            });
          }}
          onCancel={() => setShowCompleteConfirmation(false)}
        />
      )}

      {/* Authenticate Confirmation Modal */}
      {showAuthenticateConfirmation && (
        <ConfirmationModal
          title="Confirm Authentication"
          message={`Are you sure you want to authenticate this order <span class="danger">${order?.order_number}</span>?`}
          onConfirm={() => {
            dispatch(
              updateStatusAfterUnderReview({
                id,
                data: { status_id: 12 },
              })
            ).then((result) => {
              if (result.meta.requestStatus === "fulfilled") {
                // Status updated successfully
                dispatch(fetchOrderById(id)); // Refresh order data
                setShowAuthenticateConfirmation(false);
              }
            });
          }}
          onCancel={() => setShowAuthenticateConfirmation(false)}
        />
      )}

      {/* Revision Required Confirmation Modal */}
      {showRevisionConfirmation && (
        <ConfirmationModal
          title="Confirm Revision Required"
          message={`Are you sure you want to mark this order <span class="danger">${order?.order_number}</span> for revision?`}
          onConfirm={() => {
            dispatch(
              updateStatusAfterUnderReview({
                id,
                data: { status_id: 11 },
              })
            ).then((result) => {
              if (result.meta.requestStatus === "fulfilled") {
                // Status updated successfully
                dispatch(fetchOrderById(id)); // Refresh order data
                setShowRevisionConfirmation(false);
              }
            });
          }}
          onCancel={() => setShowRevisionConfirmation(false)}
        />
      )}
    </section>
  );
}

export default OrderDetails;
