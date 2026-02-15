import React, { useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { uploadZipFile, fetchOrderMedia } from "../redux/reducers/orderReducer";
import { hasPermission } from "../utils/permissionUtils";
import { selectPermissions } from "../redux/selectors/authSelectors";
import { toast } from "react-toastify";
import FormModel from "./FormModel";
import { FolderIcon } from "./icons";
import "./ZipUploadModal.scss";
import { PlusIcon } from "lucide-react";

/**
 * ZIP Upload Modal Component
 *
 * Features:
 * - Drag and drop ZIP file upload
 * - Click to browse file selection
 * - Upload progress indicator
 * - Permission-based access control
 * - Automatic media refresh after successful upload
 *
 * Required Permission: upload_order_media_files
 */
const ZipUploadModal = ({ isOpen, onClose, orderId }) => {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);

  // Get user permissions
  const allowedPermissions = useSelector(selectPermissions);

  // Get ZIP upload state from Redux
  const { zipUploading, zipUploadProgress, zipUploadError } = useSelector(
    (state) => state.orders
  );

  // Local state
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Check if user has permission to upload
  const hasUploadPermission = hasPermission(
    allowedPermissions,
    "upload_order_media_files"
  );

  // Handle file selection
  const handleFileSelect = (file) => {
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Only ZIP files are allowed");
      return;
    }

    // Validate file size (e.g., max 300MB)
    const maxSize = 300 * 1024 * 1024; // 300MB
    if (file.size > maxSize) {
      toast.error("File size must be less than 300MB");
      return;
    }

    setSelectedFile(file);
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  };

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Handle upload
  const handleUpload = () => {
    if (!selectedFile) {
      toast.error("Please select a ZIP file to upload");
      return;
    }

    if (!hasUploadPermission) {
      toast.error("You don't have permission to upload files");
      return;
    }

    const formData = new FormData();
    formData.append("orderId", orderId);
    formData.append("zipFile", selectedFile);

    dispatch(uploadZipFile(formData)).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        // Refresh order media so new images show without page reload
        dispatch(fetchOrderMedia(orderId));
        // Reset state and close modal
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        onClose();
      }
    });
  };

  // Handle modal close
  const handleClose = () => {
    if (!zipUploading) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClose();
    }
  };

  // Don't render if no permission
  if (!hasUploadPermission) {
    return null;
  }

  // Don't render if modal is closed
  if (!isOpen) {
    return null;
  }

  const modalContent = {
    title: "Upload ZIP File",
    body: (
      <div className="zip-upload-modal-content">
        {/* File Upload Area */}
        <div className="zip-upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileInputChange}
            style={{ display: "none" }}
          />

          <div
            className={`zip-upload-dropzone ${
              dragActive ? "drag-active" : ""
            } ${selectedFile ? "file-selected" : ""}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? (
              <div className="zip-upload-file-info">
                <h4>Selected File</h4>
                <p className="file-name">{selectedFile.name}</p>
                <p className="file-size">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-extra"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Remove File
                </button>
              </div>
            ) : (
              <div className="zip-upload-text">
                <div className="upload-icon">
                  <PlusIcon />
                </div>
                <h4>Drop ZIP file here or <span>click to browse</span></h4>
                <p className="mb-0">
                  Select a ZIP file containing images and videos
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Upload Progress */}
        {zipUploading && (
          <div className="zip-upload-progress">
            <div className="progress">
              <div
                className="progress-bar"
                role="progressbar"
                style={{ width: `${zipUploadProgress}%` }}
                aria-valuenow={zipUploadProgress}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                {zipUploadProgress}%
              </div>
            </div>
            <p className="progress-text">Uploading ZIP file...</p>
          </div>
        )}

        {/* Error Display */}
        {zipUploadError && (
          <div className="zip-upload-error">
            <p className="text-danger">{zipUploadError}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="zip-upload-actions">
          <button
            type="button"
            className="btn btn-secondary btn-cancle-modal"
            onClick={handleClose}
            disabled={zipUploading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-save-modal"
            onClick={handleUpload}
            disabled={!selectedFile || zipUploading}
          >
            {zipUploading ? "Uploading..." : "Upload ZIP"}
          </button>
        </div>
      </div>
    ),
    onClose: handleClose,
  };

  return <FormModel size="medium">{modalContent}</FormModel>;
};

export default ZipUploadModal;
