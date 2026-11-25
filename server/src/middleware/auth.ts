import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, HttpError } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/security.js';

export const SESSION_COOKIE = 'mms_sid';
export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  isActive: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: number;
    }
  }
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Attaches req.user when a valid, unexpired session cookie is present. Never rejects by itself. */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (typeof raw !== 'string' || raw.length < 20) return next();

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: true },
  });
  const now = Date.now();
  const idleLimit = config.idleTimeoutMinutes * 60_000;
  if (
    !session ||
    session.expiresAt.getTime() <= now ||
    now - session.lastSeenAt.getTime() > idleLimit
  ) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    clearSessionCookie(res);
    return next();
  }
  if (!session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return next();
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  req.user = {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    role: session.user.role as Role,
    mustChangePassword: session.user.mustChangePassword,
    isActive: session.user.isActive,
  };
  req.sessionId = session.id;
  next();
}

/** Requires authentication. Blocks every route until a forced password change is done. */
export function requireAuth(options: { allowPasswordChange?: boolean } = {}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'لطفاً وارد حساب کاربری خود شوید', undefined, 'UNAUTHENTICATED'));
    if (req.user.mustChangePassword && !options.allowPasswordChange) {
      return next(
        new HttpError(403, 'قبل از ادامه باید رمز عبور خود را تغییر دهید', undefined, 'PASSWORD_CHANGE_REQUIRED'),
      );
    }
    next();
  };
}

/** Server-side RBAC. Never rely on frontend checks. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export async function createSession(userId: number, req: Request): Promise<string> {
  const token = randomToken(32);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      ip: req.ip ?? null,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 255),
      expiresAt: new Date(Date.now() + config.sessionTtlHours * 3600_000),
    },
  });
  return token;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionTtlHours * 3600_000,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' });
}

/** Revokes every session of a user, optionally keeping one (current session). */
export async function revokeSessions(userId: number, keepSessionId?: number) {
  await prisma.session.deleteMany({
    where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
  });
}
