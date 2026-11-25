import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../middleware/auth.js';
import { prisma, type Tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { currentJalaliYear, tehranDayEnd, tehranDayStart } from '../lib/jalali.js';
import { dateString, emptyToUndef, optionalText, paginationSchema, parse, text, timeString } from '../lib/validation.js';
import { freezeCopy } from '../lib/storage.js';
import { sha256 } from '../lib/security.js';

export const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type MissionStatus = (typeof STATUSES)[number];

export const missionInput = z
  .object({
    missionDate: dateString('تاریخ مأموریت'),
    destination: text('مقصد', 2, 150),
    purpose: text('شرح و هدف مأموریت', 5, 1000),
    departureTime: timeString('ساعت حرکت'),
    returnDate: dateString('تاریخ بازگشت'),
    returnTime: timeString('ساعت بازگشت'),
    description: optionalText('توضیحات تکمیلی', 1000),
  })
  .superRefine((v, ctx) => {
    if (v.returnDate < v.missionDate) {
      ctx.addIssue({ code: 'custom', path: ['returnDate'], message: 'تاریخ بازگشت نمی‌تواند قبل از تاریخ مأموریت باشد' });
    } else if (v.returnDate === v.missionDate && v.returnTime <= v.departureTime) {
      ctx.addIssue({ code: 'custom', path: ['returnTime'], message: 'ساعت بازگشت باید بعد از ساعت حرکت باشد' });
    }
  });


export const missionFilterSchema = paginationSchema.extend({
  q: emptyToUndef(z.string().trim().max(100)),
  status: emptyToUndef(z.enum(STATUSES)),
  departmentId: emptyToUndef(z.coerce.number().int().positive()),
  destination: emptyToUndef(z.string().trim().max(100)),
  missionFrom: emptyToUndef(dateString('تاریخ شروع')),
  missionTo: emptyToUndef(dateString('تاریخ پایان')),
  submittedFrom: emptyToUndef(dateString('تاریخ ثبت از')),
  submittedTo: emptyToUndef(dateString('تاریخ ثبت تا')),
  approverId: emptyToUndef(z.coerce.number().int().positive()),
  sortBy: z.enum(['missionNumber', 'createdAt', 'missionDate', 'returnDate', 'status', 'destination']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type MissionFilters = z.infer<typeof missionFilterSchema>;

export const missionInclude = {
  employee: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      jobTitle: true,
      managerId: true,
      department: { select: { id: true, name: true } },
    },
  },
  decidedBy: { select: { id: true, fullName: true, jobTitle: true } },
} satisfies Prisma.MissionInclude;

export const historyInclude = {
  manager: { select: { id: true, fullName: true, jobTitle: true } },
} satisfies Prisma.MissionApprovalHistoryInclude;

type MissionRow = Prisma.MissionGetPayload<{ include: typeof missionInclude }>;

export function toMissionDto(m: MissionRow) {
  return {
    id: m.id,
    missionNumber: m.missionNumber,
    status: m.status as MissionStatus,
    employee: {
      id: m.employee.id,
      fullName: m.employee.fullName,
      employeeCode: m.employee.employeeCode,
      jobTitle: m.employee.jobTitle,
    },
    department: m.departmentName,
    departmentId: m.departmentId,
    destination: m.destination,
    purpose: m.purpose,
    missionDate: m.missionDate,
    departureTime: m.departureTime,
    returnDate: m.returnDate,
    returnTime: m.returnTime,
    description: m.description,
    rejectionReason: m.rejectionReason,
    decidedAt: m.decidedAt?.toISOString() ?? null,
    decidedBy: m.decidedBy ? { id: m.decidedBy.id, fullName: m.decidedBy.fullName, jobTitle: m.decidedBy.jobTitle } : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/** Business rules visible to the requesting user. Server-side only. */
function permissionsFor(user: AuthUser, m: { status: string; employeeId: number }, managerId?: number | null) {
  const isOwner = user.role === 'EMPLOYEE' && m.employeeId === user.id;
  const pending = m.status === 'PENDING';
  return {
    canEdit: isOwner && pending,
    canCancel: isOwner && pending,
    canDecide: user.role === 'MANAGER' && pending && (managerId == null || managerId === user.id),
    canDownloadPdf: m.status === 'APPROVED' && (isOwner || user.role === 'MANAGER' || user.role === 'ADMIN'),
  };
}

/** Next unique mission number, e.g. MS-1405-000012. Increments inside the caller's transaction. */
async function nextMissionNumber(tx: Tx): Promise<string> {
  const settings = await tx.systemSettings.upsert({
    where: { id: 1 },
    update: { missionSeq: { increment: 1 } },
    create: { id: 1, missionSeq: 1 },
  });
  return `MS-${currentJalaliYear()}-${String(settings.missionSeq).padStart(6, '0')}`;
}

export async function createMission(user: AuthUser, body: unknown, req: Request) {
  const input = parse(missionInput, body);
  const employee = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { department: true } });

  return prisma.$transaction(async (tx) => {
    const missionNumber = await nextMissionNumber(tx);
    const mission = await tx.mission.create({
      data: {
        missionNumber,
        employeeId: employee.id,
        employeeCode: employee.employeeCode ?? '—',
        departmentId: employee.departmentId,
        departmentName: employee.department?.name ?? null,
        missionDate: input.missionDate,
        destination: input.destination,
        purpose: input.purpose,
        departureTime: input.departureTime,
        returnDate: input.returnDate,
        returnTime: input.returnTime,
        description: input.description ?? null,
        status: 'PENDING',
      },
      include: missionInclude,
    });
    await audit(req, { action: 'MISSION_CREATED', entityType: 'Mission', entityId: mission.id, details: { missionNumber } }, tx);
    return toMissionDto(mission);
  });
}

async function loadScoped(user: AuthUser, id: number) {
  const mission = await prisma.mission.findUnique({ where: { id }, include: missionInclude });
  // Employees get 404 for other people's missions so existence is not disclosed.
  if (!mission || (user.role === 'EMPLOYEE' && mission.employeeId !== user.id)) throw notFound();
  return mission;
}

export async function getMission(user: AuthUser, id: number) {
  const mission = await loadScoped(user, id);
  const history = await prisma.missionApprovalHistory.findMany({
    where: { missionId: id },
    include: historyInclude,
    orderBy: { createdAt: 'asc' },
  });
  return {
    ...toMissionDto(mission),
    permissions: permissionsFor(user, mission, mission.employee.managerId),
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      reason: h.reason,
      createdAt: h.createdAt.toISOString(),
      manager: { id: h.manager.id, fullName: h.manager.fullName, jobTitle: h.manager.jobTitle },
      snapshotHash: sha256(h.snapshot).slice(0, 16),
    })),
  };
}

