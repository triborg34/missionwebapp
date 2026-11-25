import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { parse, paramId, text } from '../lib/validation.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const commonRouter = Router();
commonRouter.use(requireAuth());

commonRouter.get('/', async (_req, res) => {
  const items = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  res.json({ items: items.map((d) => ({ id: d.id, name: d.name })) });
});

const departmentSchema = z.object({ name: text('نام واحد سازمانی', 2, 100) });

commonRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const body = parse(departmentSchema, req.body);
  const dup = await prisma.department.findUnique({ where: { name: body.name } });
  if (dup) throw conflict('این واحد سازمانی قبلاً ثبت شده است');
  const dep = await prisma.department.create({ data: { name: body.name } });
  await audit(req, { action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: dep.id, details: { name: dep.name } });
  res.status(201).json({ id: dep.id, name: dep.name });
});

commonRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = paramId(req.params.id);
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) throw notFound('واحد سازمانی یافت نشد');
  const body = parse(departmentSchema, req.body);
  const dup = await prisma.department.findUnique({ where: { name: body.name } });
  if (dup && dup.id !== id) throw conflict('این واحد سازمانی قبلاً ثبت شده است');
  // Renaming keeps the snapshot name on old missions; finalized documents never change.
  const dep = await prisma.department.update({ where: { id }, data: { name: body.name } });
  await audit(req, { action: 'DEPARTMENT_UPDATED', entityType: 'Department', entityId: id, details: { name: dep.name } });
  res.json({ id: dep.id, name: dep.name });
});
