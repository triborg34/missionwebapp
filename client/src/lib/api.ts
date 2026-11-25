export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  code?: string;

  constructor(message: string, status: number, fields?: Record<string, string>, code?: string) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit | null };

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, ...rest } = options;
  const headers = new Headers(rest.headers);
  // Required by the server for every /api call (CSRF guard).
  headers.set('x-requested-with', 'mms-web');
  let body = rest.body;
  if (json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...rest, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('خطا در ارتباط با سرور. اتصال اینترنت یا سرور را بررسی کنید', 0);
  }

  if (!res.ok) {
    let data: { error?: string; fields?: Record<string, string>; code?: string } = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(data.error ?? 'خطای غیرمنتظره رخ داد', res.status, data.fields, data.code);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return (await res.json()) as T;
  return (await res.blob()) as T;
}

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Same-origin URL for downloads (the session cookie is sent automatically). */
export const apiUrl = (path: string) => `/api${path}`;
