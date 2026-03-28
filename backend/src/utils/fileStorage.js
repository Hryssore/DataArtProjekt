import crypto from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export async function ensureDirectory(pathname) {
  await mkdir(pathname, { recursive: true });
}

export function buildStoredFilename(originalName) {
  const extension = extname(originalName) || "";
  return `${crypto.randomUUID()}${extension}`;
}

export async function moveUploadedFile(sourcePath, targetDir, originalName) {
  const storedName = buildStoredFilename(originalName);
  const targetPath = join(targetDir, storedName);
  await ensureDirectory(targetDir);
  await rename(sourcePath, targetPath);

  return {
    storedName,
    storagePath: targetPath,
    originalName: basename(originalName),
  };
}

export async function deleteFileIfExists(pathname) {
  try {
    await unlink(pathname);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
