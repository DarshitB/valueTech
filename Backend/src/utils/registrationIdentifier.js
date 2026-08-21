// Parse mixed registration / serial / chassis values into comparable tokens.
// "MH-04-HD-6353", "SERIAL NO - S80-3346", and "PLATE / CHASSIS NO :- ABC" all
// match by the real identifier, not the raw typed text.
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

const LABEL_PREFIX_RE =
  /^(?:DG\s*SET\s+)?(?:MACHINE\s+)?(?:(?:SERIAL|SERAIL|CHASSISS|CHASSIS|CHASISS|CHASIS|ENGINE|MODEL|FAB|PRODUCTION|REGISTRATION|IMO|OFFICIAL|ITEM|PINO|EQSLNO|EMLSNO|PIN|SR)[\s.]*)+(?:NO|NUMBER|NUM|N0)?[\s.:\-]*/i;

const MULTI_ID_SPLIT_RE = /\s*[/&,|]\s*|\s+AND\s+/i;

function normalizeAlnum(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function stripLeadingLabel(segment) {
  let text = String(segment || "")
    .toUpperCase()
    .trim();

  for (let i = 0; i < 6; i += 1) {
    const next = text.replace(LABEL_PREFIX_RE, "").replace(/^[:.\-\s]+/, "").trim();
    if (next === text) break;
    text = next;
  }

  return text;
}

function addToken(tokens, value) {
  const normalized = normalizeAlnum(value);
  if (!normalized || normalized.length < MIN_TOKEN_LENGTH) return;
  if (!/\d/.test(normalized)) return;
  if (JUNK_VALUES.has(normalized)) return;
  tokens.add(normalized);
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

  const labelsRemoved = stripLeadingLabel(source);
  addToken(tokens, labelsRemoved);

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
