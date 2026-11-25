import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { api, ApiError } from '../lib/api';
import { formatDate, todayIso } from '../lib/format';
import type { Mission } from '../lib/types';
import { Button, Card, DateField, Field, PageHeader, Spinner, TextArea, TextInput, useToast } from '../components/ui';

interface FormState {
  missionDate: string;
  destination: string;
  purpose: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  description: string;
}

const EMPTY: FormState = {
  missionDate: '',
  destination: '',
  purpose: '',
  departureTime: '',
  returnDate: '',
  returnTime: '',
  description: '',
};

export function MissionFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<FormState>({ ...EMPTY, missionDate: todayIso(), returnDate: todayIso() });
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [mission, setMission] = useState<Mission | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    api<Mission>(`/missions/${id}`)
      .then((m) => {
        setMission(m);
        if (!m.permissions.canEdit) {
          toast.error('فقط درخواست‌های در انتظار تأیید قابل ویرایش هستند');
          navigate(`/missions/${m.id}`, { replace: true });
          return;
        }
        setForm({
          missionDate: m.missionDate,
          destination: m.destination,
          purpose: m.purpose,
          departureTime: m.departureTime,
          returnDate: m.returnDate,
          returnTime: m.returnTime,
          description: m.description ?? '',
        });
      })
      .catch((e: Error) => setFormError(e.message))
      .finally(() => setLoading(false));
  }, [id, isEdit, navigate, toast]);

  if (loading) return <Spinner />;

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(e.target.value);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      const payload = { ...form, description: form.description.trim() || undefined };
      const m = isEdit
        ? await api<Mission>(`/missions/${id}`, { method: 'PATCH', json: payload })
        : await api<Mission>('/missions', { method: 'POST', json: payload });
      toast.success(isEdit ? 'درخواست مأموریت ویرایش شد' : 'درخواست مأموریت با موفقیت ثبت شد');
      navigate(`/missions/${m.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.message);
      } else setFormError('ذخیره اطلاعات با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isEdit ? `ویرایش درخواست ${mission?.missionNumber ?? ''}` : 'ثبت مأموریت جدید'}
        description="فیلدهای ستاره‌دار الزامی هستند. پس از تأیید مدیر، امکان ویرایش درخواست وجود ندارد."
      />

      <Card className="mb-6 bg-brand-50/50">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-gray-500">نام کارمند</div>
            <div className="font-medium">{mission?.employee.fullName ?? user?.fullName}</div>
          </div>
          <div>
            <div className="text-gray-500">کد پرسنلی</div>
            <div className="font-medium">{mission?.employee.employeeCode ?? '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">واحد سازمانی</div>
            <div className="font-medium">{mission?.department ?? user?.departmentName ?? '—'}</div>
          </div>
        </div>
      </Card>

      <form onSubmit={submit} noValidate>
        <Card className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="تاریخ مأموریت" required error={errors.missionDate}>
              <DateField value={form.missionDate} onChange={set('missionDate')} error={errors.missionDate} />
            </Field>
            <Field label="مقصد" required error={errors.destination}>
              <TextInput value={form.destination} onChange={text('destination')} error={errors.destination} placeholder="مثال: اصفهان — شرکت نمونه" />
            </Field>
            <Field label="ساعت حرکت" required error={errors.departureTime}>
              <TextInput type="time" value={form.departureTime} onChange={text('departureTime')} error={errors.departureTime} dir="ltr" />
            </Field>
            <div />
            <Field label="تاریخ بازگشت" required error={errors.returnDate} hint={form.returnDate ? `بازگشت: ${formatDate(form.returnDate)}` : undefined}>
              <DateField value={form.returnDate} onChange={set('returnDate')} error={errors.returnDate} />
            </Field>
            <Field label="ساعت بازگشت" required error={errors.returnTime}>
              <TextInput type="time" value={form.returnTime} onChange={text('returnTime')} error={errors.returnTime} dir="ltr" />
            </Field>
          </div>
          <Field label="شرح و هدف مأموریت" required error={errors.purpose}>
            <TextArea value={form.purpose} onChange={text('purpose')} error={errors.purpose} rows={4} />
          </Field>
          <Field label="توضیحات تکمیلی" error={errors.description}>
            <TextArea value={form.description} onChange={text('description')} error={errors.description} rows={2} />
          </Field>
          {formError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
          <div className="flex justify-end gap-3 border-t pt-5">
            <Link to={isEdit ? `/missions/${id}` : '/my-missions'}>
              <Button variant="secondary" type="button">
                انصراف
              </Button>
            </Link>
            <Button type="submit" loading={busy}>
              {isEdit ? 'ذخیره تغییرات' : 'ثبت درخواست'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
