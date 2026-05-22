const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];

const TENS = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
];

/** Convert 1–999 into words (used for crore/lakh/thousand segments). */
function numToWordsUpTo999(n) {
  n = Math.floor(n);
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return ONES[hundreds] + " HUNDRED" + (rest ? " " + numToWordsUpTo999(rest) : "");
}

/** Convert 1–999999 into words (e.g. 100 → ONE HUNDRED, 1000 → ONE THOUSAND). */
function numToWordsUpToLakh(n) {
  n = Math.floor(n);
  if (n === 0) return "";
  if (n < 1000) return numToWordsUpTo999(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return (
    numToWordsUpTo999(thousands) +
    " THOUSAND" +
    (rest ? " " + numToWordsUpTo999(rest) : "")
  );
}

/**
 * Indian numbering: crore, lakh, thousand, hundred — e.g. 12,66,13,650.
 */
export function convertNumberToWordsIndian(num) {
  let n = Math.round(Number(num) || 0);
  if (n === 0) return "ZERO ONLY";

  let words = "";

  const crore = Math.floor(n / 10000000);
  if (crore > 0) {
    words += numToWordsUpToLakh(crore) + " CRORE ";
    n %= 10000000;
  }

  const lakh = Math.floor(n / 100000);
  if (lakh > 0) {
    words += numToWordsUpTo999(lakh) + " LAKH ";
    n %= 100000;
  }

  const thousand = Math.floor(n / 1000);
  if (thousand > 0) {
    words += numToWordsUpTo999(thousand) + " THOUSAND ";
    n %= 1000;
  }

  const hundred = Math.floor(n / 100);
  if (hundred > 0) {
    words += ONES[hundred] + " HUNDRED ";
    n %= 100;
  }

  if (n > 0) {
    if (words !== "") words += "AND ";
    words += numToWordsUpTo999(n) + " ";
  }

  return words.trim() + " ONLY";
}
