import { BorderStyleTypes, Range } from "@univerjs/core";
import { Border, SpreadsheetSkeleton } from "@univerjs/engine-render";

const BLUR_OFFSET = 0.5;
const STRAIGHT_BORDER = new Set(["t", "b", "l", "r"]);

/**
 * The open sheet paints every border edge with its own canvas stroke, and
 * builds the same cell style twice while scrolling. This keeps the pixels
 * and only cuts that repeated work. It does not change stored cells.
 */
export function installSmoothSheetPaint() {
  if (SpreadsheetSkeleton.prototype.__companySmoothPaint) return;
  SpreadsheetSkeleton.prototype.__companySmoothPaint = true;
  patchStyleWork();
  patchBorderDraw();
}

function patchStyleWork() {
  const skeleton = SpreadsheetSkeleton.prototype;
  const originalSetStyles = skeleton.setStylesCache;
  const originalSetCell = skeleton._setStylesCacheForOneCell;

  skeleton.setStylesCache = function setStylesCache(vpInfo) {
    const worksheet = this.worksheet;
    this.__paintRowFull = { row: -2, start: Infinity, end: -1 };
    if (!worksheet || worksheet.__paintCompose) {
      return originalSetStyles.call(this, vpInfo);
    }

    const styleCache = new Map();
    const originalCompose = worksheet.getComposedCellStyleByCellData.bind(worksheet);
    worksheet.getComposedCellStyleByCellData = (row, col, cell) =>
      composedStyle(worksheet, styleCache, originalCompose, row, col, cell);
    worksheet.__paintCompose = true;
    try {
      return originalSetStyles.call(this, vpInfo);
    } finally {
      worksheet.getComposedCellStyleByCellData = originalCompose;
      worksheet.__paintCompose = false;
    }
  };

  skeleton._setStylesCacheForOneCell = function setStylesCacheForOneCell(row, col, options) {
    const cacheItem = options && options.cacheItem;
    const fontOnly = cacheItem && cacheItem.bg === false && cacheItem.border === false;
    const rowFull = this.__paintRowFull || { row: -2, start: Infinity, end: -1 };
    if (row !== rowFull.row) {
      rowFull.row = row;
      rowFull.start = Infinity;
      rowFull.end = -1;
      this.__paintRowFull = rowFull;
    }
    if (fontOnly && col >= rowFull.start && col <= rowFull.end) {
      return;
    }
    originalSetCell.call(this, row, col, options);
    if (!fontOnly) {
      if (col < rowFull.start) rowFull.start = col;
      if (col > rowFull.end) rowFull.end = col;
    }
  };
}

function composedStyle(worksheet, styleCache, originalCompose, row, col, cell) {
  const styleId = cell && typeof cell.s === "string" ? cell.s : "";
  if (!styleId || cell.themeStyle || worksheet.getRowStyle(row) || worksheet.getColumnStyle(col)) {
    return originalCompose(row, col, cell);
  }
  const cached = styleCache.get(styleId);
  if (cached) return cached;
  const composed = originalCompose(row, col, cell);
  styleCache.set(styleId, composed);
  return composed;
}

function patchBorderDraw() {
  const originalRender = Border.prototype.renderBorderByCell;

  Border.prototype.draw = function draw(ctx, _parentScale, spreadsheetSkeleton, diffRanges, drawInfo) {
    const viewRanges = drawInfo && drawInfo.viewRanges;
    const {
      stylesCache,
      overflowCache,
      worksheet,
      rowHeightAccumulation,
      columnWidthAccumulation,
      columnTotalWidth,
      rowTotalHeight,
    } = spreadsheetSkeleton;
    if (!worksheet || !viewRanges) return;
    if (
      !rowHeightAccumulation ||
      !columnWidthAccumulation ||
      columnTotalWidth === undefined ||
      rowTotalHeight === undefined
    ) {
      return;
    }
    const border = stylesCache && stylesCache.border;
    if (!border) return;

    const precisionScale = this._getScale(ctx.getScale());
    const renderBorderContext = {
      ctx,
      precisionScale,
      overflowCache,
      diffRanges,
      viewRanges,
      spreadsheetSkeleton,
    };
    const batches = new Map();

    ctx.save();
    ctx.translateWithPrecisionRatio(BLUR_OFFSET, BLUR_OFFSET);
    viewRanges.forEach((range) => {
      Range.foreach(range, (row, col) => {
        const borderConfig = border.getValue(row, col);
        if (!borderConfig) return;
        if (!isSimpleBorder(borderConfig)) {
          originalRender.call(this, renderBorderContext, row, col, borderConfig);
          return;
        }
        queueSimpleBorder(this, renderBorderContext, batches, row, col, borderConfig);
      });
    });
    flushBorderBatches(ctx, batches);
    ctx.restore();
  };
}

