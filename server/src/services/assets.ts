import type { Request } from 'express';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  readStoredFile,
  removeStoredFile,
  validateImageUpload,
  writeStoredFile,
} from '../lib/storage.js';
import { detectImage } from '../lib/storage.js';

export const ASSET_TYPES = ['SIGNATURE', 'STAMP'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export function parseAssetType(value: unknown): AssetType {
  const type = String(value).toUpperCase() as AssetType;
  if (!ASSET_TYPES.includes(type)) throw notFound('نوع فایل نامعتبر است');
  return type;
}

export async function assetStatus(managerId: number) {
  const assets = await prisma.managerAsset.findMany({ where: { managerId } });
  const pick = (type: AssetType) => {
    const a = assets.find((x) => x.type === type);
    return a ? { uploadedAt: a.uploadedAt.toISOString(), sizeBytes: a.sizeBytes, mimeType: a.mimeType } : null;
  };
  return { SIGNATURE: pick('SIGNATURE'), STAMP: pick('STAMP') };
}

/** Replaces (or creates) a manager's signature or stamp. Only the manager or an admin may call this. */
export async function setAsset(
  req: Request,
  managerId: number,
  type: AssetType,
  file: Express.Multer.File | undefined,
) {
  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager || manager.role !== 'MANAGER') throw notFound('مدیر موردنظر یافت نشد');

  const label = type === 'SIGNATURE' ? 'امضا' : 'مهر';
  const info = validateImageUpload(file, label);
  const filePath = await writeStoredFile(`managers/${managerId}`, file!.buffer, info.ext);

  const previous = await prisma.managerAsset.findUnique({
    where: { managerId_type: { managerId, type } },
  });
  await prisma.managerAsset.upsert({
    where: { managerId_type: { managerId, type } },
    create: { managerId, type, filePath, mimeType: info.mime, sizeBytes: file!.size, sha256: info.sha256 },
    update: { filePath, mimeType: info.mime, sizeBytes: file!.size, sha256: info.sha256, uploadedAt: new Date() },
  });
  // Previous file is removed only after the DB points to the new one. Already-approved
  // documents hold their own frozen copies, so they are not affected.
  if (previous) await removeStoredFile(previous.filePath);

  await audit(req, { action: 'MANAGER_ASSET_UPDATED', entityType: 'User', entityId: managerId, details: { type } });
  return assetStatus(managerId);
}

export async function removeAsset(req: Request, managerId: number, type: AssetType) {
  const existing = await prisma.managerAsset.findUnique({
    where: { managerId_type: { managerId, type } },
  });
  if (!existing) throw badRequest('فایلی برای حذف وجود ندارد');
  await prisma.managerAsset.delete({ where: { id: existing.id } });
  await removeStoredFile(existing.filePath);
  await audit(req, { action: 'MANAGER_ASSET_REMOVED', entityType: 'User', entityId: managerId, details: { type } });
  return assetStatus(managerId);
}

export async function readAsset(managerId: number, type: AssetType): Promise<{ mime: string; buf: Buffer }> {
  const existing = await prisma.managerAsset.findUnique({
    where: { managerId_type: { managerId, type } },
  });
  if (!existing) throw notFound('فایلی ثبت نشده است');
  const buf = await readStoredFile(existing.filePath);
  const detected = detectImage(buf);
  if (!detected) throw notFound('فایل معتبر نیست');
  return { mime: detected.mime, buf };
}
