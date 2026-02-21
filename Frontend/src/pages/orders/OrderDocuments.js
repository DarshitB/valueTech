import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Link, useParams } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { usePageTitle } from "../../context/PageTitleContext";
import { fetchOrderById } from "../../redux/reducers/orderReducer";
import {
  fetchOrderMediaDocuments,
  uploadOrderMediaDocuments,
  deleteOrderMediaDocuments,
  approveOrderMediaDocuments,
  removeApproveOrderMediaDocuments,
  uploadOrderReportCollage,
  uploadMultipleOrderReportsCollages,
} from "../../redux/reducers/orderMediaDocumentsReducer";
import CustomDataTable from "../../components/CustomDataTable";
import {
  DeleteIcon,
  DownloadDocumentIcon,
  ViewIcon,
  ApprovedIcon,
  ReportIcon,
} from "../../components/icons";
import { PlusIcon } from "lucide-react";
import ConfirmationModal from "../../components/ConfirmationModal";
import { toast } from "react-toastify";
import { hasPermission } from "../../utils/permissionUtils";
import { selectPermissions } from "../../redux/selectors/authSelectors";

// Constants for security and configuration
const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES_COUNT = 50;
const DOCUMENT_TYPES = ["collage", "report", "documents"];

// Security utilities
const sanitizeFilename = (filename) => {
  if (!filename || typeof filename !== "string") return "document";
  // Remove path traversal attempts and dangerous characters
  return (
    filename
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/\.\./g, "_")
      .substring(0, 255)
      .trim() || "document"
  );
};

const validateUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    // Only allow http/https protocols
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const validateFileType = (file) => {
  return ALLOWED_FILE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE;
};

// Custom hooks for better organization
const useDocumentState = () => {
  const [selectedCollages, setSelectedCollages] = useState([]);
  const [selectedReports, setSelectedReports] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const clearSelections = useCallback(() => {
    setSelectedCollages([]);
    setSelectedReports([]);
    setSelectedDocuments([]);
  }, []);

  return {
    selectedCollages,
    setSelectedCollages,
    selectedReports,
    setSelectedReports,
    selectedDocuments,
    setSelectedDocuments,
    uploadProgress,
    setUploadProgress,
    isUploading,
    setIsUploading,
    confirmDeleteId,
    setConfirmDeleteId,
    confirmDeleteName,
    setConfirmDeleteName,
    clearSelections,
  };
};

