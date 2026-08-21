// Parse mixed registration / serial / chassis values into comparable tokens.
// Extra words before/after the identifier are ignored; matching is on the number.
const MIN_TOKEN_LENGTH = 4;

const JUNK_VALUES = new Set([
  "NOTAPPLICABLE",
  "NOTAVAILABLE",
  "NA",
  "NIL",
  "NONE",
  "TEST",
  "KARTIKTEST",
]);

// 1-2 letter prefixes that are labels, not vehicle state codes (MH, GJ, HP...).
const SHORT_LABELS = new Set([
  "S",
  "SR",
  "NO",
  "N0",
  "NUM",
  "PIN",
  "IMO",
  "FAB",
  "SN",
  "SL",
  "DG",
]);

const MULTI_ID_SPLIT_RE = /\s*[/&,|]\s*|\s+AND\s+/i;

// Leading word + separator only. "LGI922..." must not peel "LGI".
const LEADING_WORD_RE = /^([A-Z]+)[\s.:\-]+/;

function normalizeAlnum(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function shouldPeelLabelWord(word) {
  if (!word) return false;
  if (word.length >= 3) return true;
  return SHORT_LABELS.has(word);
}

function stripLeadingLabel(segment) {
  let text = String(segment || "")
    .toUpperCase()
    .trim();

  for (let i = 0; i < 8; i += 1) {
    const match = text.match(LEADING_WORD_RE);
    if (!match || !shouldPeelLabelWord(match[1])) break;
    const next = text.slice(match[0].length).trim();
    if (!next) break;
    text = next;
  }

  return text.replace(/^[:.\-\s]+/, "").trim();
}

function addToken(tokens, value) {
  const normalized = normalizeAlnum(value);
  if (!normalized || normalized.length < MIN_TOKEN_LENGTH) return;
  if (!/\d/.test(normalized)) return;
  if (JUNK_VALUES.has(normalized)) return;
  tokens.add(normalized);
}

function extractSerialLikeTokens(source, tokens) {
  String(source || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .forEach((piece) => {
      // Serial-like: letters and digits together, not a short plate fragment.
      if (piece.length >= 6 && /[A-Z]/.test(piece) && /\d/.test(piece)) {
        addToken(tokens, piece);
      }
    });
}

function extractIdentifierTokens(raw) {
  const source = String(raw || "").trim();
  if (!source) return [];

  const fullNormalized = normalizeAlnum(source);
  if (JUNK_VALUES.has(fullNormalized)) return [];

  const tokens = new Set();
  const parts = source
    .toUpperCase()
    .split(MULTI_ID_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);

  parts.forEach((part) => {
    const identifier = stripLeadingLabel(part);
    if (!identifier) return;
    identifier.split(/\*+/).forEach((piece) => addToken(tokens, piece));
  });

  addToken(tokens, stripLeadingLabel(source));
  extractSerialLikeTokens(source, tokens);

  return [...tokens];
}

function identifiersMatch(query, stored) {
  const queryTokens = extractIdentifierTokens(query);
  const storedTokens = extractIdentifierTokens(stored);
  if (queryTokens.length === 0 || storedTokens.length === 0) return false;

  const storedSet = new Set(storedTokens);
  return queryTokens.some((token) => storedSet.has(token));
}

module.exports = {
  MIN_TOKEN_LENGTH,
  extractIdentifierTokens,
  identifiersMatch,
  normalizeAlnum,
};
