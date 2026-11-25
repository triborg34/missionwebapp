import type { MissionStatus, Role } from './types';

export const STATUS_LABEL: Record<MissionStatus, string> = {
  PENDING: 'در انتظار تأیید',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
  CANCELLED: 'لغو شده',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'ادمین سامانه',
  MANAGER: 'مدیر سازمان',
  EMPLOYEE: 'کارمند',
};

export const ACTION_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: 'ورود موفق',
  LOGIN_FAILED: 'ورود ناموفق',
  PASSWORD_CHANGED: 'تغییر رمز عبور',
  PASSWORD_RESET_BY_ADMIN: 'بازنشانی رمز توسط ادمین',
  SETUP_COMPLETED: 'راه‌اندازی اولیه',
  USER_CREATED: 'ایجاد کاربر',
  USER_UPDATED: 'ویرایش کاربر',
  USER_DELETED: 'حذف کاربر',
  MISSION_CREATED: 'ثبت مأموریت',
  MISSION_UPDATED: 'ویرایش مأموریت',
  MISSION_CANCELLED: 'لغو مأموریت',
  MISSION_APPROVED: 'تأیید مأموریت',
  MISSION_REJECTED: 'رد مأموریت',
  MANAGER_PROFILE_UPDATED: 'ویرایش پروفایل مدیر',
  MANAGER_ASSET_UPDATED: 'به‌روزرسانی مهر یا امضا',
  MANAGER_ASSET_REMOVED: 'حذف مهر یا امضا',
  DEPARTMENT_CREATED: 'ایجاد واحد سازمانی',
  DEPARTMENT_UPDATED: 'ویرایش واحد سازمانی',
  SETTINGS_UPDATED: 'تغییر تنظیمات',
  LOGO_UPDATED: 'به‌روزرسانی لوگو',
  LOGO_REMOVED: 'حذف لوگو',
};

const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** Formats a stored Gregorian date (YYYY-MM-DD) as a Jalali date. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

/** Formats an ISO timestamp as a Jalali date and time in Tehran time. */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  }).format(new Date(value));
}

export const formatTime = (value?: string | null) => (value ? faDigits(value) : '—');
export const formatNumber = (n: number) => faDigits(n.toLocaleString('en-US'));

/** Gregorian YYYY-MM-DD for today in Tehran (used as a default). */
export function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
}
