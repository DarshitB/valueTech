import { convertNumberToWordsIndian } from "./numberToWordsIndian";

export { convertNumberToWordsIndian };

/** Plain text from WYSIWYG / HTML amount-in-words value (for validation). */
export function getAmountInWordsPlainText(value) {
  if (value == null) return "";
  const str = String(value);
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = str;
    return (el.textContent || el.innerText || "").trim();
  }
  return str
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

export function hasAmountInWordsContent(value) {
  return getAmountInWordsPlainText(value).length > 0;
}

/** Derive amount in words from formatted fair market value (same as legacy read-only field). */
export function computeAmountInWordsFromFmv(
  fairMarketValue,
  parseCurrency,
  convertNumberToWordsIndian
) {
  const amt = parseCurrency(fairMarketValue);
  if (amt <= 0) return "";
  return convertNumberToWordsIndian(amt) || "";
}
