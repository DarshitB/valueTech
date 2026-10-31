function isVisuallyEmptyNode(node) {
  if (!node) return true;

  if (node.nodeType === Node.TEXT_NODE) {
    return !String(node.textContent || "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return true;

  const tag = node.tagName.toLowerCase();
  if (tag === "br" || tag === "meta" || tag === "style" || tag === "script") {
    return true;
  }

  // Keep real content structures (tables, lists, images, etc.)
  if (
    tag === "table" ||
    tag === "img" ||
    tag === "ul" ||
    tag === "ol" ||
    tag === "hr"
  ) {
    return false;
  }

  const text = String(node.textContent || "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (text) return false;

  // Empty <p>/<div> that only contain <br> / whitespace
  return true;
}

/**
 * Remove only leading empty nodes / whitespace before the first real character.
 * Keeps internal spaces, blank lines, and formatting intact.
 */
function stripLeadingEmptyNodes(root) {
  let safety = 0;
  while (root.firstChild && safety < 200) {
    safety++;
    const first = root.firstChild;

    if (first.nodeType === Node.TEXT_NODE) {
      const trimmed = String(first.textContent || "").replace(
        /^[\s\u00a0\u200b]+/,
        ""
      );
      if (!trimmed) {
        root.removeChild(first);
        continue;
      }
      first.textContent = trimmed;
      break;
    }

    if (first.nodeType !== Node.ELEMENT_NODE) {
      root.removeChild(first);
      continue;
    }

    const tag = first.tagName.toLowerCase();
    if (tag === "br" || tag === "meta" || tag === "style" || tag === "script") {
      root.removeChild(first);
      continue;
    }

    if (isVisuallyEmptyNode(first)) {
      root.removeChild(first);
      continue;
    }

    // Recurse into leading container so "   Hello" / <p><br>text become clean
    if (["div", "span", "section", "article", "p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      stripLeadingEmptyNodes(first);
      if (isVisuallyEmptyNode(first)) {
        root.removeChild(first);
        continue;
      }
    }
    break;
  }

  // ChatGPT often wraps the fragment in one outer div — clean inside it too
  const only = root.childNodes.length === 1 ? root.firstChild : null;
  if (
    only &&
    only.nodeType === Node.ELEMENT_NODE &&
    ["div", "span", "section", "article"].includes(only.tagName.toLowerCase())
  ) {
    stripLeadingEmptyNodes(only);
  }
}

/** Plain text: drop leading whitespace/newlines only; keep the rest. */
export function stripLeadingPlainText(text) {
  return String(text || "").replace(/^[\s\u00a0\u200b]+/, "");
}

/**
 * Sanitize pasted HTML for report WYSIWYG:
 * - keep structure (tables, paragraphs, lists, etc.)
 * - strip style/class/id/data-* attrs
 * - drop leading empty lines / spaces / <br> before first character only
 */
export function sanitizePastedHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html || "";

  temp.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (
        attr.name === "style" ||
        attr.name === "class" ||
        attr.name === "id" ||
        attr.name.startsWith("data-")
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });

  stripLeadingEmptyNodes(temp);
  return temp.innerHTML;
}

/** True when the current selection covers the entire editor contents. */
function isEntireElementSelected(element) {
  if (!element) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;

  const range = sel.getRangeAt(0);
  if (
    !element.contains(range.commonAncestorContainer) &&
    range.commonAncestorContainer !== element
  ) {
    return false;
  }

  // Anything left before/after selection inside the editor?
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);

  const after = range.cloneRange();
  after.selectNodeContents(element);
  after.setStart(range.endContainer, range.endOffset);

  const leftover =
    String(before.toString() || "").replace(/\u00a0/g, " ").trim() +
    String(after.toString() || "").replace(/\u00a0/g, " ").trim();

  return leftover === "";
}

/**
 * Select-all + paste can leave a leftover empty <p> (with margin) above content.
 * Clear the editor first so insert starts clean.
 */
function clearEditorIfFullySelected(editor) {
  if (!editor || !isEntireElementSelected(editor)) return false;

  editor.innerHTML = "";
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/**
 * Apply paste into a contentEditable field.
 * IMPORTANT: call getData() synchronously in the paste handler first —
 * clipboard data is often empty after rAF/timeouts.
 * Pass `editor` so select-all + paste does not leave an empty leading <p>.
 * Returns true when something was inserted.
 */
export function insertWysiwygClipboardData({
  html = "",
  text = "",
  editor = null,
} = {}) {
  clearEditorIfFullySelected(editor);

  let inserted = false;
  if (html) {
    const cleaned = sanitizePastedHtml(html);
    if (cleaned) {
      document.execCommand("insertHTML", false, cleaned);
      inserted = true;
    }
  }

  if (!inserted) {
    const cleanedText = stripLeadingPlainText(text);
    if (cleanedText) {
      document.execCommand("insertText", false, cleanedText);
      inserted = true;
    }
  }

  // Drop leftover leading empty <p>/<br> (common after select-all replace).
  // Only leading empties — mid/trailing content is untouched.
  if (editor && inserted) {
    stripLeadingEmptyNodes(editor);
  }

  return inserted;
}

/** Convenience when still inside the paste event (sync getData). */
export function insertWysiwygClipboard(clipboardData) {
  return insertWysiwygClipboardData({
    html: clipboardData?.getData?.("text/html") || "",
    text: clipboardData?.getData?.("text/plain") || "",
  });
}
