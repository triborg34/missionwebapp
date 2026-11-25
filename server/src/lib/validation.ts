import { z } from 'zod';
import { HttpError, notFound } from './errors.js';

/** Parses input with a Zod schema; on failure throws a 422 with Persian field messages. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'form';
      fields[key] ??= issue.message;
    }
    throw new HttpError(422, 'اطلاعات واردشده معتبر نیست', fields, 'VALIDATION');
  }
  return result.data;
}

/** Parses a numeric route parameter; anything malformed is reported as not found. */
export function paramId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw notFound('مورد موردنظر یافت نشد');
  return n;
}

export const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const dateString = (label = 'تاریخ') =>
  z.string({ message: `${label} الزامی است` }).regex(DATE_RE, `${label} نامعتبر است`);

export const timeString = (label = 'ساعت') =>
  z.string({ message: `${label} الزامی است` }).regex(TIME_RE, `${label} نامعتبر است (HH:mm)`);

export const text = (label: string, min: number, max: number) =>
  z
    .string({ message: `${label} الزامی است` })
    .trim()
    .min(min, `${label} الزامی است`)
    .max(max, `${label} نباید بیشتر از ${max} نویسه باشد`);

/** Optional text: empty input becomes undefined. */
export const optionalText = (label: string, max: number) =>
  z
    .string({ message: `${label} نامعتبر است` })
    .trim()
    .max(max, `${label} نباید بیشتر از ${max} نویسه باشد`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Treats empty strings and null as absent, keeping the inner type. */
export const emptyToUndef = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

/** Strips control characters and trims user text. */
export function cleanText(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}
