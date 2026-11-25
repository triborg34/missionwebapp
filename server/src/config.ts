import 'dotenv/config';
import path from 'node:path';

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 4000),
  storageDir: path.resolve(process.cwd(), process.env.STORAGE_DIR ?? '../storage'),
  clientDistDir: path.resolve(process.cwd(), process.env.CLIENT_DIST_DIR ?? '../client/dist'),
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 8),
  idleTimeoutMinutes: num(process.env.IDLE_TIMEOUT_MINUTES, 60),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  chromePath: process.env.CHROME_PATH || undefined,
  setupToken: process.env.SETUP_TOKEN || undefined,
  maxUploadBytes: 2 * 1024 * 1024,
  maxLoginFailures: 5,
  loginLockMinutes: 15,
};

/** Fixed initial password for every new / reset account (per specification). */
export const DEFAULT_PASSWORD = '123456';
