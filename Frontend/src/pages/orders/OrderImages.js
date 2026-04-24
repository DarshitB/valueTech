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
 * - 3: Terminated
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "../../context/PageTitleContext";
import {
  deleteOrderMedia,
  fetchOrderById,
  fetchOrderMedia,
  updateOrderMediaStatus,
  uploadZipFile,
} from "../../redux/reducers/orderReducer";
import { generateCollage, generateTextImageCollage } from "../../redux/reducers/collageReducer";
import {
  ApprovedIcon,
  FolderIcon,
  ImageCollageIcon,
  RevalidateIcon,
  SelectedIcon,
  ShareIcon,
  TrashIcon,
  UploadImageIcon,
  ValidateIcon,
} from "../../components/icons";
import { ZoomIn, Copy, RotateCw } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { toast } from "react-toastify";
import { hasPermission } from "../../utils/permissionUtils";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import { resolveAssetUrl } from "../../utils/urlUtils";
import ZipUploadModal from "../../components/ZipUploadModal";
import ConfirmationModal from "../../components/ConfirmationModal";

// Pure helpers outside component (stable reference, no closure over state)
function formatMediaGroupDate(dateString) {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "No date";
  const day = date.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutesStr = String(minutes).padStart(2, "0");
  return `${day} ${month} ${year} at ${hours}:${minutesStr} ${ampm}`;
}

const STATUS_INFO = {
  0: { text: "Pending", color: "text-warning" },
  1: { text: "Approved", color: "text-success" },
  2: { text: "Rejected", color: "text-danger" },
  3: { text: "Terminated", color: "text-info" },
  4: { text: "Text Image", color: "text-secondary" },
};

const IMAGE_RETRY_MAX = 3;
const IMAGE_RETRY_BASE_DELAY = 2000;

