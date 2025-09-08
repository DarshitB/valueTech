import React, { useEffect, useLayoutEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { usePageTitle } from "../../context/PageTitleContext";
import { fetchOrderById } from "../../redux/reducers/orderReducer";
import {
  fetchOrderMediaDocuments,
  uploadOrderMediaDocuments,
  deleteOrderMediaDocuments,
} from "../../redux/reducers/orderMediaDocumentsReducer";
import CustomDataTable from "../../components/CustomDataTable";
import {
  DeleteIcon,
  DownloadDocumentIcon,
  ViewIcon,
} from "../../components/icons";
import { PlusIcon } from "lucide-react";
import ConfirmationModal from "../../components/ConfirmationModal";
import { toast } from "react-toastify";
import { hasPermission } from "../../utils/permissionUtils";
import { selectPermissions } from "../../redux/selectors/authSelectors";

function OrderDocuments() {
  // Extract order ID from route parameters
  const { id } = useParams();

  // Initialize Redux dispatch function
  const dispatch = useDispatch();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  const order = useSelector((state) => state.orders.selected);
  const { documents, loading, uploadLoading } = useSelector(
    (state) => state.orderMediaDocuments
  );

  // Local state for document selections and file upload
  const [selectedCollages, setSelectedCollages] = useState([]);
  const [selectedReports, setSelectedReports] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Confirmation modal state
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // Fetch order details and documents
  useEffect(() => {
    if (id && (!order || order.id !== Number(id))) {
      dispatch(fetchOrderById(id));
    }
    if (id) {
      dispatch(fetchOrderMediaDocuments(id));
    }
  }, [dispatch, id, order]);

  // Segregate documents by type
  // Try both possible data structures
  const documentsArray = documents?.documents || documents || [];

  const segregatedDocuments = {
    collage:
      documentsArray.filter((doc) => doc.document_type === "collage") || [],
    report:
      documentsArray.filter((doc) => doc.document_type === "report") || [],
    documents:
      documentsArray.filter((doc) => doc.document_type === "documents") || [],
  };

  // Debug logging to see the data structure
  /* console.log("Raw documents data:", documents);
  console.log("Segregated documents:", segregatedDocuments);
  console.log("Loading state:", loading); */

  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  // Helper function to extract filename from media_url
  const getFilenameFromMediaUrl = (media_url) => {
    if (!media_url) return "-";

    try {
      // Try to parse as JSON first (for cases where it's a JSON string)
      const parsed = JSON.parse(media_url);
      if (parsed.path) {
        // Extract filename from path
        return parsed.path.split("/").pop() || parsed.path;
      }
      if (parsed.filename) {
        return parsed.filename;
      }
      return parsed.name || "-";
    } catch (error) {
      // If not JSON, treat as direct path/URL
      if (typeof media_url === "string") {
        // Extract filename from URL/path
        return media_url.split("/").pop() || media_url;
      }
      return "-";
    }
  };

  // Helper functions
  const handleCheckboxChange = (documentId, type) => {
    const setters = {
      collage: setSelectedCollages,
      report: setSelectedReports,
      documents: setSelectedDocuments,
    };

    const setter = setters[type];
    setter((prev) =>
      prev.includes(documentId)
        ? prev.filter((id) => id !== documentId)
        : [...prev, documentId]
    );
  };

  const handleViewDocument = (document) => {
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    let fileUrl;
    try {
      // Try to parse media_url as JSON first
      const parsed = JSON.parse(document.media_url);
      if (parsed.path) {
        fileUrl = `${baseUrl}/${parsed.path}`;
      } else if (parsed.link) {
        fileUrl = parsed.link;
      } else {
        fileUrl = `${baseUrl}/${document.media_url}`;
      }
    } catch (error) {
      // If not JSON, treat as direct path
      if (document.media_url) {
        if (document.media_url.startsWith("/")) {
          fileUrl = `${baseUrl}${document.media_url}`;
        } else {
          fileUrl = `${baseUrl}/${document.media_url}`;
        }
      } else {
        // Fallback to file_path if media_url is not available
        fileUrl = `${baseUrl}/${document.file_path}`;
      }
    }

    window.open(fileUrl, "_blank");
  };

  const handleDownloadDocument = async (doc) => {
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    let downloadUrl;
    try {
      // Try to parse media_url as JSON first
      const parsed = JSON.parse(doc.media_url);
      if (parsed.path) {
        downloadUrl = `${baseUrl}/${parsed.path}`;
      } else if (parsed.link) {
        downloadUrl = parsed.link;
      } else {
        downloadUrl = `${baseUrl}/${doc.media_url}`;
      }
    } catch (error) {
      // If not JSON, treat as direct path
      if (doc.media_url) {
        if (doc.media_url.startsWith("/")) {
          downloadUrl = `${baseUrl}${doc.media_url}`;
        } else {
          downloadUrl = `${baseUrl}/${doc.media_url}`;
        }
      } else {
        // Fallback to file_path if media_url is not available
        downloadUrl = `${baseUrl}/${doc.file_path}`;
      }
    }

    try {
      // Fetch the file and force download
      const response = await fetch(downloadUrl);
      const blob = await response.blob();

      // Create download link
      const link = window.document.createElement("a");
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = getFilenameFromMediaUrl(doc.media_url) || "document";
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);

      // Clean up the object URL
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback to simple link method if fetch fails
      const link = window.document.createElement("a");
      link.href = downloadUrl;
      link.download = getFilenameFromMediaUrl(doc.media_url) || "document";
      link.target = "_blank";
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    }
  };

  const handleDeleteDocument = (doc) => {
    const filename = getFilenameFromMediaUrl(doc.media_url) || "document";
    setConfirmDeleteId(doc.id);
    setConfirmDeleteName(filename);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      dispatch(deleteOrderMediaDocuments(confirmDeleteId)).then(() => {
        dispatch(fetchOrderMediaDocuments(id));
        setConfirmDeleteId(null);
        setConfirmDeleteName("");
      });
    }
  };

  // Download selected documents as ZIP
  const handleDownloadSelected = async (selectedIds, documentType) => {
    if (!selectedIds || selectedIds.length === 0) {
      toast.error("Please select documents to download");
      return;
    }

    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    try {
      // Create ZIP file using JSZip (you'll need to install jszip)
      const JSZip = await import("jszip");
      const zip = new JSZip.default();

      // Get selected documents
      const documentsArray = documents?.documents || documents || [];
      const selectedDocs = documentsArray.filter((doc) =>
        selectedIds.includes(doc.id)
      );

      // Download each file and add to ZIP
      for (let i = 0; i < selectedDocs.length; i++) {
        const doc = selectedDocs[i];

        let fileUrl;
        try {
          const parsed = JSON.parse(doc.media_url);
          if (parsed.path) {
            fileUrl = `${baseUrl}/${parsed.path}`;
          } else if (parsed.link) {
            fileUrl = parsed.link;
          } else {
            fileUrl = `${baseUrl}/${doc.media_url}`;
          }
        } catch (error) {
          if (doc.media_url) {
            if (doc.media_url.startsWith("/")) {
              fileUrl = `${baseUrl}${doc.media_url}`;
            } else {
              fileUrl = `${baseUrl}/${doc.media_url}`;
            }
          } else {
            fileUrl = `${baseUrl}/${doc.file_path}`;
          }
        }

        try {
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          const filename =
            getFilenameFromMediaUrl(doc.media_url) || `document_${doc.id}`;
          zip.file(filename, blob);
        } catch (error) {
          console.error(`Failed to download file ${doc.id}:`, error);
        }
      }

      // Generate ZIP and download
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = window.document.createElement("a");
      const url = window.URL.createObjectURL(zipBlob);
      link.href = url;
      link.download = `${
        order && order.order_number ? order.order_number + "_" : ""
      }${documentType}_${new Date().toISOString().split("T")[0]}.zip`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to create ZIP:", error);
      toast.error("Failed to download selected documents");
    }
  };

  // File upload functions
  const handleFileUpload = (files) => {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append("order_id", id);

    Array.from(files).forEach((file) => {
      formData.append("files", file);
    });

    setIsUploading(true);
    setUploadProgress(0);

    dispatch(uploadOrderMediaDocuments(formData)).then((result) => {
      setIsUploading(false);
      setUploadProgress(0);
      if (result.meta.requestStatus === "fulfilled") {
        dispatch(fetchOrderMediaDocuments(id));
      }
    });
  };

  const handleFileInputChange = (e) => {
    handleFileUpload(e.target.files);
    e.target.value = ""; // Reset input
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    handleFileUpload(files);
  };

  // Helper function to render document table
  const renderDocumentTable = (docs, type, selectedItems, emptyMessage) => {
    /* console.log(
      `Rendering ${type} table with docs:`,
      docs,
      `Loading: ${loading}`
    ); */

    if (loading) {
      return (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <div className="spinner-border" role="status">
            {/* <span className="visually-hidden">Loading...</span> */}
          </div>
        </div>
      );
    }

    if (!docs || docs.length === 0) {
      return <div className="no-documents">{emptyMessage}</div>;
    }

    return (
      <table width="100%">
        <thead>
          <tr>
            <th width="50px"></th>
            <th width="200px">Name</th>
            <th>Created By</th>
            <th>Created At</th>
            <th width="150px" style={{ textAlign: "center" }}>
              Action
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
                  />
                </div>
              </td>
              <td>{getFilenameFromMediaUrl(doc.media_url)}</td>
              <td>{doc.created_by_name || "-"}</td>
              <td>{formatDate(doc.created_at)}</td>
              <td style={{ textAlign: "center" }}>
                <button
                  onClick={() => handleViewDocument(doc)}
                  style={{ background: "none", border: "none" }}
                >
                  <ViewIcon />
                </button>
                {hasPermission(
                  allowedPermissions,
                  "download_order_media_documents"
                ) && (
                  <button
                    onClick={() => handleDownloadDocument(doc)}
                    style={{ background: "none", border: "none" }}
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
                    style={{ background: "none", border: "none" }}
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
  };

  // Helper function to render uploaded documents table (with media_type column)
  const renderUploadedDocumentsTable = (
    docs,
    type,
    selectedItems,
    emptyMessage
  ) => {
    /* console.log(
      `Rendering ${type} table with docs:`,
      docs,
      `Loading: ${loading}`
    ); */

    if (loading) {
      return (
        <div style={{ textAlign: "center", padding: "20px" }}>
          <div className="spinner-border" role="status">
            {/* <span className="visually-hidden">Loading...</span> */}
          </div>
        </div>
      );
    }

    if (!docs || docs.length === 0) {
      return <div className="no-documents">{emptyMessage}</div>;
    }

    return (
      <table width="100%">
        <thead>
          <tr>
            <th width="50px"></th>
            <th width="200px">Name</th>
            <th>Type</th>
            <th>Uploaded By</th>
            <th>Uploaded At</th>
            <th width="150px" style={{ textAlign: "center" }}>
              Action
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
                  />
                </div>
              </td>
              <td>{getFilenameFromMediaUrl(doc.media_url)}</td>
              <td>{doc.media_type || doc.file_type || "-"}</td>
              <td>{doc.created_by_name || doc.uploaded_by_name || "-"}</td>
              <td>{formatDate(doc.created_at)}</td>
              <td style={{ textAlign: "center" }}>
                <button
                  onClick={() => handleViewDocument(doc)}
                  style={{ background: "none", border: "none" }}
                >
                  <ViewIcon />
                </button>
                {hasPermission(
                  allowedPermissions,
                  "download_order_media_documents"
                ) && (
                  <button
                    onClick={() => handleDownloadDocument(doc)}
                    style={{ background: "none", border: "none" }}
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
                    style={{ background: "none", border: "none" }}
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
  };

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/orders" className="text-blue-600 hover:underline">
          Orders
        </Link>{" "}
        &gt;{" "}
        <Link
          to={`/orders/${id}/details`}
          className="text-blue-600 hover:underline"
        >
          {order && order.order_number ? order.order_number : "-"}
        </Link>{" "}
        &gt; Documents
      </>
    );
  }, [id, order, setTitle]);

  return (
    <section className="order-documents-wrapper">
      <div className="row">
        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
          <div className="order-collage-report-container">
            <div className="row">
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="order-collage-container">
                  <div className="order-collage-header">
                    <h3>Collage</h3>
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
                  </div>
                  <div className="order-document-table">
                    {renderDocumentTable(
                      segregatedDocuments.collage,
                      "collage",
                      selectedCollages,
                      "No collages generated yet"
                    )}
                    {selectedCollages.length > 0 && (
                      <button
                        className="btn download-all"
                        onClick={() =>
                          handleDownloadSelected(selectedCollages, "collage")
                        }
                      >
                        Download selected collages
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12">
                <div className="order-report-container">
                  <div className="order-report-header">
                    <h3>Reports</h3>
                    <Link className="btn primary">Generate Report</Link>
                  </div>
                  <div className="order-document-table">
                    {renderDocumentTable(
                      segregatedDocuments.report,
                      "report",
                      selectedReports,
                      "No reports generated yet"
                    )}
                    {selectedReports.length > 0 && (
                      <button
                        className="btn download-all"
                        onClick={() =>
                          handleDownloadSelected(selectedReports, "report")
                        }
                      >
                        Download selected reports
                      </button>
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
                    </label>
                    {isUploading && (
                      <div className="upload-progress-container">
                        <div className="progress">
                          <div
                            className="progress-bar"
                            role="progressbar"
                            style={{ width: `${uploadProgress}%` }}
                          >
                            Uploading...
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
                    selectedDocuments,
                    "No documents uploaded yet"
                  )}
                  {selectedDocuments.length > 0 && (
                    <button
                      className="btn download-all"
                      onClick={() =>
                        handleDownloadSelected(selectedDocuments, "documents")
                      }
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

      {/* ❗ Delete Confirmation Modal */}
      {confirmDeleteId && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete <span class="danger">${confirmDeleteName}</span>?`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </section>
  );
}

export default OrderDocuments;
