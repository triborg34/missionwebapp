import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import ReactMultiDatePicker from 'react-multi-date-picker';
import DateObject from 'react-date-object';
// Calendar and locale objects must be imported; the picker cannot resolve them from names.
import persian from 'react-date-object/calendars/persian';
import gregorian from 'react-date-object/calendars/gregorian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import { STATUS_LABEL } from '../lib/format';
import type { MissionStatus } from '../lib/types';

// ---------- Toasts ----------
type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi { success(m: string): void; error(m: string): void; info(m: string): void }
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);
  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg bg-white ${
              t.kind === 'success' ? 'border-green-300' : t.kind === 'error' ? 'border-red-300' : 'border-blue-300'
            }`}
          >
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : t.kind === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
            <span className="flex-1 text-gray-800">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ---------- Basic blocks ----------
export function Spinner({ label = 'در حال بارگذاری...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-500">
      <Info className="h-8 w-8 text-gray-300" />
      <p>{title}</p>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function StatCard({ label, value, tone = 'blue', onClick }: { label: string; value: string | number; tone?: 'blue' | 'orange' | 'green' | 'red' | 'gray'; onClick?: () => void }) {
  const tones = { blue: 'border-r-blue-600', orange: 'border-r-orange-500', green: 'border-r-green-600', red: 'border-r-red-600', gray: 'border-r-gray-500' };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`w-full rounded-xl border border-gray-200 border-r-4 bg-white p-5 text-right shadow-sm ${tones[tone]} ${onClick ? 'hover:shadow-md' : ''}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
    </Tag>
  );
}

const STATUS_STYLE: Record<MissionStatus, string> = {
  PENDING: 'bg-orange-100 text-orange-800 ring-orange-300',
  APPROVED: 'bg-green-100 text-green-800 ring-green-300',
  REJECTED: 'bg-red-100 text-red-800 ring-red-300',
  CANCELLED: 'bg-gray-100 text-gray-700 ring-gray-300',
};

export function StatusBadge({ status }: { status: MissionStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

// ---------- Buttons ----------
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
export function Button({ variant = 'primary', loading, className = '', children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    ghost: 'text-brand-700 hover:bg-brand-50',
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------- Form fields ----------
const fieldBase = 'w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}
export function Field({ label, error, hint, required, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="mr-1 text-red-600">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return <input {...rest} className={`${fieldBase} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} />;
}

export function Select({ error, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  return (
    <select {...rest} className={`${fieldBase} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`}>
      {children}
    </select>
  );
}

export function TextArea({ error, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }) {
  return <textarea rows={3} {...rest} className={`${fieldBase} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} />;
}

/**
 * Jalali date picker. The value and onChange use Gregorian `YYYY-MM-DD`,
 * which is what the server stores; the calendar shows Persian dates.
 */
// CJS interop: some bundler paths hand back the whole module object instead of its default export.
const DatePicker: typeof ReactMultiDatePicker =
  (ReactMultiDatePicker as unknown as { default?: typeof ReactMultiDatePicker }).default ?? ReactMultiDatePicker;

export function DateField({ value, onChange, placeholder, className = '', error, id }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; error?: string; id?: string }) {
  const date = value ? new DateObject({ date: value, calendar: gregorian, format: 'YYYY-MM-DD' }) : undefined;
  return (
    <DatePicker
      id={id}
      value={date}
      calendar={persian}
      locale={persian_fa}
      format="YYYY/MM/DD"
      placeholder={placeholder ?? 'انتخاب تاریخ'}
      onChange={(d: DateObject | DateObject[] | null) => {
        const picked = Array.isArray(d) ? d[0] : d;
        onChange(picked ? picked.convert(gregorian).format('YYYY-MM-DD') : '');
      }}
      inputClass={`${fieldBase} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`}
      containerStyle={{ width: '100%' }}
      style={{ width: '100%' }}
      editable={false}
    />
  );
}

// ---------- Modal & confirm ----------
export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === ref.current && onClose()} ref={ref}>
      <div role="dialog" aria-modal="true" className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="بستن">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'تأیید', danger, loading, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            انصراف
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-gray-700">{message}</p>
    </Modal>
  );
}

// ---------- Pagination ----------
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
      <span>
        صفحه {page.toLocaleString('fa-IR')} از {pages.toLocaleString('fa-IR')} — {total.toLocaleString('fa-IR')} مورد
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          قبلی
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          بعدی
        </Button>
      </div>
    </div>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-right text-sm">{children}</table>
    </div>
  );
}

export const th = 'whitespace-nowrap border-b bg-gray-50 px-4 py-3 font-semibold text-gray-600';
export const td = 'border-b border-gray-100 px-4 py-3 align-middle text-gray-800';
