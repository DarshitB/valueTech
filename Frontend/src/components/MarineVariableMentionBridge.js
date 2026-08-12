import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

function isTextualTarget(el, excludedInputNames) {
  if (!el || el.disabled || el.readOnly) return false;

  // Skip react-select search boxes and other non-report fields
  if (
    el.closest('[class*="react-select"]') ||
    (el.id && String(el.id).includes("react-select"))
  ) {
    return false;
  }

  if (el.isContentEditable) return true;

  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;

  if (tag === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    if (
      ![
        "text",
        "search",
        "email",
        "url",
        "tel",
        "password",
        "",
      ].includes(type)
    ) {
      return false;
    }
    if (excludedInputNames.has(el.name)) return false;
    return true;
  }

  return false;
}

function filterOptions(query, variableOptions) {
  const q = String(query || "").toLowerCase();
  if (!q) return variableOptions;
  return variableOptions.filter((opt) => {
    const tokenBody = opt.token.slice(1).toLowerCase();
    return (
      tokenBody.startsWith(q) ||
      opt.label.toLowerCase().includes(q) ||
      opt.token.toLowerCase().includes(q)
    );
  });
}

function getInputAtMention(el) {
  const value = el.value ?? "";
  const caret = el.selectionStart;
  if (caret == null) return null;

  const before = value.slice(0, caret);
  const match = before.match(/@([A-Za-z]*)$/);
  if (!match) return null;

  return {
    kind: "input",
    query: match[1],
    start: caret - match[0].length,
    end: caret,
  };
}

function getContentEditableAtMention(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  if (!range.collapsed) return null;

  let node = range.startContainer;
  let offset = range.startOffset;

  if (node.nodeType !== Node.TEXT_NODE) {
    if (node.childNodes[offset] && node.childNodes[offset].nodeType === Node.TEXT_NODE) {
      node = node.childNodes[offset];
      offset = 0;
    } else if (
      offset > 0 &&
      node.childNodes[offset - 1] &&
      node.childNodes[offset - 1].nodeType === Node.TEXT_NODE
    ) {
      node = node.childNodes[offset - 1];
      offset = node.textContent.length;
    } else {
      return null;
    }
  }

  const before = node.textContent.slice(0, offset);
  const match = before.match(/@([A-Za-z]*)$/);
  if (!match) return null;

  return {
    kind: "contentEditable",
    query: match[1],
    start: offset - match[0].length,
    end: offset,
    textNode: node,
  };
}

function getAtMentionContext(el) {
  if (el.isContentEditable) return getContentEditableAtMention(el);
  return getInputAtMention(el);
}

