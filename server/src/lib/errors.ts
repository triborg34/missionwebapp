export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, message, fields);
export const notFound = (message = 'مورد موردنظر یافت نشد') => new HttpError(404, message);
export const forbidden = (message = 'دسترسی مجاز نیست') => new HttpError(403, message);
export const conflict = (message: string) => new HttpError(409, message);
