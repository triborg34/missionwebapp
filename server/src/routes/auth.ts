import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { HttpError } from '../lib/errors.js';
import { formatJalaliDateTime } from '../lib/jalali.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/security.js';
import { parse } from '../lib/validation.js';
import {
  clearSessionCookie,
  createSession,
  requireAuth,
  revokeSessions,
  setSessionCookie,
} from '../middleware/auth.js';
import { passwordSchema } from './setup.js';

export const authRouter = Router();

type UserRecord = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
  jobTitle: string | null;
  phone: string | null;
  employeeCode: string | null;
  departmentId: number | null;
  managerId: number | null;
  department: { name: string } | null;
};

export function userDto(u: UserRecord) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    jobTitle: u.jobTitle,
    phone: u.phone,
    employeeCode: u.employeeCode,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    managerId: u.managerId,
  };
}

const loginSchema = z.object({
  username: z.string({ message: 'نام کاربری الزامی است' }).trim().min(1, 'نام کاربری الزامی است').max(64),
  password: z.string({ message: 'رمز عبور الزامی است' }).min(1, 'رمز عبور الزامی است').max(200),
});

authRouter.post('/login', async (req, res) => {
  const body = parse(loginSchema, req.body);
  const username = body.username.toLowerCase();
  const user = await prisma.user.findUnique({ where: { username }, include: { department: true } });
  const now = new Date();

  if (user?.lockedUntil && user.lockedUntil > now) {
    throw new HttpError(
      423,
      `حساب به‌دلیل تلاش‌های ناموفق متوالی موقتاً قفل شده است. تا ساعت ${formatJalaliDateTime(user.lockedUntil)} صبر کنید`,
      undefined,
      'ACCOUNT_LOCKED',
    );
  }

  const valid = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    if (user) {
      const failures = user.failedLoginCount + 1;
      const lock = failures >= config.maxLoginFailures;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failures,
          lockedUntil: lock ? new Date(now.getTime() + config.loginLockMinutes * 60_000) : null,
        },
      });
    }
    await audit(req, { action: 'LOGIN_FAILED', details: { username } });
    throw new HttpError(401, 'نام کاربری یا رمز عبور اشتباه است');
  }
  if (!user.isActive) throw new HttpError(403, 'حساب کاربری غیرفعال است');

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });
  const token = await createSession(user.id, req);
  setSessionCookie(res, token);
  await audit(req, { action: 'LOGIN_SUCCESS', actor: { id: user.id, fullName: user.fullName } });
  res.json({ user: userDto(user) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.sessionId) await prisma.session.deleteMany({ where: { id: req.sessionId } });
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth({ allowPasswordChange: true }), async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, include: { department: true } });
  res.json({ user: userDto(user) });
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string({ message: 'رمز عبور فعلی الزامی است' }).min(1, 'رمز عبور فعلی الزامی است'),
    newPassword: passwordSchema,
    confirmPassword: z.string({ message: 'تکرار رمز عبور جدید الزامی است' }),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'رمز عبور جدید و تکرار آن یکسان نیستند',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'رمز عبور جدید باید با رمز فعلی متفاوت باشد',
  });

authRouter.post('/change-password', requireAuth({ allowPasswordChange: true }), async (req, res) => {
  const body = parse(changePasswordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const ok = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!ok) {
    throw new HttpError(422, 'اطلاعات واردشده معتبر نیست', { currentPassword: 'رمز عبور فعلی نادرست است' }, 'VALIDATION');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false },
  });
  // Other devices must sign in again with the new password; keep the current session.
  await revokeSessions(user.id, req.sessionId);
  await audit(req, { action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id });
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { department: true } });
  res.json({ user: userDto(updated) });
});
