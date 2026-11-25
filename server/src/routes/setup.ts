import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config, DEFAULT_PASSWORD } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { hashPassword } from '../lib/security.js';
import { parse, text, USERNAME_RE } from '../lib/validation.js';
import { detectImage, readStoredFile, validateImageUpload, writeStoredFile } from '../lib/storage.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });

export const passwordSchema = z
  .string({ message: 'رمز عبور الزامی است' })
  .min(8, 'رمز عبور باید حداقل ۸ نویسه باشد')
  .max(72, 'رمز عبور نباید بیشتر از ۷۲ نویسه باشد')
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'رمز عبور باید شامل حروف و عدد باشد')
  .refine((v) => v !== DEFAULT_PASSWORD, 'رمز عبور نمی‌تواند همان رمز پیش‌فرض باشد');

const setupSchema = z
  .object({
    orgName: text('نام سازمان', 2, 120),
    adminFullName: text('نام و نام خانوادگی مدیر سامانه', 3, 100),
    adminUsername: z
      .string({ message: 'نام کاربری الزامی است' })
      .trim()
      .toLowerCase()
      .regex(USERNAME_RE, 'نام کاربری باید ۳ تا ۳۲ نویسه از حروف انگلیسی، عدد، «.»، «_» یا «-» باشد'),
    password: passwordSchema,
    confirmPassword: z.string({ message: 'تکرار رمز عبور الزامی است' }),
    setupToken: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'رمز عبور و تکرار آن یکسان نیستند' });

export const setupRouter = Router();

setupRouter.get('/status', async (_req, res) => {
  const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
  res.json({ needsSetup: admins === 0, setupTokenRequired: Boolean(config.setupToken) });
});

setupRouter.post('/', upload.single('logo'), async (req, res) => {
  const body = parse(setupSchema, req.body);
  if (config.setupToken && body.setupToken !== config.setupToken) {
    throw badRequest('کد راه‌اندازی نامعتبر است', { setupToken: 'کد راه‌اندازی نامعتبر است' });
  }
  const logo = req.file ? validateImageUpload(req.file, 'لوگو') : null;
  const passwordHash = await hashPassword(body.password);
  const logoPath = logo && req.file ? await writeStoredFile('org', req.file.buffer, logo.ext) : null;

  await prisma.$transaction(async (tx) => {
    const admins = await tx.user.count({ where: { role: 'ADMIN' } });
    if (admins > 0) throw conflict('راه‌اندازی اولیه قبلاً انجام شده است');
    await tx.systemSettings.upsert({
      where: { id: 1 },
      update: { orgName: body.orgName, logoPath, logoMime: logo?.mime ?? null },
      create: { id: 1, orgName: body.orgName, logoPath, logoMime: logo?.mime ?? null },
    });
    const admin = await tx.user.create({
      data: {
        username: body.adminUsername,
        passwordHash,
        fullName: body.adminFullName,
        role: 'ADMIN',
        mustChangePassword: false,
      },
    });
    await audit(null, { action: 'SETUP_COMPLETED', entityType: 'User', entityId: admin.id, details: { orgName: body.orgName } }, tx);
  });
  res.status(201).json({ ok: true });
});

export const publicRouter = Router();

publicRouter.get('/settings', async (_req, res) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  res.json({ orgName: settings?.orgName ?? 'سازمان', hasLogo: Boolean(settings?.logoPath) });
});

publicRouter.get('/logo', async (_req, res) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings?.logoPath) throw notFound('لوگو تنظیم نشده است');
  const buf = await readStoredFile(settings.logoPath);
  const detected = detectImage(buf);
  if (!detected) throw notFound('لوگو تنظیم نشده است');
  res.setHeader('Content-Type', detected.mime);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
});
