import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/auth';
import { api, ApiError, apiUrl, qs } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import type { AssetInfo, AssetType, MissionStatus, Paginated, User } from '../lib/types';
import { Button, Card, ConfirmDialog, DataTable, EmptyState, Field, PageHeader, Pagination, Spinner, StatusBadge, TextInput, th, td, useToast } from '../components/ui';

interface Decision {
  id: number;
  missionNumber: string;
  status: MissionStatus;
  employee: { fullName: string; employeeCode: string };
  destination: string;
  missionDate: string;
  decidedAt: string | null;
  rejectionReason: string | null;
}

export function DecisionsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Decision> | null>(null);
  const pageSize = 15;

  useEffect(() => {
    api<Paginated<Decision>>(`/manager/decisions${qs({ page, pageSize })}`).then(setData).catch(() => setData({ items: [], total: 0, page, pageSize }));
  }, [page]);

  return (
    <div>
      <PageHeader title="تاریخچه تصمیمات" description="درخواست‌هایی که شما تأیید یا رد کرده‌اید" />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState title="هنوز تصمیمی ثبت نکرده‌اید" />
        </Card>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <th className={th}>شماره مأموریت</th>
                <th className={th}>کارمند</th>
                <th className={th}>مقصد</th>
                <th className={th}>تاریخ مأموریت</th>
                <th className={th}>تاریخ تصمیم</th>
                <th className={th}>نتیجه</th>
                <th className={th}>دلیل رد</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/missions/${d.id}`)}>
                  <td className={`${td} font-medium`}>{d.missionNumber}</td>
                  <td className={td}>{d.employee.fullName}</td>
                  <td className={td}>{d.destination}</td>
                  <td className={td}>{formatDate(d.missionDate)}</td>
                  <td className={td}>{formatDateTime(d.decidedAt)}</td>
                  <td className={td}>
                    <StatusBadge status={d.status} />
                  </td>
                  <td className={`${td} max-w-xs truncate`}>{d.rejectionReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

const ASSET_LABEL: Record<AssetType, string> = { SIGNATURE: 'امضا', STAMP: 'مهر' };
const ASSET_HINT: Record<AssetType, string> = {
  SIGNATURE: 'تصویر امضای خود را بارگذاری کنید. فایل PNG با پس‌زمینه شفاف بهترین نتیجه را دارد.',
  STAMP: 'تصویر مهر سازمان یا مهر شخصی را بارگذاری کنید. فایل PNG با پس‌زمینه شفاف توصیه می‌شود.',
};

export interface AssetPanelProps {
  /** API base for asset routes, e.g. `/manager/assets` or `/admin/managers/3/assets`. */
  assetsBase: string;
  /** Current asset metadata (null when not uploaded). */
  assets: { SIGNATURE: AssetInfo | null; STAMP: AssetInfo | null } | null;
  /** Cache-busting key for previews; change after each mutation. */
  onChanged: () => void;
  readOnly?: boolean;
}

/** Upload, preview, replace and remove signature and stamp images. */
export function AssetPanel({ assetsBase, assets, onChanged, readOnly }: AssetPanelProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {(['SIGNATURE', 'STAMP'] as AssetType[]).map((type) => (
        <AssetCard key={type} type={type} assetsBase={assetsBase} info={assets?.[type] ?? null} onChanged={onChanged} readOnly={readOnly} />
      ))}
    </div>
  );
}

function AssetCard({ type, assetsBase, info, onChanged, readOnly }: { type: AssetType; assetsBase: string; info: AssetInfo | null; onChanged: () => void; readOnly?: boolean }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (f: File | null) => {
    setFileError('');
    if (!f) return setFile(null);
    if (!['image/png', 'image/jpeg'].includes(f.type)) return (setFileError('فقط فایل PNG یا JPG مجاز است'), setFile(null));
    if (f.size > 2 * 1024 * 1024) return (setFileError('حجم فایل نباید بیش از ۲ مگابایت باشد'), setFile(null));
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await api(`${assetsBase}/${type}`, { method: 'PUT', body });
      toast.success(`${ASSET_LABEL[type]} با موفقیت ذخیره شد`);
      setFile(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'بارگذاری فایل با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`${assetsBase}/${type}`, { method: 'DELETE' });
      toast.success(`${ASSET_LABEL[type]} حذف شد`);
      setConfirmRemove(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'حذف با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const version = info?.uploadedAt ?? 'none';
  return (
    <Card>
      <h3 className="font-semibold text-gray-900">{ASSET_LABEL[type]}</h3>
      <p className="mt-1 text-xs text-gray-500">{ASSET_HINT[type]}</p>

      <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3">
        {preview ? (
          <img src={preview} alt={`پیش‌نمایش ${ASSET_LABEL[type]}`} className="max-h-full max-w-full object-contain" />
        ) : info ? (
          <img src={apiUrl(`${assetsBase}/${type}/file?v=${encodeURIComponent(version)}`)} alt={ASSET_LABEL[type]} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-gray-400">{ASSET_LABEL[type]} ثبت نشده است</span>
        )}
      </div>
      {info && !preview && <p className="mt-2 text-xs text-gray-500">آخرین به‌روزرسانی: {formatDateTime(info.uploadedAt)}</p>}
      {preview && <p className="mt-2 text-xs text-orange-700">پیش‌نمایش فایل انتخابی؛ برای ذخیره، دکمه «ذخیره» را بزنید.</p>}

      {!readOnly && (
        <div className="mt-4 space-y-3">
          <Field label={info ? 'جایگزینی فایل' : 'بارگذاری فایل'} error={fileError}>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => onPick(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={upload} disabled={!file} loading={busy}>
              <Upload className="h-4 w-4" />
              ذخیره
            </Button>
            {info && (
              <Button variant="secondary" onClick={() => setConfirmRemove(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={`حذف ${ASSET_LABEL[type]}`}
        message={`آیا مطمئن هستید؟ ${ASSET_LABEL[type]} فقط برای برگه‌های صادرشده بعدی حذف می‌شود؛ برگه‌های قبلی تغییر نمی‌کنند.`}
        confirmLabel="حذف"
        danger
        loading={busy}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}
      />
    </Card>
  );
}

export function SignaturePage() {
  const { setUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ user: User; assets: { SIGNATURE: AssetInfo | null; STAMP: AssetInfo | null } } | null>(null);
  const [form, setForm] = useState({ jobTitle: '', phone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ user: User; assets: { SIGNATURE: AssetInfo | null; STAMP: AssetInfo | null } }>('/manager/profile').then((d) => {
      setData(d);
      setForm({ jobTitle: d.user.jobTitle ?? '', phone: d.user.phone ?? '' });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const res = await api<{ user: User }>('/manager/profile', { method: 'PATCH', json: form });
      setUser(res.user);
      toast.success('سمت سازمانی ذخیره شد');
      load();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof ApiError ? err.message : 'ذخیره با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader title="تنظیمات مهر و امضا" description="امضا و مهر شما روی برگه‌های مأموریتی که تأیید می‌کنید درج می‌شود. تغییرات فقط روی برگه‌های صادرشده بعدی اثر دارد." />
      <Card className="mb-6">
        <form onSubmit={saveProfile} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" noValidate>
          <Field label="سمت سازمانی (نمایش در برگه)" required error={errors.jobTitle}>
            <TextInput value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} error={errors.jobTitle} />
          </Field>
          <Field label="تلفن تماس" error={errors.phone}>
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} dir="ltr" />
          </Field>
          <Button type="submit" loading={busy}>
            ذخیره اطلاعات
          </Button>
        </form>
      </Card>
      <AssetPanel assetsBase="/manager/assets" assets={data.assets} onChanged={load} />
    </div>
  );
}
