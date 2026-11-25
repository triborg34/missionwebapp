import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/auth';
import { api, ApiError } from '../lib/api';
import { ROLE_LABEL } from '../lib/format';
import type { User } from '../lib/types';
import { Button, Card, Field, PageHeader, TextInput, useToast } from '../components/ui';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ jobTitle: user?.jobTitle ?? '', phone: user?.phone ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const canEdit = user.role === 'MANAGER';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const res = await api<{ user: User }>('/manager/profile', { method: 'PATCH', json: form });
      setUser(res.user);
      toast.success('اطلاعات پروفایل ذخیره شد');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof ApiError ? err.message : 'ذخیره با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const info: [string, string | null | undefined][] = [
    ['نام و نام خانوادگی', user.fullName],
    ['نام کاربری', user.username],
    ['کد پرسنلی', user.employeeCode],
    ['نقش', ROLE_LABEL[user.role]],
    ['واحد سازمانی', user.departmentName],
    ['سمت', user.jobTitle],
    ['تلفن', user.phone],
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="پروفایل" description="اطلاعات حساب کاربری شما" />
      <Card className="mb-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          {info.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="mt-1 font-medium text-gray-900">{value || '—'}</dd>
            </div>
          ))}
        </dl>
        {!canEdit && <p className="mt-6 text-xs text-gray-500">برای تغییر اطلاعات حساب، با مدیر سامانه تماس بگیرید. برای تغییر رمز عبور از منوی «تغییر رمز عبور» استفاده کنید.</p>}
      </Card>

      {canEdit && (
        <Card>
          <h2 className="mb-4 font-semibold">ویرایش سمت و تلفن</h2>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2" noValidate>
            <Field label="سمت سازمانی" required error={errors.jobTitle}>
              <TextInput value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} error={errors.jobTitle} />
            </Field>
            <Field label="تلفن تماس" error={errors.phone}>
              <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} dir="ltr" />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit" loading={busy}>
                ذخیره تغییرات
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
