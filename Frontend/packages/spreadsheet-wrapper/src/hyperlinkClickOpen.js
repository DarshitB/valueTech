/**
 * Open http(s) links with Ctrl/Cmd+click.
 * Plain click still selects the cell. Does not execute sheet commands.
 */

function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function extractUrlFromHyperlinkFormula(formula) {
  const match = String(formula ?? "").match(
    /^=HYPERLINK\(\s*"((?:https?:)\/\/[^"]+)"/i
  );
  return match ? isSafeHttpUrl(match[1]) : null;
}

function extractUrlFromText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const direct = isSafeHttpUrl(text);
  if (direct) {
    return direct;
  }

  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? isSafeHttpUrl(match[0]) : null;
}

function resolveCellHttpUrl(worksheet, row, column) {
  if (!worksheet || row == null || column == null) {
    return null;
  }

  const range = worksheet.getRange?.(row, column);
  if (!range) {
    return null;
  }

  try {
    const links = range.getHyperLinks?.();
    if (Array.isArray(links)) {
      for (const link of links) {
        const fromLink = isSafeHttpUrl(link?.url);
        if (fromLink) {
          return fromLink;
        }
      }
    }
  } catch {
    // Facade method is optional until the hyperlink plugin is ready.
  }

  const fromFormula = extractUrlFromHyperlinkFormula(range.getFormula?.());
  if (fromFormula) {
    return fromFormula;
  }

  return extractUrlFromText(range.getValue?.());
}

/**
 * @param {object} univerAPI
 * @returns {() => void}
 */
export function installHyperlinkClickOpen(univerAPI) {
  if (!univerAPI?.addEvent || !univerAPI?.Event?.CellPointerDown) {
    return () => {};
  }

  let modifierPointerDown = false;

  const handlePointerDown = (event) => {
    modifierPointerDown =
      event.button === 0 && Boolean(event.ctrlKey || event.metaKey);
  };

  window.addEventListener("pointerdown", handlePointerDown, true);

  const disposable = univerAPI.addEvent(
    univerAPI.Event.CellPointerDown,
    (event) => {
      if (!modifierPointerDown) {
        return;
      }
      modifierPointerDown = false;

      const workbook =
        event?.workbook || univerAPI.getActiveWorkbook?.();
      if (workbook?.isCellEditing?.()) {
        return;
      }

      const url = resolveCellHttpUrl(
        event?.worksheet,
        event?.row,
        event?.column
      );
      if (!url) {
        return;
      }

      event.cancel = true;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  );

  return () => {
    window.removeEventListener("pointerdown", handlePointerDown, true);
    disposable?.dispose?.();
  };
}
