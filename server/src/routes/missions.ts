import { Router } from 'express';
import { prisma } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { todayJalaliStamp } from '../lib/jalali.js';
import {
  approveMission,
  cancelMission,
  createMission,
  getMission,
  listMissions,
  missionSummary,
  rejectMission,
  updateMission,
} from '../services/missions.js';
import { missionsWorkbook } from '../services/export.js';
import { renderApprovalPdf, type ApprovalSnapshot } from '../services/pdf.js';

export const missionsRouter = Router();
missionsRouter.use(requireAuth());

const idParam = (value: unknown) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
};

missionsRouter.get('/', async (req, res) => {
  res.json(await listMissions(req.user!, req.query));
});

missionsRouter.get('/summary', async (req, res) => {
  res.json(await missionSummary(req.user!));
});

missionsRouter.get('/export.xlsx', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const buf = await missionsWorkbook(req.user!, req.query);
  const stamp = todayJalaliStamp();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="missions-${stamp}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

missionsRouter.post('/', requireRole('EMPLOYEE'), async (req, res) => {
  res.status(201).json(await createMission(req.user!, req.body, req));
});

missionsRouter.get('/:id', async (req, res) => {
  res.json(await getMission(req.user!, idParam(req.params.id)));
});

missionsRouter.patch('/:id', requireRole('EMPLOYEE'), async (req, res) => {
  res.json(await updateMission(req.user!, idParam(req.params.id), req.body, req));
});

missionsRouter.post('/:id/cancel', requireRole('EMPLOYEE'), async (req, res) => {
  res.json(await cancelMission(req.user!, idParam(req.params.id), req));
});

missionsRouter.post('/:id/approve', requireRole('MANAGER'), async (req, res) => {
  res.json(await approveMission(req.user!, idParam(req.params.id), req));
});

missionsRouter.post('/:id/reject', requireRole('MANAGER'), async (req, res) => {
  res.json(await rejectMission(req.user!, idParam(req.params.id), req.body, req));
});

// Official PDF: rendered only from the frozen approval snapshot, never from live mission data.
missionsRouter.get('/:id/pdf', async (req, res) => {
  const id = idParam(req.params.id);
  const mission = await getMission(req.user!, id); // enforces scope (404 for others)
  if (mission.status !== 'APPROVED') throw conflict('فقط مأموریت‌های تأیید شده برگه رسمی دارند');

  const approval = await prisma.missionApprovalHistory.findFirst({
    where: { missionId: id, action: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
  });
  if (!approval) throw notFound('سند تأیید برای این مأموریت یافت نشد');

  const pdf = await renderApprovalPdf({
    snapshot: JSON.parse(approval.snapshot) as ApprovalSnapshot,
    signaturePath: approval.signaturePath,
    stampPath: approval.stampPath,
    logoPath: approval.logoPath,
  });
  const fileName = `${mission.missionNumber}.pdf`; // ASCII-only: header values must be Latin-1
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
});