export async function updateMission(user: AuthUser, id: number, body: unknown, req: Request) {
  const input = parse(missionInput, body);
  const mission = await loadScoped(user, id);
  if (mission.employeeId !== user.id) throw forbidden();
  if (mission.status !== 'PENDING') throw conflict('فقط درخواست‌های در انتظار تأیید قابل ویرایش هستند');

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.mission.updateMany({
      where: { id, employeeId: user.id, status: 'PENDING' },
      data: {
        missionDate: input.missionDate,
        destination: input.destination,
        purpose: input.purpose,
        departureTime: input.departureTime,
        returnDate: input.returnDate,
        returnTime: input.returnTime,
        description: input.description ?? null,
      },
    });
    if (updated.count !== 1) throw conflict('وضعیت مأموریت تغییر کرده است و دیگر قابل ویرایش نیست');
    await audit(req, { action: 'MISSION_UPDATED', entityType: 'Mission', entityId: id }, tx);
    return tx.mission.findUniqueOrThrow({ where: { id }, include: missionInclude });
  });
  return toMissionDto(result);
}

export async function cancelMission(user: AuthUser, id: number, req: Request) {
  const mission = await loadScoped(user, id);
  if (mission.employeeId !== user.id) throw forbidden();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.mission.updateMany({
      where: { id, employeeId: user.id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (updated.count !== 1) throw conflict('فقط درخواست‌های در انتظار تأیید قابل لغو هستند');
    await audit(req, { action: 'MISSION_CANCELLED', entityType: 'Mission', entityId: id }, tx);
  });
  return { ok: true };
}

/** Builds the immutable snapshot that drives the official PDF. */
function buildSnapshot(args: {
  mission: MissionRow;
  orgName: string;
  managerName: string;
  managerPosition: string | null;
  decidedAt: Date;
  action: 'APPROVED' | 'REJECTED';
  reason?: string;
}) {
  const { mission: m } = args;
  return {
    version: 1,
    missionNumber: m.missionNumber,
    orgName: args.orgName,
    employee: {
      fullName: m.employee.fullName,
      employeeCode: m.employeeCode,
      departmentName: m.departmentName ?? '',
      jobTitle: m.employee.jobTitle ?? '',
    },
    mission: {
      destination: m.destination,
      purpose: m.purpose,
      missionDate: m.missionDate,
      departureTime: m.departureTime,
      returnDate: m.returnDate,
      returnTime: m.returnTime,
      description: m.description ?? '',
      submittedAt: m.createdAt.toISOString(),
    },
    decision: {
      action: args.action,
      managerName: args.managerName,
      managerPosition: args.managerPosition ?? '',
      decidedAt: args.decidedAt.toISOString(),
      reason: args.reason ?? null,
    },
  };
}

export async function approveMission(user: AuthUser, id: number, req: Request) {
  const manager = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const [settings, assets] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { id: 1 } }),
    prisma.managerAsset.findMany({ where: { managerId: user.id } }),
  ]);
  const signature = assets.find((a) => a.type === 'SIGNATURE');
  const stamp = assets.find((a) => a.type === 'STAMP');

  // Copy the current signature, stamp and logo so later changes never touch this document.
  const [signaturePath, stampPath, logoPath] = await Promise.all([
    freezeCopy(signature?.filePath, 'approvals'),
    freezeCopy(stamp?.filePath, 'approvals'),
    freezeCopy(settings?.logoPath, 'approvals'),
  ]);

  return prisma.$transaction(async (tx) => {
    const mission = await tx.mission.findUnique({ where: { id }, include: missionInclude });
    if (!mission) throw notFound();
    if (mission.status !== 'PENDING') throw conflict('این مأموریت قبلاً بررسی شده است');
    if (mission.employee.managerId && mission.employee.managerId !== user.id) {
      throw forbidden('این درخواست توسط مدیر دیگری باید بررسی شود');
    }

    const decidedAt = new Date();
    const snapshot = buildSnapshot({
      mission,
      orgName: settings?.orgName ?? 'سازمان',
      managerName: manager.fullName,
      managerPosition: manager.jobTitle,
      decidedAt,
      action: 'APPROVED',
    });
    const updated = await tx.mission.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: user.id, decidedAt, rejectionReason: null },
    });
    if (updated.count !== 1) throw conflict('این مأموریت قبلاً بررسی شده است');

    await tx.missionApprovalHistory.create({
      data: {
        missionId: id,
        managerId: user.id,
        action: 'APPROVED',
        snapshot: JSON.stringify(snapshot),
        signaturePath,
        stampPath,
        logoPath,
      },
    });
    await audit(req, { action: 'MISSION_APPROVED', entityType: 'Mission', entityId: id, details: { missionNumber: mission.missionNumber } }, tx);
    return { ok: true, missionNumber: mission.missionNumber };
  });
}

