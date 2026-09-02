import { IMarkSelectionService } from "@univerjs/sheets-ui";

/**
 * Presence (other-user) borders are Univer mark-selections drawn above the
 * real cell selection. Their border rects capture pointer events and hide the
 * fill-handle "+" cursor. Canvas has no CSS pointer-events, so disable
 * evented on those overlay controls only.
 */
function isPresenceOverlayStyle(style) {
  if (!style || typeof style !== "object") {
    return false;
  }

  // Copy/cut marching ants use dash — leave those alone.
  if (style.strokeDash != null) {
    return false;
  }

  const fill = String(style.fill ?? "").replace(/\s/g, "");
  return fill === "rgba(0,0,0,0)" || fill === "transparent";
}

function disableControlPointerEvents(control) {
  if (!control) {
    return;
  }

  control.setEvent?.(false);

  if (control.fillControl) {
    control.fillControl.evented = false;
  }
}

function disablePresenceOverlayPointerEvents(markSelectionService) {
  const shapeMap = markSelectionService?.getShapeMap?.();
  if (!shapeMap || typeof shapeMap.forEach !== "function") {
    return;
  }

  shapeMap.forEach((shape) => {
    if (!isPresenceOverlayStyle(shape?.selection?.style)) {
      return;
    }
    disableControlPointerEvents(shape.control);
  });
}

function getMarkSelectionService(univerAPI) {
  const injector = univerAPI?._injector;
  if (!injector?.get || !IMarkSelectionService) {
    return null;
  }

  try {
    return injector.get(IMarkSelectionService);
  } catch {
    return null;
  }
}

/**
 * Make collaborator selection borders ignore mouse hits.
 * Re-applied after Univer recreates overlay shapes (zoom, sheet switch).
 * @param {object} univerAPI
 * @returns {() => void}
 */
export function disablePresenceHighlightPointerEvents(univerAPI) {
  try {
    disablePresenceOverlayPointerEvents(getMarkSelectionService(univerAPI));
  } catch {
    // Overlay hit-testing must never block selection or fill.
  }
}

export function installPresenceHighlightPointerPassthrough(univerAPI) {
  const markSelectionService = getMarkSelectionService(univerAPI);
  if (!markSelectionService?.refreshShapes) {
    return () => {};
  }

  const originalRefreshShapes = markSelectionService.refreshShapes.bind(
    markSelectionService
  );

  markSelectionService.refreshShapes = () => {
    originalRefreshShapes();
    disablePresenceHighlightPointerEvents(univerAPI);
  };

  disablePresenceHighlightPointerEvents(univerAPI);

  return () => {
    markSelectionService.refreshShapes = originalRefreshShapes;
  };
}
