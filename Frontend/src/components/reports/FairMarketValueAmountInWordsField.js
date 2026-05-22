import React from "react";
import WysiwygTextarea from "../WysiwygTextarea";

/**
 * Fair Market Value amount in words — WYSIWYG, editable, submitted as HTML/plain text.
 */
function FairMarketValueAmountInWordsField({
  value,
  onChange,
  colClassName = "col-md-3",
  required = true,
}) {
  return (
    <div className={colClassName}>
      <div className="form-group">
        <label htmlFor="amount_in_words">
          Fair Market Value Amount In Words{" "}
          {required ? <span className="text-danger">*</span> : null}
        </label>
        <WysiwygTextarea
          className="amount-in-words-wysiwyg"
          id="amount_in_words"
          name="amount_in_words"
          value={value}
          onChange={onChange}
          rows={3}
          placeholder="Auto-updates from fair market value; you can edit before save"
          required={required}
        />
      </div>
    </div>
  );
}

export default FairMarketValueAmountInWordsField;
