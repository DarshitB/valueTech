import React, { useState, useMemo } from "react";
import "./CustomDataTable.scss";
import { SearchIcon } from "./icons";

const CustomDataTable = ({ children, showEntriesSelector = true, showFooter = true }) => {
  const { header, rows, footer, buttons } = children;

  const [search, setSearch] = useState("");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    index: null,
    direction: "asc",
  });

  // Extract raw data from row elements
  const rawData = useMemo(() => {
    return React.Children.map(rows, (row) => {
      // Filter out falsy values (false, null, undefined) from children
      const cells = React.Children.toArray(row.props.children).filter(Boolean);
      return {
        element: row,
        data: cells.map(
          (cell) => cell.props?.children?.toString().toLowerCase() ?? ""
        ),
      };
    });
  }, [rows]);

  // Helper function to normalize text for search (remove separators)
  const normalizeForSearch = (text) => {
    if (!text) return "";
    // Convert to lowercase and remove all separators (spaces, underscores, dashes, dots, etc.)
    return text.toLowerCase().replace(/[\s_\-.,;:\/\\|]/g, '');
  };

  // Filter by search - robust search ignoring separators
  const filteredData = useMemo(() => {
    if (!search) return rawData;
    const normalizedSearch = normalizeForSearch(search);
    return rawData.filter(({ data }) =>
      data.some((value) => {
        const normalizedValue = normalizeForSearch(value);
        return normalizedValue.includes(normalizedSearch);
      })
    );
  }, [rawData, search]);

  // Sort
  const sortedData = useMemo(() => {
    if (sortConfig.index === null) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a.data[sortConfig.index];
      const valB = b.data[sortConfig.index];
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / entriesPerPage);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  // Sort handler
  const handleSort = (index) => {
    // Skip sorting for sequential number column (index 0)
    if (index === 0) return;
    
    if (sortConfig.index === index) {
      setSortConfig({
        index,
        direction: sortConfig.direction === "asc" ? "desc" : "asc",
      });
    } else {
      setSortConfig({ index, direction: "asc" });
    }
  };

  // Helper for pagination numbers
  const getPageNumbers = (current, total) => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (
        i === 1 ||
        i === total ||
        (i >= current - delta && i <= current + delta)
      ) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  return (
    <div className="dataTable-container">
      <div className="dataTable-header">
        {showEntriesSelector && (
          <div className="show-x-entries">
            Show &nbsp;
            <select
              value={entriesPerPage}
              onChange={(e) => {
                setEntriesPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="count-of-page-selector"
            >
              {[10, 25, 50, 100].map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>{" "}
            &nbsp; Entries
          </div>
        )}
        <div className="search-bar-container">
          <span className="search-icon">
            <SearchIcon className="search-icon-svg" />
          </span>
          <input
            type="text"
            placeholder="Search..."
            className="search-bar"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="dataTable-header-buttons">{buttons}</div>
      </div>
      <div className="dataTable-table-container">
        <table className="dataTable-table">
          <thead>
            <tr className="dataTable-table-heading-tr">
              {React.Children.map(header.props.children, (th, index) => {
                // Filter out falsy values (false, null, undefined)
                if (!th) return null;
                return (
                  <th
                    className={`dataTable-table-heading-th ${
                      th.props.className || ""
                    }`}
                    onClick={() => handleSort(index)}
                    style={th.props.style || {}}
                  >
                    {th.props.children}
                    {sortConfig.index === index &&
                      (sortConfig.direction === "asc" ? " ▲" : " ▼")}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map(({ element }, index) => {
              // Calculate the actual sequential number based on current page and entries per page
              const sequentialNumber = (currentPage - 1) * entriesPerPage + index + 1;
              
              return React.cloneElement(element, {
                className: "hover:bg-gray-50",
                key: element.key,
                children: React.Children.map(element.props.children, (child, childIndex) => {
                  // Filter out falsy values (false, null, undefined)
                  if (!child) return null;
                  
                  // Replace the sequential number in the first column (index 0)
                  if (childIndex === 0 && child.props?.className === "sequential-number") {
                    return React.cloneElement(child, {
                      children: sequentialNumber
                    });
                  }
                  return child;
                })
              });
            })}
          </tbody>
          <tfoot>{footer}</tfoot>
        </table>
      </div>

      {showFooter && (
        <div className="dataTable-footer">
          <div>
            Showing {(currentPage - 1) * entriesPerPage + 1} to{" "}
            {Math.min(currentPage * entriesPerPage, filteredData.length)} of{" "}
            {filteredData.length} entries
          </div>

          <div className="pagination-box flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="pagination-button-nav"
            >
              ◀
            </button>

            {getPageNumbers(currentPage, totalPages).map((page, i) =>
              page === "..." ? (
                <span key={i} className="px-2">
                  ...
                </span>
              ) : (
                <button
                  key={i}
                  onClick={() => setCurrentPage(page)}
                  className={`pagination-button ${
                    currentPage === page ? "active" : ""
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="pagination-button-nav"
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDataTable;
