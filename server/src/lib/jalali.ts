import * as jalaali from 'jalaali-js';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** Converts ASCII digits in a string to Persian digits. */
export const faDigits = (value: string | number): string =>
  String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

/** Gregorian "YYYY-MM-DD" -> Jalali parts. */
export function toJalali(iso: string) {
  const [gy, gm, gd] = iso.split('-').map(Number);
  const { jy, jm, jd } = jalaali.toJalaali(gy, gm, gd);
  return { jy, jm, jd };
}

/** Gregorian "YYYY-MM-DD" -> "۱۴۰۴/۰۸/۱۲" */
export function formatJalaliDate(iso: string): string {
  const { jy, jm, jd } = toJalali(iso);
  return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** Date object (UTC instant) -> "۱۴۰۴/۰۸/۱۲ ۱۴:30" in Tehran time. */
export function formatJalaliDateTime(date: Date): string {
  const tehran = new Date(date.getTime() + 3.5 * 3600 * 1000);
  const iso = tehran.toISOString();
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${formatJalaliDate(day)} ${faDigits(time)}`;
}

/** Jalali month name for a Gregorian ISO date. */
export function jalaliMonthName(iso: string): string {
  return MONTHS[toJalali(iso).jm - 1];
}

/** Today's Jalali date (Tehran time) as "1404-08-12", for file names. */
export function todayJalaliStamp(): string {
  const iso = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
  const { jy, jm, jd } = toJalali(iso);
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

/** Current Jalali year (Tehran time). */
export function currentJalaliYear(): number {
  const now = new Date(Date.now() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
  return toJalali(now).jy;
}

/** Tehran-local day boundaries as UTC Dates (Iran has a fixed +03:30 offset). */
export function tehranDayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00+03:30`);
}
export function tehranDayEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999+03:30`);
}
