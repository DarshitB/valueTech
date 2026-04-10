const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Use bundled ffmpeg binary so no system-level install is required
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// MIME sub-types that don't map to a valid ffmpeg output extension as-is
const MIME_EXT_MAP = {
  quicktime:    'mov',
  'x-msvideo':  'avi',
  'x-matroska': 'mkv',
  'x-m4v':      'mp4',
  '3gpp':       '3gp',
  mpeg:         'mpg',
};

// Font search order: Linux VPS paths first, then macOS fallbacks
const FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/System/Library/Fonts/HelveticaNeue.ttc',
  '/System/Library/Fonts/Geneva.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
];

function findFontFile() {
  for (const f of FONT_CANDIDATES) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Resolve once at startup so we don't hit the filesystem on every request
const FONT_FILE = findFontFile();

/**
 * Convert a raw MIME sub-type (e.g. "quicktime") to a valid container extension.
 */
function normalizeVideoExt(rawExt) {
  if (!rawExt) return 'mp4';
  return MIME_EXT_MAP[rawExt.toLowerCase()] || rawExt;
}

/**
 * Escape special characters that ffmpeg's drawtext filter treats as syntax:
 *   \  '  :
 * Order matters — backslash must be escaped first.
 */
function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

const FONT_SIZE = 28;
const LINE_HEIGHT = FONT_SIZE + 10; // gap between lines

/**
 * Split text on "|", trim each segment, and build one drawtext filter per line
 * stacked bottom-to-top at the bottom-right corner.
 *
 * FFmpeg's drawtext filter does not support \n, so multi-line text requires
 * multiple chained filters with calculated y offsets.
 */
function buildDrawtextFilters(text) {
  const fontPart = FONT_FILE ? `fontfile='${FONT_FILE}':` : '';
  const lines = text.split('|').map((l) => l.trim()).filter(Boolean);
  const n = lines.length;

  return lines.map((line, i) => {
    const escaped = escapeDrawtext(line);
    // Bottom line (i = n-1) sits 20px from the bottom edge.
    // Each line above it is offset by LINE_HEIGHT px further up.
    const distFromBottom = (n - 1 - i) * LINE_HEIGHT + 20;

    return (
      `drawtext=${fontPart}` +
      `text='${escaped}'` +
      `:fontcolor=white` +
      `:fontsize=${FONT_SIZE}` +
      `:x=w-tw-20` +
      `:y=h-th-${distFromBottom}` +
      `:box=1` +
      `:boxcolor=black@0.5` +
      `:boxborderw=8`
    );
  });
}

/**
 * Burn `text` onto a video at the bottom-right corner.
 *  - Pipe characters (|) in the text become separate lines.
 *  - White text with a semi-transparent black box for readability.
 *  - Audio stream is copied as-is (no re-encode).
 *  - Pixel format is normalised to yuv420p for broad device compatibility.
 *
 * @param {string} inputPath  - Absolute path to the source video temp file.
 * @param {string} text       - Text to burn in; use "|" as a line separator.
 * @param {string} [ext]      - Raw MIME sub-type / extension hint (default: 'mp4').
 * @returns {Promise<string>} - Resolves with the absolute path of the overlaid temp file.
 *
 * The CALLER is responsible for cleaning up both inputPath and the returned path.
 */
function burnTextOnVideo(inputPath, text, ext = 'mp4') {
  return new Promise((resolve, reject) => {
    const safeExt = normalizeVideoExt(ext);
    const outputPath = path.join(os.tmpdir(), `${uuidv4()}-overlay.${safeExt}`);

    const filters = buildDrawtextFilters(text);

    ffmpeg(inputPath)
      .videoFilters(filters)
      .outputOptions([
        '-c:a copy',          // copy audio without re-encoding
        '-preset fast',       // faster encode
        '-pix_fmt yuv420p',   // normalise pixel format — required for some iPhone videos
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) =>
        reject(new Error(`Video text overlay failed: ${err.message}`))
      )
      .run();
  });
}

module.exports = { burnTextOnVideo, normalizeVideoExt };
