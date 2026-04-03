import React, { useState, useRef, useCallback, useEffect } from 'react'
import './CustomReport.scss'

// Page size constants with default margins (in inches)
const PAGE_SIZES = {
  A4: { width: 8.27, height: 11.69, unit: 'in', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
  A3: { width: 11.69, height: 16.54, unit: 'in', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
  Legal: { width: 8.5, height: 14, unit: 'in', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
  Letter: { width: 8.5, height: 11, unit: 'in', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } }
}

// Content block types
const BLOCK_TYPES = {
  CONTAINER: 'container',
  TWO_COLUMN: 'two-column',
  HEADING: 'heading',
  PARAGRAPH: 'paragraph',
  IMAGE: 'image',
  TABLE: 'table'
}

// Heading types
const HEADING_TYPES = {
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h5',
  H6: 'h6'
}

function CustomReport() {
  // Global document settings
  const [documentSettings, setDocumentSettings] = useState({
    pageSize: 'A4',
    background: { type: 'image', value: null }
  })

  // Document content structure
  const [documentContent, setDocumentContent] = useState([
    {
      id: 'page-1',
      type: 'page',
      blocks: [],
      isOverflowing: false
    }
  ])

  // Current cursor position and selection
  const [cursorPosition, setCursorPosition] = useState({ pageId: 'page-1', blockId: null, insertIndex: 0 })
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [activeBlock, setActiveBlock] = useState(null)
  const [editingTable, setEditingTable] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState(null) // 'left' or 'right'
  const [selectedChild, setSelectedChild] = useState(null) // { blockId, childIndex } for child selection
  const [selectedAlignment, setSelectedAlignment] = useState('left') // Default alignment
  const [focusedInput, setFocusedInput] = useState(null) // { blockId, childIndex } for focused input/textarea
  const [paginationInProgress, setPaginationInProgress] = useState(false) // Prevent pagination loops
  const [lastPageDimensions, setLastPageDimensions] = useState(null) // Track page dimension changes
  const paginationTimeoutRef = useRef(null) // Debounce pagination calls

  const documentRef = useRef(null)
  const cursorRef = useRef(null)
  const lastInsertionRef = useRef(null)
  const buttonClickRef = useRef({})

  // Auto-resize textarea function
  const autoResizeTextarea = (textarea) => {
    if (textarea) {
      // Store current scroll position
      const scrollTop = textarea.scrollTop
      
      // Reset height to get accurate scrollHeight
      textarea.style.height = '1px'
      
      // Calculate new height based on content
      const newHeight = textarea.scrollHeight
      
      // Set height to fit content exactly
      textarea.style.height = newHeight + 'px'
      
      // Restore scroll position
      textarea.scrollTop = scrollTop
    }
  }

  // Convert inches to pixels (96 DPI standard)
  const inToPx = (inches) => (inches * 96)

  // Get current page dimensions and margins
  const getPageDimensions = () => {
    const size = PAGE_SIZES[documentSettings.pageSize]
    return {
      width: inToPx(size.width),
      height: inToPx(size.height),
      margins: size.margins
    }
  }

  // Measure actual DOM content height for a page
  const measurePageContentHeight = useCallback((pageId) => {
    const pageElement = document.querySelector(`[data-page-id="${pageId}"] .page-content`)
    if (!pageElement) return 0
    
    // Get the actual height of all content including margins
    const contentHeight = pageElement.scrollHeight
    
    // Also account for any margins/padding of child elements
    const children = pageElement.children
    let totalMarginHeight = 0
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const computedStyle = window.getComputedStyle(child)
      const marginTop = parseFloat(computedStyle.marginTop) || 0
      const marginBottom = parseFloat(computedStyle.marginBottom) || 0
      totalMarginHeight += marginTop + marginBottom
    }
    
    return Math.max(contentHeight, totalMarginHeight)
  }, [])

  // Measure individual block height
  const measureBlockHeight = useCallback((blockId) => {
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`)
    if (!blockElement) {
      console.warn(`Block element not found for ID: ${blockId}`)
      return 30 // Fallback height
    }
    
    // Get the actual rendered height
    const height = blockElement.offsetHeight
    
    // If height is 0, try alternative measurements
    if (height === 0) {
      const computedStyle = window.getComputedStyle(blockElement)
      const rect = blockElement.getBoundingClientRect()
      
      console.warn(`Block ${blockId} has 0 offsetHeight, trying alternatives:`)
      console.warn(`- getBoundingClientRect height: ${rect.height}`)
      console.warn(`- scrollHeight: ${blockElement.scrollHeight}`)
      console.warn(`- computed height: ${computedStyle.height}`)
      
      // Use the best alternative measurement
      const alternativeHeight = Math.max(rect.height, blockElement.scrollHeight, 30)
      console.warn(`Using alternative height: ${alternativeHeight}px for block ${blockId}`)
      return alternativeHeight
    }
    
    return height
  }, [])

  // Find the optimal break point for content using real DOM measurements
  const findContentBreakPoint = useCallback((pageId, blocks, maxHeight) => {
    let accumulatedHeight = 0
    let breakIndex = 0
    
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      
      // Measure actual block height from DOM
      const blockHeight = measureBlockHeight(block.id) || 30 // fallback to 30px
      
      // Check if adding this block would exceed the limit
      if (accumulatedHeight + blockHeight > maxHeight) {
        // If this is the first block and it's too big, we need to move it
        if (i === 0) {
          breakIndex = 1 // Move the first block to next page
        } else {
          breakIndex = i // Break before this block
        }
        break
      }
      
      accumulatedHeight += blockHeight
    }
    
    // If we didn't find a break point but content is overflowing, 
    // break at the last block to force pagination
    if (breakIndex === 0 && accumulatedHeight > maxHeight && blocks.length > 1) {
      breakIndex = blocks.length - 1
    }
    
    return breakIndex
  }, [measureBlockHeight])

  // Immediate redistribution (internal function)
  const redistributeContentImmediate = useCallback(() => {
    if (paginationInProgress) {
      console.log('Pagination already in progress, skipping...')
      return
    }
    
    console.log('Starting content redistribution...')
    setPaginationInProgress(true)
    
    // Wait for DOM to be fully updated and rendered - increased delay for stability
    setTimeout(() => {
      const pageDimensions = getPageDimensions()
      const maxContentHeight = pageDimensions.height - inToPx(pageDimensions.margins.top + pageDimensions.margins.bottom)
      const bufferHeight = 50 // Increased buffer to be less aggressive
      const availableHeight = maxContentHeight - bufferHeight
      
      setDocumentContent(prev => {
        const newContent = [...prev]
        let hasChanges = false
        
        // Process each page individually to check for overflow
        for (let pageIndex = 0; pageIndex < newContent.length; pageIndex++) {
          const page = newContent[pageIndex]
          
          // Remove empty pages except the first one - but be more careful about timing
          if (page.blocks.length === 0 && pageIndex > 0) {
            // Only remove empty pages that have been empty for a while (not just created)
            if (!page.justCreated) {
              console.log(`Removing empty page ${page.id} at index ${pageIndex}`)
              newContent.splice(pageIndex, 1)
              hasChanges = true
              pageIndex-- // Adjust index after removal
              continue
            } else {
              console.log(`Skipping removal of just-created empty page ${page.id} - giving it time to populate`)
              // Clear the justCreated flag after one pass
              page.justCreated = false
            }
          }
          
          // CRITICAL: Double-check that this page actually has blocks rendered
          if (page.blocks.length > 0) {
            const containerBlocks = page.blocks.filter(block => 
              block.type === BLOCK_TYPES.CONTAINER || block.type === BLOCK_TYPES.TWO_COLUMN
            )
            if (containerBlocks.length > 0) {
              console.log(`Page ${pageIndex + 1} has ${containerBlocks.length} container(s):`, 
                containerBlocks.map(b => `${b.type}(${b.id})`))
            }
          }
          
          // Check if page content overflows using actual DOM measurements
          if (page.blocks.length > 0) {
            const actualContentHeight = measurePageContentHeight(page.id)
            
            // Mark page as overflowing for visual feedback
            const isCurrentlyOverflowing = actualContentHeight > availableHeight
            
            if (page.isOverflowing !== isCurrentlyOverflowing) {
              page.isOverflowing = isCurrentlyOverflowing
              hasChanges = true
            }
            
            if (isCurrentlyOverflowing) {
              // Find the break point where content should split using real measurements
              let breakIndex = findContentBreakPoint(page.id, page.blocks, availableHeight)
              
              // If we have a valid break point (some blocks need to move)
              if (breakIndex > 0 && breakIndex < page.blocks.length) {
                // CRITICAL: Ensure we never lose user content - move overflow blocks to next page
                const blocksToMove = page.blocks.slice(breakIndex)
                
                // Validate that we're not losing content
                if (blocksToMove.length === 0) {
                  console.error('ERROR: No blocks to move despite overflow detected')
                  continue
                }
                
                console.log(`MOVING BLOCKS: Page ${pageIndex + 1} overflow detected`)
                console.log(`Break index: ${breakIndex}, Total blocks: ${page.blocks.length}`)
                console.log(`Blocks staying on page:`, page.blocks.slice(0, breakIndex).map(b => `${b.type}(${b.id})`))
                console.log(`Blocks being moved:`, blocksToMove.map(b => `${b.type}(${b.id})`))
                
                page.blocks = page.blocks.slice(0, breakIndex)
                page.isOverflowing = false // No longer overflowing after split
                
                let targetPageId = null
                
                // If there's a next page, move blocks there, otherwise create new page
                if (pageIndex + 1 < newContent.length) {
                  // Add blocks to existing next page
                  const nextPage = newContent[pageIndex + 1]
                  nextPage.blocks = [...blocksToMove, ...nextPage.blocks]
                  targetPageId = nextPage.id
                  
                  // Validate blocks were added
                  console.log(`Moved ${blocksToMove.length} blocks to existing page ${targetPageId}`)
                } else {
                  // Create new page for overflow content
                  const newPageId = `page-${Date.now()}-${newContent.length + 1}`
                  const newPage = {
                    id: newPageId,
                    type: 'page',
                    blocks: [...blocksToMove], // Ensure we copy the blocks
                    isOverflowing: false,
                    justCreated: true // Flag to prevent immediate removal
                  }
                  newContent.push(newPage)
                  targetPageId = newPageId
                  
                  // Validate new page was created with blocks
                  console.log(`Created new page ${targetPageId} with ${blocksToMove.length} blocks`)
                }
                
                // Update cursor position and selection states if they reference moved blocks
                const movedBlockIds = blocksToMove.map(block => block.id)
                
                setTimeout(() => {
                  // Check if current active/selected blocks were moved
                  const activeBlockMoved = activeBlock && movedBlockIds.some(id => 
                    id === activeBlock || 
                    blocksToMove.some(block => 
                      (block.children && block.children.some(child => child.id === activeBlock)) ||
                      (block.leftChildren && block.leftChildren.some(child => child.id === activeBlock)) ||
                      (block.rightChildren && block.rightChildren.some(child => child.id === activeBlock))
                    )
                  )
                  
                  const selectedBlockMoved = selectedBlock && movedBlockIds.includes(selectedBlock.id)
                  
                  if (activeBlockMoved || selectedBlockMoved) {
                    setCursorPosition(prev => ({ ...prev, pageId: targetPageId }))
                    
                    // If we have a selected block that moved, ensure it stays selected
                    if (selectedBlockMoved) {
                      const movedBlock = blocksToMove.find(block => block.id === selectedBlock.id)
                      if (movedBlock) {
                        // Keep the block selected on the new page
                        setTimeout(() => {
                          setSelectedBlock(movedBlock)
                          setActiveBlock(movedBlock.id)
                        }, 200)
                      }
                    }
                  }
                }, 150)
                
                hasChanges = true
              } else if (breakIndex === 0 && page.blocks.length > 1) {
                // Fallback: if no break point found but we have multiple blocks, move the last block
                const lastBlock = page.blocks.pop()
                
                // Validate we got a block to move
                if (!lastBlock) {
                  console.error('ERROR: Failed to get last block for fallback move')
                  continue
                }
                
                // Special handling for containers - ensure they're preserved
                if (lastBlock.type === BLOCK_TYPES.CONTAINER || lastBlock.type === BLOCK_TYPES.TWO_COLUMN) {
                  console.warn(`CONTAINER FALLBACK: Moving ${lastBlock.type} container ${lastBlock.id} to preserve user content`)
                }
                
                page.isOverflowing = false
                console.log(`Fallback: Moving last block ${lastBlock.id} (${lastBlock.type}) to new page`)
                
                let targetPageId = null
                
                if (pageIndex + 1 < newContent.length) {
                  newContent[pageIndex + 1].blocks = [lastBlock, ...newContent[pageIndex + 1].blocks]
                  targetPageId = newContent[pageIndex + 1].id
                } else {
                  const newPageId = `page-${Date.now()}-${newContent.length + 1}`
                  newContent.push({
                    id: newPageId,
                    type: 'page',
                    blocks: [lastBlock],
                    isOverflowing: false,
                    justCreated: true // Flag to prevent immediate removal
                  })
                  targetPageId = newPageId
                }
                
                // Update cursor position if the moved block was selected/active
                setTimeout(() => {
                  const activeBlockMoved = activeBlock && (
                    lastBlock.id === activeBlock || 
                    (lastBlock.children && lastBlock.children.some(child => child.id === activeBlock)) ||
                    (lastBlock.leftChildren && lastBlock.leftChildren.some(child => child.id === activeBlock)) ||
                    (lastBlock.rightChildren && lastBlock.rightChildren.some(child => child.id === activeBlock))
                  )
                  
                  const selectedBlockMoved = selectedBlock && selectedBlock.id === lastBlock.id
                  
                  if (activeBlockMoved || selectedBlockMoved) {
                    setCursorPosition(prev => ({ ...prev, pageId: targetPageId }))
                    
                    // If we have a selected block that moved, ensure it stays selected
                    if (selectedBlockMoved) {
                      setTimeout(() => {
                        setSelectedBlock(lastBlock)
                        setActiveBlock(lastBlock.id)
                      }, 200)
                    }
                  }
                }, 100)
                
                hasChanges = true
              }
            }
          } else {
            // Empty page should not be marked as overflowing
            if (page.isOverflowing) {
              page.isOverflowing = false
              hasChanges = true
            }
          }
        }
        
        // Handle backward flow when page size increases (e.g., A4 to Legal)
        // Check if content from next pages can fit back into previous pages
        let backflowOccurred = true
        while (backflowOccurred && newContent.length > 1) {
          backflowOccurred = false
          
          for (let pageIndex = 0; pageIndex < newContent.length - 1; pageIndex++) {
            const currentPage = newContent[pageIndex]
            const nextPage = newContent[pageIndex + 1]
            
            if (nextPage && nextPage.blocks.length > 0) {
              // Calculate current page height
              const currentPageHeight = measurePageContentHeight(currentPage.id)
              const remainingSpace = availableHeight - currentPageHeight
              
              // Try to move blocks from next page back to current page if there's space
              let blocksToMoveBack = []
              let accumulatedHeight = 0
              
              for (let blockIndex = 0; blockIndex < nextPage.blocks.length; blockIndex++) {
                const blockHeight = measureBlockHeight(nextPage.blocks[blockIndex].id) || 30
                
                if (accumulatedHeight + blockHeight <= remainingSpace) {
                  blocksToMoveBack.push(nextPage.blocks[blockIndex])
                  accumulatedHeight += blockHeight
                } else {
                  break // Stop if this block would cause overflow
                }
              }
              
              // Move blocks back if any can fit
              if (blocksToMoveBack.length > 0) {
                currentPage.blocks = [...currentPage.blocks, ...blocksToMoveBack]
                nextPage.blocks = nextPage.blocks.slice(blocksToMoveBack.length)
                hasChanges = true
                backflowOccurred = true
                
                // If next page is now empty, remove it (but only if it's truly empty)
                if (nextPage.blocks.length === 0) {
                  console.log(`Removing empty page ${nextPage.id} after backward flow`)
                  newContent.splice(pageIndex + 1, 1)
                  break // Restart the loop after removing a page
                }
              }
            }
          }
        }
        
        // Ensure we have at least one page
        if (newContent.length === 0) {
          newContent.push({
            id: 'page-1',
            type: 'page',
            blocks: [],
            isOverflowing: false,
            justCreated: false // First page is not "just created"
          })
          hasChanges = true
        }
        
        // Final validation: ensure no content was lost
        if (hasChanges) {
          const originalBlockCount = prev.reduce((count, page) => count + page.blocks.length, 0)
          const newBlockCount = newContent.reduce((count, page) => count + page.blocks.length, 0)
          
          // Get all block IDs for detailed tracking
          const originalBlockIds = prev.flatMap(page => page.blocks.map(block => block.id)).sort()
          const newBlockIds = newContent.flatMap(page => page.blocks.map(block => block.id)).sort()
          
          // Find missing and extra blocks
          const missingBlocks = originalBlockIds.filter(id => !newBlockIds.includes(id))
          const extraBlocks = newBlockIds.filter(id => !originalBlockIds.includes(id))
          
          // Only error if we have missing blocks (lost content) - extra blocks might be newly added
          if (missingBlocks.length > 0) {
            console.error(`CRITICAL ERROR: Missing blocks detected!`)
            console.error('Original blocks:', originalBlockIds)
            console.error('New blocks:', newBlockIds)
            console.error('MISSING BLOCKS:', missingBlocks)
            
            // Return original content to prevent data loss
            return prev
          }
          
          // Log extra blocks as info, not error (these might be newly added blocks)
          if (extraBlocks.length > 0) {
            console.log('INFO: Extra blocks detected (likely newly added):', extraBlocks)
          }
          
          // Only warn about count mismatch, don't fail
          if (originalBlockCount !== newBlockCount) {
            console.log(`INFO: Block count changed during redistribution. Original: ${originalBlockCount}, New: ${newBlockCount}`)
          }
          
          // Check for duplicate blocks
          const blockIdCounts = {}
          newBlockIds.forEach(id => {
            blockIdCounts[id] = (blockIdCounts[id] || 0) + 1
          })
          
          const duplicates = Object.entries(blockIdCounts).filter(([id, count]) => count > 1)
          if (duplicates.length > 0) {
            console.error('DUPLICATE BLOCKS DETECTED:', duplicates)
            return prev // Prevent duplicate content
          }
          
          console.log(`Content redistribution successful: ${newBlockCount} blocks across ${newContent.length} pages`)
          
          // Log page distribution for debugging
          newContent.forEach((page, index) => {
            console.log(`Page ${index + 1}: ${page.blocks.length} blocks [${page.blocks.map(b => b.type).join(', ')}]`)
          })
        }
        
        return hasChanges ? newContent : prev
      })
      
      // Reset pagination flag after processing
      setTimeout(() => {
        setPaginationInProgress(false)
      }, 500)
    }, 400) // Increased from 300ms to 400ms for better DOM stability
  }, [documentSettings, getPageDimensions, measurePageContentHeight, findContentBreakPoint, paginationInProgress, activeBlock, selectedBlock])

  // Debounced redistribution to prevent race conditions
  const debouncedRedistributeContent = useCallback(() => {
    // Clear any existing timeout
    if (paginationTimeoutRef.current) {
      clearTimeout(paginationTimeoutRef.current)
    }
    
    // Set a new timeout to debounce rapid calls
    paginationTimeoutRef.current = setTimeout(() => {
      redistributeContentImmediate()
    }, 200) // 200ms debounce - increased for better DOM stability
  }, [redistributeContentImmediate])

  // Create a public redistributeContent function that uses the debounced version
  const redistributeContent = debouncedRedistributeContent

  // Legacy function name for compatibility
  const checkPageOverflow = redistributeContent

  // Effect to auto-resize textareas when content changes
  useEffect(() => {
    // Auto-resize all textareas when document content changes
    const textareas = document.querySelectorAll('textarea')
    textareas.forEach(textarea => {
      autoResizeTextarea(textarea)
    })
  }, [documentContent])

  // Effect to check page overflow when content changes
  useEffect(() => {
    // Check for page overflow after content changes with longer delay for DOM measurements
    const timeoutId = setTimeout(() => {
      debouncedRedistributeContent()
    }, 500) // Even longer delay to ensure DOM is fully rendered and measured
    
    return () => clearTimeout(timeoutId)
  }, [documentContent, redistributeContent])

  // Effect to redistribute content when page size changes
  useEffect(() => {
    const currentDimensions = getPageDimensions()
    const dimensionsKey = `${currentDimensions.width}-${currentDimensions.height}`
    
    // Only redistribute if dimensions actually changed
    if (lastPageDimensions && lastPageDimensions !== dimensionsKey) {
      // Redistribute content when page size changes
      const timeoutId = setTimeout(() => {
        debouncedRedistributeContent()
      }, 300) // Delay to ensure page dimensions are updated
      
      return () => clearTimeout(timeoutId)
    }
    
    setLastPageDimensions(dimensionsKey)
  }, [documentSettings.pageSize, redistributeContent, getPageDimensions, lastPageDimensions])

  // Additional effect to handle window resize and re-measure content
  useEffect(() => {
    const handleResize = () => {
      // Re-measure content when window is resized
      setTimeout(() => {
        debouncedRedistributeContent()
      }, 200)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [redistributeContent])

  // Auto-add new page when needed
  const addNewPage = useCallback(() => {
    const newPageId = `page-${documentContent.length + 1}`
    setDocumentContent(prev => [
      ...prev,
      {
        id: newPageId,
        type: 'page',
        blocks: [],
        isOverflowing: false
      }
    ])
    return newPageId
  }, [documentContent.length])


  // Insert content block at cursor position
  const insertBlock = useCallback((blockType, data = {}) => {
    if (isProcessing) {
      console.log('Already processing, ignoring duplicate call')
      return
    }
    
    setIsProcessing(true)
    console.log('=== INSERT BLOCK START ===')
    console.log('blockType:', blockType)
    console.log('selectedBlock:', selectedBlock)
    console.log('current documentContent:', documentContent)
    
    // Store original values before clearing for container operations
    const originalSelectedChild = selectedChild
    const originalFocusedInput = focusedInput
    const originalSelectedColumn = selectedColumn
    
    // Clear child selection immediately for container operations
    if (blockType === BLOCK_TYPES.CONTAINER || blockType === BLOCK_TYPES.TWO_COLUMN) {
      setSelectedChild(null)
      setFocusedInput(null)
      setSelectedColumn(null)
    }
    
    const blockId = `block-${Date.now()}`
    const newBlock = {
      id: blockId,
      type: blockType,
      content: data.content || '',
      styles: data.styles || {},
      headingType: blockType === BLOCK_TYPES.HEADING ? (data.headingType || 'h2') : undefined,
      ...data
    }

    // Ensure cursor position is valid - find the page that should receive the new content
    let targetPageId = cursorPosition.pageId
    const targetPage = documentContent.find(p => p.id === targetPageId)
    
    // If cursor position is invalid, use the last page or create a new one
    if (!targetPage) {
      targetPageId = documentContent[documentContent.length - 1]?.id || 'page-1'
      console.log(`Invalid cursor position, using page: ${targetPageId}`)
    }
    
    // Create a completely new document structure
    const newDocumentContent = documentContent.map(page => {
      if (page.id === targetPageId) {
        const newPage = { ...page, blocks: [...page.blocks] }
        
        // If a child is selected (and we're not adding a container), handle based on block type
        if (originalSelectedChild && originalSelectedChild.blockId && originalSelectedChild.childIndex !== undefined && 
            blockType !== BLOCK_TYPES.CONTAINER && blockType !== BLOCK_TYPES.TWO_COLUMN) {
          const containerIndex = newPage.blocks.findIndex(block => block.id === originalSelectedChild.blockId)
          if (containerIndex !== -1) {
            
            // For other content blocks, insert after the selected child
            const containerBlock = { ...newPage.blocks[containerIndex] }
            
            if (containerBlock.type === BLOCK_TYPES.CONTAINER) {
              const children = [...(containerBlock.children || [])]
              children.splice(originalSelectedChild.childIndex + 1, 0, newBlock)
              containerBlock.children = children
              console.log('Inserted after selected child in container')
            } else if (containerBlock.type === BLOCK_TYPES.TWO_COLUMN) {
              if (originalSelectedColumn === 'right') {
                const children = [...(containerBlock.rightChildren || [])]
                children.splice(originalSelectedChild.childIndex + 1, 0, newBlock)
                containerBlock.rightChildren = children
                console.log('Inserted after selected child in right column')
              } else {
                const children = [...(containerBlock.leftChildren || [])]
                children.splice(originalSelectedChild.childIndex + 1, 0, newBlock)
                containerBlock.leftChildren = children
                console.log('Inserted after selected child in left column')
              }
            }
            
            newPage.blocks[containerIndex] = containerBlock
            console.log('Inserted after child in container:', containerBlock.id)
            return newPage
          }
        }
        // If a container is selected, handle based on block type
        else if (selectedBlock && (selectedBlock.type === BLOCK_TYPES.CONTAINER || selectedBlock.type === BLOCK_TYPES.TWO_COLUMN)) {
          const containerIndex = newPage.blocks.findIndex(block => block.id === selectedBlock.id)
          if (containerIndex !== -1) {
            // If trying to add a new container or two-column, add as sibling below the selected container
            if (blockType === BLOCK_TYPES.CONTAINER || blockType === BLOCK_TYPES.TWO_COLUMN) {
              const newBlocks = [...newPage.blocks]
              newBlocks.splice(containerIndex + 1, 0, newBlock)
              newPage.blocks = newBlocks
              console.log('Added new container as sibling below selected container')
              return newPage
            }
            
            // For other content blocks, add inside the selected container
            const containerBlock = { ...newPage.blocks[containerIndex] }
            
            if (containerBlock.type === BLOCK_TYPES.TWO_COLUMN) {
              // For two-column, add to selected column or left by default
              if (originalSelectedColumn === 'right') {
                containerBlock.rightChildren = [...(containerBlock.rightChildren || []), newBlock]
                console.log('Added to right column of two-column container')
              } else {
                containerBlock.leftChildren = [...(containerBlock.leftChildren || []), newBlock]
                console.log('Added to left column of two-column container')
              }
            } else {
              // For single container
              containerBlock.children = [...(containerBlock.children || []), newBlock]
              console.log('Added to single container')
            }
            
            newPage.blocks[containerIndex] = containerBlock
            console.log('Added to container:', containerBlock.id)
            return newPage
          }
        }
        
        // For container blocks (Container, Two Column), insert at the bottom
        if (blockType === BLOCK_TYPES.CONTAINER || blockType === BLOCK_TYPES.TWO_COLUMN) {
          const newBlocks = [...newPage.blocks]
          newBlocks.push(newBlock) // Add to the end (bottom)
          newPage.blocks = newBlocks
          console.log('Created new container block at bottom')
          return newPage
        }
        
        // For other content blocks, create a default container first if none selected
        if (!selectedBlock || (selectedBlock.type !== BLOCK_TYPES.CONTAINER && selectedBlock.type !== BLOCK_TYPES.TWO_COLUMN)) {
          const containerId = `container-${Date.now()}`
          const defaultContainer = {
            id: containerId,
            type: BLOCK_TYPES.CONTAINER,
            children: [newBlock]
          }
          
          const newBlocks = [...newPage.blocks]
          newBlocks.push(defaultContainer) // Add to the end (bottom)
          newPage.blocks = newBlocks
          console.log('Created default container for content block at bottom')
          return newPage
        }
      }
      return page
    })

    console.log('New document content:', newDocumentContent)
    console.log('=== INSERT BLOCK END ===')
    
    setDocumentContent(newDocumentContent)
    setActiveBlock(blockId)
    setSelectedBlock(null)
    
    // Update cursor position to ensure it's on the correct page
    setCursorPosition(prev => ({ ...prev, pageId: targetPageId, blockId: blockId }))
    
    // Auto-focus newly created heading or paragraph blocks
    if (blockType === BLOCK_TYPES.HEADING || blockType === BLOCK_TYPES.PARAGRAPH) {
      setTimeout(() => {
        try {
          const newBlockElement = document.querySelector(`[data-block-id="${blockId}"] textarea`)
          if (newBlockElement && newBlockElement.focus) {
            newBlockElement.focus()
            newBlockElement.setSelectionRange(0, 0)
          }
        } catch (error) {
          // Focus error handling
        }
      }, 200) // Increased delay to ensure DOM is fully rendered
    }
    
        debouncedRedistributeContent()
    
    // Reset processing flag after a delay
    setTimeout(() => {
      setIsProcessing(false)
    }, 200)
  }, [cursorPosition, selectedBlock, checkPageOverflow, documentContent, isProcessing])

  // Handle toolbar button clicks with duplicate prevention
  const handleToolbarClick = useCallback((blockType, additionalData = {}) => {
    const buttonKey = `${blockType}-${selectedBlock?.id || 'none'}`
    const now = Date.now()
    
    // Check if this button was clicked recently
    if (buttonClickRef.current[buttonKey] && now - buttonClickRef.current[buttonKey] < 1000) {
      console.log('Button click ignored - too recent:', buttonKey)
      return
    }
    
    // Record this button click
    buttonClickRef.current[buttonKey] = now
    console.log('Button click processed:', buttonKey)
    
    // Call insertBlock with additional data
    insertBlock(blockType, additionalData)
  }, [selectedBlock, insertBlock])

  // Handle alignment changes for selected child elements or focused inputs
  const handleAlignmentChange = useCallback((alignment) => {
    const targetElement = selectedChild || focusedInput
    
    if (targetElement && targetElement.blockId && targetElement.childIndex !== undefined) {
      // Find the child element and update its alignment
      setDocumentContent(prev => prev.map(page => ({
        ...page,
        blocks: page.blocks.map(block => {
          if (block.id === targetElement.blockId) {
            const updatedBlock = { ...block }
            
            if (block.children) {
              const updatedChildren = [...block.children]
              if (updatedChildren[targetElement.childIndex]) {
                updatedChildren[targetElement.childIndex] = {
                  ...updatedChildren[targetElement.childIndex],
                  styles: {
                    ...updatedChildren[targetElement.childIndex].styles,
                    textAlign: alignment
                  }
                }
                updatedBlock.children = updatedChildren
              }
            } else if (block.leftChildren) {
              const updatedChildren = [...block.leftChildren]
              if (updatedChildren[targetElement.childIndex]) {
                updatedChildren[targetElement.childIndex] = {
                  ...updatedChildren[targetElement.childIndex],
                  styles: {
                    ...updatedChildren[targetElement.childIndex].styles,
                    textAlign: alignment
                  }
                }
                updatedBlock.leftChildren = updatedChildren
              }
            } else if (block.rightChildren) {
              const updatedChildren = [...block.rightChildren]
              if (updatedChildren[targetElement.childIndex]) {
                updatedChildren[targetElement.childIndex] = {
                  ...updatedChildren[targetElement.childIndex],
                  styles: {
                    ...updatedChildren[targetElement.childIndex].styles,
                    textAlign: alignment
                  }
                }
                updatedBlock.rightChildren = updatedChildren
              }
            }
            
            return updatedBlock
          }
          return block
        })
      })))
      
      setSelectedAlignment(alignment)
    }
  }, [selectedChild, focusedInput])

  // Handle page click to create new paragraph and start typing
  const handlePageClick = useCallback((pageId, event) => {
    console.log('handlePageClick triggered:', {
      target: event.target,
      tagName: event.target.tagName,
      className: event.target.className,
      closestContentBlock: event.target.closest('.content-block'),
      closestNestedBlock: event.target.closest('.nested-block'),
      closestTextarea: event.target.closest('textarea'),
      isTextarea: event.target.tagName === 'TEXTAREA',
      pageId: pageId
    })
    
    // Don't create new block if clicking on existing blocks or their textareas
    if (event.target.closest('.content-block') || 
        event.target.closest('.nested-block') ||
        event.target.tagName === 'TEXTAREA' || 
        event.target.tagName === 'INPUT' ||
        event.target.closest('textarea') ||
        event.target.closest('input')) {
      console.log('Prevented new block creation - clicked on existing content')
      return
    }
    
    // If clicking on page-content, check if we're near any existing content
    if (event.target.className === 'page-content') {
      // Find all textareas in this page
      const textareas = event.currentTarget.querySelectorAll('textarea')
      const clickX = event.clientX
      const clickY = event.clientY
      
      // Check if click is near any existing textarea
      for (let textarea of textareas) {
        const rect = textarea.getBoundingClientRect()
        const buffer = 20 // 20px buffer around textareas
        
        if (clickX >= rect.left - buffer && 
            clickX <= rect.right + buffer &&
            clickY >= rect.top - buffer && 
            clickY <= rect.bottom + buffer) {
          // Click is near this textarea, focus it instead
          textarea.focus()
          textarea.setSelectionRange(textarea.value.length, textarea.value.length)
          console.log('Focused nearby textarea instead of creating new block')
          return
        }
      }
    }
    
    console.log('Creating new block - clicked on empty space')
    
    // Clear any selected child and focused input only when creating new content
    setSelectedChild(null)
    setFocusedInput(null)
    
    const rect = event.currentTarget.getBoundingClientRect()
    const clickY = event.clientY - rect.top
    const page = documentContent.find(p => p.id === pageId)
    
    if (page) {
      let insertIndex = page.blocks.length
      
      // Find the best insertion point based on click position
      for (let i = 0; i < page.blocks.length; i++) {
        const blockElement = event.currentTarget.querySelector(`[data-block-id="${page.blocks[i].id}"]`)
        if (blockElement) {
          const blockRect = blockElement.getBoundingClientRect()
          const blockTop = blockRect.top - rect.top
          
          if (clickY < blockTop + (blockRect.height / 2)) {
            insertIndex = i
            break
          }
        }
      }
      
      // Create new container with paragraph at click position
      const paragraphId = `paragraph-${Date.now()}`
      const containerId = `container-${Date.now()}`
      
      const newParagraph = {
        id: paragraphId,
        type: BLOCK_TYPES.PARAGRAPH,
        content: '',
        styles: {}
      }
      
      const newContainer = {
        id: containerId,
        type: BLOCK_TYPES.CONTAINER,
        children: [newParagraph]
      }

      setDocumentContent(prev => prev.map(p => {
        if (p.id === pageId) {
          const newBlocks = [...p.blocks]
          newBlocks.splice(insertIndex, 0, newContainer)
          return { ...p, blocks: newBlocks, isOverflowing: p.isOverflowing || false }
        }
        return p
      }))

      setCursorPosition({ pageId, blockId: paragraphId, insertIndex })
      setActiveBlock(paragraphId)
      setSelectedBlock(null)
      
      // Focus the new paragraph after it's rendered
      setTimeout(() => {
        try {
          const newBlockElement = document.querySelector(`[data-block-id="${paragraphId}"] textarea`)
          if (newBlockElement && newBlockElement.focus) {
            newBlockElement.focus()
            newBlockElement.setSelectionRange(0, 0)
            console.log('Successfully focused new textarea:', paragraphId)
          } else {
            console.log('Could not find or focus new textarea:', paragraphId)
          }
        } catch (error) {
          console.log('Focus new block error:', error)
        }
      }, 150) // Increased delay to ensure DOM is fully rendered
    }
  }, [documentContent])


  // Update block content
  const updateBlock = useCallback((blockId, updates) => {
    setDocumentContent(prev => prev.map(page => ({
      ...page,
      blocks: page.blocks.map(block => {
        // Check if this is the block we want to update
        if (block.id === blockId) {
          return { ...block, ...updates }
        }
        
        // Check if this block has children and update the target block in children
        if (block.children) {
          return {
            ...block,
            children: block.children.map(child => 
              child.id === blockId ? { ...child, ...updates } : child
            )
          }
        }
        
        // Check if this is a two-column block and update in left/right children
        if (block.leftChildren) {
          block.leftChildren = block.leftChildren.map(child => 
            child.id === blockId ? { ...child, ...updates } : child
          )
        }
        if (block.rightChildren) {
          block.rightChildren = block.rightChildren.map(child => 
            child.id === blockId ? { ...child, ...updates } : child
          )
        }
        
        return block
      })
    })))
    
    // Trigger pagination check after content update
    setTimeout(() => {
      debouncedRedistributeContent()
    }, 100)
  }, [redistributeContent])

  // Delete block
  const deleteBlock = useCallback((blockId) => {
    setDocumentContent(prev => prev.map(page => ({
      ...page,
      blocks: page.blocks.map(block => {
        // Check if this block has children and remove the target block from children
        if (block.children) {
          return {
            ...block,
            children: block.children.filter(child => child.id !== blockId)
          }
        }
        // Check if this is a two-column block and remove from left/right children
        if (block.leftChildren) {
          block.leftChildren = block.leftChildren.filter(child => child.id !== blockId)
        }
        if (block.rightChildren) {
          block.rightChildren = block.rightChildren.filter(child => child.id !== blockId)
        }
        return block
      }).filter(block => block.id !== blockId) // Remove the block itself if it's a top-level block
    })))
    setSelectedBlock(null)
    setActiveBlock(null)
  }, [])

  // Render nested blocks inside containers
  const renderNestedBlocks = (blocks, parentBlockId) => {
    if (!blocks || blocks.length === 0) return null
    
    return blocks.map((nestedBlock, index) => {
      const isSelected = selectedChild && selectedChild.blockId === parentBlockId && selectedChild.childIndex === index
      
      return (
        <div 
          key={nestedBlock.id} 
          className={`nested-block ${isSelected ? 'child-selected' : ''}`}
          onClick={(e) => {
            // If clicking on the nested block but not on textarea, focus the textarea
            if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
              e.stopPropagation()
              
              // Try to find and focus the textarea within this block
              const textarea = e.currentTarget.querySelector('textarea')
              if (textarea) {
                textarea.focus()
                textarea.setSelectionRange(textarea.value.length, textarea.value.length)
                console.log('Redirected click to textarea:', nestedBlock.id)
                return
              }
              
              // Find the parent container block to select it exactly like clicking the container
              const parentContainer = documentContent
                .flatMap(page => page.blocks)
                .find(block => block.id === parentBlockId)
              
              if (parentContainer) {
                setSelectedChild({ blockId: parentBlockId, childIndex: index })
                setActiveBlock(parentBlockId)
                setSelectedBlock(parentContainer)
                // Clear column selection when selecting child
                setSelectedColumn(null)
                console.log('Selected child and parent container:', { 
                  childIndex: index, 
                  parentContainer: parentContainer.id,
                  parentType: parentContainer.type 
                })
              }
            }
          }}
        >
          {renderBlock(nestedBlock)}
        </div>
      )
    })
  }

  // Handle table editing
  const handleTableEdit = (blockId, action, data = {}) => {
    // Find the block in all pages and nested children
    let block = null
    for (const page of documentContent) {
      // Check top-level blocks
      block = page.blocks.find(b => b.id === blockId)
      if (block) break
      
      // Check nested children
      for (const topBlock of page.blocks) {
        if (topBlock.children) {
          block = topBlock.children.find(b => b.id === blockId)
          if (block) break
        }
        if (topBlock.leftChildren) {
          block = topBlock.leftChildren.find(b => b.id === blockId)
          if (block) break
        }
        if (topBlock.rightChildren) {
          block = topBlock.rightChildren.find(b => b.id === blockId)
          if (block) break
        }
      }
      if (block) break
    }
    
    if (!block || block.type !== BLOCK_TYPES.TABLE) return
    
    let tableData = block.tableData || {
      headers: ['Header 1', 'Header 2', 'Header 3'],
      rows: [
        ['Row 1, Cell 1', 'Row 1, Cell 2', 'Row 1, Cell 3'],
        ['Row 2, Cell 1', 'Row 2, Cell 2', 'Row 2, Cell 3']
      ]
    }
    
    switch (action) {
      case 'addRow':
        const newRow = new Array(tableData.headers.length).fill('New Cell')
        tableData.rows.push(newRow)
        break
      case 'addColumn':
        tableData.headers.push(`Header ${tableData.headers.length + 1}`)
        tableData.rows.forEach(row => row.push('New Cell'))
        break
      case 'removeRow':
        if (tableData.rows.length > 1) {
          tableData.rows.splice(data.rowIndex, 1)
        }
        break
      case 'removeColumn':
        if (tableData.headers.length > 1) {
          tableData.headers.splice(data.colIndex, 1)
          tableData.rows.forEach(row => row.splice(data.colIndex, 1))
        }
        break
      case 'updateCell':
        tableData.rows[data.rowIndex][data.colIndex] = data.value
        break
      case 'updateHeader':
        tableData.headers[data.colIndex] = data.value
        break
    }
    
    updateBlock(blockId, { tableData })
  }

  // Render content block
  const renderBlock = (block) => {
    const baseStyle = {
      padding: '0',
      margin: '0 0 3px 0',
      border: '1px solid transparent',
      borderRadius: '0',
      minHeight: 'auto',
      ...block.styles
    }


    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        
        // Get current cursor position in the textarea
        const textarea = e.target
        const cursorPosition = textarea.selectionStart
        
        // Get current content
        const currentContent = textarea.value || ''
        
        // Insert line break at cursor position
        const newContent = currentContent.slice(0, cursorPosition) + '\n' + currentContent.slice(cursorPosition)
        
        // Update the block content
        updateBlock(block.id, { content: newContent })
        
        // Set cursor position after the line break and auto-resize
        setTimeout(() => {
          textarea.setSelectionRange(cursorPosition + 1, cursorPosition + 1)
          autoResizeTextarea(textarea)
        }, 0)
      }
    }

    const handleTextareaClick = (e) => {
      console.log('handleTextareaClick triggered:', {
        target: e.target,
        currentTarget: e.currentTarget,
        tagName: e.target.tagName,
        blockId: e.currentTarget.closest('[data-block-id]')?.getAttribute('data-block-id')
      })
      
      // Stop event from bubbling up to page click handler
      e.stopPropagation()
      
      // Find the parent block container and trigger its selection
      const blockContainer = e.currentTarget.closest('.content-block')
      if (blockContainer) {
        // Find the block ID from the data attribute
        const blockId = blockContainer.getAttribute('data-block-id')
        if (blockId) {
          // Find the parent container and select it
          const parentContainer = documentContent
            .flatMap(page => page.blocks)
            .find(containerBlock => 
              (containerBlock.children && containerBlock.children.some(child => child.id === blockId)) ||
              (containerBlock.leftChildren && containerBlock.leftChildren.some(child => child.id === blockId)) ||
              (containerBlock.rightChildren && containerBlock.rightChildren.some(child => child.id === blockId))
            )
          
          if (parentContainer) {
            setSelectedBlock(parentContainer)
            setActiveBlock(parentContainer.id)
            
            // Find which child this is in the parent container
            let childIndex = -1
            if (parentContainer.children) {
              childIndex = parentContainer.children.findIndex(child => child.id === blockId)
            } else if (parentContainer.leftChildren) {
              childIndex = parentContainer.leftChildren.findIndex(child => child.id === blockId)
            } else if (parentContainer.rightChildren) {
              childIndex = parentContainer.rightChildren.findIndex(child => child.id === blockId)
            }
            
            if (childIndex !== -1) {
              setSelectedChild({ blockId: parentContainer.id, childIndex })
              // Clear column selection when selecting child
              setSelectedColumn(null)
            }
            
            console.log('Selected parent container via textarea click:', parentContainer.id)
          }
        }
      }
    }

    // Handle textarea focus
    const handleTextareaFocus = (e) => {
      // Stop event from bubbling up to page click handler
      e.stopPropagation()
      
      // Find the parent block container and trigger its selection
      const blockContainer = e.currentTarget.closest('.content-block')
      if (blockContainer) {
        // Find the block ID from the data attribute
        const blockId = blockContainer.getAttribute('data-block-id')
        if (blockId) {
          // Find the parent container and select it
          const parentContainer = documentContent
            .flatMap(page => page.blocks)
            .find(containerBlock => 
              (containerBlock.children && containerBlock.children.some(child => child.id === blockId)) ||
              (containerBlock.leftChildren && containerBlock.leftChildren.some(child => child.id === blockId)) ||
              (containerBlock.rightChildren && containerBlock.rightChildren.some(child => child.id === blockId))
            )
          
          if (parentContainer) {
            setSelectedBlock(parentContainer)
            setActiveBlock(parentContainer.id)
            
            // Find which child this is in the parent container
            let childIndex = -1
            if (parentContainer.children) {
              childIndex = parentContainer.children.findIndex(child => child.id === blockId)
            } else if (parentContainer.leftChildren) {
              childIndex = parentContainer.leftChildren.findIndex(child => child.id === blockId)
            } else if (parentContainer.rightChildren) {
              childIndex = parentContainer.rightChildren.findIndex(child => child.id === blockId)
            }
            
            if (childIndex !== -1) {
              setFocusedInput({ blockId: parentContainer.id, childIndex })
              setSelectedChild(null) // Clear selected child when focusing input
              // Clear column selection when focusing input
              setSelectedColumn(null)
            }
            
            console.log('Selected parent container via textarea focus:', parentContainer.id)
          }
        }
      }
    }

    // Handle textarea blur
    const handleTextareaBlur = (e) => {
      // Small delay to allow alignment button clicks to work
      setTimeout(() => {
        setFocusedInput(null)
      }, 100)
    }


    switch (block.type) {
      case BLOCK_TYPES.CONTAINER:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block container-block ${selectedBlock?.id === block.id ? 'selected' : ''} ${activeBlock === block.id ? 'active' : ''}`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation()
              setActiveBlock(block.id)
              setSelectedBlock(block)
              setSelectedChild(null) // Clear child selection when clicking container directly
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
                  <p>Container - Select this container and use main toolbar buttons to add content</p>
                </div>
              )}
            </div>
          </div>
        )

      case BLOCK_TYPES.TWO_COLUMN:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block two-column-block ${selectedBlock?.id === block.id ? 'selected' : ''} ${activeBlock === block.id ? 'active' : ''}`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation()
              setActiveBlock(block.id)
              setSelectedBlock(block)
              setSelectedColumn(null) // Clear column selection when clicking container
              setSelectedChild(null) // Clear child selection when clicking container directly
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <div className="two-column-content">
              <div 
                className={`column left-column ${selectedBlock?.id === block.id && selectedColumn === 'left' ? 'column-selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveBlock(block.id)
                  setSelectedBlock(block)
                  setSelectedColumn('left')
                  // Clear child selection when selecting column
                  setSelectedChild(null)
                  setFocusedInput(null)
                }}
              >
                {block.leftChildren && block.leftChildren.length > 0 ? (
                  renderNestedBlocks(block.leftChildren, block.id)
                ) : (
                  <div className="empty-column">
                    <p>Left Column - Click to select, then use toolbar to add content</p>
                  </div>
                )}
              </div>
              <div 
                className={`column right-column ${selectedBlock?.id === block.id && selectedColumn === 'right' ? 'column-selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveBlock(block.id)
                  setSelectedBlock(block)
                  setSelectedColumn('right')
                  // Clear child selection when selecting column
                  setSelectedChild(null)
                  setFocusedInput(null)
                }}
              >
                {block.rightChildren && block.rightChildren.length > 0 ? (
                  renderNestedBlocks(block.rightChildren, block.id)
                ) : (
                  <div className="empty-column">
                    <p>Right Column - Click to select, then use toolbar to add content</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case BLOCK_TYPES.HEADING:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block heading-block ${activeBlock === block.id ? 'active' : ''} ${selectedBlock?.id === block.id ? 'selected' : ''}`}
            style={baseStyle}
            onClick={(e) => {
              // Only stop propagation if we're not clicking on a textarea or input
              if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                e.stopPropagation()
              }
              setActiveBlock(block.id)
              
              // Find the parent container and select it
              const parentContainer = documentContent
                .flatMap(page => page.blocks)
                .find(containerBlock => 
                  (containerBlock.children && containerBlock.children.some(child => child.id === block.id)) ||
                  (containerBlock.leftChildren && containerBlock.leftChildren.some(child => child.id === block.id)) ||
                  (containerBlock.rightChildren && containerBlock.rightChildren.some(child => child.id === block.id))
                )
              
              if (parentContainer) {
                setSelectedBlock(parentContainer)
                setActiveBlock(parentContainer.id)
                
                // Find which child this is in the parent container
                let childIndex = -1
                if (parentContainer.children) {
                  childIndex = parentContainer.children.findIndex(child => child.id === block.id)
                } else if (parentContainer.leftChildren) {
                  childIndex = parentContainer.leftChildren.findIndex(child => child.id === block.id)
                } else if (parentContainer.rightChildren) {
                  childIndex = parentContainer.rightChildren.findIndex(child => child.id === block.id)
                }
                
                if (childIndex !== -1) {
                  setSelectedChild({ blockId: parentContainer.id, childIndex })
                  // Clear column selection when selecting child
                  setSelectedColumn(null)
                }
                
                console.log('Selected parent container for heading:', parentContainer.id)
              }
              
              // Focus the textarea element
              setTimeout(() => {
                try {
                  const textareaElement = e.currentTarget?.querySelector('textarea')
                  if (textareaElement && textareaElement.focus) {
                    textareaElement.focus()
                    // Place cursor at end of text
                    textareaElement.setSelectionRange(textareaElement.value.length, textareaElement.value.length)
                  }
                } catch (error) {
                  console.log('Focus error:', error)
                }
              }, 0)
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <textarea
              key={`heading-${block.id}`}
              value={block.content || ''}
              onChange={(e) => {
                updateBlock(block.id, { content: e.target.value })
                autoResizeTextarea(e.target)
              }}
              onKeyDown={handleKeyDown}
              onClick={handleTextareaClick}
              onFocus={handleTextareaFocus}
              onBlur={handleTextareaBlur}
              placeholder="Enter heading..."
              className={`heading-${block.headingType || 'h2'} ${block.styles?.textAlign ? `text-align-${block.styles.textAlign}` : 'text-align-left'}`}
            />
          </div>
        )

      case BLOCK_TYPES.PARAGRAPH:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block paragraph-block ${activeBlock === block.id ? 'active' : ''} ${selectedBlock?.id === block.id ? 'selected' : ''}`}
            style={baseStyle}
            onClick={(e) => {
              // Only stop propagation if we're not clicking on a textarea or input
              if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                e.stopPropagation()
              }
              setActiveBlock(block.id)
              
              // Find the parent container and select it
              const parentContainer = documentContent
                .flatMap(page => page.blocks)
                .find(containerBlock => 
                  (containerBlock.children && containerBlock.children.some(child => child.id === block.id)) ||
                  (containerBlock.leftChildren && containerBlock.leftChildren.some(child => child.id === block.id)) ||
                  (containerBlock.rightChildren && containerBlock.rightChildren.some(child => child.id === block.id))
                )
              
              if (parentContainer) {
                setSelectedBlock(parentContainer)
                setActiveBlock(parentContainer.id)
                
                // Find which child this is in the parent container
                let childIndex = -1
                if (parentContainer.children) {
                  childIndex = parentContainer.children.findIndex(child => child.id === block.id)
                } else if (parentContainer.leftChildren) {
                  childIndex = parentContainer.leftChildren.findIndex(child => child.id === block.id)
                } else if (parentContainer.rightChildren) {
                  childIndex = parentContainer.rightChildren.findIndex(child => child.id === block.id)
                }
                
                if (childIndex !== -1) {
                  setSelectedChild({ blockId: parentContainer.id, childIndex })
                  // Clear column selection when selecting child
                  setSelectedColumn(null)
                }
                
                console.log('Selected parent container for paragraph:', parentContainer.id)
              }
              
              // Focus the textarea element after a short delay
              setTimeout(() => {
                try {
                  const textareaElement = e.currentTarget?.querySelector('textarea')
                  if (textareaElement && textareaElement.focus) {
                    textareaElement.focus()
                    // Place cursor at end of text
                    textareaElement.setSelectionRange(textareaElement.value.length, textareaElement.value.length)
                  }
                } catch (error) {
                  console.log('Focus error:', error)
                }
              }, 50)
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <textarea
              key={`paragraph-${block.id}`}
              value={block.content || ''}
              onChange={(e) => {
                updateBlock(block.id, { content: e.target.value })
                autoResizeTextarea(e.target)
              }}
              onKeyDown={handleKeyDown}
              onClick={handleTextareaClick}
              onFocus={handleTextareaFocus}
              onBlur={handleTextareaBlur}
              placeholder="Start typing..."
              className={block.styles?.textAlign ? `text-align-${block.styles.textAlign}` : 'text-align-left'}
            />
          </div>
        )

      case BLOCK_TYPES.IMAGE:
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block image-block ${selectedBlock?.id === block.id ? 'selected' : ''}`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation()
              setActiveBlock(block.id)
              
              // Find the parent container and select it
              const parentContainer = documentContent
                .flatMap(page => page.blocks)
                .find(containerBlock => 
                  (containerBlock.children && containerBlock.children.some(child => child.id === block.id)) ||
                  (containerBlock.leftChildren && containerBlock.leftChildren.some(child => child.id === block.id)) ||
                  (containerBlock.rightChildren && containerBlock.rightChildren.some(child => child.id === block.id))
                )
              
              if (parentContainer) {
                setSelectedBlock(parentContainer)
                setActiveBlock(parentContainer.id)
                
                // Find which child this is in the parent container
                let childIndex = -1
                if (parentContainer.children) {
                  childIndex = parentContainer.children.findIndex(child => child.id === block.id)
                } else if (parentContainer.leftChildren) {
                  childIndex = parentContainer.leftChildren.findIndex(child => child.id === block.id)
                } else if (parentContainer.rightChildren) {
                  childIndex = parentContainer.rightChildren.findIndex(child => child.id === block.id)
                }
                
                if (childIndex !== -1) {
                  setSelectedChild({ blockId: parentContainer.id, childIndex })
                  // Clear column selection when selecting child
                  setSelectedColumn(null)
                }
                
                console.log('Selected parent container for image:', parentContainer.id)
              }
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
            </div>
            <div 
              className="image-placeholder"
              onClick={(e) => {
                e.stopPropagation()
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = (e) => {
                  const file = e.target.files[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      updateBlock(block.id, { content: event.target.result })
                    }
                    reader.readAsDataURL(file)
                  }
                }
                input.click()
              }}
            >
              {block.content ? (
                <img 
                  src={block.content} 
                  alt="Uploaded"
                />
              ) : (
                <div className="image-upload-placeholder">
                  <span>Click to upload image</span>
                </div>
              )}
            </div>
          </div>
        )

      case BLOCK_TYPES.TABLE:
        const tableData = block.tableData || {
          headers: ['Header 1', 'Header 2', 'Header 3'],
          rows: [
            ['Row 1, Cell 1', 'Row 1, Cell 2', 'Row 1, Cell 3'],
            ['Row 2, Cell 1', 'Row 2, Cell 2', 'Row 2, Cell 3']
          ]
        }
        
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`content-block table-block ${selectedBlock?.id === block.id ? 'selected' : ''}`}
            style={baseStyle}
            onClick={(e) => {
              e.stopPropagation()
              setActiveBlock(block.id)
              
              // Find the parent container and select it
              const parentContainer = documentContent
                .flatMap(page => page.blocks)
                .find(containerBlock => 
                  (containerBlock.children && containerBlock.children.some(child => child.id === block.id)) ||
                  (containerBlock.leftChildren && containerBlock.leftChildren.some(child => child.id === block.id)) ||
                  (containerBlock.rightChildren && containerBlock.rightChildren.some(child => child.id === block.id))
                )
              
              if (parentContainer) {
                setSelectedBlock(parentContainer)
                setActiveBlock(parentContainer.id)
                
                // Find which child this is in the parent container
                let childIndex = -1
                if (parentContainer.children) {
                  childIndex = parentContainer.children.findIndex(child => child.id === block.id)
                } else if (parentContainer.leftChildren) {
                  childIndex = parentContainer.leftChildren.findIndex(child => child.id === block.id)
                } else if (parentContainer.rightChildren) {
                  childIndex = parentContainer.rightChildren.findIndex(child => child.id === block.id)
                }
                
                if (childIndex !== -1) {
                  setSelectedChild({ blockId: parentContainer.id, childIndex })
                  // Clear column selection when selecting child
                  setSelectedColumn(null)
                }
                
                console.log('Selected parent container for table:', parentContainer.id)
              }
            }}
          >
            <div className="block-controls child-controls">
              <button onClick={() => deleteBlock(block.id)}>×</button>
              <button className='addrow' onClick={() => handleTableEdit(block.id, 'addRow')}>+ Row</button>
              <button className='addcol' onClick={() => handleTableEdit(block.id, 'addColumn')}>+ Col</button>
            </div>
            <table>
              <thead>
                <tr>
                  {tableData.headers.map((header, colIndex) => (
                    <th key={colIndex}>
                      <input
                        type="text"
                        value={header}
                        onChange={(e) => handleTableEdit(block.id, 'updateHeader', { colIndex, value: e.target.value })}
                      />
                      {tableData.headers.length > 1 && (
                        <button
                          onClick={() => handleTableEdit(block.id, 'removeColumn', { colIndex })}
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
                          onChange={(e) => handleTableEdit(block.id, 'updateCell', { rowIndex, colIndex, value: e.target.value })}
                        />
                      </td>
                    ))}
                    <td className="table-action-cell">
                      {tableData.rows.length > 1 && (
                        <button
                          onClick={() => handleTableEdit(block.id, 'removeRow', { rowIndex })}
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
        )


      default:
        return null
    }
  }

  // Generate JSON schema for submission
  const generateReportSchema = () => {
    const schema = {
      documentSettings,
      pages: documentContent.map(page => ({
        id: page.id,
        blocks: page.blocks.map(block => ({
          id: block.id,
          type: block.type,
          content: block.content,
          styles: {
            ...block.styles,
            // Add proper spacing for document generation
            margin: block.type === BLOCK_TYPES.PARAGRAPH ? '0 0 10px 0' : 
                   block.type === BLOCK_TYPES.HEADING ? '0 0 15px 0' : 
                   block.type === BLOCK_TYPES.CONTAINER || block.type === BLOCK_TYPES.TWO_COLUMN ? '0 0 3px 0' :
                   block.styles?.margin || '0 0 3px 0',
            padding: block.styles?.padding || '0',
            lineHeight: block.type === BLOCK_TYPES.PARAGRAPH ? '1.6' : 
                       block.type === BLOCK_TYPES.HEADING ? '1.2' : 
                       block.styles?.lineHeight || 'normal',
            fontSize: block.type === BLOCK_TYPES.PARAGRAPH ? '12px' :
                     block.type === BLOCK_TYPES.HEADING ? 
                       (block.headingType === 'h1' ? '24px' : 
                        block.headingType === 'h2' ? '18px' :
                        block.headingType === 'h3' ? '16px' :
                        block.headingType === 'h4' ? '13px' :
                        block.headingType === 'h5' ? '12px' : '11px') :
                     block.styles?.fontSize || '12px',
            textAlign: block.styles?.textAlign || 'left'
          },
          ...block
        }))
      })),
      metadata: {
        generatedAt: new Date().toISOString(),
        totalPages: documentContent.length,
        totalBlocks: documentContent.reduce((acc, page) => acc + page.blocks.length, 0)
      }
    }
    return schema
  }

  // Submit report to backend
  const handleGenerateReport = () => {
    const reportSchema = generateReportSchema()
    console.log('Report Schema:', reportSchema)
    
    // TODO: Implement actual API call to backend
    alert('Report generated! Check console for JSON schema.')
  }

  const pageDimensions = getPageDimensions()

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
              const newPageSize = e.target.value
              setDocumentSettings(prev => ({ ...prev, pageSize: newPageSize }))
            }}
          >
            {Object.keys(PAGE_SIZES).map(size => (
              <option key={size} value={size}>{size}</option>
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
                const file = e.target.files[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    setDocumentSettings(prev => ({
                      ...prev,
                      background: { type: 'image', value: event.target.result }
                    }))
                  }
                  reader.readAsDataURL(file)
                }
              }}
              id="background-upload"
            />
            <button
              onClick={() => document.getElementById('background-upload').click()}
            >
              Upload Image
            </button>
            {documentSettings.background.value && (
              <button
                onClick={() => setDocumentSettings(prev => ({
                  ...prev,
                  background: { type: 'image', value: null }
                }))}
                className="remove-btn"
              >
                Remove
              </button>
            )}
          </div>
            <button onClick={handleGenerateReport} className="generate-btn">Generate Report</button>
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
                ? `Add to Two-Column (${selectedColumn === 'left' ? 'Left' : 'Right'}):`
                : "Select a column first:"
              : "Insert Blocks:"
            }
          </h4>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.CONTAINER); }}>Container</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.TWO_COLUMN); }}>Two Columns</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: 'h1' }); }}>H1</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: 'h2' }); }}>H2</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: 'h3' }); }}>H3</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: 'h4' }); }}>H4</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: 'h5' }); }}>H5</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.HEADING, { headingType: 'h6' }); }}>H6</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.PARAGRAPH); }}>Paragraph</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.IMAGE); }}>Image</button>
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleToolbarClick(BLOCK_TYPES.TABLE); }}>Table</button>
        </div>
        
        <div className="toolbar-section">
          {(selectedChild || focusedInput) && (
            <div className="alignment-controls">
              <span>Alignment:</span>
              <button 
                className={selectedAlignment === 'left' ? 'active' : ''}
                onClick={() => handleAlignmentChange('left')}
              >
                Left
              </button>
              <button 
                className={selectedAlignment === 'center' ? 'active' : ''}
                onClick={() => handleAlignmentChange('center')}
              >
                Center
              </button>
              <button 
                className={selectedAlignment === 'right' ? 'active' : ''}
                onClick={() => handleAlignmentChange('right')}
              >
                Right
              </button>
            </div>
          )}
          <button onClick={() => redistributeContentImmediate()} className="debug-btn" title="Force content redistribution">Redistribute Content</button>
        </div>
      </div>

      {/* Document Canvas */}
      <div className="document-canvas" ref={documentRef}>
        {documentContent.map((page, pageIndex) => (
          <div
            key={page.id}
            data-page-id={page.id}
            className={`document-page ${page.isOverflowing ? 'page-overflow' : ''}`}
            style={{
              width: pageDimensions.width,
              minHeight: pageDimensions.height,
              maxHeight: pageDimensions.height * 1.1, // Allow slight expansion but limit it
              margin: '30px auto',
              padding: `${inToPx(pageDimensions.margins.top)}px ${inToPx(pageDimensions.margins.right)}px ${inToPx(pageDimensions.margins.bottom)}px ${inToPx(pageDimensions.margins.left)}px`,
              backgroundImage: documentSettings.background.value ? `url(${documentSettings.background.value})` : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundColor: documentSettings.background.value ? 'transparent' : '#ffffff',
              border: '1px solid #ccc',
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
              position: 'relative',
              overflow: 'visible' // Allow content to show while pagination works
            }}
            onClick={(e) => handlePageClick(page.id, e)}
          >
            <div className="page-header">
              <span>Page {pageIndex + 1}</span>
            </div>
            
            <div className="page-content">
              {page.blocks.map((block, blockIndex) => (
                <div key={block.id}>
                  {renderBlock(block)}
                </div>
              ))}
              
              {page.blocks.length === 0 && (
                <div className="empty-page-placeholder">
                  <p>Click anywhere on this page to start typing...</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CustomReport
