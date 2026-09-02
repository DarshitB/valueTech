import { IRenderManagerService } from "@univerjs/engine-render";
import { ISheetSelectionRenderService } from "@univerjs/sheets-ui";

/**
 * Local appearance for the user's own Univer selection:
 * slightly larger fill handle, and optional current-user border color.
 * Visual only — does not execute selection commands or publish realtime.
 */
export const SELECTION_FILL_HANDLE_SIZE = 10;
const SET_SELECTIONS_OPERATION_ID = "sheet.operation.set-selections";

export function normalizeSelectionBorderColor(color) {
  const value = String(color ?? "").trim();
  const shortHex = /^#([0-9a-fA-F]{3})$/.exec(value);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }

  return null;
}

function isSpecialSelectionStyle(style) {
  if (!style || typeof style !== "object") {
    return false;
  }

  // Formula reference highlights use an id. Copy/paste marching ants use dash.
  if (style.id || style.strokeDash != null) {
    return true;
  }

  const widgets = style.widgets;
  if (widgets && typeof widgets === "object") {
    return Object.values(widgets).some(Boolean);
  }

  return false;
}

function buildNormalSelectionStylePatch(borderColor) {
  const patch = { autofillSize: SELECTION_FILL_HANDLE_SIZE };
  const color = normalizeSelectionBorderColor(borderColor);
  if (color) {
    patch.stroke = color;
    patch.rowHeaderStroke = color;
    patch.columnHeaderStroke = color;
  }
  return patch;
}

function styleAlreadyHasPatch(style, patch) {
  return Object.keys(patch).every((key) => style[key] === patch[key]);
}

function applyNormalSelectionAppearance(selections, borderColor) {
  if (!Array.isArray(selections)) {
    return;
  }

  const patch = buildNormalSelectionStylePatch(borderColor);

  for (const selection of selections) {
    if (!selection || typeof selection !== "object") {
      continue;
    }

    const style = selection.style;
    if (isSpecialSelectionStyle(style)) {
      continue;
    }

    if (style && typeof style === "object") {
      if (styleAlreadyHasPatch(style, patch)) {
        continue;
      }
      selection.style = { ...style, ...patch };
      continue;
    }

    selection.style = { ...patch };
  }
}

function getLocalSelectionControls(univerAPI) {
  const injector = univerAPI?._injector;
  if (!injector?.get || !IRenderManagerService || !ISheetSelectionRenderService) {
    return [];
  }

  try {
    const renderManagerService = injector.get(IRenderManagerService);
    const workbook = univerAPI.getActiveWorkbook?.();
    const unitId = workbook?.getId?.();
    if (!unitId || !renderManagerService?.getRenderById) {
      return [];
    }

    const render = renderManagerService.getRenderById(unitId);
    const selectionRender = render?.with?.(ISheetSelectionRenderService);
    const controls = selectionRender?.getSelectionControls?.();
    return Array.isArray(controls) ? controls : [];
  } catch {
    return [];
  }
}

/**
 * Paint the current local selection border without executing a command.
 * @param {object} univerAPI
 * @param {string | null | undefined} borderColor
 */
export function paintLocalSelectionBorder(univerAPI, borderColor) {
  const color = normalizeSelectionBorderColor(borderColor);
  if (!color || !univerAPI) {
    return;
  }

  try {
    const controls = getLocalSelectionControls(univerAPI);
    controls.forEach((control) => {
      control?.updateStyle?.({
        stroke: color,
        rowHeaderStroke: color,
        columnHeaderStroke: color,
      });
    });
  } catch {
    // Visual-only; never block selection or editing.
  }
}

/**
 * Enlarge the fill handle and optionally recolor the local selection border.
 * @param {object} univerAPI
 * @param {() => (string | null | undefined)} [getBorderColor]
 * @returns {() => void}
 */
export function installLargerSelectionFillHandle(univerAPI, getBorderColor) {
  if (!univerAPI?.addEvent || !univerAPI?.Event?.BeforeCommandExecute) {
    return () => {};
  }

  const disposable = univerAPI.addEvent(
    univerAPI.Event.BeforeCommandExecute,
    (event) => {
      if (event?.id !== SET_SELECTIONS_OPERATION_ID) {
        return;
      }

      try {
        const borderColor =
          typeof getBorderColor === "function" ? getBorderColor() : null;
        applyNormalSelectionAppearance(event.params?.selections, borderColor);
      } catch {
        // Style tweak must never block selection, fill, or other sheet commands.
      }
    }
  );

  return () => {
    disposable?.dispose?.();
  };
}
