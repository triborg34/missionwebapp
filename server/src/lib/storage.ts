import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest } from './errors.js';
import { sha256 } from './security.js';

export type ImageMime = 'image/png' | 'image/jpeg';

/** Detects PNG/JPEG by magic bytes. Client-supplied MIME types and names are ignored. */
export function detectImage(buf: Buffer): { mime: ImageMime; ext: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  return null;
}

/** Validates an uploaded image buffer (type by magic bytes, size limit). */
export function validateImageUpload(file: Express.Multer.File | undefined, label: string) {
  if (!file) throw badRequest(`فایل ${label} ارسال نشده است`, { file: 'فایل الزامی است' });
  if (file.size > config.maxUploadBytes) {
    throw badRequest(`حجم فایل ${label} نباید بیشتر از ۲ مگابایت باشد`, { file: 'حجم فایل زیاد است' });
  }
  const detected = detectImage(file.buffer);
  if (!detected) {
    throw badRequest(`فرمت فایل ${label} باید PNG، JPG یا JPEG باشد`, { file: 'فرمت فایل پشتیبانی نمی‌شود' });
  }
  return { ...detected, sha256: sha256(file.buffer) };
}

/** Writes a file below the storage directory and returns its relative path. */
export async function writeStoredFile(subdir: string, buffer: Buffer, ext: string): Promise<string> {
  const dir = path.join(config.storageDir, subdir);
  await fs.mkdir(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, name), buffer, { mode: 0o600 });
  return path.posix.join(subdir, name);
}

/** Resolves a DB-stored relative path, refusing anything that escapes the storage dir. */
export function resolveStoredPath(relative: string): string {
  const root = path.resolve(config.storageDir);
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage path');
  return full;
}

export async function readStoredFile(relative: string): Promise<Buffer> {
  return fs.readFile(resolveStoredPath(relative));
}

export async function removeStoredFile(relative: string | null | undefined): Promise<void> {
  if (!relative) return;
  await fs.rm(resolveStoredPath(relative), { force: true });
}

/** Copies a stored file to a new frozen location (used to freeze approval assets). */
export async function freezeCopy(relative: string | null | undefined, subdir: string): Promise<string | null> {
  if (!relative) return null;
  const buf = await readStoredFile(relative);
  const detected = detectImage(buf);
  if (!detected) throw new Error('Stored asset is not a supported image');
  return writeStoredFile(subdir, buf, detected.ext);
}

export function dataUri(mime: string, buf: Buffer): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}
