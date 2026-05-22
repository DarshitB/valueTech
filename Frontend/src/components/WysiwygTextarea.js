import React, { useRef, useEffect } from "react";

const normalizeWysiwygHtml = (html) => {
  if (typeof html !== "string") return html;
  const trimmed = html.trim();
  if (!trimmed) return "";

  const stripped = trimmed
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/?(div|p|span)[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, "");

  return stripped === "" ? "" : html;
};

/**
 * contentEditable field — used for long text / amount in words on reports.
 */
function WysiwygTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  className = "",
  name,
  id,
  readOnly = false,
  required = false,
}) {
  const editorRef = useRef(null);
  const isUpdatingRef = useRef(false);
  const minHeightPx = Math.max(80, rows * 28);

  useEffect(() => {
    if (editorRef.current && !isUpdatingRef.current) {
      const currentContent = editorRef.current.innerHTML;
      const newContent = normalizeWysiwygHtml(value) || "";

      if (currentContent !== newContent) {
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const wasFocused = document.activeElement === editorRef.current;

        isUpdatingRef.current = true;
        editorRef.current.innerHTML = newContent;

        if (wasFocused && range) {
          try {
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (_) {
            /* ignore invalid range */
          }
        }

        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }
  }, [value]);

  const handleInput = (e) => {
    if (!isUpdatingRef.current && onChange) {
      const normalizedValue = normalizeWysiwygHtml(e.target.innerHTML);
      onChange({
        target: {
          name,
          value: normalizedValue,
        },
      });
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    let plainText = e.clipboardData.getData("text/plain");
    plainText = plainText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");

    const htmlText = plainText.replace(/\n/g, "<br>");
    document.execCommand("insertHTML", false, htmlText || "");
  };

  useEffect(() => {
    if (editorRef.current) {
      const normalized = normalizeWysiwygHtml(value);
      if (!normalized) {
        editorRef.current.classList.add("empty");
      } else {
        editorRef.current.classList.remove("empty");
      }
    }
  }, [value]);

  return (
    <>
      <style>{`
        .wysiwyg-textarea {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          outline: none;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
          background-color: white;
          font-size: 14px;
          line-height: 1.45;
        }
        .wysiwyg-textarea.amount-in-words-wysiwyg {
          font-size: 14px;
          line-height: 1.55;
          letter-spacing: 0.01em;
        }
        .wysiwyg-textarea:focus {
          border-color: #5864bd;
          box-shadow: 0 0 0 2px rgba(88, 100, 189, 0.1);
        }
        .wysiwyg-textarea.empty:before {
          content: attr(data-placeholder);
          color: #999;
          pointer-events: none;
        }
        .wysiwyg-textarea[contenteditable="false"] {
          cursor: default;
          background-color: #f5f5f5;
        }
      `}</style>
      <div
        ref={editorRef}
        id={id}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className={`wysiwyg-textarea form-field ${className}`.trim()}
        data-placeholder={placeholder}
        aria-required={required || undefined}
        style={{
          minHeight: `${minHeightPx}px`,
          ...(readOnly ? { cursor: "default", backgroundColor: "#f5f5f5" } : {}),
        }}
      />
    </>
  );
}

export default WysiwygTextarea;
export { normalizeWysiwygHtml };