function isSimpleBorder(borderConfig) {
  for (const key in borderConfig) {
    const item = borderConfig[key];
    if (!item || item.style === BorderStyleTypes.NONE) continue;
    if (!STRAIGHT_BORDER.has(item.type) || item.style === BorderStyleTypes.DOUBLE) return false;
  }
  return true;
}

function queueSimpleBorder(extension, renderBorderContext, batches, row, col, borderConfig) {
  const { ctx, precisionScale, overflowCache, spreadsheetSkeleton } = renderBorderContext;
  const cellInfo = spreadsheetSkeleton.getCellWithCoordByIndex(row, col, false);
  if (!cellInfo) return;
  const { isMerged, mergeInfo } = cellInfo;
  if (!isMerged) {
    if (!spreadsheetSkeleton.worksheet.getRowVisible(row)) return;
    if (!spreadsheetSkeleton.worksheet.getColVisible(col)) return;
  }
  if (!extension.isRenderDiffRangesByRow(mergeInfo.startRow, mergeInfo.endRow, renderBorderContext.diffRanges)) {
    return;
  }

  for (const key in borderConfig) {
    const item = borderConfig[key];
    if (!item || item.style === BorderStyleTypes.NONE) continue;
    if (extension._getOverflowExclusion(overflowCache, item.type, row, col)) continue;
    const lineWidth = lineWidthFor(item.style);
    const lineWidthBuffer = (lineWidth - 1) / 2 / precisionScale;
    const batchKey = `${item.style}|${lineWidth}|${item.color || "rgb(0,0,0)"}`;
    let batch = batches.get(batchKey);
    if (!batch) {
      batch = {
        style: item.style,
        color: item.color || "rgb(0,0,0)",
        lineWidth,
        segments: [],
      };
      batches.set(batchKey, batch);
    }
    batch.segments.push(segmentFor(item.type, lineWidthBuffer, cellInfo));
  }
}

function segmentFor(type, lineWidthBuffer, cellInfo) {
  const { startX, startY, endX, endY } = cellInfo;
  if (type === "t") {
    return [startX - lineWidthBuffer, startY, endX + lineWidthBuffer, startY];
  }
  if (type === "b") {
    return [startX - lineWidthBuffer, endY, endX - lineWidthBuffer, endY];
  }
  if (type === "l") {
    return [startX, startY - lineWidthBuffer, startX, endY + lineWidthBuffer];
  }
  return [endX, startY - lineWidthBuffer, endX, endY + lineWidthBuffer];
}

function flushBorderBatches(ctx, batches) {
  batches.forEach((batch) => {
    setLineType(ctx, batch.style);
    ctx.setLineWidthByPrecision(batch.lineWidth);
    ctx.strokeStyle = batch.color;
    ctx.beginPath();
    batch.segments.forEach((segment) => {
      ctx.moveToByPrecision(segment[0], segment[1]);
      ctx.lineToByPrecision(segment[2], segment[3]);
    });
    ctx.stroke();
  });
}

function lineWidthFor(style) {
  if (
    style === BorderStyleTypes.MEDIUM ||
    style === BorderStyleTypes.MEDIUM_DASH_DOT ||
    style === BorderStyleTypes.MEDIUM_DASHED ||
    style === BorderStyleTypes.MEDIUM_DASH_DOT_DOT
  ) {
    return 2;
  }
  if (style === BorderStyleTypes.THICK) return 3;
  return 1;
}

function setLineType(ctx, style) {
  if (style === BorderStyleTypes.HAIR) ctx.setLineDash([1, 1]);
  else if (
    style === BorderStyleTypes.DASH_DOT_DOT ||
    style === BorderStyleTypes.MEDIUM_DASH_DOT_DOT
  ) ctx.setLineDash([2, 2, 5, 2, 2]);
  else if (
    style === BorderStyleTypes.DASH_DOT ||
    style === BorderStyleTypes.MEDIUM_DASH_DOT ||
    style === BorderStyleTypes.SLANT_DASH_DOT
  ) ctx.setLineDash([2, 5, 2]);
  else if (style === BorderStyleTypes.DOTTED) ctx.setLineDash([2]);
  else if (style === BorderStyleTypes.DASHED || style === BorderStyleTypes.MEDIUM_DASHED) ctx.setLineDash([3]);
  else ctx.setLineDash([0]);
}
