import fs from "fs/promises";
import path from "path";

/** Stored keys always use `/` so paths work on Windows and Linux. */

export function getUploadRoot() {
  const root = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  return path.resolve(root);
}

/** @param {string} name */
export function safeFileSegment(name) {
  const base = path.basename(name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return base || "file";
}

/**
 * @param {string} userId
 * @param {string} profileId
 * @param {string} originalName
 */
export function newStoredRelativeKey(userId, profileId, originalName) {
  const safe = safeFileSegment(originalName);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `user-${userId}/profile-${profileId}/${id}-${safe}`;
}

/**
 * Resolve absolute path; throws if outside upload root.
 * @param {string} relativeKey - forward slashes
 */
export function absolutePathForKey(relativeKey) {
  const root = getUploadRoot();
  const parts = String(relativeKey || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error("Invalid file path");
  }
  const full = path.resolve(root, ...parts);
  const rootResolved = path.resolve(root);
  if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
    throw new Error("Invalid file path");
  }
  return full;
}

/**
 * @param {string} relativeKey
 */
export async function deleteFileIfExists(relativeKey) {
  try {
    const abs = absolutePathForKey(relativeKey);
    await fs.unlink(abs);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

/**
 * @param {string} relativeKey
 * @param {Buffer} buffer
 */
export async function writeFileEnsured(relativeKey, buffer) {
  const abs = absolutePathForKey(relativeKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
}
