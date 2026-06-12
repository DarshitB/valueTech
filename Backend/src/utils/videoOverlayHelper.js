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

// CSS equivalent: font-family: 'Roboto', 'Arial', sans-serif; font-weight: 500;
// FFmpeg drawtext requires a TTF path — weight comes from the font file (Roboto Medium = 500).
const BUNDLED_FONTS_DIR = path.join(__dirname, '../fonts');

const FONT_CANDIDATES = [
  path.join(BUNDLED_FONTS_DIR, 'Roboto-Medium.ttf'),
  path.join(BUNDLED_FONTS_DIR, 'Roboto-Regular.ttf'),
  '/usr/share/fonts/truetype/roboto/unhinted/Roboto-Medium.ttf',
  '/usr/share/fonts/truetype/roboto/hinted/Roboto-Medium.ttf',
  '/Library/Fonts/Arial.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

// Font size by video shorter side (min of width × height):
//   480p -> 14px | 720p -> 16px | 1080p -> 18px | above -> 20px
function computeFontSize(videoWidth, videoHeight) {
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return 14;
  }
  const minDim = Math.min(videoWidth, videoHeight);
  if (minDim <= 360) return 7;
  if (minDim <= 480) return 9;
  if (minDim <= 540) return 12;
  if (minDim <= 720) return 16;
  if (minDim <= 1080) return 25;
  return 30;
}

function overlayMetrics(fontSize) {
  return {
    lineGap: Math.round(fontSize * (5 / 14)),
    pad: Math.max(10, Math.round(fontSize * (10 / 14))),
    boxBorder: Math.max(4, Math.round(fontSize * (4 / 14))),
  };
}

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

/**
 * Split text on "|", trim each segment, and build one drawtext filter per line
 * stacked bottom-to-top at the bottom-right corner.
 *
 * FFmpeg's drawtext filter does not support \n, so multi-line text requires
 * multiple chained filters with calculated y offsets.
 */
function buildDrawtextFilters(text, fontSize) {
  const fontPart = FONT_FILE ? `fontfile='${FONT_FILE}':` : '';
  const lines = text.split('|').map((l) => l.trim()).filter(Boolean);
  const n = lines.length;
  const { lineGap, pad, boxBorder } = overlayMetrics(fontSize);
  const lineHeight = fontSize + lineGap;

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
      `:boxborderw=${boxBorder}`
    );
  });
}

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
 *  - Roboto Medium (weight 500); 14px (480p), 16px (720p), 18px (1080p), 20px (4K+).
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
