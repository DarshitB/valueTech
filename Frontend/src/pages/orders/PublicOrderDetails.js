/**
 * PublicOrderDetails Component
 *
 * Public view that displays order details WITHOUT images but WITH videos.
 * This component does not require authentication.
 *
 * Features:
 * - Displays videos, reports, and collages
 * - NO images shown (only photos are excluded)
 * - Clean, simple view with navbar
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicOrderMedia } from "../../redux/reducers/orderReducer";
import { FileText, Eye } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import "./PublicOrderImages.scss";
import { resolveAssetUrl } from "../../utils/urlUtils";

function PublicOrderDetails() {
  const { id, token } = useParams();
  const dispatch = useDispatch();
  
  // Get media data from Redux store
  const media = useSelector((state) => state.orders.media);
  const loading = useSelector((state) => state.orders.mediaLoading);
  const error = useSelector((state) => state.orders.mediaError);
  
  // Get order number from media response
  const orderNumber = media?.order?.order_number || null;

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Parse media URL to get the actual link
  const getImageUrl = (mediaUrl) => {
    try {
      const parsed = JSON.parse(mediaUrl);
      if (parsed.path) {
        return resolveAssetUrl(parsed.path);
      }
      if (parsed.link) {
        return resolveAssetUrl(parsed.link);
      }
      return resolveAssetUrl(mediaUrl);
    } catch {
      return resolveAssetUrl(mediaUrl);
    }
  };

  // Open public document/collage via blob so source URL is not exposed
  // in browser address bar (same UX pattern as authenticated documents page).
  const openPublicFileInNewTab = async (url) => {
    const newWindow = window.open("about:blank", "_blank");
    if (!newWindow) return;

    try {
      newWindow.document.write(
        "<!DOCTYPE html><html><head><title>Opening\u2026</title>" +
          "<style>" +
          "body{margin:0;height:100vh;display:flex;align-items:center;" +
          "justify-content:center;background:#f8f9fa;" +
          "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
          ".sp{width:36px;height:36px;border:3px solid #dee2e6;" +
          "border-top-color:#495057;border-radius:50%;" +
          "animation:spin .7s linear infinite;margin:0 auto 14px;}" +
          "@keyframes spin{to{transform:rotate(360deg)}}" +
          "p{margin:0;font-size:14px;color:#6c757d;}" +
          "</style></head><body>" +
          "<div style='text-align:center'>" +
          "<div class='sp'></div><p>Opening document\u2026</p>" +
          "</div></body></html>"
      );
      newWindow.document.close();
    } catch (_) {
      // Ignore document.write issues due to browser/csp restrictions.
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      newWindow.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 90_000);
    } catch (_) {
      try {
        newWindow.close();
      } catch (closeErr) {}
    }
  };

  // Get filename from media URL
  const getFilenameFromMediaUrl = (media_url) => {
    if (!media_url || typeof media_url !== "string") return "Document";
    try {
      const parsed = JSON.parse(media_url);
      if (parsed && typeof parsed === "object") {
        const filename = parsed.path || parsed.filename || parsed.name;
        if (filename) {
          const extractedName =
            typeof filename === "string"
              ? filename.split("/").pop() || filename
              : "Document";
          return extractedName;
        }
      }
      return "Document";
    } catch {
      if (typeof media_url === "string") {
        const filename = media_url.split("/").pop() || media_url;
        return filename;
      }
      return "Document";
    }
  };

  // Check if media is a video
  const isVideo = (mediaUrl) => {
    try {
      const parsed = JSON.parse(mediaUrl);
      const path = parsed.path || "";
      return path.toLowerCase().match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/);
    } catch (error) {
      return mediaUrl.toLowerCase().match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/);
    }
  };

  // Filter videos from media
  const approvedVideos = React.useMemo(() => {
    if (!media?.media) return [];
    return media.media.filter((item) => isVideo(item.media_url));
  }, [media]);

  // Filter reports from media response using media_type
  const approvedReports = React.useMemo(() => {
    if (!media?.media) return [];
    return media.media.filter((item) => item.media_type === "report");
  }, [media]);

  // Filter collages from media response using media_type
  const approvedCollages = React.useMemo(() => {
    if (!media?.media) return [];
    return media.media.filter((item) => item.media_type === "collage");
  }, [media]);

  // Prepare lightbox slides array for videos
  const lightboxSlides = React.useMemo(() => {
    return approvedVideos.map((item) => {
      const url = getImageUrl(item.media_url);
      return {
        src: url,
        alt: `Video ${item.id}`,
        type: "video",
        mediaId: item.id,
      };
    });
  }, [approvedVideos]);

  // Handle lightbox open
  const handleLightboxOpen = (videoItem) => {
    const slideIndex = lightboxSlides.findIndex(
      (slide) => slide.src === getImageUrl(videoItem.media_url)
    );

    if (slideIndex !== -1) {
      setLightboxIndex(slideIndex);
      setLightboxOpen(true);
    }
  };

  // Handle lightbox close
  const handleLightboxClose = () => {
    setLightboxOpen(false);
  };

  // Handle slide transitions
  const handleSlideTransition = ({ index }) => {
    setLightboxIndex(index);
  };

  // Fetch order media using Redux action (public endpoint - no authentication required)
  useEffect(() => {
    if (token) {
      dispatch(fetchPublicOrderMedia({ token }));
      return;
    }
    if (id) {
      dispatch(fetchPublicOrderMedia({ orderId: id }));
    }
  }, [dispatch, id, token]);

  if (loading) {
    return (
      <div>
        <nav className="public-navbar">
          <div className="public-navbar-content">
            <div className="navbar-brand">
              ValueTech Solutions
            </div>
            <h1 className="page-title-heading">
              Order Details
            </h1>
          </div>
        </nav>
        <div className="public-main-content">
          <div className="text-center" style={{ padding: "50px" }}>
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <nav className="public-navbar">
          <div className="public-navbar-content">
            <div className="navbar-brand">
              ValueTech Solutions
            </div>
            <h1 className="page-title-heading">
              Order Details
            </h1>
          </div>
        </nav>
        <div className="public-main-content">
          <div className="text-center" style={{ padding: "50px" }}>
            <p className="text-danger">
              {error || "Failed to load order details. Please check the URL."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Navbar */}
      <nav className="public-navbar">
        <div className="public-navbar-content">
          {/* Logo */}
          <div className="navbar-brand">
            ValueTech Solutions
          </div>
          {/* Order number and title */}
          <h1 className="page-title-heading">
            {orderNumber ? `${orderNumber} - Order Details` : "Order Details"}
          </h1>
        </div>
      </nav>

      {/* Main Content */}
      <div className="public-main-content">
        <section className="public-order-images-wrapper">
          <div className="container-fluid">
            <div className="row">
              <div className="col-12">
                <div className="public-order-images-container">
                  <div className="public-order-images-content">
                    {approvedVideos.length > 0 || approvedReports.length > 0 || approvedCollages.length > 0 ? (
                      <>
                        {/* Reports Section */}
                        {approvedReports.length > 0 && (
                          <div style={{ marginBottom: "40px" }}>
                            <h2 className="section-heading" style={{ marginBottom: "20px", fontSize: "24px", fontWeight: "600" }}>
                              Reports ({approvedReports.length})
                            </h2>
                            <div className="public-order-images-grid">
                              {approvedReports.map((item) => {
                                const documentUrl = getImageUrl(item.view_url || item.media_url);
                                const fileName = item.file_name || item.name || getFilenameFromMediaUrl(item.media_url) || `Report ${item.id}`;

                                return (
                                  <div key={item.id} className="public-order-image-card">
                                    <div
                                      className="public-order-image-box"
                                      onClick={() => openPublicFileInNewTab(documentUrl)}
                                      style={{
                                        backgroundColor: "#f8f9fa",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "20px",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <FileText size={48} color="#007bff" style={{ marginBottom: "12px" }} />
                                      <span
                                        style={{
                                          fontSize: "12px",
                                          color: "#333",
                                          fontWeight: "500",
                                          textAlign: "center",
                                          wordBreak: "break-word",
                                          maxWidth: "100%",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                        }}
                                        title={fileName}
                                      >
                                        {fileName}
                                      </span>
                                      <div className="public-order-image-overlay">
                                        <button
                                          className="lightbox-btn"
                                          title="Open report in new tab"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPublicFileInNewTab(documentUrl);
                                          }}
                                        >
                                          <Eye size={20} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Collages Section */}
                        {approvedCollages.length > 0 && (
                          <div style={{ marginBottom: "40px" }}>
                            <h2 className="section-heading" style={{ marginBottom: "20px", fontSize: "24px", fontWeight: "600" }}>
                              Collages ({approvedCollages.length})
                            </h2>
                            <div className="public-order-images-grid">
                              {approvedCollages.map((item) => {
                                const mediaUrl = getImageUrl(item.view_url || item.media_url);
                                const fileName = item.file_name || item.name || getFilenameFromMediaUrl(item.media_url) || `Collage ${item.id}`;

                                return (
                                  <div key={item.id} className="public-order-image-card">
                                    <div
                                      className="public-order-image-box"
                                      onClick={() => openPublicFileInNewTab(mediaUrl)}
                                      style={{
                                        backgroundColor: "#f8f9fa",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "20px",
                                        cursor: "pointer",
                                      }}
                                    >
                                      <FileText size={48} color="#007bff" style={{ marginBottom: "12px" }} />
                                      <span
                                        style={{
                                          fontSize: "12px",
                                          color: "#333",
                                          fontWeight: "500",
                                          textAlign: "center",
                                          wordBreak: "break-word",
                                          maxWidth: "100%",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                        }}
                                        title={fileName}
                                      >
                                        {fileName}
                                      </span>
                                      <div className="public-order-image-overlay">
                                        <button
                                          className="lightbox-btn"
                                          title="Open collage in new tab"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPublicFileInNewTab(mediaUrl);
                                          }}
                                        >
                                          <Eye size={20} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Videos Section */}
                        {approvedVideos.length > 0 && (
                          <div style={{ marginBottom: "40px" }}>
                            <h2 className="section-heading" style={{ marginBottom: "20px", fontSize: "24px", fontWeight: "600" }}>
                              Videos ({approvedVideos.length})
                            </h2>
                            <div className="public-order-images-grid">
                              {approvedVideos.map((item) => {
                                const mediaUrl = getImageUrl(item.media_url);

                                return (
                                  <div key={item.id} className="public-order-image-card">
                                    <div
                                      className="public-order-image-box"
                                      onClick={() => handleLightboxOpen(item)}
                                    >
                                      <video
                                        src={mediaUrl}
                                        preload="metadata"
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                      >
                                        Your browser does not support the video tag.
                                      </video>
                                      <div className="public-order-image-overlay">
                                        <button
                                          className="lightbox-btn"
                                          title="View in lightbox"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleLightboxOpen(item);
                                          }}
                                        >
                                          <Eye size={20} />
                                        </button>
                                        <span
                                          style={{
                                            position: "absolute",
                                            top: "10px",
                                            right: "10px",
                                            background: "rgba(0,0,0,0.7)",
                                            color: "white",
                                            padding: "4px 8px",
                                            borderRadius: "4px",
                                            fontSize: "12px",
                                          }}
                                        >
                                          Video
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center text-muted" style={{ padding: "50px" }}>
                        <p>No documents available for this order.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Lightbox for videos */}
        <Lightbox
          open={lightboxOpen}
          close={handleLightboxClose}
          index={lightboxIndex}
          slides={lightboxSlides}
          carousel={{
            finite: true,
            preload: 1,
            padding: 0,
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
              return (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <video
                    src={slide.src}
                    controls
                    autoPlay
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              );
            },
          }}
          animation={{
            fade: 150,
            swipe: 150,
          }}
          controller={{
            closeOnBackdropClick: true,
            closeOnPullDown: true,
            closeOnPinch: true,
            closeOnEscape: true,
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
      </div>
    </div>
  );
}

export default PublicOrderDetails;