function setNativeInputValue(el, value) {
  const proto =
    el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function insertMention(el, context, token) {
  if (!el || !context) return;

  if (context.kind === "input") {
    const value = el.value ?? "";
    const next =
      value.slice(0, context.start) + token + value.slice(context.end);
    const caret = context.start + token.length;
    setNativeInputValue(el, next);
    try {
      el.setSelectionRange(caret, caret);
    } catch (_) {
      // ignore
    }
    el.focus();
    return;
  }

  // contentEditable / WYSIWYG
  const { textNode, start, end } = context;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  range.deleteContents();
  const tokenNode = document.createTextNode(token);
  range.insertNode(tokenNode);

  range.setStartAfter(tokenNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

function getCaretViewportRect(el, context) {
  if (context.kind === "contentEditable" && context.textNode) {
    try {
      const range = document.createRange();
      range.setStart(context.textNode, context.end);
      range.setEnd(context.textNode, context.end);
      const rect = range.getBoundingClientRect();
      if (rect && (rect.width || rect.height || rect.top || rect.left)) {
        return rect;
      }
    } catch (_) {
      // fall through
    }
  }

  return el.getBoundingClientRect();
}

/**
 * Form-level @ mention host for Marine report.
 * Listens on the form container so every text input / textarea / WYSIWYG
 * can pick @vesselName / @vesselType without per-field wiring.
 */
export default function MarineVariableMentionBridge({
  containerRef,
  variableOptions = [],
  excludedInputNames = [],
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const targetRef = useRef(null);
  const contextRef = useRef(null);
  const menuRef = useRef(null);

  const excludedSet = useMemo(
    () => new Set(excludedInputNames || []),
    [excludedInputNames]
  );
  const options = useMemo(
    () => filterOptions(query, variableOptions),
    [query, variableOptions]
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    targetRef.current = null;
    contextRef.current = null;
  }, []);

  const updateFromTarget = useCallback(
    (el) => {
      if (!isTextualTarget(el, excludedSet)) {
        closeMenu();
        return;
      }

      const context = getAtMentionContext(el);
      if (!context) {
        closeMenu();
        return;
      }

      const filtered = filterOptions(context.query, variableOptions);
      if (filtered.length === 0) {
        closeMenu();
        return;
      }

      targetRef.current = el;
      contextRef.current = context;
      setQuery(context.query);
      setActiveIndex(0);
      setOpen(true);

      const rect = getCaretViewportRect(el, context);
      const top = Math.min(rect.bottom + 6, window.innerHeight - 8);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - 260);
      setPosition({ top, left });
    },
    [closeMenu, excludedSet, variableOptions]
  );

  const applyOption = useCallback(
    (option) => {
      const el = targetRef.current;
      const context = contextRef.current;
      if (!el || !context || !option) return;
      insertMention(el, context, option.token);
      closeMenu();
    },
    [closeMenu]
  );

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return undefined;

    const onInput = (event) => {
      updateFromTarget(event.target);
    };

    const onKeyUp = (event) => {
      if (event.key === "Escape") return;
      updateFromTarget(event.target);
    };

    const onKeyDown = (event) => {
      if (!open) return;
      if (!options.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((i) => (i + 1) % options.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        applyOption(options[activeIndex] || options[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    };

    const onScrollOrResize = () => {
      if (!open || !targetRef.current || !contextRef.current) return;
      const rect = getCaretViewportRect(
        targetRef.current,
        contextRef.current
      );
      setPosition({
        top: Math.min(rect.bottom + 6, window.innerHeight - 8),
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 260),
      });
    };

    const onPointerDown = (event) => {
      if (!open) return;
      if (menuRef.current && menuRef.current.contains(event.target)) return;
      // Allow typing to continue; close only when clicking outside menu
      if (!targetRef.current || !targetRef.current.contains(event.target)) {
        closeMenu();
      }
    };

    container.addEventListener("input", onInput, true);
    container.addEventListener("keyup", onKeyUp, true);
    container.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("mousedown", onPointerDown);

    return () => {
      container.removeEventListener("input", onInput, true);
      container.removeEventListener("keyup", onKeyUp, true);
      container.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [
    containerRef,
    open,
    options,
    activeIndex,
    applyOption,
    closeMenu,
    updateFromTarget,
  ]);

  if (!open || options.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Marine report variables"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 10050,
        minWidth: 220,
        maxWidth: 320,
        background: "#fff",
        border: "1px solid #d0d7de",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          fontSize: 11,
          color: "#666",
          borderBottom: "1px solid #eee",
          background: "#f8f9fb",
        }}
      >
        Insert variable
      </div>
      {options.map((opt, index) => {
        const preview = opt.value || "";
        const isActive = index === activeIndex;
        return (
          <button
            key={opt.token}
            type="button"
            role="option"
            aria-selected={isActive}
            onMouseDown={(e) => {
              e.preventDefault();
              applyOption(opt);
            }}
            onMouseEnter={() => setActiveIndex(index)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "none",
              background: isActive ? "#eef1ff" : "#fff",
              padding: "8px 10px",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 600, color: "#333", fontSize: 13 }}>
              {opt.token}
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              {opt.label}
              {preview ? ` — ${preview}` : " — (not set yet)"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
