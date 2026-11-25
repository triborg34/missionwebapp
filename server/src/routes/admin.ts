import { Router } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { z } from 'zod';
import { config, DEFAULT_PASSWORD } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { conflict, HttpError, notFound, badRequest } from '../lib/errors.js';
import { hashPassword } from '../lib/security.js';
import { emptyToUndef, optionalText, paginationSchema, paramId, parse, text, USERNAME_RE } from '../lib/validation.js';
import { removeStoredFile, validateImageUpload, writeStoredFile } from '../lib/storage.js';
import { requireAuth, requireRole, revokeSessions } from '../middleware/auth.js';
import { assetStatus, parseAssetType, readAsset, removeAsset, setAsset } from '../services/assets.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });
const ROLES = ['ADMIN', 'MANAGER', 'EMPLOYEE'] as const;

const employeeCode = z
  .string({ message: 'کد پرسنلی الزامی است' })
  .trim()
  .min(1, 'کد پرسنلی الزامی است')
  .max(20, 'کد پرسنلی نباید بیشتر از ۲۰ نویسه باشد')
  .regex(/^[\p{L}\p{N}\-_/]+$/u, 'کد پرسنلی فقط می‌تواند شامل حروف، عدد، «-»، «_» یا «/» باشد');

const userFields = z.object({
  fullName: text('نام و نام خانوادگی', 3, 100),
  username: z
    .string({ message: 'نام کاربری الزامی است' })
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, 'نام کاربری باید ۳ تا ۳۲ نویسه از حروف انگلیسی، عدد، «.»، «_» یا «-» باشد'),
  role: z.enum(ROLES, { message: 'نقش کاربری نامعتبر است' }),
  employeeCode,
  departmentId: z.coerce.number({ message: 'واحد سازمانی الزامی است' }).int().positive('واحد سازمانی الزامی است'),
  jobTitle: text('سمت', 2, 100),
  phone: optionalText('شماره تماس', 20),
  managerId: z.coerce.number().int().positive().nullable().optional(),
});

const createUserSchema = userFields;
const updateUserSchema = userFields.partial().extend({ isActive: z.boolean().optional() });

const listUsersSchema = paginationSchema.extend({
  role: emptyToUndef(z.enum(ROLES)),
  q: emptyToUndef(z.string().trim().max(100)),
  status: emptyToUndef(z.enum(['active', 'inactive'])),
  departmentId: emptyToUndef(z.coerce.number().int().positive()),
});

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  employeeCode: true,
  departmentId: true,
  jobTitle: true,
  phone: true,
  isActive: true,
  mustChangePassword: true,
  managerId: true,
  lastLoginAt: true,
  createdAt: true,
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true } },
} as const;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function adminUserDto(u: AdminUserRow) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    employeeCode: u.employeeCode,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    jobTitle: u.jobTitle,
    phone: u.phone,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    managerId: u.managerId,
    managerName: u.manager?.fullName ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function assertDepartment(id: number) {
  const dep = await prisma.department.findUnique({ where: { id } });
  if (!dep) throw badRequest('واحد سازمانی نامعتبر است', { departmentId: 'واحد سازمانی نامعتبر است' });
}

async function assertManager(id: number | null | undefined, field = 'managerId') {
  if (!id) return null;
  const manager = await prisma.user.findUnique({ where: { id } });
  if (!manager || manager.role !== 'MANAGER' || !manager.isActive) {
    throw badRequest('مدیر انتخاب‌شده معتبر نیست', { [field]: 'مدیر انتخاب‌شده معتبر نیست' });
  }
  return id;
}

export const adminRouter = Router();
adminRouter.use(requireAuth(), requireRole('ADMIN'));

