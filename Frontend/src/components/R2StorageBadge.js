import React from "react";
import { isRemoteR2MediaUrl, isR2SyncFeatureEnabled } from "../utils/urlUtils";

export default function R2StorageBadge({ mediaUrl, className, style }) {
  if (!isR2SyncFeatureEnabled() || !isRemoteR2MediaUrl(mediaUrl)) return null;

  return (
    <span
      title="Stored on R2"
      className={className}
      style={{
        backgroundColor: "#f59e0b",
        color: "#fff",
        padding: "2px 6px",
        borderRadius: "999px",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.02em",
        lineHeight: 1.2,
        ...style,
      }}
    >
      R2
    </span>
  );
}