function RetryImage({ src, alt, style }) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const retryCountRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    retryCountRef.current = 0;
    setFailed(false);
    setDisplaySrc(src);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [src]);

  const handleError = useCallback(() => {
    const isRemote = typeof src === "string" && /^https?:\/\//i.test(src);
    if (isRemote && retryCountRef.current < IMAGE_RETRY_MAX) {
      retryCountRef.current += 1;
      const delay = IMAGE_RETRY_BASE_DELAY * retryCountRef.current;
      timerRef.current = setTimeout(() => {
        const sep = src.includes("?") ? "&" : "?";
        setDisplaySrc(`${src}${sep}_cb=${Date.now()}`);
      }, delay);
      return;
    }
    setFailed(true);
  }, [src]);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt || "Image unavailable"}
        style={{
          ...style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f4f6",
          color: "#9ca3af",
          fontSize: "11px",
        }}
      >
        Unavailable
      </div>
    );
  }

  return <img src={displaySrc} alt={alt} style={style} onError={handleError} />;
}
function getStatusInfo(status) {
  return STATUS_INFO[status] ?? { text: "Unknown", color: "text-muted" };
}

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
  const collageGeneratingTextImage = useSelector((state) => state.collage.generatingTextImage);

  // Local state
  const [selectedImageSequence, setSelectedImageSequence] = useState([]); // Track selection and order
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxApprovals, setLightboxApprovals] = useState({}); // Track approvals in lightbox
  const [remarks, setRemarks] = useState("");
  const [zipUploadModalOpen, setZipUploadModalOpen] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  // Per-image orientation for collage: "default" | "left" | "right" (cycle on button click)
  const [imageOrientations, setImageOrientations] = useState({});

  // Global ResizeObserver error suppression - runs once when component mounts
  useEffect(() => {
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

  // Parse media URL to get the actual image link (full resolution)
  const getImageUrl = (mediaUrl) => {
    if (mediaUrl == null || typeof mediaUrl !== "string" || String(mediaUrl).trim() === "") return "";

    try {
      const parsed = JSON.parse(mediaUrl);
      if (parsed.path) {
        return resolveAssetUrl(parsed.path);
      }
      if (parsed.link) {
        return resolveAssetUrl(parsed.link);
      }
      return mediaUrl;
    } catch {
      return resolveAssetUrl(mediaUrl);
    }
  };

  // Grid display: use thumbnail_url when present, else original media_url (lightbox always uses media_url)
  const getGridImageUrl = (mediaItem) => {
    const thumb = mediaItem?.thumbnail_url;
    if (thumb != null && String(thumb).trim() !== "") {
      return getImageUrl(thumb);
    }
    return getImageUrl(mediaItem?.media_url);
  };

  // Check if media is an image (safe for null/undefined)
  const isImage = (mediaUrl) => {
    if (mediaUrl == null || typeof mediaUrl !== "string") return false;
    try {
      const parsed = JSON.parse(mediaUrl);
      const path = parsed?.path || "";
      return path && String(path).toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    } catch {
      return String(mediaUrl).toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    }
  };

  // Check if media is a video (safe for null/undefined)
  const isVideo = (mediaUrl) => {
    if (mediaUrl == null || typeof mediaUrl !== "string") return false;
    try {
      const parsed = JSON.parse(mediaUrl);
      const path = parsed?.path || "";
      return path && String(path).toLowerCase().match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/);
    } catch {
      return String(mediaUrl).toLowerCase().match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/);
    }
  };

  // Group media by created_at (date + time), sorted descending (newest first); within each group: images first, then videos
  const mediaGroupedByDate = useMemo(() => {
    const list = media?.media || [];
    const byKey = {};
    list.forEach((item) => {
      const raw = item.created_at ?? item.createdAt ?? null;
      const date = raw ? new Date(raw) : null;
      const ts = date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
      const label = formatMediaGroupDate(raw);
      if (!byKey[label]) byKey[label] = { label, ts, items: [] };
      byKey[label].items.push(item);
      if (byKey[label].ts === 0 && ts) byKey[label].ts = ts;
    });
    const groups = Object.values(byKey);
    groups.sort((a, b) => b.ts - a.ts);
    groups.forEach((g) => {
      g.items.sort((a, b) => {
        const aImg = isImage(a.media_url);
        const bImg = isImage(b.media_url);
        if (aImg && !bImg) return -1;
        if (!aImg && bImg) return 1;
        // Same type: sort by id so order is stable after approve/reject refetch
        return (a.id ?? 0) - (b.id ?? 0);
      });
    });
    return groups;
  }, [media?.media]);

  // Lightbox slides in same order as grid; include orientation from local state so lightbox matches grid rotation
  const lightboxSlides = useMemo(() => {
    const slides = [];
    mediaGroupedByDate.forEach((group) => {
      group.items.forEach((item) => {
        const url = getImageUrl(item.media_url);
        const isImageFile = isImage(item.media_url);
        const isVideoFile = isVideo(item.media_url);
        const payload = { mediaId: item.id, status: item.status };
        if (isImageFile) {
          const orientation = imageOrientations[item.id] ?? "default";
          slides.push({
            src: url,
            alt: `Image ${item.id}`,
            type: "image",
            orientation,
            ...payload,
          });
        } else if (isVideoFile) {
          slides.push({ src: url, alt: `Video ${item.id}`, type: "video", ...payload });
        }
      });
    });
    return slides;
  }, [mediaGroupedByDate, imageOrientations]);

  // Compute displayed media IDs in the same order as on screen (by group, then images before videos)
  const displayedMediaIds = useMemo(() => {
    const ids = [];
    mediaGroupedByDate.forEach((group) => {
      group.items.forEach((m) => ids.push(m.id));
    });
    return ids;
  }, [mediaGroupedByDate]);

  // Determine if all displayed media are selected
  const isAllSelected = useMemo(() => {
    if (!displayedMediaIds.length) return false;
    if (selectedImageSequence.length !== displayedMediaIds.length) return false;
    const sel = new Set(selectedImageSequence);
    for (const id of displayedMediaIds) {
      if (!sel.has(id)) return false;
    }
    return true;
  }, [selectedImageSequence, displayedMediaIds]);

  // Toggle select all/clear all
  const handleSelectAll = () => {
    if (!media?.media?.length) return;
    if (isAllSelected) {
      setSelectedImageSequence([]);
    } else {
      setSelectedImageSequence(displayedMediaIds);
    }
  };

  const handleLightboxClose = useCallback(() => {
    setLightboxApprovals({});
    setLightboxOpen(false);
  }, []);

  const handleCustomClose = useCallback(() => {
    handleLightboxClose();
  }, [handleLightboxClose]);

  // Handle approval/rejection change for individual media item in lightbox (defined early for keyboard effect)
  const handleApprovalChange = useCallback(
    (mediaId, status) => {
      const mediaItem = media?.media?.find((item) => item.id === parseInt(mediaId, 10));
      if (mediaItem && mediaItem.status === status) {
        toast.info(
          `Image is already ${status === 1 ? "approved" : status === 2 ? "rejected" : "pending"}`
        );
        return;
      }
      setLightboxApprovals((prev) => ({ ...prev, [mediaId]: status }));
      dispatch(
        updateOrderMediaStatus({
          updates: [{ id: parseInt(mediaId, 10), status }],
        })
      ).then((result) => {
        if (result.meta.requestStatus === "fulfilled") dispatch(fetchOrderMedia(id));
        else toast.error("Failed to update media status");
      });
    },
    [dispatch, id, media?.media]
  );

  // Handle keyboard events for lightbox navigation and approval/rejection
  useEffect(() => {
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
          event.preventDefault();
          const currentSlideReject = lightboxSlides[lightboxIndex];
          if (currentSlideReject && currentSlideReject.status !== 4) {
            handleApprovalChange(currentSlideReject.mediaId, 2); // 2 = rejected
          }
          break;

        case " ":
          // Mark current media as approved (skip status 4 Text Image)
          event.preventDefault(); // Prevent page scroll
          const slideApprove = lightboxSlides[lightboxIndex];
          if (slideApprove && slideApprove.status !== 4) {
            handleApprovalChange(slideApprove.mediaId, 1); // 1 = approved
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
  }, [lightboxOpen, lightboxIndex, lightboxSlides, handleCustomClose, handleApprovalChange]);

  // If slides become empty while lightbox is open (e.g. after refetch), close lightbox
  useEffect(() => {
    if (lightboxOpen && lightboxSlides.length === 0) {
      handleCustomClose();
    }
  }, [lightboxOpen, lightboxSlides.length, handleCustomClose]);

  // Clamp lightbox index when slides shrink (e.g. after media refetch) so we don't show out-of-bounds
  useEffect(() => {
    if (!lightboxOpen || lightboxSlides.length === 0) return;
    const maxIndex = lightboxSlides.length - 1;
    if (lightboxIndex > maxIndex) {
      setLightboxIndex(maxIndex);
    }
  }, [lightboxOpen, lightboxSlides.length, lightboxIndex]);

  // Fetch order details and media
  useEffect(() => {
    if (id && (!order || order.id !== Number(id))) {
      dispatch(fetchOrderById(id));
    }
    if (id) {
      dispatch(fetchOrderMedia(id));
    }
  }, [dispatch, id, order]);

  // Log get media API response when it arrives
  /* useEffect(() => {
    if (!mediaLoading && media != null) {
      console.log("[OrderImages] get media API response:", media);
    }
  }, [media, mediaLoading]); */

  // Sync orientation from API: each media record has "orientation"; null/default → "default", show on screen until user changes
  useEffect(() => {
    const list = media?.media || [];
    if (list.length === 0) return;
    const fromApi = {};
    list.forEach((item) => {
      fromApi[item.id] = getDbOrientation(item);
    });
    setImageOrientations((prev) => ({ ...fromApi, ...prev }));
  }, [media?.media]);

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/dashboard" className="text-blue-600 hover:underline">
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

  // Cycle orientation for an image: default → left → right → default (for collage)
  const cycleImageOrientation = (imageId, e) => {
    e?.stopPropagation?.();
    setImageOrientations((prev) => {
      const current = prev[imageId] || "default";
      const next = current === "default" ? "left" : current === "left" ? "right" : "default";
      return { ...prev, [imageId]: next };
    });
  };

  // Normalize orientation from DB: null/undefined/"default" → "default"; "left"/"right" as-is
  const getDbOrientation = (mediaItem) => {
    if (!mediaItem) return "default";
    const raw = mediaItem.orientation;
    return raw === "left" || raw === "right" ? raw : "default";
  };

  // Handle image selection with sequence tracking (status 4 can be selected for collage only)
  const handleImageSelect = (imageId) => {
    setSelectedImageSequence((prevSeq) => {
      if (prevSeq.includes(imageId)) {
        // On deselect: revert orientation to database value (null → default)
        const mediaItem = media?.media?.find((m) => m.id === imageId);
        const dbOrientation = getDbOrientation(mediaItem);
        setImageOrientations((prev) => ({ ...prev, [imageId]: dbOrientation }));
        return prevSeq.filter((mediaId) => mediaId !== imageId);
      } else {
        return [...prevSeq, imageId];
      }
    });
  };

  // Handle copying video URL to clipboard
  const handleCopyVideoUrl = async (mediaUrl, e) => {
    e?.stopPropagation?.();
    if (mediaUrl == null) return;
    try {
      const fullUrl = getImageUrl(mediaUrl);
      await navigator.clipboard.writeText(fullUrl);
      toast.success("Video URL copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy URL:", err);
      toast.error("Failed to copy URL to clipboard");
    }
  };

  // Handle copying public share URL to clipboard
  const handleShareUrl = async () => {
    try {
      const publicUrl = `${window.location.origin}/public/orders/${id}/images`;
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public URL copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy URL:", err);
      toast.error("Failed to copy URL to clipboard");
    }
  };

  // Validation function for collage generation
  const validateCollageGeneration = () => {
    if (selectedImageSequence.length === 0) {
      toast.error("Please select at least one image for collage generation");
      return false;
    }

    // Check if all selected images are approved (status 4 Text Image is allowed without approval)
    const selectedMediaItems =
      media?.media?.filter((item) => selectedImageSequence.includes(item.id)) ||
      [];
    const unapprovedImages = selectedMediaItems.filter(
      (item) => item.status !== 1 && item.status !== 4
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

    // Check image count validation based on allowed counts and text
    const hasText = remarks && remarks.trim().length > 0;
    const imageCount = selectedImageSequence.length;
    
    // Allowed total counts for collage generation (images + text if present)
    const allowedCounts = [2, 4, 6, 8, 12, 16, 20, 24, 32];
    
    // Calculate total count (images + text if present)
    const totalCount = hasText ? imageCount + 1 : imageCount;
    
    // Validate total count against allowed counts
    if (!allowedCounts.includes(totalCount)) {
      if (hasText) {
        // Check if user selected even number of images when text is present
        if (imageCount % 2 === 0) {
          toast.error("When adding text, please select an odd number of images");
        } else {
          // User selected odd number but total count is not in allowed list
          toast.error(`With text, select 1, 3, 5, 7, 11, 15, 19, 23, or 31 images. You selected ${imageCount}.`);
        }
      } else {
        // When no text, check if user selected odd number
        if (imageCount % 2 !== 0) {
          toast.error("When no text is added, please select an even number of images");
        } else {
          // User selected even number but not in allowed list
          toast.error(`Select 2, 4, 6, 8, 12, 16, 20, 24, or 32 images. You selected ${imageCount}.`);
        }
      }
      return false;
    }

    return true;
  };

  // Handle collage generation
  const handleCollageGeneration = () => {
    if (!validateCollageGeneration()) {
      return;
    }

    // Require valuer name set on order before generating collage
    if (!order?.valuer_name || String(order.valuer_name).trim() === "") {
      toast.error(
        "Valuer name is not set for this order. Please set it in Order Attributes before generating collage."
      );
      return;
    }

    const trimmedRemarks = remarks.trim();
    const imageIds = selectedImageSequence.map((id) => id.toString());
    const orientations = selectedImageSequence.map((imageId) => imageOrientations[imageId] || "default");
    const payload = {
      order_id: id.toString(),
      text: trimmedRemarks ? remarks : "",
      image_ids: imageIds,
      orientations,
      valuer_name: order?.valuer_name || "",
    };
    /* console.log("Collage generate payload:", payload); */
    dispatch(generateCollage(payload)).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        const downloadUrl = result.payload?.data?.download_url;
        if (downloadUrl) {
          const fullUrl = resolveAssetUrl(downloadUrl);
          window.open(fullUrl, "_blank");
        }
        setSelectedImageSequence([]);
        setRemarks("");
        setImageOrientations((prev) => {
          const next = { ...prev };
          selectedImageSequence.forEach((imageId) => delete next[imageId]);
          return next;
        });
        dispatch(fetchOrderMedia(id));
      }
    });
  };

  // Handle generate text image (text-only image from remarks, saved to order media)
  const handleGenerateTextImage = () => {
    const trimmed = remarks.trim();
    if (!trimmed) return;
    const payload = {
      order_id: id.toString(),
      text: trimmed,
    };
    dispatch(generateTextImageCollage(payload)).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        setRemarks("");
        dispatch(fetchOrderMedia(id));
      }
    });
  };

  // Custom approval component for lightbox (not shown for status 4 Text Image)
  const ApprovalComponent = ({ slide }) => {
    if (slide.status === 4) return null; // Text Image: no approve/reject in lightbox
    const currentApproval = lightboxApprovals[slide.mediaId] || 0;

    // Handle local approval change and delegate to global handler
    const handleLocalApprovalChange = (status) => {
      handleApprovalChange(slide.mediaId, status);
    };

    return (
      <div
        className="approval-component-lightbox"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
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

  const VideoRenderer = useCallback(({ slide }) => {
    if (slide.type !== "video") return null;
    return (
      <video
        src={slide.src}
        controls
        autoPlay
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={() => toast.error("Failed to load video")}
      />
    );
  }, []);

  const handleSlideTransition = useCallback(({ index }) => {
    setLightboxIndex(index);
  }, []);

  // Lightbox padding so image doesn't touch screen edges
  const LIGHTBOX_PADDING_PX = 24;

  // Lightbox image: no crop; rotated image sized so post-rotation fits within padded area.
  const renderSlideMedia = useCallback((slide) => {
    if (slide.type === "video") return <VideoRenderer slide={slide} />;
    const orientation = slide.orientation ?? "default";
    const isRotated = orientation === "left" || orientation === "right";
    const transform =
      orientation === "left"
        ? "rotate(-90deg)"
        : orientation === "right"
          ? "rotate(90deg)"
          : undefined;
    const paddedVh = `calc(100vh - ${2 * LIGHTBOX_PADDING_PX}px)`;
    const paddedVw = `calc(100vw - ${2 * LIGHTBOX_PADDING_PX}px)`;
    if (isRotated) {
      return (
        <div
          style={{
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
              maxWidth: `min(${paddedVh}, 100%)`,
              maxHeight: `min(${paddedVw}, 100%)`,
              width: `min(${paddedVh}, 100%)`,
              height: `min(${paddedVw}, 100%)`,
              objectFit: "contain",
              display: "block",
              transform,
            }}
          />
        </div>
      );
    }
    return (
      <img
        src={slide.src}
        alt={slide.alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    );
  }, [VideoRenderer]);

  // Handle lightbox open: find slide by media id so order matches grid; init approval state from current media
  const handleLightboxOpen = useCallback(
    (mediaItem) => {
      const slideIndex = lightboxSlides.findIndex((slide) => slide.mediaId === mediaItem.id);
      if (slideIndex === -1) return;
      setLightboxIndex(slideIndex);
      setLightboxOpen(true);
      const currentApprovals = {};
      lightboxSlides.forEach((slide) => {
        const item = media?.media?.find((m) => m.id === slide.mediaId);
        if (item && item.status !== 0) currentApprovals[slide.mediaId] = item.status;
      });
      setLightboxApprovals(currentApprovals);
    },
    [lightboxSlides, media?.media]
  );

  // Handle approve selected images (for bulk operations; exclude status 4 Text Image)
  const handleApprove = () => {
    if (selectedImageSequence.length === 0) {
      toast.warning("Please select images to approve");
      return;
    }

    const updates = selectedImageSequence
      .map((imageId) => {
        const mediaItem = media?.media?.find((m) => m.id === imageId);
        if (mediaItem?.status === 4) return null; // Text Image not in approve/reject
        return { id: imageId, status: 1 }; // 1 = approved
      })
      .filter(Boolean);

    if (updates.length === 0) {
      toast.warning("Selected items are Text Images; approve/reject does not apply.");
      return;
    }

    dispatch(updateOrderMediaStatus({ updates })).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        setSelectedImageSequence([]);
        // Refresh media data to show updated statuses
        dispatch(fetchOrderMedia(id));
      }
    });
  };

  // Handle reject selected images (for bulk operations; exclude status 4 Text Image)
  const handleReject = () => {
    if (selectedImageSequence.length === 0) {
      toast.warning("Please select images to reject");
      return;
    }

    const updates = selectedImageSequence
      .map((imageId) => {
        const mediaItem = media?.media?.find((m) => m.id === imageId);
        if (mediaItem?.status === 4) return null; // Text Image not in approve/reject
        return { id: imageId, status: 2 }; // 2 = rejected
      })
      .filter(Boolean);

    if (updates.length === 0) {
      toast.warning("Selected items are Text Images; approve/reject does not apply.");
      return;
    }

    dispatch(updateOrderMediaStatus({ updates })).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        setSelectedImageSequence([]);
        // Refresh media data to show updated statuses
        dispatch(fetchOrderMedia(id));
      }
    });
  };

  // Handle delete selected media (soft delete)
  const handleDelete = () => {
    if (selectedImageSequence.length === 0) return;
    const ids = [...selectedImageSequence];
    dispatch(deleteOrderMedia({ ids })).then((result) => {
      if (result.meta.requestStatus === "fulfilled") {
        setSelectedImageSequence([]);
        setImageOrientations((prev) => {
          const next = { ...prev };
          ids.forEach((imageId) => delete next[imageId]);
          return next;
        });
      }
    });
  };

  return (
    <section className="order-images-wrapper">
      <div className="row h-100">
        <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 col-xs-12 h-100">
          <div className="order-images-container">
            <div className="order-images-header">
              <div className="order-images-header-title-with-buttons">
                <h2>
                  Media Files{" "}
                  <span className="text-muted">
                    {selectedImageSequence.length
                      ? `(Selected - ${selectedImageSequence.length})`
                      : ""}
                  </span>
                </h2>
                <button
                  onClick={handleSelectAll}
                  title={isAllSelected ? "Clear Selection" : "Select All"}
                  className="btn btn-primary tooltip-link"
                >
                  {isAllSelected ? "Clear Selection" : "Select All"}
                </button>
                {hasPermission(
                  allowedPermissions,
                  "generate_order_collage"
                ) &&
                  remarks.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={handleGenerateTextImage}
                      disabled={collageGeneratingTextImage}
                      className="btn btn-primary tooltip-link ms-2"
                      title="Generate a text-only image and save to order media"
                    >
                      {collageGeneratingTextImage ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                          Generating...
                        </>
                      ) : (
                        "Generate Text Image"
                      )}
                    </button>
                  )}
              </div>
              <div className="order-images-buttons">
                {hasPermission(
                  allowedPermissions,
                  "delete_order_media_files"
                ) && (
                  <button
                    onClick={() =>
                      selectedImageSequence.length > 0 &&
                      setShowDeleteConfirmation(true)
                    }
                    disabled={selectedImageSequence.length === 0}
                    title="Delete Selected Media"
                    className="tooltip-link"
                  >
                    <TrashIcon />
                  </button>
                )}
                {hasPermission(
                  allowedPermissions,
                  "share_public_url_of_media_files"
                ) && (
                  <button
                    onClick={handleShareUrl}
                    title="Share Public URL"
                    className="tooltip-link"
                  >
                    <ShareIcon />
                  </button>
                )}
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
                  {mediaGroupedByDate.map((group) => (
                    <div
                      key={`${group.label}-${group.items[0]?.id ?? 0}`}
                      className="order-images-group"
                      style={{ marginBottom: "32px" }}
                    >
                      <div
                        className="order-images-group-heading"
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          marginBottom: "12px",
                          color: "var(--bs-body-color)",
                        }}
                      >
                        {group.label}
                      </div>
                      <div className="order-images-group-grid d-flex flex-wrap gap-3">
                        {group.items.map((image, index) => {
                          const statusInfo = getStatusInfo(image.status);
                          const isSelected = selectedImageSequence.includes(
                            image.id
                          );
                          const imageUrl = getImageUrl(image.media_url);
                          const gridImageUrl = getGridImageUrl(image);
                          const isImageFile = isImage(image.media_url);
                          const isVideoFile = isVideo(image.media_url);
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
                                  <div
                                    className={`order-image-box-img-wrap ${imageOrientations[image.id] && imageOrientations[image.id] !== "default" ? "is-rotated" : ""}`}
                                  >
                                    <RetryImage
                                      src={gridImageUrl}
                                      alt={`Order Image ${image.id}`}
                                      style={{
                                        transform:
                                          imageOrientations[image.id] === "left"
                                            ? "rotate(-90deg)"
                                            : imageOrientations[image.id] === "right"
                                              ? "rotate(90deg)"
                                              : undefined,
                                      }}
                                    />
                                  </div>
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
                                      handleImageSelect(image.id);
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
                                  {isVideoFile && (
                                    <button
                                      onClick={(e) => {
                                        handleCopyVideoUrl(image.media_url, e);
                                      }}
                                      className="copy-video-url-btn"
                                      title="Copy video URL"
                                      style={{ marginLeft: "5px" }}
                                    >
                                      <Copy size={16} />
                                    </button>
                                  )}
                                  {isSelected && (
                                    <div className="selection-order">
                                      {selectionOrder}
                                    </div>
                                  )}
                                </div>
                                {isImageFile && isSelected && image.status === 1 && (
                                  <div className="orientation-btn-wrap">
                                    <button
                                      type="button"
                                      onClick={(e) => cycleImageOrientation(image.id, e)}
                                      className="orientation-btn"
                                      title={`Orientation: ${imageOrientations[image.id] || "default"} (click to cycle)`}
                                    >
                                      <RotateCw size={14} />
                                      <span className="orientation-badge">{imageOrientations[image.id] || "default"}</span>
                                    </button>
                                  </div>
                                )}
                                <div
                                  className={
                                    image.status === 4
                                      ? "image-status image-status--text-image"
                                      : `image-status ${statusInfo.color}`
                                  }
                                >
                                  {statusInfo.text}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
          slide: ({ slide }) => (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                }}
              >
                {/* Backdrop: full size, click closes lightbox */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                  }}
                  onClick={handleCustomClose}
                  onKeyDown={(e) => e.key === "Enter" && handleCustomClose()}
                  role="button"
                  tabIndex={0}
                  aria-label="Close lightbox"
                />
                {/* Content area: padded so image doesn't touch edges. Full-size container so portrait/landscape/rotated all fit. */}
                <div
                  style={{
                    position: "absolute",
                    top: LIGHTBOX_PADDING_PX,
                    left: LIGHTBOX_PADDING_PX,
                    right: LIGHTBOX_PADDING_PX,
                    bottom: LIGHTBOX_PADDING_PX,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1,
                  }}
                  role="presentation"
                >
                  {/* Inner div: click on image, video, or dark area closes lightbox; not on approval bar or nav */}
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onClick={(e) => {
                      if (e.target.closest(".approval-component-lightbox")) return;
                      if (e.target.closest("button")) return;
                      handleCustomClose();
                    }}
                    role="presentation"
                  >
                    {renderSlideMedia(slide)}
                  </div>
                </div>
                {/* Approval bar fixed to lightbox viewport bottom (full width) */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    paddingBottom: "16px",
                    zIndex: 2,
                    pointerEvents: "auto",
                  }}
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <ApprovalComponent slide={slide} />
                </div>
              </div>
          ),
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

      {/* Delete selected media confirmation */}
      {showDeleteConfirmation && (
        <ConfirmationModal
          title="Confirm Deletion"
          message={`Are you sure you want to delete the selected ${selectedImageSequence.length} media file(s)?`}
          onConfirm={() => {
            setShowDeleteConfirmation(false);
            handleDelete();
          }}
          onCancel={() => setShowDeleteConfirmation(false)}
        />
      )}
    </section>
  );
}

export default OrderImages;