// ---------- Dashboard ----------
adminRouter.get('/stats', async (_req, res) => {
  const [roleGroups, missionGroups, recentMissions, recentActivity] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.mission.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.mission.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { employee: { select: { fullName: true } } },
    }),
    prisma.auditLog.findMany({ take: 10, orderBy: { createdAt: 'desc' } }),
  ]);
  const roles = Object.fromEntries(roleGroups.map((g) => [g.role, g._count._all]));
  const statuses = Object.fromEntries(missionGroups.map((g) => [g.status, g._count._all]));
  const totalMissions = missionGroups.reduce((n, g) => n + g._count._all, 0);
  res.json({
    users: { employees: roles.EMPLOYEE ?? 0, managers: roles.MANAGER ?? 0, admins: roles.ADMIN ?? 0 },
    missions: {
      total: totalMissions,
      pending: statuses.PENDING ?? 0,
      approved: statuses.APPROVED ?? 0,
      rejected: statuses.REJECTED ?? 0,
    },
    recentMissions: recentMissions.map((m) => ({
      id: m.id,
      missionNumber: m.missionNumber,
      employeeName: m.employee.fullName,
      destination: m.destination,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    })),
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      actorName: a.actorName,
      action: a.action,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

// ---------- Reports ----------
adminRouter.get('/reports/summary', async (_req, res) => {
  const [byDepartment, byDecision, byStatus] = await Promise.all([
    prisma.mission.groupBy({ by: ['departmentName', 'status'], _count: { _all: true } }),
    prisma.mission.groupBy({ by: ['decidedById'], where: { decidedById: { not: null } }, _count: { _all: true } }),
    prisma.mission.groupBy({ by: ['destination'], _count: { _all: true }, orderBy: { _count: { destination: 'desc' } }, take: 10 }),
  ]);
  const managers = await prisma.user.findMany({
    where: { id: { in: byDecision.map((d) => d.decidedById!) } },
    select: { id: true, fullName: true },
  });
  const nameOf = new Map(managers.map((m) => [m.id, m.fullName]));

  const depMap = new Map<string, Record<string, number>>();
  for (const g of byDepartment) {
    const key = g.departmentName ?? 'بدون واحد';
    const row = depMap.get(key) ?? { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, TOTAL: 0 };
    row[g.status] = g._count._all;
    row.TOTAL += g._count._all;
    depMap.set(key, row);
  }
  res.json({
    byDepartment: [...depMap.entries()].map(([name, c]) => ({ name, ...c })),
    byManager: byDecision.map((d) => ({ name: nameOf.get(d.decidedById!) ?? '—', decisions: d._count._all })),
    topDestinations: byStatus.map((d) => ({ name: d.destination, count: d._count._all })),
  });
});

// ---------- Users ----------
adminRouter.get('/users', async (req, res) => {
  const f = parse(listUsersSchema, req.query);
  const where = {
    ...(f.role ? { role: f.role } : {}),
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.status ? { isActive: f.status === 'active' } : {}),
    ...(f.q
      ? {
          OR: [
            { fullName: { contains: f.q } },
            { username: { contains: f.q } },
            { employeeCode: { contains: f.q } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);
  res.json({ items: rows.map(adminUserDto), total, page: f.page, pageSize: f.pageSize });
});

adminRouter.post('/users', async (req, res) => {
  const body = parse(createUserSchema, req.body);
  await assertDepartment(body.departmentId);
  const managerId = body.role === 'EMPLOYEE' ? await assertManager(body.managerId) : null;

  const [dupUser, dupCode] = await Promise.all([
    prisma.user.findUnique({ where: { username: body.username } }),
    prisma.user.findUnique({ where: { employeeCode: body.employeeCode } }),
  ]);
  if (dupUser) throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده است', { username: 'نام کاربری تکراری است' }, 'DUPLICATE');
  if (dupCode) throw new HttpError(409, 'این کد پرسنلی قبلاً ثبت شده است', { employeeCode: 'کد پرسنلی تکراری است' }, 'DUPLICATE');

  const user = await prisma.user.create({
    data: {
      username: body.username,
      fullName: body.fullName,
      role: body.role,
      employeeCode: body.employeeCode,
      departmentId: body.departmentId,
      jobTitle: body.jobTitle,
      phone: body.phone ?? null,
      managerId,
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
      mustChangePassword: true,
    },
    select: userSelect,
  });
  await audit(req, { action: 'USER_CREATED', entityType: 'User', entityId: user.id, details: { username: user.username, role: user.role } });
  res.status(201).json({ user: adminUserDto(user) });
});

adminRouter.get('/users/:id', async (req, res) => {
  const id = paramId(req.params.id);
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw notFound('کاربر یافت نشد');
  res.json({ user: adminUserDto(user) });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const id = paramId(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('کاربر یافت نشد');
  const body = parse(updateUserSchema, req.body);

  const isSelf = id === req.user!.id;
  if (isSelf && body.role && body.role !== existing.role) {
    throw conflict('نقش کاربری خودتان را نمی‌توانید تغییر دهید');
  }
  if (isSelf && body.isActive === false) throw conflict('نمی‌توانید حساب کاربری خودتان را غیرفعال کنید');

  const role = body.role ?? existing.role;
  if (body.departmentId) await assertDepartment(body.departmentId);
  let managerId: number | null = existing.managerId;
  if (role !== 'EMPLOYEE') managerId = null;
  else if ('managerId' in req.body) managerId = await assertManager(body.managerId ?? null);

  if (body.username && body.username !== existing.username) {
    if (await prisma.user.findUnique({ where: { username: body.username } })) {
      throw new HttpError(409, 'این نام کاربری قبلاً ثبت شده است', { username: 'نام کاربری تکراری است' }, 'DUPLICATE');
    }
  }
  if (body.employeeCode && body.employeeCode !== existing.employeeCode) {
    if (await prisma.user.findUnique({ where: { employeeCode: body.employeeCode } })) {
      throw new HttpError(409, 'این کد پرسنلی قبلاً ثبت شده است', { employeeCode: 'کد پرسنلی تکراری است' }, 'DUPLICATE');
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    // A user who stops being a manager releases the employees assigned to them.
    if (existing.role === 'MANAGER' && role !== 'MANAGER') {
      await tx.user.updateMany({ where: { managerId: id }, data: { managerId: null } });
    }
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(body.username ? { username: body.username } : {}),
        ...(body.fullName ? { fullName: body.fullName } : {}),
        ...(body.employeeCode ? { employeeCode: body.employeeCode } : {}),
        ...(body.departmentId ? { departmentId: body.departmentId } : {}),
        ...(body.jobTitle ? { jobTitle: body.jobTitle } : {}),
        ...('phone' in req.body ? { phone: body.phone ?? null } : {}),
        role,
        managerId,
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: userSelect,
    });
    await audit(req, { action: 'USER_UPDATED', entityType: 'User', entityId: id, details: { fields: Object.keys(req.body ?? {}) } }, tx);
    return updated;
  });

  if (body.isActive === false || (body.role && body.role !== existing.role)) {
    await revokeSessions(id);
  }
  res.json({ user: adminUserDto(user) });
});

adminRouter.post('/users/:id/reset-password', async (req, res) => {
  const id = paramId(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('کاربر یافت نشد');
  if (id === req.user!.id) throw conflict('برای تغییر رمز خودتان از صفحه تغییر رمز عبور استفاده کنید');
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(DEFAULT_PASSWORD), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
  });
  await revokeSessions(id);
  // Audit records the action only; the password itself is never stored or displayed.
  await audit(req, { action: 'PASSWORD_RESET_BY_ADMIN', entityType: 'User', entityId: id });
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const id = paramId(req.params.id);
  if (id === req.user!.id) throw conflict('نمی‌توانید حساب کاربری خودتان را حذف کنید');
  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { missions: true, decisions: true } } },
  });
  if (!user) throw notFound('کاربر یافت نشد');
  if (user._count.missions > 0 || user._count.decisions > 0) {
    throw conflict('این کاربر سابقه مأموریت دارد و قابل حذف نیست. به‌جای حذف، حساب را غیرفعال کنید');
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id } });
    await audit(req, { action: 'USER_DELETED', entityType: 'User', entityId: id, details: { username: user.username } }, tx);
  });
  res.json({ ok: true });
});

