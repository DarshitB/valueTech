import { useEffect } from "react";
import { computeAmountInWordsFromFmv } from "../utils/reportAmountInWords";

/**
 * Keep amount_in_words in sync with fair_market_value (legacy read-only useMemo behavior).
 */
export function useAutoFillAmountInWordsFromFmv({
  fairMarketValue,
  setReportFormData,
  parseCurrency,
  convertNumberToWordsIndian,
}) {
  useEffect(() => {
    const words = computeAmountInWordsFromFmv(
      fairMarketValue,
      parseCurrency,
      convertNumberToWordsIndian
    );
    setReportFormData((prev) => {
      if (prev.amount_in_words === words) {
        return prev;
      }
      return { ...prev, amount_in_words: words };
    });
  }, [fairMarketValue, setReportFormData, parseCurrency, convertNumberToWordsIndian]);
}