export async function rejectMission(user: AuthUser, id: number, reasonInput: unknown, req: Request) {
  const { reason } = parse(z.object({ reason: text('دلیل رد درخواست', 5, 1000) }), reasonInput);
  const manager = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });

  return prisma.$transaction(async (tx) => {
    const mission = await tx.mission.findUnique({ where: { id }, include: missionInclude });
    if (!mission) throw notFound();
    if (mission.status !== 'PENDING') throw conflict('این مأموریت قبلاً بررسی شده است');
    if (mission.employee.managerId && mission.employee.managerId !== user.id) {
      throw forbidden('این درخواست توسط مدیر دیگری باید بررسی شود');
    }

    const decidedAt = new Date();
    const snapshot = buildSnapshot({
      mission,
      orgName: settings?.orgName ?? 'سازمان',
      managerName: manager.fullName,
      managerPosition: manager.jobTitle,
      decidedAt,
      action: 'REJECTED',
      reason,
    });
    const updated = await tx.mission.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: user.id, decidedAt, rejectionReason: reason },
    });
    if (updated.count !== 1) throw conflict('این مأموریت قبلاً بررسی شده است');

    await tx.missionApprovalHistory.create({
      data: { missionId: id, managerId: user.id, action: 'REJECTED', reason, snapshot: JSON.stringify(snapshot) },
    });
    await audit(req, { action: 'MISSION_REJECTED', entityType: 'Mission', entityId: id, details: { missionNumber: mission.missionNumber, reason } }, tx);
    return { ok: true };
  });
}

