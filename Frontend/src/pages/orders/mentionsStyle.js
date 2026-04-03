// Custom style for react-mentions single-line input and dropdown
const mentionsStyle = {
  control: {
    backgroundColor: "#fff",
    fontSize: 14,
    fontWeight: "normal",
    border: "none",
    padding: "10px 15px",
    borderRadius: "50rem",
    width: "100%",
    boxSizing: "border-box",
    position: "relative",
    zIndex: 10,
  },
  highlighter: {
    overflow: "hidden",
    padding: 0,
  },
  input: {
    margin: 0,
    minHeight: 40,
    outline: "none",
    border: "none",
    padding: 0,
    width: "100%",
    backgroundColor: "transparent",
    fontSize: 14,
  },
  suggestions: {
    position: "absolute",
    backgroundColor: "#fff",
    border: "1px solid #ccc",
    borderRadius: 4,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    maxHeight: 400,
    height: "fit-content",
    overflowY: "auto",
  },
  singleLine: {
    display: "inline-block",
    width: "100%",
    verticalAlign: "middle",
  },
  suggestion: {
    padding: "8px 12px",
    borderBottom: "1px solid #eee",
    cursor: "pointer",
  },
  suggestionFocused: {
    backgroundColor: "#f5f5f5",
  },
};

export default mentionsStyle;
