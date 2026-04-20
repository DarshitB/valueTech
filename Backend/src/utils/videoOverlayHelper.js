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

// Overlay sizing baseline.
//
// A fixed pixel font size can never look consistent across videos at different
// resolutions (28px is tiny on 4K, huge on 480p). To get the same VISUAL size
// of the overlay regardless of input resolution we scale the font by the
// video's SHORTER dimension (min of width and height) — this is orientation-
// independent so landscape and portrait recordings get matching-looking text.
//
// Calibration:
//   min(w,h) = 1080  -> 28px  (empirical "perfect" size on 1080p)
//   min(w,h) = 720   -> 19px
//   min(w,h) = 480   -> 14px (floor)
//   min(w,h) = 2160  -> 48px (ceiling)
const BASE_FONT_SIZE = 28;
const BASE_MIN_DIM = 1080;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 48;

function computeFontSize(videoWidth, videoHeight) {
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return BASE_FONT_SIZE;
  }
  const minDim = Math.min(videoWidth, videoHeight);
  const scaled = Math.round((minDim * BASE_FONT_SIZE) / BASE_MIN_DIM);
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, scaled));
}

/**
 * Split text on "|", trim each segment, and build one drawtext filter per line
 * stacked bottom-to-top at the bottom-right corner.
 *
 * FFmpeg's drawtext filter does not support \n, so multi-line text requires
 * multiple chained filters with calculated y offsets. Each visual element
 * (font, line gap, corner padding) is derived from the font size so the
 * overlay looks proportionally identical on every resolution.
 */
function buildDrawtextFilters(text, fontSize) {
  const fontPart = FONT_FILE ? `fontfile='${FONT_FILE}':` : '';
  const lines = text.split('|').map((l) => l.trim()).filter(Boolean);
  const n = lines.length;

  // At the 28px baseline these evaluate to LINE_HEIGHT=38 and PAD=20 — the
  // exact values used by the previous fixed-size implementation, so 1080p
  // output is pixel-identical to before.
  const lineHeight = fontSize + Math.round(fontSize * (10 / 28));
  const pad = Math.max(10, Math.round(fontSize * (20 / 28)));

  return lines.map((line, i) => {
    const escaped = escapeDrawtext(line);
    const distFromBottom = (n - 1 - i) * lineHeight + pad;

    return (
      `drawtext=${fontPart}` +
      `text='${escaped}'` +
      `:fontcolor=white` +
      `:fontsize=${fontSize}` +
      `:x=w-tw-${pad}` +
      `:y=h-th-${distFromBottom}` +
      `:box=1` +
      `:boxcolor=black@0.5` +
      `:boxborderw=8`
    );
  });
}

/**
 * Probe the input video and return { width, height } in pixels, or null for
 * both if probing fails. On failure we fall back to the baseline 28px font,
 * which is the same behaviour as the original fixed-size helper.
 */
function probeVideoDimensions(inputPath) {
  return new Promise((resolve) => {
    try {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err || !data || !Array.isArray(data.streams)) {
          return resolve({ width: null, height: null });
        }
        const videoStream = data.streams.find(
          (s) => s && s.codec_type === 'video'
        );
        if (!videoStream) return resolve({ width: null, height: null });
        resolve({
          width: Number.isFinite(videoStream.width) ? videoStream.width : null,
          height: Number.isFinite(videoStream.height) ? videoStream.height : null,
        });
      });
    } catch (_) {
      resolve({ width: null, height: null });
    }
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
async function burnTextOnVideo(inputPath, text, ext = 'mp4') {
  const safeExt = normalizeVideoExt(ext);
  const outputPath = path.join(os.tmpdir(), `${uuidv4()}-overlay.${safeExt}`);

  // Auto-size the overlay based on the shorter edge of the source video so
  // text is visually consistent across 480p / 720p / 1080p / 4K and
  // landscape vs portrait alike. 1080p videos land on 28px — identical to
  // the previous fixed-size behaviour — so nothing regresses for your
  // already-perfect test case.
  const { width, height } = await probeVideoDimensions(inputPath);
  const fontSize = computeFontSize(width, height);
  const filters = buildDrawtextFilters(text, fontSize);

  return new Promise((resolve, reject) => {
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
