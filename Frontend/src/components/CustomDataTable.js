import React, { useState, useMemo, useEffect } from "react";
import "./CustomDataTable.scss";
import { SearchIcon } from "./icons";

const STORAGE_KEY = "customDataTable_entriesPerPage";

// Recursively extract visible text from React nodes (strings, numbers, Link/component children)
const getTextFromReactNode = (node) => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextFromReactNode).join("");
  if (React.isValidElement(node) && node.props?.children != null) {
    return getTextFromReactNode(node.props.children);
  }
  return "";
};

const CustomDataTable = ({
  children,
  showEntriesSelector = true,
  showFooter = true,
  serverPagination = null,
  // null = legacy (all columns except index 0); array = only those indexes
  sortableColumns = null,
}) => {
  const { header, rows, footer, buttons, filters } = children;

  const isServerPaginated = Boolean(serverPagination);
  const isServerSearch =
    isServerPaginated &&
    typeof serverPagination?.onSearchChange === "function";

  const isColumnSortable = (index) => {
    if (Array.isArray(sortableColumns)) {
      return sortableColumns.includes(index);
    }
    // Legacy default: skip sequential-number column (index 0)
    return index !== 0;
  };

  // Load entries per page from localStorage or default to 10
  const [entriesPerPage, setEntriesPerPage] = useState(() => {
    if (serverPagination?.limit) return serverPagination.limit;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 10;
  });

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(
    serverPagination?.page || 1
  );
  const [sortConfig, setSortConfig] = useState({
    index: null,
    direction: "asc",
  });

  // Extract raw data from row elements (plain text and link/component text both searchable)
  const rawData = useMemo(() => {
    return React.Children.map(rows, (row) => {
      // Filter out falsy values (false, null, undefined) from children
      const cells = React.Children.toArray(row.props.children).filter(Boolean);
      return {
        element: row,
        data: cells.map((cell) => {
          const text = String(
            getTextFromReactNode(cell.props?.children) || ""
          ).toLowerCase();
          // Prefer explicit sort key when provided (e.g. ISO date for Date column)
          const sortKey = cell.props?.["data-sort"] ?? cell.props?.sortValue;
          const sort =
            sortKey != null && String(sortKey) !== ""
              ? String(sortKey).toLowerCase()
              : text;
          return { search: text, sort };
        }),
      };
    });
  }, [rows]);

  // Helper function to normalize text for search (remove separators)
  const normalizeForSearch = (text) => {
    if (!text) return "";
    // Convert to lowercase and remove all separators (spaces, underscores, dashes, dots, etc.)
    return text.toLowerCase().replace(/[\s_\-.,;:\/\\|]/g, '');
  };

  // Filter by search - client-side only when not using server search
  const filteredData = useMemo(() => {
    if (isServerSearch || !search) return rawData;
    const normalizedSearch = normalizeForSearch(search);
    return rawData.filter(({ data }) =>
      data.some((value) => {
        const normalizedValue = normalizeForSearch(value.search);
        return normalizedValue.includes(normalizedSearch);
      })
    );
  }, [rawData, search, isServerSearch]);

  // Sort
  const sortedData = useMemo(() => {
    if (sortConfig.index === null) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a.data[sortConfig.index]?.sort ?? "";
      const valB = b.data[sortConfig.index]?.sort ?? "";
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Pagination
  const totalEntries = isServerPaginated
    ? Number(serverPagination.total || 0)
    : sortedData.length;
  const activePage = isServerPaginated
    ? Number(serverPagination.page || 1)
    : currentPage;
  const activeLimit = isServerPaginated
    ? Number(serverPagination.limit || entriesPerPage)
    : entriesPerPage;
  const totalPages = Math.max(1, Math.ceil(totalEntries / activeLimit) || 1);
  const paginatedData = isServerPaginated
    ? sortedData
    : sortedData.slice(
        (currentPage - 1) * entriesPerPage,
        currentPage * entriesPerPage
      );

  useEffect(() => {
    if (isServerPaginated && serverPagination?.page) {
      setCurrentPage(serverPagination.page);
    }
  }, [isServerPaginated, serverPagination?.page]);

  useEffect(() => {
    if (isServerPaginated && serverPagination?.limit) {
      setEntriesPerPage(serverPagination.limit);
    }
  }, [isServerPaginated, serverPagination?.limit]);

  const handlePageChange = (nextPage) => {
    if (isServerPaginated && serverPagination?.onPageChange) {
      serverPagination.onPageChange(nextPage);
      return;
    }
    setCurrentPage(nextPage);
  };

  const handleEntriesPerPageChange = (nextLimit) => {
    if (isServerPaginated && serverPagination?.onLimitChange) {
      serverPagination.onLimitChange(nextLimit);
      return;
    }
    setEntriesPerPage(nextLimit);
    setCurrentPage(1);
  };

  // Persist entriesPerPage to localStorage when it changes (client-side mode only)
  useEffect(() => {
    if (isServerPaginated) return;
    localStorage.setItem(STORAGE_KEY, entriesPerPage.toString());
  }, [entriesPerPage, isServerPaginated]);

  // Sort handler
  const handleSort = (index) => {
    if (!isColumnSortable(index)) return;

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
        {filters && <div className="dataTable-header-filters">{filters}</div>}
        <div className="inner-dataTable-header">
          {showEntriesSelector && (
            <div className="show-x-entries">
              Show &nbsp;
              <select
                value={activeLimit}
                onChange={(e) => handleEntriesPerPageChange(Number(e.target.value))}
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
              value={isServerSearch ? serverPagination.search ?? "" : search}
              onChange={(e) => {
                const value = e.target.value;
                if (isServerSearch) {
                  serverPagination.onSearchChange(value);
                  return;
                }
                setSearch(value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="dataTable-header-buttons">{buttons}</div>
        </div>
      </div>
      <div className="dataTable-table-container">
        <table className="dataTable-table">
          <thead>
            <tr className="dataTable-table-heading-tr">
              {React.Children.map(header.props.children, (th, index) => {
                // Filter out falsy values (false, null, undefined)
                if (!th) return null;
                const sortable = isColumnSortable(index);
                return (
                  <th
                    className={`dataTable-table-heading-th ${
                      th.props.className || ""
                    }${sortable ? "" : " no-sort"}`}
                    onClick={() => handleSort(index)}
                    style={{
                      ...(th.props.style || {}),
                      cursor: sortable ? "pointer" : "default",
                    }}
                  >
                    {th.props.children}
                    {sortable &&
                      sortConfig.index === index &&
                      (sortConfig.direction === "asc" ? " ▲" : " ▼")}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map(({ element }, index) => {
              const sequentialNumber =
                (activePage - 1) * activeLimit + index + 1;
              
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
            Showing{" "}
            {totalEntries === 0
              ? 0
              : (activePage - 1) * activeLimit + 1}{" "}
            to {Math.min(activePage * activeLimit, totalEntries)} of{" "}
            {totalEntries} entries
          </div>

          <div className="pagination-box flex items-center gap-1">
            <button
              disabled={activePage === 1}
              onClick={() => handlePageChange(activePage - 1)}
              className="pagination-button-nav"
            >
              ◀
            </button>

            {getPageNumbers(activePage, totalPages).map((page, i) =>
              page === "..." ? (
                <span key={i} className="px-2">
                  ...
                </span>
              ) : (
                <button
                  key={i}
                  onClick={() => handlePageChange(page)}
                  className={`pagination-button ${
                    activePage === page ? "active" : ""
                  }`}
                >
                  {page}
                </button>
              )
            )}

            <button
              disabled={activePage === totalPages}
              onClick={() => handlePageChange(activePage + 1)}
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
