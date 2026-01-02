/**
 * PublicOrderImages Component
 *
 * Public view that displays only approved images and videos for a specific order.
 * This component does not require authentication and shows a read-only gallery.
 *
 * Features:
 * - Displays only approved media (backend returns only approved media)
 * - Lightbox support for viewing images and videos
 * - No functional controls (no approve/reject, no collage generation)
 * - Clean, simple gallery view with navbar
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchPublicOrderMedia } from "../../redux/reducers/orderReducer";
import { ZoomIn } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import "./PublicOrderImages.scss";

function PublicOrderImages() {
  const { id } = useParams();
  const dispatch = useDispatch();
  
  // Get media data from Redux store
  const media = useSelector((state) => state.orders.media);
  const loading = useSelector((state) => state.orders.mediaLoading);
  const error = useSelector((state) => state.orders.mediaError);
  
  // Get order number from media response (media.order.order_number)
  const orderNumber = media?.order?.order_number || null;
  
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Parse media URL to get the actual image link
  const getImageUrl = (mediaUrl) => {
    const baseUrl =
      process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

    try {
      const parsed = JSON.parse(mediaUrl);
      if (parsed.path) {
        return `${baseUrl}/${parsed.path}`;
      }
      if (parsed.link) {
        return parsed.link;
      }
      return mediaUrl;
    } catch (error) {
      if (mediaUrl.startsWith("/")) {
        return `${baseUrl}${mediaUrl}`;
      }
      return mediaUrl;
    }
  };

  // Check if media is an image
  const isImage = (mediaUrl) => {
    try {
      const parsed = JSON.parse(mediaUrl);
      const path = parsed.path || "";
      return path.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
    } catch (error) {
      return mediaUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/);
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

  // Backend already returns only approved media, so no filtering needed
  // Separate images and videos
  const approvedMedia = React.useMemo(() => {
    if (!media?.media) return [];
    // Backend returns only approved media, filter by image or video type
    return media.media.filter((item) => isImage(item.media_url) || isVideo(item.media_url));
  }, [media]);

  // Separate images and videos into different arrays
  const approvedImages = React.useMemo(() => {
    return approvedMedia.filter((item) => isImage(item.media_url));
  }, [approvedMedia]);

  const approvedVideos = React.useMemo(() => {
    return approvedMedia.filter((item) => isVideo(item.media_url));
  }, [approvedMedia]);

  // Prepare lightbox slides array (approved images and videos)
  const lightboxSlides = React.useMemo(() => {
    return approvedMedia.map((item) => {
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
    }).filter(Boolean);
  }, [approvedMedia]);

  // Fetch order media using Redux action (public endpoint - no authentication required)
  // The API response includes order information with order_number
  useEffect(() => {
    if (id) {
      dispatch(fetchPublicOrderMedia(id));
    }
  }, [dispatch, id]);

  // Handle lightbox open
  const handleLightboxOpen = (imageItem) => {
    const slideIndex = lightboxSlides.findIndex(
      (slide) => slide.src === getImageUrl(imageItem.media_url)
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

  if (loading) {
    return (
      <div>
        <nav className="public-navbar">
          <div className="public-navbar-content">
            <div className="navbar-brand">
              ValueTech Solutions
            </div>
            <h1 className="page-title-heading">
              Media Files
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
              Media Files
            </h1>
          </div>
        </nav>
        <div className="public-main-content">
          <div className="text-center" style={{ padding: "50px" }}>
            <p className="text-danger">
              {error || "Failed to load images. Please check the URL."}
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
            {orderNumber ? `${orderNumber} Media Files` : "Media Files"}
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
                    {approvedMedia.length > 0 ? (
                      <>
                        {/* Images Section */}
                        {approvedImages.length > 0 && (
                          <div style={{ marginBottom: "40px" }}>
                            <h2 className="section-heading" style={{ marginBottom: "20px", fontSize: "24px", fontWeight: "600" }}>
                              Images ({approvedImages.length})
                            </h2>
                            <div className="public-order-images-grid">
                              {approvedImages.map((item) => {
                                const mediaUrl = getImageUrl(item.media_url);

                                return (
                                  <div key={item.id} className="public-order-image-card">
                                    <div
                                      className="public-order-image-box"
                                      onClick={() => handleLightboxOpen(item)}
                                    >
                                      <img
                                        src={mediaUrl}
                                        alt={`Order Image ${item.id}`}
                                        onError={(e) => {
                                          e.target.src =
                                            "https://via.placeholder.com/200x200?text=Image+Not+Found";
                                        }}
                                      />
                                      <div className="public-order-image-overlay">
                                        <button
                                          className="lightbox-btn"
                                          title="View in lightbox"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleLightboxOpen(item);
                                          }}
                                        >
                                          <ZoomIn size={20} />
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
                          <div>
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
                                          <ZoomIn size={20} />
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
                        <p>No approved media available for this order.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Lightbox */}
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
              if (slide.type === "video") {
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
              } else {
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
                  </div>
                );
              }
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

export default PublicOrderImages;

