/**
 * OrderImages Component
 * 
 * Features:
 * - Lightbox with image and video support
 * - Individual approval/rejection with immediate API submission
 * - Keyboard shortcuts: Space (Approve), Enter (Reject), Escape (Close)
 * - Status validation to prevent unnecessary API calls
 * - ResizeObserver error suppression for smooth transitions
 * - Bulk operations for selected images
 * - Collage generation for approved images
 * 
 * Status Codes:
 * - 0: Pending
 * - 1: Approved  
 * - 2: Rejected
 */
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "../../context/PageTitleContext";
import {
  fetchOrderById,
  fetchOrderMedia,
  updateOrderMediaStatus,
  uploadZipFile,
} from "../../redux/reducers/orderReducer";
import { generateCollage } from "../../redux/reducers/collageReducer";
import {
  ApprovedIcon,
  FolderIcon,
  ImageCollageIcon,
  RevalidateIcon,
  SelectedIcon,
  UploadImageIcon,
  ValidateIcon,
} from "../../components/icons";
import { ZoomIn } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { toast } from "react-toastify";
import { hasPermission } from "../../utils/permissionUtils";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import ZipUploadModal from "../../components/ZipUploadModal";

function OrderImages() {
  // Extract order ID from route parameters
  const { id } = useParams();

  // Initialize Redux dispatch function
  const dispatch = useDispatch();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  // Set page title using custom hook
  const { setTitle } = usePageTitle();

  const order = useSelector((state) => state.orders.selected);
  const media = useSelector((state) => state.orders.media);
  const mediaLoading = useSelector((state) => state.orders.mediaLoading);
  const mediaError = useSelector((state) => state.orders.mediaError);
  const collageGenerating = useSelector((state) => state.collage.generating);

  // Local state
  const [selectedImageSequence, setSelectedImageSequence] = useState([]); // Track selection and order
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxApprovals, setLightboxApprovals] = useState({}); // Track approvals in lightbox
  const [remarks, setRemarks] = useState("");
  const [zipUploadModalOpen, setZipUploadModalOpen] = useState(false);

  // Global ResizeObserver error suppression - runs once when component mounts
  React.useEffect(() => {
    // Store original error handlers
    const originalError = console.error;
    const originalWindowError = window.onerror;

    // Override console.error to suppress ResizeObserver errors
    console.error = (...args) => {
      const errorMessage = args[0];
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes(
          "ResizeObserver loop completed with undelivered notifications"
        ) ||
          errorMessage.includes("ResizeObserver"))
      ) {
        return; // Suppress ResizeObserver errors
      }
      originalError.apply(console, args);
    };

    // Override window.onerror to suppress ResizeObserver errors
    window.onerror = (message, source, lineno, colno, error) => {
      if (
        typeof message === "string" &&
        (message.includes(
          "ResizeObserver loop completed with undelivered notifications"
        ) ||
          message.includes("ResizeObserver"))
      ) {
        return true; // Suppress ResizeObserver errors
      }
      if (originalWindowError) {
        return originalWindowError(message, source, lineno, colno, error);
      }
      return false;
    };

    // Cleanup function
    return () => {
      console.error = originalError;
      window.onerror = originalWindowError;
    };
  }, []); // Empty dependency array - runs only once

  // Parse media URL to get the actual image link
  const getImageUrl = (mediaUrl) => {
    // Get base URL from environment variable or use default
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    try {
      // First try to parse as JSON (for cases where it's a JSON string)
      const parsed = JSON.parse(mediaUrl);
      if (parsed.path) {
        return `${baseUrl}/${parsed.path}`;
      }
      if (parsed.link) {
        return parsed.link;
      }
      return mediaUrl;
    } catch (error) {
      // If not JSON, treat as direct path
      if (mediaUrl.startsWith("/")) {
        return `${baseUrl}${mediaUrl}`;
      }
      return mediaUrl;
    }
  };

  // Check if media is an image
  const isImage = (mediaUrl) => {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(mediaUrl);
      const path = parsed.path || "";
      return path.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    } catch (error) {
      // If not JSON, check the direct path
      return mediaUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    }
  };

  // Check if media is a video
  const isVideo = (mediaUrl) => {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(mediaUrl);
      const path = parsed.path || "";
      return path.toLowerCase().match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/);
    } catch (error) {
      // If not JSON, check the direct path
      return mediaUrl.toLowerCase().match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/);
    }
  };

  // Prepare lightbox slides array (for both images and videos) - maintain screen order
  const lightboxSlides = React.useMemo(() => {
    // First sort media the same way as displayed on screen (images first, then videos)
    const sortedMedia = [...(media?.media || [])].sort((a, b) => {
      const aIsImage = isImage(a.media_url);
      const bIsImage = isImage(b.media_url);
      // Images (true) should come before videos (false)
      if (aIsImage && !bIsImage) return -1;
      if (!aIsImage && bIsImage) return 1;
      return 0; // Keep original order within same type
    });

    return (
      sortedMedia
        .map((item) => {
          const url = getImageUrl(item.media_url);
          const isImageFile = isImage(item.media_url);
          const isVideoFile = isVideo(item.media_url);

          if (isImageFile) {
            return {
              src: url,
              alt: `Image ${item.id}`,
              type: "image",
              mediaId: item.id,
            };
          } else if (isVideoFile) {
            return {
              src: url,
              alt: `Video ${item.id}`,
              type: "video",
              mediaId: item.id,
            };
          }
          return null;
        })
        .filter(Boolean) || []
    );
  }, [media?.media]);

  // Handle keyboard events for lightbox navigation and approval/rejection
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (!lightboxOpen) return;

      switch (event.key) {
        case "Escape":
          // Close lightbox with custom handler to ensure proper cleanup
          event.preventDefault();
          event.stopPropagation();
          handleCustomClose();
          break;
          
        case "Enter":
          // Mark current media as rejected
          const currentSlide = lightboxSlides[lightboxIndex];
          if (currentSlide) {
            handleApprovalChange(currentSlide.mediaId, 2); // 2 = rejected
          }
          break;
          
        case " ":
          // Mark current media as approved
          event.preventDefault(); // Prevent page scroll
          const slide = lightboxSlides[lightboxIndex];
          if (slide) {
            handleApprovalChange(slide.mediaId, 1); // 1 = approved
          }
          break;
      }
    };

    if (lightboxOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [lightboxOpen, lightboxIndex, lightboxSlides]);

  // Fetch order details and media
  useEffect(() => {
    if (id && (!order || order.id !== Number(id))) {
      dispatch(fetchOrderById(id));
    }
    if (id) {
      dispatch(fetchOrderMedia(id));
    }
  }, [dispatch, id, order]);

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
        &gt; Media Files
      </>
    );
  }, [id, order, setTitle]);

  // Handle image selection with sequence tracking
  const handleImageSelect = (imageId) => {
    setSelectedImageSequence((prevSeq) => {
      if (prevSeq.includes(imageId)) {
        // Remove from sequence
        const newSeq = prevSeq.filter((id) => id !== imageId);
        console.log("Removed from sequence:", imageId, "New sequence:", newSeq);
        return newSeq;
      } else {
        // Add to sequence (maintain order)
        const newSeq = [...prevSeq, imageId];
        console.log("Added to sequence:", imageId, "New sequence:", newSeq);
        return newSeq;
      }
    });
  };

  // Validation function for collage generation
  const validateCollageGeneration = () => {
    if (selectedImageSequence.length === 0) {
      toast.error("Please select at least one image for collage generation");
      return false;
    }

    // Check if all selected images are approved
    const selectedMediaItems =
      media?.media?.filter((item) => selectedImageSequence.includes(item.id)) ||
      [];
    const unapprovedImages = selectedMediaItems.filter(
      (item) => item.status !== 1
    );

    if (unapprovedImages.length > 0) {
      toast.error(
        "All selected images must be approved before generating collage"
      );
      return false;
    }

    // Check if any videos are selected
    const videoSelected = selectedMediaItems.some((item) =>
      isVideo(item.media_url)
    );
    if (videoSelected) {
      toast.error("Videos cannot be included in collage generation");
      return false;
    }

    // Check image count validation based on text
    const hasText = remarks && remarks.trim().length > 0;
    const imageCount = selectedImageSequence.length;

    if (hasText) {
      // If text is present, image count should be odd
      if (imageCount % 2 === 0) {
        toast.error("When adding text, please select an odd number of images");
        return false;
      }
    } else {
      // If no text, image count should be even
      if (imageCount % 2 !== 0) {
        toast.error(
          "When no text is added, please select an even number of images"
        );
        return false;
      }
    }

    return true;
  };

  // Handle collage generation
  const handleCollageGeneration = () => {
    if (!validateCollageGeneration()) {
      return;
    }

    const payload = {
      order_id: id.toString(),
      text: remarks.trim() || "",
      image_ids: selectedImageSequence.map((id) => id.toString()), // Use sequence order
    };
    console.log("image collage payload", payload);
    dispatch(generateCollage(payload)).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        // Open PDF in new tab
        const downloadUrl = result.payload.data.download_url;
        const baseUrl =
          process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
        const fullUrl = `${baseUrl}${downloadUrl}`;
        window.open(fullUrl, "_blank");

        // Clear selection after successful generation
        setSelectedImageSequence([]);
        setRemarks("");
      }
    });
  };

  // Custom approval component for lightbox
  // Approval component for lightbox - displays radio buttons for status selection
  const ApprovalComponent = ({ slide }) => {
    const currentApproval = lightboxApprovals[slide.mediaId] || 0;

    // Handle local approval change and delegate to global handler
    const handleLocalApprovalChange = (status) => {
      handleApprovalChange(slide.mediaId, status);
    };

    return (
      <div className="approval-component-lightbox">
        <div className="approval-component-lightbox-status-note">
          Press Space for Approved, Enter for Rejected
        </div>
        <div className="approval-component-lightbox-status">
          <span style={{ color: "white", fontSize: "14px" }}>Status:</span>
          <label
            style={{
              color: "white",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={`approval-${slide.mediaId}`}
              value="1"
              checked={currentApproval === 1}
              onChange={() => handleLocalApprovalChange(1)}
              style={{ margin: 0 }}
            />
            <span>Approved</span>
          </label>
          <label
            style={{
              color: "white",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={`approval-${slide.mediaId}`}
              value="2"
              checked={currentApproval === 2}
              onChange={() => handleLocalApprovalChange(2)}
              style={{ margin: 0 }}
            />
            <span>Rejected</span>
          </label>
        </div>
      </div>
    );
  };

  // Custom video renderer for lightbox with error handling
  const VideoRenderer = ({ slide }) => {
    if (slide.type === "video") {
      return (
        <video
          src={slide.src}
          controls
          autoPlay
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
          onError={(e) => {
            console.error("Video load error:", e);
            toast.error("Failed to load video");
          }}
          onLoadStart={() => {
            // Suppress ResizeObserver errors during video load
            const originalError = console.error;
            console.error = (...args) => {
              const errorMessage = args[0];
              if (
                typeof errorMessage === "string" &&
                (errorMessage.includes("ResizeObserver loop completed with undelivered notifications") ||
                 errorMessage.includes("ResizeObserver"))
              ) {
                return; // Suppress ResizeObserver errors
              }
              originalError.apply(console, args);
            };
          }}
        />
      );
    }
    return null;
  };

  // Handle lightbox close and submit approvals
  const handleLightboxClose = () => {
    // Clear approvals and close lightbox
    setLightboxApprovals({});
    setLightboxOpen(false);
  };

  // Custom close handler that ensures proper cleanup
  // Used by both Escape key and close button to maintain consistency
  const handleCustomClose = () => {
    handleLightboxClose();
  };

  // Handle slide transitions with ResizeObserver error suppression
  // Prevents console errors during video-to-image transitions
  const handleSlideTransition = ({ index }) => {
    setLightboxIndex(index);

    // Temporarily suppress ResizeObserver errors during transitions
    const originalError = console.error;
    console.error = (...args) => {
      const errorMessage = args[0];
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("ResizeObserver loop completed with undelivered notifications") ||
         errorMessage.includes("ResizeObserver"))
      ) {
        return; // Suppress ResizeObserver errors
      }
      originalError.apply(console, args);
    };

    // Restore console.error after transition completes
    setTimeout(() => {
      console.error = originalError;
    }, 100);
  };

  // Handle lightbox open for both images and videos
  // Initializes approval states based on current media status
  const handleLightboxOpen = (mediaItem) => {
    // Find the index in the sorted slides array
    const slideIndex = lightboxSlides.findIndex(
      (slide) => slide.src === getImageUrl(mediaItem.media_url)
    );
    
    if (slideIndex !== -1) {
      setLightboxIndex(slideIndex);
      setLightboxOpen(true);

      // Initialize approvals with current media status (only for non-pending items)
      const currentApprovals = {};
      lightboxSlides.forEach((slide) => {
        const mediaItem = media.media.find((item) => item.id === slide.mediaId);
        if (mediaItem && mediaItem.status !== 0) {
          // Only set if not pending (status 0)
          currentApprovals[slide.mediaId] = mediaItem.status;
        }
      });
      setLightboxApprovals(currentApprovals);
    }
  };

  // Handle approval/rejection change for individual media item in lightbox
  // Validates if status change is needed before making API call
  const handleApprovalChange = (mediaId, status) => {
    // Find the current media item to check its current status
    const mediaItem = media.media.find((item) => item.id === parseInt(mediaId));
    
    // If the status is the same as current, don't make unnecessary API call
    if (mediaItem && mediaItem.status === status) {
      toast.info(`Image is already ${status === 1 ? 'approved' : status === 2 ? 'rejected' : 'pending'}`);
      return;
    }
    
    // Update local state for immediate UI feedback
    setLightboxApprovals((prev) => ({
      ...prev,
      [mediaId]: status,
    }));

    // Submit the change immediately to backend
    const updates = [{
      id: parseInt(mediaId),
      status: status,
    }];

    dispatch(updateOrderMediaStatus({ updates })).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        // Refresh media data to show updated statuses
        dispatch(fetchOrderMedia(id));
      } else {
        toast.error("Failed to update media status");
      }
    });
  };

  // Handle approve selected images (for bulk operations)
  const handleApprove = () => {
    if (selectedImageSequence.length === 0) {
      toast.warning("Please select images to approve");
      return;
    }

    const updates = selectedImageSequence.map((imageId) => ({
      id: imageId,
      status: 1, // 1 = approved
    }));

    dispatch(updateOrderMediaStatus({ updates })).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        setSelectedImageSequence([]);
        // Refresh media data to show updated statuses
        dispatch(fetchOrderMedia(id));
      }
    });
  };

  // Handle reject selected images (for bulk operations)
  const handleReject = () => {
    if (selectedImageSequence.length === 0) {
      toast.warning("Please select images to reject");
      return;
    }

    const updates = selectedImageSequence.map((imageId) => ({
      id: imageId,
      status: 2, // 2 = rejected
    }));

    dispatch(updateOrderMediaStatus({ updates })).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        setSelectedImageSequence([]);
        // Refresh media data to show updated statuses
        dispatch(fetchOrderMedia(id));
      }
    });
  };

  // Get status text and color
  const getStatusInfo = (status) => {
    switch (status) {
      case 0:
        return { text: "Pending", color: "text-warning" };
      case 1:
        return { text: "Approved", color: "text-success" };
      case 2:
        return { text: "Rejected", color: "text-danger" };
      default:
        return { text: "Unknown", color: "text-muted" };
    }
  };

  return (
    <section className="order-images-wrapper">
      <div className="row h-100">
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 h-100">
          <div className="order-images-container">
            <div className="order-images-header">
              <h2>
                Media Files{" "}
                <span className="text-muted">
                  {selectedImageSequence.length
                    ? `(Selected - ${selectedImageSequence.length})`
                    : ""}
                </span>
              </h2>
              <div className="order-images-buttons">
                {hasPermission(
                  allowedPermissions,
                  "upload_order_media_files"
                ) && (
                  <button
                    onClick={() => setZipUploadModalOpen(true)}
                    title="Upload ZIP file"
                    className="tooltip-link"
                  >
                    <UploadImageIcon />
                  </button>
                )}
                {hasPermission(
                  allowedPermissions,
                  "approve_reject_order_media_files"
                ) && (
                  <button
                    onClick={handleApprove}
                    disabled={selectedImageSequence.length === 0}
                    title="Approve Selected Images"
                    className="tooltip-link"
                  >
                    <ApprovedIcon />
                  </button>
                )}
                {hasPermission(
                  allowedPermissions,
                  "approve_reject_order_media_files"
                ) && (
                  <button
                    onClick={handleReject}
                    disabled={selectedImageSequence.length === 0}
                    title="Reject Selected Images"
                    className="tooltip-link"
                  >
                    <RevalidateIcon />
                  </button>
                )}
                {hasPermission(
                  allowedPermissions,
                  "generate_order_collage"
                ) && (
                  <button
                    onClick={handleCollageGeneration}
                    disabled={
                      selectedImageSequence.length === 0 || collageGenerating
                    }
                    title="Generate Image Collage"
                    className="tooltip-link"
                  >
                    <ImageCollageIcon />
                  </button>
                )}
              </div>
            </div>
            <div className="order-images-content">
              <div className="mb-3">
                <label className="form-label">
                  Remarks for Collage (Optional)
                </label>
                <textarea
                  className="form-control"
                  rows="4"
                  placeholder="Add remarks here... (Leave empty for even image count, add text for odd image count)"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {mediaLoading ? (
                <div className="text-center">
                  <div className="spinner-border" role="status">
                    {/* <span className="visually-hidden">Loading...</span> */}
                  </div>
                </div>
              ) : media?.media?.length > 0 ? (
                <div className="order-images">
                  {/* Sort media: images first, then videos */}
                  {[...media.media]
                    .sort((a, b) => {
                      const aIsImage = isImage(a.media_url);
                      const bIsImage = isImage(b.media_url);
                      // Images (true) should come before videos (false)
                      if (aIsImage && !bIsImage) return -1;
                      if (!aIsImage && bIsImage) return 1;
                      return 0; // Keep original order within same type
                    })
                    .map((image, index) => {
                      const statusInfo = getStatusInfo(image.status);
                      const isSelected = selectedImageSequence.includes(
                        image.id
                      );
                      const imageUrl = getImageUrl(image.media_url);
                      const isImageFile = isImage(image.media_url);
                      const isVideoFile = isVideo(image.media_url);
                      // Get the actual selection order (1, 2, 3, etc.)
                      const selectionOrder = isSelected
                        ? selectedImageSequence.indexOf(image.id) + 1
                        : 0;

                      return (
                        <div key={image.id} className="order-image-card">
                          <div
                            className={`order-image-box ${
                              isSelected ? "selected" : ""
                            }`}
                            onClick={() => handleImageSelect(image.id)}
                          >
                            {isImageFile ? (
                              <img
                                src={imageUrl}
                                alt={`Order Image ${image.id}`}
                                onError={(e) => {
                                  e.target.src =
                                    "https://via.placeholder.com/200x200?text=Image+Not+Found";
                                }}
                              />
                            ) : isVideoFile ? (
                              <video
                                src={imageUrl}
                                controls
                                preload="metadata"
                                onError={(e) => {
                                  console.error("Video load error:", e);
                                }}
                              >
                                Your browser does not support the video tag.
                              </video>
                            ) : (
                              <div className="media-placeholder">
                                <i className="fas fa-file"></i>
                                <span>Media File</span>
                              </div>
                            )}
                            <div className="order-image-card-actions">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  /* handleImageSelect(image.id); */
                                }}
                                className="form-check-input"
                              />
                              <SelectedIcon className="icon-if-selected" />
                              {(isImageFile || isVideoFile) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLightboxOpen(image);
                                  }}
                                  className="lightbox-btn"
                                  title="View in lightbox"
                                >
                                  <ZoomIn size={16} />
                                </button>
                              )}
                              {isSelected && (
                                <div className="selection-order">
                                  {selectionOrder}
                                </div>
                              )}
                            </div>
                            <div className={`image-status ${statusInfo.color}`}>
                              {statusInfo.text}
                            </div>
                          </div>
                          <div className="image-info">
                            <p className="mb-1">
                              {isImageFile
                                ? "Image"
                                : isVideoFile
                                ? "Video"
                                : "Media"}{" "}
                              {index + 1}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center text-muted">
                  <p>No media files available for this order.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Yet Another React Lightbox */}
      <Lightbox
        open={lightboxOpen}
        close={handleCustomClose}
        index={lightboxIndex}
        slides={lightboxSlides}
        carousel={{
          finite: true,
          preload: 1, // Reduced from 2 to minimize resize events
          padding: 0, // Reduce padding to minimize layout changes
        }}
        render={{
          iconNext: () => (
            <span style={{ fontSize: "24px", color: "white" }}>›</span>
          ),
          iconPrev: () => (
            <span style={{ fontSize: "24px", color: "white" }}>‹</span>
          ),
          iconClose: () => (
            <span style={{ fontSize: "20px", color: "white" }}>×</span>
          ),
          slide: ({ slide }) => {
            if (slide.type === "video") {
              return (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <VideoRenderer slide={slide} />
                  <ApprovalComponent slide={slide} />
                </div>
              );
            } else {
              // For images, create a container with the image and approval component
              return (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={slide.src}
                    alt={slide.alt}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                  <ApprovalComponent slide={slide} />
                </div>
              );
            }
          },
        }}
        animation={{
          fade: 150, // Reduced from 200 to minimize transition time
          swipe: 150, // Reduced from 200 to minimize transition time
        }}
                 controller={{
           closeOnBackdropClick: true,
           closeOnPullDown: true,
           closeOnPinch: true,
           closeOnEscape: false, // Disable default Escape behavior to use our custom handler
         }}
        zoom={{
          maxZoomPixelRatio: 3,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
          doubleClickDelay: 300,
          doubleClickMaxStops: 2,
          keyboardMoveDistance: 50,
          wheelZoomDistanceFactor: 100,
          pinchZoomDistanceFactor: 100,
          scrollToZoom: true,
        }}
        plugins={[]}
        on={{
          view: handleSlideTransition,
        }}
      />

      {/* ZIP Upload Modal */}
      <ZipUploadModal
        isOpen={zipUploadModalOpen}
        onClose={() => setZipUploadModalOpen(false)}
        orderId={id}
      />
    </section>
  );
}

export default OrderImages;
