import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import multer from 'multer';
import { config } from './config.js';
import { loadSession } from './middleware/auth.js';
import { HttpError } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { setupRouter, publicRouter } from './routes/setup.js';
import { missionsRouter } from './routes/missions.js';
import { managerRouter } from './routes/manager.js';
import { adminRouter } from './routes/admin.js';
import { commonRouter } from './routes/common.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 1500, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'تعداد درخواست‌ها بیش از حد مجاز است' } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Basic CSRF defence in depth: state-changing API calls must carry a custom header
  // that cross-site HTML forms cannot send. Combined with SameSite=Strict cookies.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('x-requested-with') !== 'mms-web') {
      return res.status(403).json({ error: 'درخواست نامعتبر است', code: 'CSRF' });
    }
    next();
  });

  app.use('/api', loadSession);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'تلاش‌های ورود بیش از حد مجاز است. چند دقیقه دیگر دوباره تلاش کنید' },
  });
  app.use('/api/auth/login', loginLimiter);

  app.use('/api/setup', setupRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/departments', commonRouter);
  app.use('/api/missions', missionsRouter);
  app.use('/api/manager', managerRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'مسیر یافت نشد' });
  });

  // Serve the built SPA in production (same origin, so cookies stay SameSite=Strict).
  const indexHtml = path.join(config.clientDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.clientDistDir, {
        index: false,
        dotfiles: 'ignore',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    // `root` keeps dotfile filtering limited to the relative name (the install path may contain dot-directories).
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile('index.html', { root: config.clientDistDir }));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, fields: err.fields, code: err.code });
    }
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل نباید بیشتر از ۲ مگابایت باشد' : 'خطا در دریافت فایل';
      return res.status(400).json({ error: msg, fields: { file: msg } });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'بدنهٔ درخواست نامعتبر است' });
    }
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'خطای داخلی سرور رخ داده است' });
  });

  return app;
}
