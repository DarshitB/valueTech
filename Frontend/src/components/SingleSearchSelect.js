import React from "react";
import Select from "react-select";

/**
 * 🔽 A reusable searchable select dropdown component (single or multi)
 * @param {Array} options - Array of { value, label } items
 * @param {any|Array} value - Selected value(s): a value or array of values
 * @param {Function} onChange - Callback with selected value(s)
 * @param {String} placeholder - Placeholder text
 * @param {Boolean} isMulti - If true, enables multiple selection
 */
const SingleSearchSelect = ({ options, value, onChange, placeholder, isMulti = false, required = false }) => {
  // Handle selected value(s)
  const selected = isMulti
    ? options.filter((opt) => value?.includes(opt.value))
    : options.find((opt) => opt.value === value) || null;

  return (
    <Select
      options={options}
      value={selected}
      onChange={(selectedOption) => {
        if (isMulti) {
          // For multi-select, send an array of values
          onChange(selectedOption ? selectedOption.map((opt) => opt.value) : []);
        } else {
          // For single-select, send a single value or null
          onChange(selectedOption ? selectedOption.value : null);
        }
      }}
      isSearchable
      isClearable
      isMulti={isMulti}
      placeholder={placeholder || "Select an option..."}
      required={required}
    />
  );
};

export default SingleSearchSelect;