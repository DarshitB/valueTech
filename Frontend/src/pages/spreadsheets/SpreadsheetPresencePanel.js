import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { useSpreadsheetPresence } from "../../hooks/useSpreadsheetPresence";
import { useSpreadsheetActiveCells } from "../../hooks/useSpreadsheetActiveCells";
import {
  resolveUserInitials,
} from "./spreadsheetPresenceColors";
import { useSpreadsheetSessionColors } from "./SpreadsheetSessionColorContext";

const TOOLTIP_OFFSET_PX = 8;
const TOOLTIP_VIEWPORT_PADDING_PX = 8;

function PresenceAvatar({ identity, tooltip, className = "" }) {
  const avatarRef = useRef(null);
  const [tooltipState, setTooltipState] = useState(null);

  const hideTooltip = useCallback(() => {
    setTooltipState(null);
  }, []);

  const showTooltip = useCallback(() => {
    const rect = avatarRef.current?.getBoundingClientRect();
    if (!rect || !tooltip) {
      return;
    }

    const centerX = rect.left + rect.width / 2;
    const spaceAbove = rect.top;
    const showBelow = spaceAbove < 40;

    setTooltipState({
      label: tooltip,
      left: Math.min(
        Math.max(centerX, TOOLTIP_VIEWPORT_PADDING_PX),
        window.innerWidth - TOOLTIP_VIEWPORT_PADDING_PX
      ),
      top: showBelow
        ? rect.bottom + TOOLTIP_OFFSET_PX
        : rect.top - TOOLTIP_OFFSET_PX,
      placement: showBelow ? "below" : "above",
    });
  }, [tooltip]);

  return (
    <>
      <span
        ref={avatarRef}
        className={`spreadsheet-presence__avatar ${className}`.trim()}
        style={{
          backgroundColor: identity.avatarBackground,
          color: identity.avatarTextColor,
        }}
        aria-label={tooltip}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {identity.initials}
      </span>
      {tooltipState &&
        createPortal(
          <span
            className={`spreadsheet-presence__tooltip spreadsheet-presence__tooltip--${tooltipState.placement}`}
            style={{
              left: `${tooltipState.left}px`,
              top: `${tooltipState.top}px`,
            }}
            role="tooltip"
          >
            {tooltipState.label}
          </span>,
          document.body
        )}
    </>
  );
}

/**
 * Online users list for the current spreadsheet session.
 * Shows active cell when known: "[D] Darshit → B4"
 * Must render inside SpreadsheetRealtimeProvider.
 */
function SpreadsheetPresencePanel({ localActiveCell = null }) {
  const onlineUsers = useSpreadsheetPresence();
  const activeCellsByUserId = useSpreadsheetActiveCells();
  const { getUserIdentity } = useSpreadsheetSessionColors();
  const currentUserId = useSelector((state) => state.auth.user?.id);

  const rows = useMemo(() => {
    const initialsByUserId = resolveUserInitials(onlineUsers);

    return onlineUsers.map((user) => {
      const isCurrentUser =
        currentUserId != null &&
        String(user.userId) === String(currentUserId);

      const remoteCell = activeCellsByUserId[user.userId]?.cell;
      const cell = isCurrentUser ? localActiveCell : remoteCell;
      const identity = getUserIdentity(
        user.userId,
        user.userName,
        initialsByUserId.get(String(user.userId))
      );

      return {
        userId: user.userId,
        userName: user.userName,
        cell: cell || null,
        identity,
        isCurrentUser,
      };
    });
  }, [onlineUsers, activeCellsByUserId, currentUserId, localActiveCell, getUserIdentity]);

  const currentUserRow = rows.find((row) => row.isCurrentUser) || null;
  const visibleRows = rows.filter((row) => !row.isCurrentUser);

  return (
    <div className="spreadsheet-presence" aria-live="polite">
      {currentUserRow && (
        <div className="spreadsheet-presence__section spreadsheet-presence__section--you">
          <span className="spreadsheet-presence__section-label">You</span>
          <PresenceAvatar
            className="spreadsheet-presence__avatar--current"
            identity={currentUserRow.identity}
            tooltip={currentUserRow.userName || "You"}
          />
        </div>
      )}
      <div className="spreadsheet-presence__section spreadsheet-presence__section--online">
        <span className="spreadsheet-presence__section-label">Online</span>
        {visibleRows.length > 0 ? (
          <ul className="spreadsheet-presence__list">
            {visibleRows.map((row) => (
              <li key={row.userId} className="spreadsheet-presence__user">
                <PresenceAvatar
                  identity={row.identity}
                  tooltip={row.userName}
                />
                {/* Keep for quick debug enablement if needed later.
            <span
              className="spreadsheet-presence__name"
              style={{ color: row.identity.avatarBackground }}
            >
              {row.userName}
            </span>
            {row.cell && (
              <>
                <span className="spreadsheet-presence__separator">→</span>
                <span className="spreadsheet-presence__cell">{row.cell}</span>
              </>
            )}
            */}
              </li>
            ))}
          </ul>
        ) : (
          <span className="spreadsheet-presence__empty">
            No other collaborators right now
          </span>
        )}
      </div>
    </div>
  );
}

export default SpreadsheetPresencePanel;
