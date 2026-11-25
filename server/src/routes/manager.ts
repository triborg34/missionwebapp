import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { optionalText, paginationSchema, parse, text } from '../lib/validation.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assetStatus, parseAssetType, readAsset, removeAsset, setAsset } from '../services/assets.js';
import { userDto } from './auth.js';
import { missionInclude } from '../services/missions.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

export const managerRouter = Router();
managerRouter.use(requireAuth(), requireRole('MANAGER'));

managerRouter.get('/profile', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { department: true } });
  res.json({ user: userDto(user), assets: await assetStatus(user.id) });
});

const profileSchema = z.object({
  jobTitle: text('سمت سازمانی', 2, 120),
  phone: optionalText('شماره تماس', 20),
});

managerRouter.patch('/profile', async (req, res) => {
  const body = parse(profileSchema, req.body);
  // Managers may only change their own official position and phone; not role or identity.
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { jobTitle: body.jobTitle, phone: body.phone ?? null },
  });
  await audit(req, { action: 'MANAGER_PROFILE_UPDATED', entityType: 'User', entityId: req.user!.id });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { department: true } });
  res.json({ user: userDto(user) });
});

managerRouter.put('/assets/:type', upload.single('file'), async (req, res) => {
  const type = parseAssetType(req.params.type);
  res.json(await setAsset(req, req.user!.id, type, req.file));
});

managerRouter.delete('/assets/:type', async (req, res) => {
  const type = parseAssetType(req.params.type);
  res.json(await removeAsset(req, req.user!.id, type));
});

managerRouter.get('/assets/:type/file', async (req, res) => {
  const type = parseAssetType(req.params.type);
  const { mime, buf } = await readAsset(req.user!.id, type);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
});

// Approval history of this manager's decisions.
managerRouter.get('/decisions', async (req, res) => {
  const { page, pageSize } = parse(paginationSchema, req.query);
  const where = { decidedById: req.user!.id };
  const [total, rows] = await Promise.all([
    prisma.mission.count({ where }),
    prisma.mission.findMany({
      where,
      include: missionInclude,
      orderBy: { decidedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  res.json({
    total,
    page,
    pageSize,
    items: rows.map((m) => ({
      id: m.id,
      missionNumber: m.missionNumber,
      status: m.status,
      employee: { fullName: m.employee.fullName, employeeCode: m.employee.employeeCode },
      destination: m.destination,
      missionDate: m.missionDate,
      decidedAt: m.decidedAt?.toISOString() ?? null,
      rejectionReason: m.rejectionReason,
    })),
  });
});
