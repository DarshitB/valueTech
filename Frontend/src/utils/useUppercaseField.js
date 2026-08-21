import { useLayoutEffect, useRef } from "react";

// Uppercase a controlled input without moving the caret to the end.
export function useUppercaseField(value) {
  const inputRef = useRef(null);
  const caretRef = useRef(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const caret = caretRef.current;
    if (!input || !caret) return;

    const max = input.value.length;
    const start = Math.min(caret.start ?? max, max);
    const end = Math.min(caret.end ?? max, max);
    try {
      input.setSelectionRange(start, end);
    } catch {
      // Ignore if the field is not a text input or is unfocused.
    }
    caretRef.current = null;
  }, [value]);

  const applyUppercaseChange = (event, onValue) => {
    const input = event.target;
    caretRef.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
    onValue(String(input.value || "").toUpperCase());
  };

  return { inputRef, applyUppercaseChange };
}
