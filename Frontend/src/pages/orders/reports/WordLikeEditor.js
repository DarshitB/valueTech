import React, { useState, useRef, useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { generateCustomReport } from "../../../redux/reducers/orderReportReducer";
import { fetchOrderById } from "../../../redux/reducers/orderReducer";
import { selectCustomReportGenerating, selectCustomReportError, selectCustomReportData } from "../../../redux/selectors/orderSelectors";
import { resolveAssetUrl } from "../../../utils/urlUtils";
import "./CustomReport.scss";

// Page size constants with default margins (in inches)
const PAGE_SIZES = {
  A4: {
    width: 8.27,
    height: 11.69,
    unit: "in",
    margins: { top: 0.5, bottom: 0.9, left: 0.5, right: 0.5 },
  },
  A3: {
    width: 11.69,
    height: 16.54,
    unit: "in",
    margins: { top: 0.5, bottom: 0.9, left: 0.5, right: 0.5 },
  },
  Legal: {
    width: 8.5,
    height: 14,
    unit: "in",
    margins: { top: 0.5, bottom: 0.9, left: 0.5, right: 0.5 },
  },
  Letter: {
    width: 8.5,
    height: 11,
    unit: "in",
    margins: { top: 0.5, bottom: 0.9, left: 0.5, right: 0.5 },
  },
};

// Content block types
const BLOCK_TYPES = {
  CONTAINER: "container",
  TWO_COLUMN: "two-column",
  HEADING: "heading",
  PARAGRAPH: "paragraph",
  IMAGE: "image",
  TABLE: "table",
  LIST: "list",
};

// Heading types
const HEADING_TYPES = {
  H1: "h1",
  H2: "h2",
  H3: "h3",
  H4: "h4",
  H5: "h5",
  H6: "h6",
};

// WYSIWYG List Editor Component
const WysiwygListEditor = ({ block, onFocus, onBlur }) => {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) {
      const initialContent = block.content || '<ul><li>• List item 1</li></ul>';
      if (editorRef.current.innerHTML !== initialContent) {
        editorRef.current.innerHTML = initialContent;
      }
    }
  }, [block.id]); // Only run when block ID changes, not content

  const handleKeyDown = (e) => {
    // Handle Enter key to create new list items naturally
    if (e.key === 'Enter') {
      e.preventDefault();
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      
      // Create a new list item
      const li = document.createElement('li');
      li.innerHTML = '<br>';
      
      // Insert after current list item
      if (range.startContainer.parentNode.tagName === 'LI') {
        range.startContainer.parentNode.parentNode.insertBefore(li, range.startContainer.parentNode.nextSibling);
      } else {
        // If not in a list item, create a new list structure
        const ul = document.createElement('ul');
        ul.appendChild(li);
        range.insertNode(ul);
      }
      
      // Move cursor to new item
      range.setStart(li, 0);
      range.setEnd(li, 0);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const handleBlur = () => {
    if (editorRef.current) {
      onBlur(editorRef.current.innerHTML);
    }
  };

  return (
    <div 
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning={true}
      className="wysiwyg-list-editor"
      style={{
        minHeight: "40px",
        fontSize: "12px",
        lineHeight: "1.5",
        outline: "1px solid transparent",
        borderRadius: "4px",
        fontFamily: "inherit",
      }}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={handleBlur}
    />
  );
};

function WordLikeEditor() {
  const { id } = useParams(); // Get order ID from URL params
  const dispatch = useDispatch();
  const customReportGenerating = useSelector(selectCustomReportGenerating);
  const { generating } = useSelector((state) => state.orderReports);
  const customReportError = useSelector(selectCustomReportError);
  const customReportData = useSelector(selectCustomReportData);
  const order = useSelector((state) => state.orders.selected);
  const orderLoading = useSelector((state) => state.orders.loading);
  const orderError = useSelector((state) => state.orders.error);

  // Global document settings
  const [documentSettings, setDocumentSettings] = useState({
    pageSize: "A4",
    background: { type: "image", value: null },
    footerText: "Custom Footer Text",
  });

  // Document content structure - flat list of all blocks for better pagination
  const [allBlocks, setAllBlocks] = useState([]);
  
  // Pages are calculated dynamically from blocks
  const [documentContent, setDocumentContent] = useState([
    { id: "page-1", type: "page", blocks: [], isOverflowing: false },
  ]);

  // Current cursor position and selection
  const [cursorPosition, setCursorPosition] = useState({
    pageId: "page-1",
    blockId: null,
    insertIndex: 0,
  });
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [activeBlock, setActiveBlock] = useState(null);
  const [editingTable, setEditingTable] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState(null); // 'left' or 'right'
  const [selectedChild, setSelectedChild] = useState(null); // { blockId, childIndex } for child selection
  const [selectedAlignment, setSelectedAlignment] = useState("left"); // Default alignment
  const [focusedInput, setFocusedInput] = useState(null); // { blockId, childIndex } for focused input/textarea
  const [paginationInProgress, setPaginationInProgress] = useState(false); // Prevent pagination loops

  const documentRef = useRef(null);
  const paginationTimeoutRef = useRef(null);
  const buttonClickRef = useRef({});

  // Auto-resize textarea function with debouncing to prevent typing interference
  const autoResizeTextarea = useCallback((textarea) => {
    if (textarea) {
      // Use requestAnimationFrame to avoid interfering with typing
      requestAnimationFrame(() => {
        const currentScrollTop = textarea.scrollTop;
        // Reset height to auto to let it calculate naturally
        textarea.style.height = "auto";
        // Let the browser calculate the height based on content
        textarea.style.height = textarea.scrollHeight + "px";
        textarea.scrollTop = currentScrollTop;
      });
    }
  }, []);

  // Debounced version for onChange events
  const debouncedAutoResize = useCallback(
    (textarea) => {
      setTimeout(() => autoResizeTextarea(textarea), 0);
    },
    [autoResizeTextarea]
  );

  // Convert inches to pixels (96 DPI standard)
  const inToPx = (inches) => inches * 96;

  // Get current page dimensions and margins
  const getPageDimensions = () => {
    const size = PAGE_SIZES[documentSettings.pageSize];
    return {
      width: inToPx(size.width),
      height: inToPx(size.height),
      margins: size.margins,
      contentHeight: inToPx(
        size.height - size.margins.top - size.margins.bottom
      ),
    };
  };

  // Calculate which blocks fit on each page (WordLikeEditor approach)
  const calculatePagination = useCallback(() => {
    if (paginationInProgress || allBlocks.length === 0) {
      if (allBlocks.length === 0) {
        setDocumentContent([
          { id: "page-1", type: "page", blocks: [], isOverflowing: false },
        ]);
      }
      return;
    }

    setPaginationInProgress(true);
    
    const pageDimensions = getPageDimensions();
    const maxPageHeight = pageDimensions.contentHeight - 50; // Buffer space
    
    // Wait for DOM to render, then measure
    setTimeout(() => {
      const newPages = [];
      let currentPageBlocks = [];
      let currentPageHeight = 0;
      let pageNumber = 1;

      for (let i = 0; i < allBlocks.length; i++) {
        const block = allBlocks[i];
        
        // Find the DOM element for this block
        const blockElement = document.querySelector(
          `[data-block-id="${block.id}"]`
        );
        let blockHeight = 80; // default fallback height
        
        if (blockElement) {
          // Force layout calculation
          void blockElement.offsetHeight;
          
          // Get accurate height including margins
          const rect = blockElement.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(blockElement);
          const marginTop = parseFloat(computedStyle.marginTop) || 0;
          const marginBottom = parseFloat(computedStyle.marginBottom) || 0;

          blockHeight = Math.max(rect.height + marginTop + marginBottom, 40);
        }

        // Check if this block fits on the current page
        if (
          currentPageHeight + blockHeight <= maxPageHeight ||
          currentPageBlocks.length === 0
        ) {
          // Block fits on current page or it's the first block on page
          currentPageBlocks.push(block);
          currentPageHeight += blockHeight;
        } else {
          // Block doesn't fit, start a new page
          
          // Save current page
          if (currentPageBlocks.length > 0) {
            newPages.push({
              id: `page-${pageNumber}`,
              type: "page",
              blocks: [...currentPageBlocks],
              isOverflowing: false,
            });
            pageNumber++;
          }
          
          // Start new page with this block
          currentPageBlocks = [block];
          currentPageHeight = blockHeight;
        }
      }

      // Add the last page if it has content
      if (currentPageBlocks.length > 0) {
        newPages.push({
          id: `page-${pageNumber}`,
          type: "page",
          blocks: [...currentPageBlocks],
          isOverflowing: false,
        });
      }

      // Ensure at least one page exists
      if (newPages.length === 0) {
        newPages.push({
          id: "page-1",
          type: "page",
          blocks: [],
          isOverflowing: false,
        });
      }

      setDocumentContent(newPages);
      setPaginationInProgress(false);
    }, 100);
  }, [allBlocks, documentSettings.pageSize, paginationInProgress]);

  // Insert content block
  const insertBlock = useCallback(
    (blockType, data = {}) => {
    if (isProcessing) {
        return;
    }
    
      setIsProcessing(true);
    
    // Store original values before clearing for container operations
      const originalSelectedChild = selectedChild;
      const originalFocusedInput = focusedInput;
      const originalSelectedColumn = selectedColumn;
    
    // Clear child selection immediately for container operations
      if (
        blockType === BLOCK_TYPES.CONTAINER ||
        blockType === BLOCK_TYPES.TWO_COLUMN
      ) {
        setSelectedChild(null);
        setFocusedInput(null);
        setSelectedColumn(null);
      }

      const blockId = `block-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
    const newBlock = {
      id: blockId,
      type: blockType,
        content: data.content || "",
      styles: data.styles || {},
        headingType:
          blockType === BLOCK_TYPES.HEADING
            ? data.headingType || "h2"
            : undefined,
        ...data,
      };

    // Handle container blocks
      if (
        blockType === BLOCK_TYPES.CONTAINER ||
        blockType === BLOCK_TYPES.TWO_COLUMN
      ) {
        if (
          selectedBlock &&
          (selectedBlock.type === BLOCK_TYPES.CONTAINER ||
            selectedBlock.type === BLOCK_TYPES.TWO_COLUMN)
        ) {
          // Insert below the selected container
          setAllBlocks((prev) => {
            const selectedIndex = prev.findIndex(
              (block) => block.id === selectedBlock.id
            );
            if (selectedIndex !== -1) {
              const newBlocks = [...prev];
              newBlocks.splice(selectedIndex + 1, 0, newBlock);
              return newBlocks;
            }
            return [...prev, newBlock]; // fallback to end if not found
          });
        } else {
          // No container selected, add to the end
          setAllBlocks((prev) => [...prev, newBlock]);
        }
    } else {
      // Handle content blocks - add to selected container or create new one
        if (
          selectedBlock &&
          (selectedBlock.type === BLOCK_TYPES.CONTAINER ||
            selectedBlock.type === BLOCK_TYPES.TWO_COLUMN)
        ) {
          setAllBlocks((prev) =>
            prev.map((block) => {
          if (block.id === selectedBlock.id) {
            if (block.type === BLOCK_TYPES.TWO_COLUMN) {
                  const targetColumn =
                    originalSelectedColumn === "right"
                      ? "rightChildren"
                      : "leftChildren";
              return {
                ...block,
                    [targetColumn]: [...(block[targetColumn] || []), newBlock],
                  };
            } else {
              return {
                ...block,
                    children: [...(block.children || []), newBlock],
                  };
                }
              }
              return block;
            })
          );
      } else {
        // Create new container for content blocks
          const containerId = `container-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        const defaultContainer = {
          id: containerId,
          type: BLOCK_TYPES.CONTAINER,
            children: [newBlock],
          };
          setAllBlocks((prev) => [...prev, defaultContainer]);
        }
      }

      setActiveBlock(blockId);
      setSelectedBlock(null);
    
      // Auto-focus text blocks
      if (
        blockType === BLOCK_TYPES.HEADING ||
        blockType === BLOCK_TYPES.PARAGRAPH ||
        blockType === BLOCK_TYPES.LIST
      ) {
      setTimeout(() => {
        try {
            const newBlockElement = document.querySelector(
              `[data-block-id="${blockId}"] ${blockType === BLOCK_TYPES.LIST ? 'input' : 'textarea'}`
            );
          if (newBlockElement && newBlockElement.focus) {
              newBlockElement.focus();
              newBlockElement.setSelectionRange(0, 0);
          }
        } catch (error) {
          // Focus error handling
        }
        }, 200);
      }

      setIsProcessing(false);
    },
    [selectedBlock, selectedChild, focusedInput, selectedColumn, isProcessing]
  );

  // Handle toolbar button clicks with duplicate prevention
  const handleToolbarClick = useCallback(
    (blockType, additionalData = {}) => {
      const buttonKey = `${blockType}-${selectedBlock?.id || "none"}`;
      const now = Date.now();
    
    // Check if this button was clicked recently
      if (
        buttonClickRef.current[buttonKey] &&
        now - buttonClickRef.current[buttonKey] < 1000
      ) {
        return;
    }
    
    // Record this button click
      buttonClickRef.current[buttonKey] = now;
    
    // Call insertBlock with additional data
      insertBlock(blockType, additionalData);
    },
    [selectedBlock, insertBlock]
  );

  // Handle alignment changes for selected child elements or focused inputs
  const handleAlignmentChange = useCallback(
    (alignment) => {
      const targetElement = selectedChild || focusedInput;
      console.log("handleAlignmentChange called:", {
        alignment,
        targetElement,
      });

      if (
        targetElement &&
        targetElement.blockId &&
        targetElement.childIndex !== undefined
      ) {
      // Find the child element and update its alignment
        setAllBlocks((prev) =>
          prev.map((block) => {
        if (block.id === targetElement.blockId) {
              const updatedBlock = { ...block };
          
          if (block.children) {
                const updatedChildren = [...block.children];
            if (updatedChildren[targetElement.childIndex]) {
              updatedChildren[targetElement.childIndex] = {
                ...updatedChildren[targetElement.childIndex],
                styles: {
                  ...updatedChildren[targetElement.childIndex].styles,
                      textAlign: alignment,
                    },
                  };
                  updatedBlock.children = updatedChildren;
            }
          } else if (block.leftChildren) {
                const updatedChildren = [...block.leftChildren];
            if (updatedChildren[targetElement.childIndex]) {
              updatedChildren[targetElement.childIndex] = {
                ...updatedChildren[targetElement.childIndex],
                styles: {
                  ...updatedChildren[targetElement.childIndex].styles,
                      textAlign: alignment,
                    },
                  };
                  updatedBlock.leftChildren = updatedChildren;
            }
          } else if (block.rightChildren) {
                const updatedChildren = [...block.rightChildren];
            if (updatedChildren[targetElement.childIndex]) {
              updatedChildren[targetElement.childIndex] = {
                ...updatedChildren[targetElement.childIndex],
                styles: {
                  ...updatedChildren[targetElement.childIndex].styles,
                      textAlign: alignment,
                    },
                  };
                  updatedBlock.rightChildren = updatedChildren;
                }
              }

              return updatedBlock;
            }
            return block;
          })
        );

        console.log("Updated block alignment:", alignment);
        setSelectedAlignment(alignment);
    } else if (focusedInput && focusedInput.blockId) {
      // Handle direct block alignment update
        setAllBlocks((prev) =>
          prev.map((block) =>
        block.id === focusedInput.blockId 
          ? { ...block, styles: { ...block.styles, textAlign: alignment } }
          : block
          )
        );
        setSelectedAlignment(alignment);
    }
    },
    [selectedChild, focusedInput]
  );

  // Handle page click to create new paragraph and start typing
  const handlePageClick = useCallback((pageId, event) => {
    // Don't create new block if clicking on existing blocks or their textareas
    if (
      event.target.closest(".content-block") ||
      event.target.closest(".nested-block") ||
      event.target.tagName === "TEXTAREA" ||
      event.target.tagName === "INPUT" ||
      event.target.closest("textarea") ||
      event.target.closest("input")
    ) {
      return;
    }
    
    // Clear any selected child and focused input only when creating new content
    setSelectedChild(null);
    setFocusedInput(null);
    
    // Create new container with paragraph at click position
    const paragraphId = `paragraph-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const containerId = `container-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    
    const newParagraph = {
      id: paragraphId,
      type: BLOCK_TYPES.PARAGRAPH,
      content: "",
      styles: {},
    };
    
    const newContainer = {
      id: containerId,
      type: BLOCK_TYPES.CONTAINER,
      children: [newParagraph],
    };

    setAllBlocks((prev) => [...prev, newContainer]);
    setActiveBlock(paragraphId);
    setSelectedBlock(null);
    
    // Focus the new paragraph after it's rendered
    setTimeout(() => {
      try {
        const newBlockElement = document.querySelector(
          `[data-block-id="${paragraphId}"] textarea`
        );
        if (newBlockElement && newBlockElement.focus) {
          newBlockElement.focus();
          newBlockElement.setSelectionRange(0, 0);
        } else {
        }
      } catch (error) {
        console.log("Focus new block error:", error);
      }
    }, 200);
  }, []);

  // Update block content
  const updateBlock = useCallback((blockId, updates) => {
    console.log("updateBlock triggered:", updates);
    setAllBlocks((prev) =>
      prev.map((block) => {
      // Check if this is the block we want to update
      if (block.id === blockId) {
          return { ...block, ...updates };
      }
      
      // Check if this block has children and update the target block in children
      if (block.children) {
        return {
          ...block,
            children: block.children.map((child) =>
            child.id === blockId ? { ...child, ...updates } : child
            ),
          };
      }
      
      // Check if this is a two-column block and update in left/right children
      if (block.leftChildren) {
          block.leftChildren = block.leftChildren.map((child) =>
          child.id === blockId ? { ...child, ...updates } : child
          );
      }
      if (block.rightChildren) {
          block.rightChildren = block.rightChildren.map((child) =>
          child.id === blockId ? { ...child, ...updates } : child
          );
        }

        return block;
      })
    );
  }, []);

  // Delete block
  const deleteBlock = useCallback((blockId) => {
    setAllBlocks((prev) =>
      prev
        .filter((block) => block.id !== blockId)
        .map((block) => ({
      ...block,
          children: block.children
            ? block.children.filter((child) => child.id !== blockId)
            : block.children,
          leftChildren: block.leftChildren
            ? block.leftChildren.filter((child) => child.id !== blockId)
            : block.leftChildren,
          rightChildren: block.rightChildren
            ? block.rightChildren.filter((child) => child.id !== blockId)
            : block.rightChildren,
        }))
    );

    setSelectedBlock(null);
    setActiveBlock(null);
  }, []);

  // Render nested blocks inside containers
  const renderNestedBlocks = (blocks, parentBlockId) => {
    if (!blocks || blocks.length === 0) return null;
    
    return blocks.map((nestedBlock, index) => {
      const isSelected =
        selectedChild &&
        selectedChild.blockId === parentBlockId &&
        selectedChild.childIndex === index;
      
      return (
        <div 
          key={nestedBlock.id} 
          className={`nested-block ${isSelected ? "child-selected" : ""}`}
          onClick={(e) => {
            // If clicking on the nested block but not on textarea, focus the textarea
            if (
              e.target.tagName !== "TEXTAREA" &&
              e.target.tagName !== "INPUT"
            ) {
              e.stopPropagation();
              
              // Try to find and focus the textarea within this block
              const textarea = e.currentTarget.querySelector("textarea");
              if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(
                  textarea.value.length,
                  textarea.value.length
                );
                return;
              }
              
              // Find the parent container block to select it exactly like clicking the container
              const parentContainer = allBlocks.find(
                (block) => block.id === parentBlockId
              );
              
              if (parentContainer) {
                setSelectedChild({ blockId: parentBlockId, childIndex: index });
                setActiveBlock(parentBlockId);
                setSelectedBlock(parentContainer);
                // Clear column selection when selecting child
                setSelectedColumn(null);
              }
            }
          }}
        >
          {renderBlock(nestedBlock)}
        </div>
      );
    });
  };

  // Handle table editing
  const handleTableEdit = (blockId, action, data = {}) => {
    // Find the block in allBlocks
    let block = allBlocks.find((b) => b.id === blockId);
    
    // If not found in top level, check nested children
    if (!block) {
      for (const topBlock of allBlocks) {
        if (topBlock.children) {
          block = topBlock.children.find((b) => b.id === blockId);
          if (block) break;
        }
        if (topBlock.leftChildren) {
          block = topBlock.leftChildren.find((b) => b.id === blockId);
          if (block) break;
        }
        if (topBlock.rightChildren) {
          block = topBlock.rightChildren.find((b) => b.id === blockId);
          if (block) break;
        }
      }
    }
    
    if (!block || block.type !== BLOCK_TYPES.TABLE) return;
    
    let tableData = block.tableData || {
      headers: ["Header 1", "Header 2", "Header 3"],
      rows: [
        ["Row 1, Cell 1", "Row 1, Cell 2", "Row 1, Cell 3"],
        ["Row 2, Cell 1", "Row 2, Cell 2", "Row 2, Cell 3"],
      ],
    };
    
    switch (action) {
      case "addRow":
        const newRow = new Array(tableData.headers.length).fill("New Cell");
        tableData.rows.push(newRow);
        break;
      case "addColumn":
        tableData.headers.push(`Header ${tableData.headers.length + 1}`);
        tableData.rows.forEach((row) => row.push("New Cell"));
        break;
      case "removeRow":
        if (tableData.rows.length > 1) {
          tableData.rows.splice(data.rowIndex, 1);
        }
        break;
      case "removeColumn":
        if (tableData.headers.length > 1) {
          tableData.headers.splice(data.colIndex, 1);
          tableData.rows.forEach((row) => row.splice(data.colIndex, 1));
        }
        break;
      case "updateCell":
        tableData.rows[data.rowIndex][data.colIndex] = data.value;
        break;
      case "updateHeader":
        tableData.headers[data.colIndex] = data.value;
        break;
    }

    updateBlock(blockId, { tableData });
  };

  // Render content block
  const renderBlock = (block) => {
    const baseStyle = {
      padding: "0",
      margin: "0 0 3px 0",
      border: "1px solid transparent",
      borderRadius: "0",
      minHeight: "auto",
      ...block.styles,
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        
        // Get current cursor position in the textarea
        const textarea = e.target;
        const cursorPosition = textarea.selectionStart;
        
        // Get current content
        const currentContent = textarea.value || "";
        
        // Insert line break at cursor position
        const newContent =
          currentContent.slice(0, cursorPosition) +
          "\n" +
          currentContent.slice(cursorPosition);
        
        // Update the block content
        updateBlock(block.id, { content: newContent });
        
        // Set cursor position after the line break
        setTimeout(() => {
          textarea.setSelectionRange(cursorPosition + 1, cursorPosition + 1);
        }, 0);
      }
    };

    const handleTextareaClick = (e) => {
      // Allow normal textarea interaction - don't stop propagation
      // Just ensure the parent container is selected
      const blockContainer = e.currentTarget.closest(".content-block");
      if (blockContainer) {
        const blockId = blockContainer.getAttribute("data-block-id");
        if (blockId) {
          const parentContainer = allBlocks.find(
            (containerBlock) =>
              (containerBlock.children &&
                containerBlock.children.some(
                  (child) => child.id === blockId
                )) ||
              (containerBlock.leftChildren &&
                containerBlock.leftChildren.some(
                  (child) => child.id === blockId
                )) ||
              (containerBlock.rightChildren &&
                containerBlock.rightChildren.some(
                  (child) => child.id === blockId
                ))
          );
          
          if (parentContainer) {
            setSelectedBlock(parentContainer);
            setActiveBlock(parentContainer.id);
            
            let childIndex = -1;
            if (parentContainer.children) {
              childIndex = parentContainer.children.findIndex(
                (child) => child.id === blockId
              );
            } else if (parentContainer.leftChildren) {
              childIndex = parentContainer.leftChildren.findIndex(
                (child) => child.id === blockId
              );
            } else if (parentContainer.rightChildren) {
              childIndex = parentContainer.rightChildren.findIndex(
                (child) => child.id === blockId
              );
            }
            
            if (childIndex !== -1) {
              setSelectedChild({ blockId: parentContainer.id, childIndex });
              setSelectedColumn(null);
            }
          }
        }
      }
    };

    // Handle textarea focus
    const handleTextareaFocus = (e) => {
      // Allow normal textarea focus - don't stop propagation
      const blockContainer = e.currentTarget.closest(".content-block");
      if (blockContainer) {
        const blockId = blockContainer.getAttribute("data-block-id");
        if (blockId) {
          const parentContainer = allBlocks.find(
            (containerBlock) =>
              (containerBlock.children &&
                containerBlock.children.some(
                  (child) => child.id === blockId
                )) ||
              (containerBlock.leftChildren &&
                containerBlock.leftChildren.some(
                  (child) => child.id === blockId
                )) ||
              (containerBlock.rightChildren &&
                containerBlock.rightChildren.some(
                  (child) => child.id === blockId
                ))
          );
          
          if (parentContainer) {
            setSelectedBlock(parentContainer);
            setActiveBlock(parentContainer.id);
            
            let childIndex = -1;
            if (parentContainer.children) {
              childIndex = parentContainer.children.findIndex(
                (child) => child.id === blockId
              );
            } else if (parentContainer.leftChildren) {
              childIndex = parentContainer.leftChildren.findIndex(
                (child) => child.id === blockId
              );
            } else if (parentContainer.rightChildren) {
              childIndex = parentContainer.rightChildren.findIndex(
                (child) => child.id === blockId
              );
            }
            
            if (childIndex !== -1) {
              setFocusedInput({ blockId: parentContainer.id, childIndex });
              setSelectedChild(null);
              setSelectedColumn(null);
            }
          } else {
            // Handle direct block focus (not nested)
            setFocusedInput({ blockId: block.id });
            setSelectedAlignment(block.styles?.textAlign || "left");
          }
        }
      }
    };

    // Handle textarea blur
    const handleTextareaBlur = (e) => {
      // Small delay to allow alignment button clicks to work
      setTimeout(() => {
        setFocusedInput(null);
      }, 100);
    };

    switch (block.type) {
      case BLOCK_TYPES.CONTAINER:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block container-block ${
              selectedBlock?.id === block.id ? "selected" : ""
            } ${activeBlock === block.id ? "active" : ""}`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation();
              setActiveBlock(block.id);
              setSelectedBlock(block);
              setSelectedChild(null); // Clear child selection when clicking container directly
            }}
          >
            <div className="block-controls main-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <div className="container-content">
              {block.children && block.children.length > 0 ? (
                renderNestedBlocks(block.children, block.id)
              ) : (
                <div className="empty-container">
                  <p>
                    Container - Select this container and use main toolbar
                    buttons to add content
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case BLOCK_TYPES.TWO_COLUMN:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block two-column-block ${
              selectedBlock?.id === block.id ? "selected" : ""
            } ${activeBlock === block.id ? "active" : ""}`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation();
              setActiveBlock(block.id);
              setSelectedBlock(block);
              setSelectedColumn(null); // Clear column selection when clicking container
              setSelectedChild(null); // Clear child selection when clicking container directly
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <div className="two-column-content">
              <div 
                className={`column left-column ${
                  selectedBlock?.id === block.id && selectedColumn === "left"
                    ? "column-selected"
                    : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveBlock(block.id);
                  setSelectedBlock(block);
                  setSelectedColumn("left");
                  // Clear child selection when selecting column
                  setSelectedChild(null);
                  setFocusedInput(null);
                }}
              >
                {block.leftChildren && block.leftChildren.length > 0 ? (
                  renderNestedBlocks(block.leftChildren, block.id)
                ) : (
                  <div className="empty-column">
                    <p>
                      Left Column - Click to select, then use toolbar to add
                      content
                    </p>
                  </div>
                )}
              </div>
              <div 
                className={`column right-column ${
                  selectedBlock?.id === block.id && selectedColumn === "right"
                    ? "column-selected"
                    : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveBlock(block.id);
                  setSelectedBlock(block);
                  setSelectedColumn("right");
                  // Clear child selection when selecting column
                  setSelectedChild(null);
                  setFocusedInput(null);
                }}
              >
                {block.rightChildren && block.rightChildren.length > 0 ? (
                  renderNestedBlocks(block.rightChildren, block.id)
                ) : (
                  <div className="empty-column">
                    <p>
                      Right Column - Click to select, then use toolbar to add
                      content
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case BLOCK_TYPES.HEADING:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block heading-block ${
              activeBlock === block.id ? "active" : ""
            } ${selectedBlock?.id === block.id ? "selected" : ""}`}
            style={baseStyle}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <textarea
              key={`heading-${block.id}`}
              value={block.content || ""}
              onChange={(e) => {
                updateBlock(block.id, { content: e.target.value });
              }}
              onKeyDown={handleKeyDown}
              onClick={handleTextareaClick}
              onFocus={handleTextareaFocus}
              onBlur={handleTextareaBlur}
              placeholder="Enter heading..."
              className={`heading-${block.headingType || "h2"} ${
                block.styles?.textAlign
                  ? `text-align-${block.styles.textAlign}`
                  : "text-align-left"
              }`}
              style={{
                resize: "none",
                overflow: "hidden",
                minHeight: "1em",
                height: "auto",
                maxHeight: "none",
              }}
            />
          </div>
        );

      case BLOCK_TYPES.PARAGRAPH:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block paragraph-block ${
              activeBlock === block.id ? "active" : ""
            } ${selectedBlock?.id === block.id ? "selected" : ""}`}
            style={baseStyle}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <textarea
              key={`paragraph-${block.id}`}
              value={block.content || ""}
              onChange={(e) => {
                updateBlock(block.id, { content: e.target.value });
              }}
              onKeyDown={handleKeyDown}
              onClick={handleTextareaClick}
              onFocus={handleTextareaFocus}
              onBlur={handleTextareaBlur}
              placeholder="Start typing..."
              className={
                block.styles?.textAlign
                  ? `text-align-${block.styles.textAlign}`
                  : "text-align-left"
              }
              style={{
                resize: "none",
                overflow: "hidden",
                minHeight: "1.2em",
                height: "auto",
                maxHeight: "none",
              }}
            />
          </div>
        );

      case BLOCK_TYPES.IMAGE:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block image-block ${
              selectedBlock?.id === block.id ? "selected" : ""
            }`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation();
              setActiveBlock(block.id);
              
              // Find the parent container and select it
              const parentContainer = allBlocks.find(
                (containerBlock) =>
                  (containerBlock.children &&
                    containerBlock.children.some(
                      (child) => child.id === block.id
                    )) ||
                  (containerBlock.leftChildren &&
                    containerBlock.leftChildren.some(
                      (child) => child.id === block.id
                    )) ||
                  (containerBlock.rightChildren &&
                    containerBlock.rightChildren.some(
                      (child) => child.id === block.id
                    ))
              );
              
              if (parentContainer) {
                setSelectedBlock(parentContainer);
                setActiveBlock(parentContainer.id);
                
                // Find which child this is in the parent container
                let childIndex = -1;
                if (parentContainer.children) {
                  childIndex = parentContainer.children.findIndex(
                    (child) => child.id === block.id
                  );
                } else if (parentContainer.leftChildren) {
                  childIndex = parentContainer.leftChildren.findIndex(
                    (child) => child.id === block.id
                  );
                } else if (parentContainer.rightChildren) {
                  childIndex = parentContainer.rightChildren.findIndex(
                    (child) => child.id === block.id
                  );
                }
                
                if (childIndex !== -1) {
                  setSelectedChild({ blockId: parentContainer.id, childIndex });
                  // Clear column selection when selecting child
                  setSelectedColumn(null);
                }
              }
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <div 
              className="image-placeholder"
              onClick={(e) => {
                e.stopPropagation();
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      updateBlock(block.id, { content: event.target.result });
                    };
                    reader.readAsDataURL(file);
                  }
                };
                input.click();
              }}
            >
              {block.content ? (
                <img src={block.content} alt="Uploaded" />
              ) : (
                <div className="image-upload-placeholder">
                  <span>Click to upload image</span>
                </div>
              )}
            </div>
          </div>
        );

      case BLOCK_TYPES.TABLE:
        const tableData = block.tableData || {
          headers: ["Header 1", "Header 2", "Header 3"],
          rows: [
            ["Row 1, Cell 1", "Row 1, Cell 2", "Row 1, Cell 3"],
            ["Row 2, Cell 1", "Row 2, Cell 2", "Row 2, Cell 3"],
          ],
        };
        
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block table-block ${
              selectedBlock?.id === block.id ? "selected" : ""
            }`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation();
              setActiveBlock(block.id);
              
              // Find the parent container and select it
              const parentContainer = allBlocks.find(
                (containerBlock) =>
                  (containerBlock.children &&
                    containerBlock.children.some(
                      (child) => child.id === block.id
                    )) ||
                  (containerBlock.leftChildren &&
                    containerBlock.leftChildren.some(
                      (child) => child.id === block.id
                    )) ||
                  (containerBlock.rightChildren &&
                    containerBlock.rightChildren.some(
                      (child) => child.id === block.id
                    ))
              );
              
              if (parentContainer) {
                setSelectedBlock(parentContainer);
                setActiveBlock(parentContainer.id);
                
                // Find which child this is in the parent container
                let childIndex = -1;
                if (parentContainer.children) {
                  childIndex = parentContainer.children.findIndex(
                    (child) => child.id === block.id
                  );
                } else if (parentContainer.leftChildren) {
                  childIndex = parentContainer.leftChildren.findIndex(
                    (child) => child.id === block.id
                  );
                } else if (parentContainer.rightChildren) {
                  childIndex = parentContainer.rightChildren.findIndex(
                    (child) => child.id === block.id
                  );
                }
                
                if (childIndex !== -1) {
                  setSelectedChild({ blockId: parentContainer.id, childIndex });
                  setSelectedAlignment(block.styles?.textAlign || "left");
                  // Clear column selection when selecting child
                  setSelectedColumn(null);
                }
              }
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
              <button
                className="addrow"
                onClick={() => handleTableEdit(block.id, "addRow")}
              >
                + Row
              </button>
              <button
                className="addcol"
                onClick={() => handleTableEdit(block.id, "addColumn")}
              >
                + Col
              </button>
            </div>
            <table
              className={
                block.styles?.textAlign
                  ? `text-align-${block.styles.textAlign}`
                  : "text-align-left"
              }
              data-debug-styles={JSON.stringify(block.styles)}
            >
              <thead>
                <tr>
                  {tableData.headers.map((header, colIndex) => (
                    <th key={colIndex}>
                      <input
                        type="text"
                        value={header}
                        onChange={(e) =>
                          handleTableEdit(block.id, "updateHeader", {
                            colIndex,
                            value: e.target.value,
                          })
                        }
                      />
                      {tableData.headers.length > 1 && (
                        <button
                          onClick={() =>
                            handleTableEdit(block.id, "removeColumn", {
                              colIndex,
                            })
                          }
                        >
                          ×
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, colIndex) => (
                      <td key={colIndex}>
                        <input
                          type="text"
                          value={cell}
                          onChange={(e) =>
                            handleTableEdit(block.id, "updateCell", {
                              rowIndex,
                              colIndex,
                              value: e.target.value,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="table-action-cell">
                      {tableData.rows.length > 1 && (
                        <button
                          onClick={() =>
                            handleTableEdit(block.id, "removeRow", { rowIndex })
                          }
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case BLOCK_TYPES.LIST:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block list-block ${
              activeBlock === block.id ? "active" : ""
            } ${selectedBlock?.id === block.id ? "selected" : ""}`}
            style={baseStyle}
          >
            <div className="block-controls child-controls">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBlock(block.id);
                }}
                title="Delete List"
              >
                🗑️
              </button>
            </div>
            <div className="block-content">
              <WysiwygListEditor 
                block={block}
                onFocus={() => {
                  setActiveBlock(block.id);
                  setSelectedChild(block.id);
                }}
                onBlur={(content) => {
                  updateBlock(block.id, { content });
                }}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Helper function to extract list items from HTML content
  const extractListItems = (htmlContent) => {
    if (!htmlContent) return [];
    
    try {
      // Create a temporary DOM element to parse the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      
      // Find all list items and extract their text content
      const listItems = tempDiv.querySelectorAll('li');
      return Array.from(listItems).map(li => {
        // Get text content and remove any formatting
        return li.textContent || li.innerText || '';
      }).filter(item => item.trim() !== ''); // Remove empty items
    } catch (error) {
      console.error('Error parsing list items:', error);
      return [];
    }
  };

  // Generate JSON schema for submission
  const generateReportSchema = () => {
    const pageDimensions = getPageDimensions();
    
    const schema = {
      settings: {
        pageSize: documentSettings.pageSize,
        margins: {
          top: pageDimensions.margins.top,
          bottom: pageDimensions.margins.bottom,
          left: pageDimensions.margins.left,
          right: pageDimensions.margins.right
        },
        background: documentSettings.background.value || null,
        footerText: documentSettings.footerText
      },
      pages: documentContent.reduce((pagesObj, page, pageIndex) => {
        const pageNumber = pageIndex + 1;
        pagesObj[pageNumber] = {
          containers: page.blocks.map((container) => {
            if (container.type === BLOCK_TYPES.CONTAINER) {
              // Single column container
              return {
                type: "single",
                blocks: (container.children || []).map((block) => ({
                  type: getBlockType(block),
                  text: block.type === BLOCK_TYPES.LIST ? extractListItems(block.content).join(', ') : block.content || block.text || "",
                  data: block.type === BLOCK_TYPES.TABLE ? (block.tableData || { headers: ["Header 1", "Header 2", "Header 3"], rows: [["Row 1, Cell 1", "Row 1, Cell 2", "Row 1, Cell 3"], ["Row 2, Cell 1", "Row 2, Cell 2", "Row 2, Cell 3"]] }) : (block.type === BLOCK_TYPES.LIST ? extractListItems(block.content) : null),
                  style: {
                    textAlign: block.styles?.textAlign || "left",
                    fontSize: getFontSize(block),
                    fontWeight: block.type === BLOCK_TYPES.HEADING ? "bold" : "normal"
                  }
                }))
              };
            } else if (container.type === BLOCK_TYPES.TWO_COLUMN) {
              // Two column container
              return {
                type: "double",
                left: (container.leftChildren || []).map((block) => ({
                  type: getBlockType(block),
                  text: block.type === BLOCK_TYPES.LIST ? extractListItems(block.content).join(', ') : block.content || block.text || "",
                  data: block.type === BLOCK_TYPES.TABLE ? (block.tableData || { headers: ["Header 1", "Header 2", "Header 3"], rows: [["Row 1, Cell 1", "Row 1, Cell 2", "Row 1, Cell 3"], ["Row 2, Cell 1", "Row 2, Cell 2", "Row 2, Cell 3"]] }) : (block.type === BLOCK_TYPES.LIST ? extractListItems(block.content) : null),
                  style: {
                    textAlign: block.styles?.textAlign || "left",
                    fontSize: getFontSize(block),
                    fontWeight: block.type === BLOCK_TYPES.HEADING ? "bold" : "normal"
                  }
                })),
                right: (container.rightChildren || []).map((block) => ({
                  type: getBlockType(block),
                  text: block.type === BLOCK_TYPES.LIST ? extractListItems(block.content).join(', ') : block.content || block.text || "",
                  data: block.type === BLOCK_TYPES.TABLE ? (block.tableData || { headers: ["Header 1", "Header 2", "Header 3"], rows: [["Row 1, Cell 1", "Row 1, Cell 2", "Row 1, Cell 3"], ["Row 2, Cell 1", "Row 2, Cell 2", "Row 2, Cell 3"]] }) : (block.type === BLOCK_TYPES.LIST ? extractListItems(block.content) : null),
                  style: {
                    textAlign: block.styles?.textAlign || "left",
                    fontSize: getFontSize(block),
                    fontWeight: block.type === BLOCK_TYPES.HEADING ? "bold" : "normal"
                  }
                }))
              };
            }
            return null;
          }).filter(Boolean)
        };
        return pagesObj;
      }, {})
    };
    
    return schema;
  };

  // Helper function to get appropriate font size
  const getFontSize = (block) => {
    if (block.type === BLOCK_TYPES.HEADING) {
      switch (block.headingType) {
        case 'h1': return '24px';
        case 'h2': return '20px';
        case 'h3': return '18px';
        case 'h4': return '16px';
        case 'h5': return '14px';
        case 'h6': return '12px';
        default: return '16px';
      }
    } else if (block.type === BLOCK_TYPES.PARAGRAPH) {
      return '12px';
    } else if (block.type === BLOCK_TYPES.TABLE) {
      return '10px';
    } else if (block.type === BLOCK_TYPES.LIST) {
      return '12px';
    }
    return '12px';
  };

  // Helper function to get proper HTML tag type
  const getBlockType = (block) => {
    if (block.type === BLOCK_TYPES.HEADING) {
      return block.headingType || 'h1';
    } else if (block.type === BLOCK_TYPES.PARAGRAPH) {
      return 'p';
    } else if (block.type === BLOCK_TYPES.TABLE) {
      return 'table';
    } else if (block.type === BLOCK_TYPES.IMAGE) {
      return 'img';
    } else if (block.type === BLOCK_TYPES.LINK) {
      return 'a';
    } else if (block.type === BLOCK_TYPES.LIST) {
      return 'ul';
    }
    return block.type.toLowerCase();
  };

  // Submit report to backend
  const handleGenerateReport = () => {
    const reportSchema = generateReportSchema();

    // Log the complete JSON payload for API implementation
    console.log(JSON.stringify(reportSchema, null, 2));

    // Pre-open a tab synchronously to avoid popup blockers
    const preOpenedTab = window.open("about:blank", "_blank");
    if (preOpenedTab && !preOpenedTab.closed) {
      try {
        const doc = preOpenedTab.document;
        doc.open();
        doc.write(
          `<!doctype html><html><head><meta charset="utf-8"><title>Preparing report…</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}.box{text-align:center}.spinner{width:44px;height:44px;border: 4px solid rgba(88, 100, 189, 0.2);border-top-color: #5864bd;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}small{opacity:.75}</style></head><body><div class="box"><div class="spinner"></div><div>Preparing your Report...</div><small>This tab will update automatically. So don't close the tab.</small></div></body></html>`
        );
        doc.close();
      } catch (err) {
        // If writing fails, ignore and proceed
      }
    }

    // Dispatch the API call
    if (id) {
      dispatch(generateCustomReport({ orderId: id, content: reportSchema })).then((result) => {
        if (result.meta.requestStatus === "fulfilled") {
          // Open PDF in the pre-opened tab
          const downloadUrl = result.payload.data.download_url;
          const fullUrl = resolveAssetUrl(downloadUrl);
          if (preOpenedTab && !preOpenedTab.closed) {
            preOpenedTab.location.href = fullUrl;
          } else {
            window.open(fullUrl, "_blank");
          }
        } else {
          // Close the preOpenedTab if generation failed
          if (preOpenedTab && !preOpenedTab.closed) {
            preOpenedTab.close();
          }
        }
      });
    } else {
      toast.error("Order ID is required to generate report!");
      // Close the preOpenedTab if no order ID
      if (preOpenedTab && !preOpenedTab.closed) {
        preOpenedTab.close();
      }
    }
  };

  // Effects
  useEffect(() => {
    // Fetch order details when component mounts or ID changes
    if (id) {
      dispatch(fetchOrderById(id));
    }
  }, [dispatch, id]);

  useEffect(() => {
    // Trigger pagination calculation
    calculatePagination();
  }, [allBlocks, calculatePagination]);

  useEffect(() => {
    // Recalculate pagination when page size changes
    calculatePagination();
  }, [documentSettings.pageSize, calculatePagination]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (paginationTimeoutRef.current) {
        clearTimeout(paginationTimeoutRef.current);
      }
    };
  }, []);

  const pageDimensions = getPageDimensions();

  // Show loading state while fetching order details
  if (orderLoading) {
    return (
      <div className="word-like-editor">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  // Show error state if order fetching failed
  if (orderError) {
    return (
      <div className="word-like-editor">
        <div className="error-container">
          <h3>Error Loading Order</h3>
          <p>{orderError}</p>
          <button onClick={() => dispatch(fetchOrderById(id))} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show message if no order ID provided
  if (!id) {
    return (
      <div className="word-like-editor">
        <div className="error-container">
          <h3>No Order ID</h3>
          <p>Please navigate to this page with a valid order ID.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="custom-report-editor">
      {/* Global Settings Panel */}
      <div className="global-settings-panel">
        <h3>Document Settings</h3>
        
        <div className="setting-group">
          <label>Page Size:</label>
          <select
            value={documentSettings.pageSize}
            onChange={(e) => {
              const newPageSize = e.target.value;
              setDocumentSettings((prev) => ({
                ...prev,
                pageSize: newPageSize,
              }));
            }}
          >
            {Object.keys(PAGE_SIZES).map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-group">
          <label>Background:</label>
          <div className="background-controls">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setDocumentSettings((prev) => ({
                      ...prev,
                      background: { type: "image", value: event.target.result },
                    }));
                  };
                  reader.readAsDataURL(file);
                }
              }}
              id="background-upload"
            />
            <button
              onClick={() =>
                document.getElementById("background-upload").click()
              }
            >
              Upload Image
            </button>
            {documentSettings.background.value && (
              <button
                onClick={() =>
                  setDocumentSettings((prev) => ({
                  ...prev,
                    background: { type: "image", value: null },
                  }))
                }
                className="remove-btn"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="setting-group">
          <label>Footer Text:</label>
          <input
            type="text"
            value={documentSettings.footerText}
            onChange={(e) =>
              setDocumentSettings((prev) => ({
                ...prev,
                footerText: e.target.value,
              }))
            }
            placeholder="Enter footer text..."
            className="footer-text-input"
          />
        </div>

        <div className="setting-group generate-report-group">
          <button 
            onClick={handleGenerateReport} 
            className="generate-btn"
            disabled={generating}
          >
            {generating ? "Generating Report..." : "Generate Report"}
          </button>
        </div>
      </div>

      {/* Sticky Toolbar */}
      <div className="sticky-toolbar">
        <div className="toolbar-section">
          <h4>
            {selectedBlock && selectedBlock.type === BLOCK_TYPES.CONTAINER 
              ? "Add to Container:" 
              : selectedBlock && selectedBlock.type === BLOCK_TYPES.TWO_COLUMN
              ? selectedColumn 
                ? `Add to Two-Column (${
                    selectedColumn === "left" ? "Left" : "Right"
                  }):`
                : "Select a column first:"
              : "Insert Blocks:"}
          </h4>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.CONTAINER);
            }}
          >
            Container
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.TWO_COLUMN);
            }}
          >
            Two Columns
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: "h1" });
            }}
          >
            H1
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: "h2" });
            }}
          >
            H2
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: "h3" });
            }}
          >
            H3
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: "h4" });
            }}
          >
            H4
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: "h5" });
            }}
          >
            H5
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: "h6" });
            }}
          >
            H6
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.PARAGRAPH);
            }}
          >
            Paragraph
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.IMAGE);
            }}
          >
            Image
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.TABLE);
            }}
          >
            Table
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleToolbarClick(BLOCK_TYPES.LIST);
            }}
          >
            List
          </button>
        </div>
        
        <div className="toolbar-section">
          {selectedChild && selectedChild.type === BLOCK_TYPES.LIST && (
            <div className="formatting-controls">
              <span>Format:</span>
              <button 
                onClick={() => document.execCommand('bold')}
                title="Bold"
              >
                <strong>B</strong>
              </button>
              <button 
                onClick={() => document.execCommand('italic')}
                title="Italic"
              >
                <em>I</em>
              </button>
              <button 
                onClick={() => document.execCommand('underline')}
                title="Underline"
              >
                <u>U</u>
              </button>
            </div>
          )}
        </div>
        
        <div className="toolbar-section">
          {(selectedChild || focusedInput) && (
            <div className="alignment-controls">
              <span>Alignment:</span>
              <button 
                className={selectedAlignment === "left" ? "active" : ""}
                onClick={() => handleAlignmentChange("left")}
              >
                Left
              </button>
              <button 
                className={selectedAlignment === "center" ? "active" : ""}
                onClick={() => handleAlignmentChange("center")}
              >
                Center
              </button>
              <button 
                className={selectedAlignment === "right" ? "active" : ""}
                onClick={() => handleAlignmentChange("right")}
              >
                Right
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document Canvas */}
      <div className="document-canvas" ref={documentRef}>
        {documentContent.map((page, pageIndex) => (
          <div
            key={page.id}
            data-page-id={page.id}
            className={`document-page ${
              page.isOverflowing ? "page-overflow" : ""
            }`}
            style={{
              width: pageDimensions.width,
              minHeight: pageDimensions.height,
              maxHeight: pageDimensions.height * 1.1, // Allow slight expansion but limit it
              margin: "30px auto",
              padding: `${inToPx(pageDimensions.margins.top)}px ${inToPx(
                pageDimensions.margins.right
              )}px ${inToPx(pageDimensions.margins.bottom)}px ${inToPx(
                pageDimensions.margins.left
              )}px`,
              backgroundImage: documentSettings.background.value
                ? `url(${documentSettings.background.value})`
                : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundColor: documentSettings.background.value
                ? "transparent"
                : "#ffffff",
              border: "1px solid #ccc",
              boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
              position: "relative",
              overflow: "visible", // Allow content to show while pagination works
            }}
            onClick={(e) => handlePageClick(page.id, e)}
          >
            <div className="page-header">
              <span>Page {pageIndex + 1}</span>
            </div>
            
            <div className="page-content">
              {page.blocks.map((block, blockIndex) => (
                <div key={block.id}>{renderBlock(block)}</div>
              ))}
              
              {page.blocks.length === 0 && (
                <div className="empty-page-placeholder">
                  <p>Click anywhere on this page to start typing...</p>
                </div>
              )}
            </div>
            {/* Page Footer */}
            <div className="page-footer">
              <div className="footer-left">
                <span className="page-number">{pageIndex + 1}</span>
              </div>
              <div className="footer-right">
                <span className="footer-text">
                  {documentSettings.footerText}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WordLikeEditor;
