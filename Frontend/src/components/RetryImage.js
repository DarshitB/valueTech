import React, { useState, useEffect, useRef, useCallback } from "react";

/**
 * RetryImage — drop-in replacement for <img> that automatically retries
 * loading for remote (R2/CDN) URLs when the initial request fails due to
 * CDN propagation delay or transient network errors.
 *
 * Retry schedule: 2 s → 4 s → 6 s (linear backoff, max 3 retries).
 * Cache-busting query param is appended on each retry so the browser
 * does not serve the cached failure.
 *
 * Local paths (starting with "/") are NOT retried — a 404 on a local
 * asset is a real error, not a transient CDN hiccup.
 *
 * After exhausting retries, a tasteful "Unavailable" placeholder is shown
 * that respects the same style / className / onClick as the original img.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 2000;

function UnavailablePlaceholder({ style, className, onClick, alt }) {
  return (
    <div
      role="img"
      aria-label={alt || "Image unavailable"}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "6px",
        background: "#f3f4f6",
        color: "#9ca3af",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
      className={className}
      onClick={onClick}
    >
      {/* Broken-image icon */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <span style={{ fontSize: "11px", letterSpacing: "0.3px" }}>
        Unavailable
      </span>
    </div>
  );
}

function RetryImage({ src, alt, style, className, onClick, onError: externalOnError, ...rest }) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [failed, setFailed] = useState(false);
  // Use ref so the onError closure always reads the latest count without stale captures.
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Reset everything when the source URL changes (e.g., after R2 sync completes).
  useEffect(() => {
    retryCountRef.current = 0;
    setFailed(false);
    setDisplaySrc(src);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [src]);

  const handleError = useCallback(() => {
    // Only retry absolute HTTP(S) URLs — CDN propagation delays only affect these.
    const isRemoteUrl = src && /^https?:\/\//i.test(src);

    if (isRemoteUrl && retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current += 1;
      const delay = RETRY_DELAY_BASE_MS * retryCountRef.current; // 2 s, 4 s, 6 s
      retryTimerRef.current = setTimeout(() => {
        // Append cache-buster so the browser actually re-fetches.
        const sep = src.includes("?") ? "&" : "?";
        setDisplaySrc(`${src}${sep}_cb=${Date.now()}`);
      }, delay);
    } else {
      // Local URL or max retries exhausted — show placeholder.
      setFailed(true);
      if (externalOnError) externalOnError();
    }
  }, [src, externalOnError]);

  if (failed) {
    return (
      <UnavailablePlaceholder
        style={style}
        className={className}
        onClick={onClick}
        alt={alt}
      />
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      style={style}
      className={className}
      onClick={onClick}
      onError={handleError}
      {...rest}
    />
  );
}

export default RetryImage;
