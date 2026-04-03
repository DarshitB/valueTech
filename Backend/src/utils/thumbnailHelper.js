const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { ensureDirectoryExists, UPLOADS_BASE_DIR } = require("./localFileHelper");

const THUMB_MAX_SIZE = 400;
const THUMB_WEBP_QUALITY = 80;

/**
 * Generate a WebP thumbnail from an image and save to .../thumbs/<basename>.webp.
 * Does not throw: on error (e.g. corrupt file, not an image), logs and returns.
 * @param {string} sourceFilePath - Absolute path to the image file on disk
 * @returns {Promise<void>}
 */
async function generateAndSaveThumbnail(sourceFilePath) {
  try {
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      return;
    }
    const dir = path.dirname(sourceFilePath);
    const thumbsDir = path.join(dir, "thumbs");
    ensureDirectoryExists(thumbsDir);

    const ext = path.extname(sourceFilePath);
    const basename = path.basename(sourceFilePath, ext);
    const destPath = path.join(thumbsDir, `${basename}.webp`);

    await sharp(sourceFilePath)
      .resize(THUMB_MAX_SIZE, THUMB_MAX_SIZE, { fit: "inside" })
      .webp({ quality: THUMB_WEBP_QUALITY })
      .toFile(destPath);
  } catch (err) {
    console.warn("Thumbnail generation failed:", sourceFilePath, err.message);
  }
}

/**
 * Derive thumbnail_url from media_url using convention:
 * /uploads/.../images/photo.jpg -> /uploads/.../images/thumbs/photo.webp
 * @param {string} mediaUrl - e.g. /uploads/2025/Feb/ORD123/images/photo.jpg
 * @returns {string|null} thumbnail_url or null if mediaUrl is invalid/empty
 */
function getThumbnailUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;
  const lastSlash = mediaUrl.lastIndexOf("/");
  if (lastSlash === -1) return null;
  const dirPart = mediaUrl.slice(0, lastSlash);
  const filename = mediaUrl.slice(lastSlash + 1);
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext) || filename;
  return `${dirPart}/thumbs/${basename}.webp`;
}

/**
 * Return thumbnail_url only if the thumbnail file exists on disk (e.g. for GET APIs).
 * @param {string} mediaUrl - e.g. /uploads/2025/Feb/ORD123/images/photo.jpg
 * @returns {string|null} thumbnail_url if file exists, else null
 */
function getThumbnailUrlIfExists(mediaUrl) {
  const thumbUrl = getThumbnailUrl(mediaUrl);
  if (!thumbUrl) return null;
  const relative = thumbUrl.replace(/^\/uploads\/?/, "").replace(/\//g, path.sep);
  const thumbPath = path.join(UPLOADS_BASE_DIR, relative);
  return fs.existsSync(thumbPath) ? thumbUrl : null;
}

module.exports = {
  generateAndSaveThumbnail,
  getThumbnailUrl,
  getThumbnailUrlIfExists,
};