// ---------- Manager assets (admin-managed) ----------
adminRouter.get('/managers/:id/assets', async (req, res) => {
  res.json(await assetStatus(paramId(req.params.id)));
});
adminRouter.put('/managers/:id/assets/:type', upload.single('file'), async (req, res) => {
  const type = parseAssetType(req.params.type);
  res.json(await setAsset(req, paramId(req.params.id), type, req.file));
});
adminRouter.delete('/managers/:id/assets/:type', async (req, res) => {
  const type = parseAssetType(req.params.type);
  res.json(await removeAsset(req, paramId(req.params.id), type));
});
adminRouter.get('/managers/:id/assets/:type/file', async (req, res) => {
  const type = parseAssetType(req.params.type);
  const { mime, buf } = await readAsset(paramId(req.params.id), type);
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
});

// ---------- System settings ----------
adminRouter.get('/settings', async (_req, res) => {
  const s = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  res.json({ orgName: s?.orgName ?? 'سازمان', hasLogo: Boolean(s?.logoPath) });
});

adminRouter.patch('/settings', async (req, res) => {
  const body = parse(z.object({ orgName: text('نام سازمان', 2, 120) }), req.body);
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: { orgName: body.orgName },
    create: { id: 1, orgName: body.orgName },
  });
  await audit(req, { action: 'SETTINGS_UPDATED', details: { orgName: body.orgName } });
  res.json({ orgName: body.orgName });
});

adminRouter.put('/settings/logo', upload.single('file'), async (req, res) => {
  const info = validateImageUpload(req.file, 'لوگو');
  const logoPath = await writeStoredFile('org', req.file!.buffer, info.ext);
  const previous = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: { logoPath, logoMime: info.mime },
    create: { id: 1, logoPath, logoMime: info.mime },
  });
  if (previous?.logoPath) await removeStoredFile(previous.logoPath);
  await audit(req, { action: 'LOGO_UPDATED' });
  res.json({ hasLogo: true });
});

adminRouter.delete('/settings/logo', async (req, res) => {
  const s = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!s?.logoPath) throw badRequest('لوگویی برای حذف وجود ندارد');
  await prisma.systemSettings.update({ where: { id: 1 }, data: { logoPath: null, logoMime: null } });
  await removeStoredFile(s.logoPath);
  await audit(req, { action: 'LOGO_REMOVED' });
  res.json({ hasLogo: false });
});

// ---------- Audit log ----------
adminRouter.get('/audit', async (req, res) => {
  const f = parse(
    paginationSchema.extend({
      q: emptyToUndef(z.string().trim().max(100)),
      action: emptyToUndef(z.string().trim().max(60)),
    }),
    req.query,
  );
  const where = {
    ...(f.action ? { action: f.action } : {}),
    ...(f.q ? { OR: [{ actorName: { contains: f.q } }, { details: { contains: f.q } }, { entityId: { contains: f.q } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
  ]);
  res.json({
    total,
    page: f.page,
    pageSize: f.pageSize,
    items: rows.map((a) => ({
      id: a.id,
      actorName: a.actorName,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      details: a.details,
      ip: a.ip,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});