/** Builds the Prisma where clause shared by list, summary and export. Scope is enforced here. */
export function missionWhere(user: AuthUser, f: Partial<MissionFilters>): Prisma.MissionWhereInput {
  const where: Prisma.MissionWhereInput = {};
  if (user.role === 'EMPLOYEE') where.employeeId = user.id;
  if (f.q) {
    where.OR = [
      { missionNumber: { contains: f.q } },
      { employeeCode: { contains: f.q } },
      { employee: { fullName: { contains: f.q } } },
    ];
  }
  if (f.status) where.status = f.status;
  if (f.departmentId) where.departmentId = f.departmentId;
  if (f.destination) where.destination = { contains: f.destination };
  if (f.approverId) where.decidedById = f.approverId;
  if (f.missionFrom || f.missionTo) {
    where.missionDate = {
      ...(f.missionFrom ? { gte: f.missionFrom } : {}),
      ...(f.missionTo ? { lte: f.missionTo } : {}),
    };
  }
  if (f.submittedFrom || f.submittedTo) {
    where.createdAt = {
      ...(f.submittedFrom ? { gte: tehranDayStart(f.submittedFrom) } : {}),
      ...(f.submittedTo ? { lte: tehranDayEnd(f.submittedTo) } : {}),
    };
  }
  return where;
}

export async function listMissions(user: AuthUser, query: unknown) {
  const f = parse(missionFilterSchema, query);
  const where = missionWhere(user, f);
  const [total, rows] = await Promise.all([
    prisma.mission.count({ where }),
    prisma.mission.findMany({
      where,
      include: missionInclude,
      orderBy: [{ [f.sortBy]: f.sortDir }, { id: 'desc' }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({ ...toMissionDto(r), permissions: permissionsFor(user, r, r.employee.managerId) })),
    total,
    page: f.page,
    pageSize: f.pageSize,
  };
}

export async function missionSummary(user: AuthUser) {
  const where = missionWhere(user, {});
  const groups = await prisma.mission.groupBy({ by: ['status'], where, _count: { _all: true } });
  const counts: Record<MissionStatus | 'TOTAL', number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, TOTAL: 0 };
  for (const g of groups) {
    counts[g.status as MissionStatus] = g._count._all;
    counts.TOTAL += g._count._all;
  }
  return counts;
}