function OrderDocuments() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const allowedPermissions = useSelector(selectPermissions);
  const currentUser = useSelector((state) => state.auth.user);
  const isExemptAdmin =
    currentUser?.role?.name.toUpperCase().includes("SUPER ADMIN") ||
    currentUser?.role?.name === "developer_admin";
  const userRole = currentUser?.role?.name?.toUpperCase();
  const isBankUser = userRole === "BANK OFFICER" || userRole === "BANK AUTHORITY";
  const { setTitle } = usePageTitle();
  const abortControllerRef = useRef(null);

  // Validate order ID
  const orderId = useMemo(() => {
    const parsed = parseInt(id, 10);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error("Invalid order ID");
      return null;
    }
    return parsed;
  }, [id]);

  const order = useSelector((state) => state.orders.selected);
  const { documents, loading, uploadLoading, approveLoading, removeApproveLoading, error, reportCollageUploadLoading } =
    useSelector((state) => state.orderMediaDocuments);

  // Refs for file inputs
  const reportFileInputRef = useRef(null);
  const collageFileInputRef = useRef(null);

  // State to track which type is being uploaded
  const [uploadingType, setUploadingType] = useState(null);

  const documentState = useDocumentState();

  // Memoized document segregation for performance
  const segregatedDocuments = useMemo(() => {
    const documentsArray = documents?.documents || documents || [];

    if (!Array.isArray(documentsArray)) {
      console.warn("Documents data is not an array:", documentsArray);
      return { collage: [], report: [], documents: [] };
    }

    // Filter documents based on user role
    // BANK OFFICER and BANK AUTHORITY can only see approved/verified collages and reports
    const filterDocuments = (docArray, docType) => {
      const filtered = docArray.filter((doc) => doc?.document_type === docType);

      // If user is BANK OFFICER or BANK AUTHORITY, only show approved documents for collages and reports
      if (isBankUser && (docType === "collage" || docType === "report")) {
        return filtered.filter((doc) => doc?.status === "approved");
      }

      return filtered;
    };

    return {
      collage: filterDocuments(documentsArray, "collage"),
      report: filterDocuments(documentsArray, "report"),
      documents: documentsArray.filter(
        (doc) => doc?.document_type === "documents"
      ),
    };
  }, [documents, isBankUser]);

  // Secure URL parsing utility
  const parseMediaUrl = useCallback((mediaUrl) => {
    if (!mediaUrl) return null;

    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(mediaUrl);
      if (parsed.path && typeof parsed.path === "string") {
        const cleanPath = parsed.path.startsWith("/")
          ? parsed.path
          : `/${parsed.path}`;
        return `${baseUrl}${cleanPath}`;
      }
      if (parsed.link && validateUrl(parsed.link)) {
        return parsed.link;
      }
    } catch {
      // If not JSON, treat as direct path
      if (typeof mediaUrl === "string") {
        const cleanPath = mediaUrl.startsWith("/") ? mediaUrl : `/${mediaUrl}`;
        return `${baseUrl}${cleanPath}`;
      }
    }

    return null;
  }, []);

  // Enhanced date formatting with error handling
  const formatDate = useCallback((dateString) => {
    if (!dateString) return "-";

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-";

      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true, // <--- 12-hour format
      }).format(date);
    } catch (error) {
      console.warn("Date formatting error:", error);
      return "-";
    }
  }, []);

  // Secure filename extraction
  const getFilenameFromMediaUrl = useCallback((mediaUrl) => {
    if (!mediaUrl) return "document";

    try {
      const parsed = JSON.parse(mediaUrl);
      if (parsed.filename) return sanitizeFilename(parsed.filename);
      if (parsed.path) return sanitizeFilename(parsed.path.split("/").pop());
      if (parsed.name) return sanitizeFilename(parsed.name);
    } catch {
      if (typeof mediaUrl === "string") {
        return sanitizeFilename(mediaUrl.split("/").pop());
      }
    }

    return "document";
  }, []);

  // Fetch data with proper cleanup
  useEffect(() => {
    if (!orderId) return;

    // Cancel previous requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    const fetchData = async () => {
      try {
        if (!order || order.id !== orderId) {
          await dispatch(fetchOrderById(orderId));
        }
        await dispatch(fetchOrderMediaDocuments(orderId));
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Failed to fetch order data:", error);
          toast.error("Failed to load order documents");
        }
      }
    };

    fetchData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [dispatch, orderId, order]);

  // Enhanced checkbox handling with validation
  const handleCheckboxChange = useCallback(
    (documentId, type) => {
      if (!DOCUMENT_TYPES.includes(type)) {
        console.warn("Invalid document type:", type);
        return;
      }

      const setters = {
        collage: documentState.setSelectedCollages,
        report: documentState.setSelectedReports,
        documents: documentState.setSelectedDocuments,
      };

      const setter = setters[type];
      if (setter) {
        setter((prev) =>
          prev.includes(documentId)
            ? prev.filter((id) => id !== documentId)
            : [...prev, documentId]
        );
      }
    },
    [documentState]
  );

  // Secure document viewing
  const handleViewDocument = useCallback(
    (document) => {
      if (!document?.media_url) {
        toast.error("Document URL not available");
        return;
      }

      const fileUrl = parseMediaUrl(document.media_url);
      if (!fileUrl || !validateUrl(fileUrl)) {
        toast.error("Invalid document URL");
        return;
      }

      // Open in new tab with security measures
      const newWindow = window.open();
      if (newWindow) {
        newWindow.opener = null; // Security: prevent access to parent window
        newWindow.location = fileUrl;
      } else {
        toast.error("Popup blocked. Please allow popups for this site.");
      }
    },
    [parseMediaUrl]
  );

  // Enhanced download with better error handling
  const handleDownloadDocument = useCallback(
    async (doc) => {
      if (!doc?.media_url) {
        toast.error("Document not available for download");
        return;
      }

      const downloadUrl = parseMediaUrl(doc.media_url);
      if (!downloadUrl || !validateUrl(downloadUrl)) {
        toast.error("Invalid download URL");
        return;
      }

      const filename = getFilenameFromMediaUrl(doc.media_url);

      try {
        const response = await fetch(downloadUrl, {
          method: "GET",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();

        // Create secure download
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        toast.success("Download started");
      } catch (error) {
        console.error("Download failed:", error);
        toast.error(`Download failed: ${error.message}`);
      }
    },
    [parseMediaUrl, getFilenameFromMediaUrl]
  );

  // Enhanced delete with proper validation
  const handleDeleteDocument = useCallback(
    (doc) => {
      if (!doc?.id) {
        toast.error("Invalid document");
        return;
      }

      const filename = getFilenameFromMediaUrl(doc.media_url);
      documentState.setConfirmDeleteId(doc.id);
      documentState.setConfirmDeleteName(filename);
    },
    [getFilenameFromMediaUrl, documentState]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!documentState.confirmDeleteId) return;

    try {
      await dispatch(
        deleteOrderMediaDocuments(documentState.confirmDeleteId)
      ).unwrap();
      await dispatch(fetchOrderMediaDocuments(orderId));
      toast.success("Document deleted successfully");
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete document");
    } finally {
      documentState.setConfirmDeleteId(null);
      documentState.setConfirmDeleteName("");
    }
  }, [dispatch, orderId, documentState]);

  // Enhanced ZIP download with progress tracking
  const handleDownloadSelected = useCallback(
    async (selectedIds, documentType) => {
      if (!selectedIds?.length) {
        toast.error("Please select documents to download");
        return;
      }

      if (!DOCUMENT_TYPES.includes(documentType)) {
        toast.error("Invalid document type");
        return;
      }

      try {
        const JSZip = await import("jszip");
        const zip = new JSZip.default();

        const documentsArray = documents?.documents || documents || [];
        const selectedDocs = documentsArray.filter(
          (doc) => selectedIds.includes(doc.id) && doc.media_url
        );

        if (!selectedDocs.length) {
          toast.error("No valid documents found");
          return;
        }

        let successCount = 0;

        for (const doc of selectedDocs) {
          try {
            const fileUrl = parseMediaUrl(doc.media_url);
            if (!fileUrl || !validateUrl(fileUrl)) continue;

            const response = await fetch(fileUrl);
            if (!response.ok) continue;

            const blob = await response.blob();
            const filename = getFilenameFromMediaUrl(doc.media_url);

            zip.file(filename, blob);
            successCount++;
          } catch (error) {
            console.warn(`Failed to download file ${doc.id}:`, error);
          }
        }

        if (successCount === 0) {
          toast.error("No documents could be downloaded");
          return;
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(zipBlob);

        link.href = url;
        link.download = `${order?.order_number || "order"}_${documentType}_${new Date().toISOString().split("T")[0]
          }.zip`;
        link.style.display = "none";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        toast.success(`Downloaded ${successCount} document(s)`);
      } catch (error) {
        console.error("ZIP creation failed:", error);
        toast.error("Failed to create download archive");
      }
    },
    [documents, parseMediaUrl, getFilenameFromMediaUrl, order]
  );

  // Enhanced verification with proper error handling
  const handleVerifySelected = useCallback(
    async (selectedIds, documentType) => {
      if (!selectedIds?.length) {
        toast.error("Please select documents to verify");
        return;
      }

      if (!["collage", "report"].includes(documentType)) {
        toast.error("Only reports and collages can be verified");
        return;
      }

      // Check permissions before proceeding
      const requiredPermission =
        documentType === "collage"
          ? "approve_order_collage"
          : "approve_order_report";

      if (!hasPermission(allowedPermissions, requiredPermission)) {
        // Silently return without showing error if permission is missing
        return;
      }

      try {
        await dispatch(
          approveOrderMediaDocuments({
            orderId,
            documentIds: selectedIds,
          })
        ).unwrap();

        await dispatch(fetchOrderMediaDocuments(orderId));

        // Clear selections
        if (documentType === "collage") {
          documentState.setSelectedCollages([]);
        } else if (documentType === "report") {
          documentState.setSelectedReports([]);
        }

        toast.success(
          `${selectedIds.length} document(s) verified successfully`
        );
      } catch (error) {
        // Only show error if it's not a permission error
        if (error?.response?.status !== 403) {
          console.error("Verification failed:", error);
          toast.error("Failed to verify documents");
        }
      }
    },
    [dispatch, orderId, documentState, allowedPermissions]
  );

  // Enhanced remove approval with proper error handling
  const handleRemoveApproveSelected = useCallback(
    async (selectedIds, documentType) => {
      if (!selectedIds?.length) {
        toast.error("Please select documents to remove approval");
        return;
      }

      if (!["collage", "report"].includes(documentType)) {
        toast.error("Only reports and collages can have approval removed");
        return;
      }

      // Check permissions before proceeding
      const requiredPermission =
        documentType === "collage"
          ? "remove_approve_order_collage"
          : "remove_approve_order_report";

      if (!hasPermission(allowedPermissions, requiredPermission)) {
        // Silently return without showing error if permission is missing
        return;
      }

      try {
        await dispatch(
          removeApproveOrderMediaDocuments({
            orderId,
            documentIds: selectedIds,
          })
        ).unwrap();

        await dispatch(fetchOrderMediaDocuments(orderId));

        // Clear selections
        if (documentType === "collage") {
          documentState.setSelectedCollages([]);
        } else if (documentType === "report") {
          documentState.setSelectedReports([]);
        }

        toast.success(
          `${selectedIds.length} document(s) approval removed successfully`
        );
      } catch (error) {
        // Only show error if it's not a permission error
        if (error?.response?.status !== 403) {
          console.error("Remove approval failed:", error);
          toast.error("Failed to remove approval from documents");
        }
      }
    },
    [dispatch, orderId, documentState, allowedPermissions]
  );

  // Helper function to check if any selected documents are approved
  const hasApprovedDocuments = useCallback(
    (selectedIds, documentType) => {
      if (!selectedIds?.length) return false;

      const documentsArray = documents?.documents || documents || [];
      if (!Array.isArray(documentsArray)) return false;

      const filteredDocs = documentsArray.filter(
        (doc) =>
          doc?.document_type === documentType && selectedIds.includes(doc.id)
      );

      return filteredDocs.some((doc) => doc?.status === "approved");
    },
    [documents]
  );

  // Enhanced file upload with validation
  const handleFileUpload = useCallback(
    (files) => {
      if (!files?.length) return;

      // Validate files
      const validFiles = Array.from(files).filter((file) => {
        if (!validateFileType(file)) {
          toast.error(`Invalid file: ${file.name}`);
          return false;
        }
        return true;
      });

      if (!validFiles.length) {
        toast.error("No valid files selected");
        return;
      }

      if (validFiles.length > MAX_FILES_COUNT) {
        toast.error(`Maximum ${MAX_FILES_COUNT} files allowed`);
        return;
      }

      const formData = new FormData();
      formData.append("order_id", orderId.toString());

      validFiles.forEach((file) => {
        formData.append("files", file);
      });

      documentState.setIsUploading(true);
      documentState.setUploadProgress(0);

      dispatch(uploadOrderMediaDocuments(formData))
        .unwrap()
        .then(() => {
          dispatch(fetchOrderMediaDocuments(orderId));
          toast.success(`${validFiles.length} file(s) uploaded successfully`);
        })
        .catch((error) => {
          console.error("Upload failed:", error);
          toast.error("Upload failed");
        })
        .finally(() => {
          documentState.setIsUploading(false);
          documentState.setUploadProgress(0);
        });
    },
    [dispatch, orderId, documentState]
  );

  const handleFileInputChange = useCallback(
    (e) => {
      handleFileUpload(e.target.files);
      e.target.value = ""; // Reset input
    },
    [handleFileUpload]
  );

  // Handle upload report/collage button click
  const handleUploadReportCollageClick = useCallback(
    (type) => {
      if (type === "report") {
        reportFileInputRef.current?.click();
      } else if (type === "collage") {
        collageFileInputRef.current?.click();
      }
    },
    []
  );

  // Handle file selection for report/collage upload
  const handleReportCollageFileChange = useCallback(
    async (e, type) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        e.target.value = ""; // Reset input
        return;
      }

      // Validate files are PDF
      const pdfFiles = Array.from(files).filter((file) => {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name} is not a PDF file. Only PDF files are allowed.`);
          return false;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} exceeds maximum file size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
          return false;
        }
        return true;
      });

      if (pdfFiles.length === 0) {
        e.target.value = ""; // Reset input
        return;
      }

      // Limit to 10 files for multiple upload
      if (pdfFiles.length > 10) {
        toast.error("Maximum 10 files allowed for upload");
        e.target.value = ""; // Reset input
        return;
      }

      setUploadingType(type);
      try {
        const formData = new FormData();
        formData.append("order_id", orderId.toString());
        formData.append("type", type);

        if (pdfFiles.length === 1) {
          // Single file upload
          formData.append("file", pdfFiles[0]);
          await dispatch(uploadOrderReportCollage(formData)).unwrap();
        } else {
          // Multiple files upload
          pdfFiles.forEach((file) => {
            formData.append("files", file);
          });
          await dispatch(uploadMultipleOrderReportsCollages(formData)).unwrap();
        }

        // Refresh documents list
        await dispatch(fetchOrderMediaDocuments(orderId));
        toast.success(`${pdfFiles.length} ${type}(s) uploaded successfully`);
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error(error || `Failed to upload ${type}`);
      } finally {
        setUploadingType(null);
        e.target.value = ""; // Reset input
      }
    },
    [dispatch, orderId]
  );

  // Helper function to show toast error for missing valuer name
  const showValuerNameError = useCallback((reportType) => {
    toast.error(
      `Please set a valuer name for this order before accessing the ${reportType} report.`
    );
  }, []);

  // Get report URL based on order category
  const getReportUrl = useCallback(() => {
    if (!order?.category_name) return null;

    const categoryName = order.category_name.toUpperCase();

    if (categoryName === "COMMERCIAL VEHICLE") {
      return `/orders/${id}/details/cv-report`;
    } else if (categoryName === "CONSTRUCTION EQUIPMENT") {
      return `/orders/${id}/details/ce-report`;
    } else if (categoryName.includes("AVR")) {
      return `/orders/${id}/details/avr-report`;
    } else if (categoryName === "MACHINERY") {
      return `/orders/${id}/details/machinery-report`;
    } else if (categoryName === "MARINE") {
      return `/orders/${id}/details/marine-report`;
    }

    return null;
  }, [order, id]);

  // Get report type name for error messages
  const getReportTypeName = useCallback(() => {
    if (!order?.category_name) return "Report";

    const categoryName = order.category_name.toUpperCase();

    if (categoryName === "COMMERCIAL VEHICLE") return "CV";
    if (categoryName === "CONSTRUCTION EQUIPMENT") return "CE";
    if (categoryName.includes("AVR")) return "AVR";
    if (categoryName === "MACHINERY") return "Machinery";
    if (categoryName === "MARINE") return "Marine";

    return "Report";
  }, [order]);

  // Handle report button click
  const handleGenerateReportClick = useCallback(() => {
    // Check if valuer name is set
    if (!order?.valuer_name || order.valuer_name.trim() === "") {
      showValuerNameError(getReportTypeName());
      return;
    }

    // Check if order is in status 10 and user is not exempt admin
    if (order?.current_status_id === 10 && !isExemptAdmin) {
      toast.error("Report generation is disabled for completed orders");
      return;
    }

    // Get the report URL and navigate
    const reportUrl = getReportUrl();
    if (reportUrl) {
      window.location.href = reportUrl;
    } else {
      toast.error("No report type available for this order category");
    }
  }, [order, isExemptAdmin, getReportUrl, getReportTypeName, showValuerNameError]);

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload]
  );

  // Memoized approval badge component
  const ApprovalBadge = useMemo(
    () =>
      ({ status }) => {
        if (status !== "approved") return null;

        return (
          <span
            style={{
              backgroundColor: "#28a745",
              color: "white",
              padding: "4px 6px",
              borderRadius: "50%",
              fontSize: "11px",
              fontWeight: "bold",
              display: "inline-block",
              lineHeight: "1",
              width: "20px",
              height: "20px",
              textAlign: "center",
            }}
          >
            ✓
          </span>
        );
      },
    []
  );

  // Enhanced document table rendering
  const renderDocumentTable = useCallback(
    (docs, type, selectedItems, emptyMessage) => {
      if (loading) {
        return (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div className="spinner-border" role="status" aria-label="Loading">
              {/* <span className="visually-hidden">Loading...</span> */}
            </div>
          </div>
        );
      }

      if (!docs?.length) {
        return <div className="no-documents">{emptyMessage}</div>;
      }

      return (
        <table width="100%" role="table">
          <thead>
            <tr>
              <th width="50px" scope="col">
                Select
              </th>
              <th width="200px" scope="col">
                Name
              </th>
              {type === "collage" && (
                <th scope="col">Image Count</th>
              )}
              <th scope="col">Created By</th>
              <th scope="col">Created At</th>
              <th width="150px" style={{ textAlign: "center" }} scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <div className="selection-check">
                    <input
                      type="checkbox"
                      className="selection-check-input"
                      checked={selectedItems.includes(doc.id)}
                      onChange={() => handleCheckboxChange(doc.id, type)}
                      aria-label={`Select ${getFilenameFromMediaUrl(
                        doc.media_url
                      )}`}
                    />
                  </div>
                </td>
                <td>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span title={getFilenameFromMediaUrl(doc.media_url)}>
                      {getFilenameFromMediaUrl(doc.media_url)}
                    </span>
                    <ApprovalBadge status={doc.status} />
                  </div>
                </td>
                {type === "collage" && (
                  <td>{doc.number_of_image_used ?? "-"}</td>
                )}
                <td>{doc.created_by_name || "-"}</td>
                <td>{formatDate(doc.created_at)}</td>
                <td style={{ textAlign: "center" }}>
                  <button
                    onClick={() => handleViewDocument(doc)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                    aria-label="View document"
                    title="View document"
                  >
                    <ViewIcon />
                  </button>
                  {hasPermission(
                    allowedPermissions,
                    "download_order_media_documents"
                  ) && (
                      <button
                        onClick={() => handleDownloadDocument(doc)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                        aria-label="Download document"
                        title="Download document"
                      >
                        <DownloadDocumentIcon />
                      </button>
                    )}
                  {hasPermission(
                    allowedPermissions,
                    "delete_order_media_documents"
                  ) && (
                      <button
                        onClick={() => handleDeleteDocument(doc)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                        aria-label="Delete document"
                        title="Delete document"
                      >
                        <DeleteIcon />
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
    [
      loading,
      handleCheckboxChange,
      getFilenameFromMediaUrl,
      ApprovalBadge,
      formatDate,
      handleViewDocument,
      handleDownloadDocument,
      handleDeleteDocument,
      allowedPermissions,
    ]
  );

  // Enhanced uploaded documents table
  const renderUploadedDocumentsTable = useCallback(
    (docs, type, selectedItems, emptyMessage) => {
      if (loading) {
        return (
          <div style={{ textAlign: "center", padding: "20px" }}>
            <div className="spinner-border" role="status" aria-label="Loading">
              {/* <span className="visually-hidden">Loading...</span> */}
            </div>
          </div>
        );
      }

      if (!docs?.length) {
        return <div className="no-documents">{emptyMessage}</div>;
      }

      return (
        <table width="100%" role="table">
          <thead>
            <tr>
              <th width="50px" scope="col">
                Select
              </th>
              <th width="200px" scope="col">
                Name
              </th>
              <th scope="col">Type</th>
              <th scope="col">Uploaded By</th>
              <th scope="col">Uploaded At</th>
              <th width="150px" style={{ textAlign: "center" }} scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <div className="selection-check">
                    <input
                      type="checkbox"
                      className="selection-check-input"
                      checked={selectedItems.includes(doc.id)}
                      onChange={() => handleCheckboxChange(doc.id, type)}
                      aria-label={`Select ${getFilenameFromMediaUrl(
                        doc.media_url
                      )}`}
                    />
                  </div>
                </td>
                <td>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span title={getFilenameFromMediaUrl(doc.media_url)}>
                      {getFilenameFromMediaUrl(doc.media_url)}
                    </span>
                    <ApprovalBadge status={doc.status} />
                  </div>
                </td>
                <td>{doc.media_type || doc.file_type || "-"}</td>
                <td>{doc.created_by_name || doc.uploaded_by_name || "-"}</td>
                <td>{formatDate(doc.created_at)}</td>
                <td style={{ textAlign: "center" }}>
                  <button
                    onClick={() => handleViewDocument(doc)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                    aria-label="View document"
                    title="View document"
                  >
                    <ViewIcon />
                  </button>
                  {hasPermission(
                    allowedPermissions,
                    "download_order_media_documents"
                  ) && (
                      <button
                        onClick={() => handleDownloadDocument(doc)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                        aria-label="Download document"
                        title="Download document"
                      >
                        <DownloadDocumentIcon />
                      </button>
                    )}
                  {hasPermission(
                    allowedPermissions,
                    "delete_order_media_documents"
                  ) && (
                      <button
                        onClick={() => handleDeleteDocument(doc)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                        aria-label="Delete document"
                        title="Delete document"
                      >
                        <DeleteIcon />
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
    [
      loading,
      handleCheckboxChange,
      getFilenameFromMediaUrl,
      ApprovalBadge,
      formatDate,
      handleViewDocument,
      handleDownloadDocument,
      handleDeleteDocument,
      allowedPermissions,
    ]
  );

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/" className="text-blue-600 hover:underline">
          Orders
        </Link>{" "}
        &gt;{" "}
        <Link
          to={`/orders/${id}/details`}
          className="text-blue-600 hover:underline"
        >
          {order?.order_number || "-"}
        </Link>{" "}
        &gt; Documents
      </>
    );
  }, [id, order, setTitle]);

  // Show error state
  if (error) {
    return (
      <div
        className="error-container"
        style={{ padding: "20px", textAlign: "center" }}
      >
        <h3>Error Loading Documents</h3>
        <p>{error}</p>
        <button
          className="btn primary"
          onClick={() => dispatch(fetchOrderMediaDocuments(orderId))}
        >
          Retry
        </button>
      </div>
    );
  }

  // Show invalid order ID
  if (!orderId) {
    return (
      <div
        className="error-container"
        style={{ padding: "20px", textAlign: "center" }}
      >
        <h3>Invalid Order</h3>
        <p>The order ID provided is not valid.</p>
        <Link to="/" className="btn primary">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <section className="order-documents-wrapper">
      {/* Full-screen loading overlay for report/collage upload */}
      {reportCollageUploadLoading && uploadingType && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            color: "white",
          }}
        >
          <div
            className="spinner-border text-light"
            role="status"
            style={{ width: "3rem", height: "3rem", marginBottom: "1rem" }}
          >
            {/* <span className="visually-hidden">Loading...</span> */}
          </div>
          <div style={{ fontSize: "18px", fontWeight: "500" }}>
            Uploading {uploadingType}...
          </div>
        </div>
      )}
      <div className="row">
        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
          <div className="order-collage-report-container">
            <div className="row">
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="order-collage-container">
                  <div className="order-collage-header">
                    <h3>Collage</h3>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {hasPermission(
                        allowedPermissions,
                        "view_order_media_files"
                      ) &&
                        hasPermission(
                          allowedPermissions,
                          "generate_order_collage"
                        ) && (
                          <Link
                            to={`/orders/${id}/details/images`}
                            className="btn primary"
                          >
                            Generate Collage
                          </Link>
                        )}
                      {hasPermission(
                        allowedPermissions,
                        "add_order_reports_collages"
                      ) && (
                          <button
                            className="btn primary"
                            onClick={() => handleUploadReportCollageClick("collage")}
                            disabled={reportCollageUploadLoading || loading}
                          >
                            {reportCollageUploadLoading && uploadingType === "collage" ? "Uploading..." : "Upload Collage"}
                          </button>
                        )}
                    </div>
                  </div>
                  {/* Hidden file input for collage upload */}
                  <input
                    type="file"
                    ref={collageFileInputRef}
                    style={{ display: "none" }}
                    accept="application/pdf"
                    multiple
                    onChange={(e) => handleReportCollageFileChange(e, "collage")}
                  />
                  <div className="order-document-table">
                    {renderDocumentTable(
                      segregatedDocuments.collage,
                      "collage",
                      documentState.selectedCollages,
                      "No collages generated yet"
                    )}
                    {documentState.selectedCollages.length > 0 && (
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          className="btn download-all"
                          onClick={() =>
                            handleDownloadSelected(
                              documentState.selectedCollages,
                              "collage"
                            )
                          }
                          disabled={loading}
                        >
                          Download selected collages
                        </button>
                        {hasPermission(
                          allowedPermissions,
                          "approve_order_collage"
                        ) && (
                            <button
                              className="btn approve-report"
                              onClick={() =>
                                handleVerifySelected(
                                  documentState.selectedCollages,
                                  "collage"
                                )
                              }
                              disabled={approveLoading || loading}
                            >
                              {approveLoading
                                ? "Verifying..."
                                : "Verify selected collages"}
                            </button>
                          )}
                        {hasPermission(
                          allowedPermissions,
                          "remove_approve_order_collage"
                        ) &&
                          hasApprovedDocuments(
                            documentState.selectedCollages,
                            "collage"
                          ) && (
                            <button
                              className="btn remove-approve-report"
                              onClick={() =>
                                handleRemoveApproveSelected(
                                  documentState.selectedCollages,
                                  "collage"
                                )
                              }
                              disabled={removeApproveLoading || loading}
                            >
                              {removeApproveLoading
                                ? "Removing approval..."
                                : "Remove Approve"}
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="order-report-container">
                  <div className="order-report-header">
                    <h3>Reports</h3>
                    <div style={{ display: "flex", gap: "10px" }}>
                      {hasPermission(allowedPermissions, "generate_order_report") && (
                        <>
                          {order?.valuer_name && order.valuer_name.trim() !== "" ? (
                            order?.current_status_id === 10 && !isExemptAdmin ? (
                              <button
                                className="btn primary"
                                disabled
                                title="Report generation is disabled for completed orders"
                              >
                                Generate Report
                              </button>
                            ) : (
                              <Link
                                to={getReportUrl() || "#"}
                                className="btn primary"
                                onClick={(e) => {
                                  if (!getReportUrl()) {
                                    e.preventDefault();
                                    toast.error("No report type available for this order category");
                                  }
                                }}
                              >
                                Generate Report
                              </Link>
                            )
                          ) : (
                            <button
                              className="btn primary"
                              onClick={handleGenerateReportClick}
                            >
                              Generate Report
                            </button>
                          )}
                        </>
                      )}
                      {hasPermission(
                        allowedPermissions,
                        "add_order_reports_collages"
                      ) && (
                          <button
                            className="btn primary"
                            onClick={() => handleUploadReportCollageClick("report")}
                            disabled={reportCollageUploadLoading || loading}
                          >
                            {reportCollageUploadLoading && uploadingType === "report" ? "Uploading..." : "Upload Report"}
                          </button>
                        )}
                    </div>
                  </div>
                  {/* Hidden file input for report upload */}
                  <input
                    type="file"
                    ref={reportFileInputRef}
                    style={{ display: "none" }}
                    accept="application/pdf"
                    multiple
                    onChange={(e) => handleReportCollageFileChange(e, "report")}
                  />
                  <div className="order-document-table">
                    {renderDocumentTable(
                      segregatedDocuments.report,
                      "report",
                      documentState.selectedReports,
                      "No reports generated yet"
                    )}
                    {documentState.selectedReports.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                        }}
                      >
                        <button
                          className="btn download-all"
                          onClick={() =>
                            handleDownloadSelected(
                              documentState.selectedReports,
                              "report"
                            )
                          }
                          disabled={loading}
                        >
                          Download selected reports
                        </button>
                        {hasPermission(
                          allowedPermissions,
                          "approve_order_report"
                        ) && (
                            <button
                              className="btn approve-report"
                              onClick={() =>
                                handleVerifySelected(
                                  documentState.selectedReports,
                                  "report"
                                )
                              }
                              disabled={approveLoading || loading}
                            >
                              {approveLoading
                                ? "Verifying..."
                                : "Verify selected reports"}
                            </button>
                          )}
                        {hasPermission(
                          allowedPermissions,
                          "remove_approve_order_report"
                        ) &&
                          hasApprovedDocuments(
                            documentState.selectedReports,
                            "report"
                          ) && (
                            <button
                              className="btn remove-approve-report"
                              onClick={() =>
                                handleRemoveApproveSelected(
                                  documentState.selectedReports,
                                  "report"
                                )
                              }
                              disabled={removeApproveLoading || loading}
                            >
                              {removeApproveLoading
                                ? "Removing approval..."
                                : "Remove Approve"}
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
          <div className="order-upload-documents-container">
            <div className="row">
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="order-upload-documents-header">
                  <h3>Upload Documents</h3>
                </div>
                {hasPermission(
                  allowedPermissions,
                  "add_order_media_documents"
                ) && (
                    <div className="order-upload-documents">
                      <input
                        type="file"
                        id="fileInput"
                        multiple
                        hidden
                        onChange={handleFileInputChange}
                        accept={[...ALLOWED_FILE_TYPES, ".zip"].join(",")}
                      />
                      <label
                        htmlFor="fileInput"
                        className="upload-box"
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="upload-icon">
                          <PlusIcon />
                        </div>
                        <p>
                          Drop documents here or <span>click to browse</span>
                        </p>
                        <small>
                          Max file size: {MAX_FILE_SIZE / (1024 * 1024)}MB, Max
                          files: {MAX_FILES_COUNT}
                        </small>
                      </label>
                      {documentState.isUploading && (
                        <div className="upload-progress-container">
                          <div className="progress">
                            <div
                              className="progress-bar"
                              role="progressbar"
                              style={{
                                width: `${documentState.uploadProgress}%`,
                              }}
                              aria-valuenow={documentState.uploadProgress}
                              aria-valuemin="0"
                              aria-valuemax="100"
                            >
                              Uploading... {documentState.uploadProgress}%
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="order-document-table">
                  {renderUploadedDocumentsTable(
                    segregatedDocuments.documents,
                    "documents",
                    documentState.selectedDocuments,
                    "No documents uploaded yet"
                  )}
                  {documentState.selectedDocuments.length > 0 && (
                    <button
                      className="btn download-all"
                      onClick={() =>
                        handleDownloadSelected(
                          documentState.selectedDocuments,
                          "documents"
                        )
                      }
                      disabled={loading}
                    >
                      Download selected documents
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal - XSS Safe */}
      {documentState.confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete "${documentState.confirmDeleteName}"?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            documentState.setConfirmDeleteId(null);
            documentState.setConfirmDeleteName("");
          }}
        />
      )}
    </section>
  );
}

export default OrderDocuments;
