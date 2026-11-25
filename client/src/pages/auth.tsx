import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/auth';
import { api, ApiError } from '../lib/api';
import { Button, Field, TextInput, useToast, Spinner } from '../components/ui';
import type { User } from '../lib/types';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-nav to-slate-700 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api<{ needsSetup: boolean }>('/setup/status')
      .then((s) => {
        if (s.needsSetup) navigate('/setup', { replace: true });
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      const data = await api<{ user: User }>('/auth/login', { method: 'POST', json: { username, password } });
      setUser(data.user);
      toast.success(`خوش آمدید، ${data.user.fullName}`);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(data.user.mustChangePassword ? '/change-password' : from ?? '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.message);
      } else {
        setFormError('ورود با خطا مواجه شد');
      }
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <Spinner />;

  return (
    <Shell title="ورود به سامانه مدیریت مأموریت" subtitle="نام کاربری و رمز عبور خود را وارد کنید">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="نام کاربری" required error={errors.username}>
          <TextInput autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} autoFocus dir="ltr" />
        </Field>
        <Field label="رمز عبور" required error={errors.password}>
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} dir="ltr" />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <Button type="submit" className="w-full" loading={busy}>
          ورود
        </Button>
      </form>
    </Shell>
  );
}

export function SetupPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState<{ needsSetup: boolean; setupTokenRequired: boolean } | null>(null);
  const [form, setForm] = useState({ setupToken: '', orgName: '', adminFullName: '', adminUsername: '', password: '', confirmPassword: '' });
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean; setupTokenRequired: boolean }>('/setup/status').then((s) => {
      if (!s.needsSetup) navigate('/login', { replace: true });
      setStatus(s);
    });
  }, [navigate]);

  if (!status) return <Spinner />;

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      if (logo) body.append('logo', logo);
      await api('/setup', { method: 'POST', body });
      toast.success('راه‌اندازی انجام شد. اکنون وارد شوید');
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.message);
      } else setFormError('راه‌اندازی با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="راه‌اندازی اولیه سامانه" subtitle="این صفحه فقط یک بار و برای ایجاد مدیر سامانه نمایش داده می‌شود">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {status.setupTokenRequired && (
          <Field label="کد راه‌اندازی (SETUP_TOKEN)" required error={errors.setupToken}>
            <TextInput type="password" value={form.setupToken} onChange={set('setupToken')} error={errors.setupToken} dir="ltr" />
          </Field>
        )}
        <Field label="نام سازمان" required error={errors.orgName}>
          <TextInput value={form.orgName} onChange={set('orgName')} error={errors.orgName} />
        </Field>
        <Field label="لوگوی سازمان" hint="PNG یا JPG، حداکثر ۲ مگابایت (اختیاری)" error={errors.logo}>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        </Field>
        <hr />
        <Field label="نام و نام خانوادگی مدیر سامانه" required error={errors.adminFullName}>
          <TextInput value={form.adminFullName} onChange={set('adminFullName')} error={errors.adminFullName} />
        </Field>
        <Field label="نام کاربری مدیر سامانه" required error={errors.adminUsername} hint="حروف انگلیسی، عدد، «.»، «_» یا «-»">
          <TextInput value={form.adminUsername} onChange={set('adminUsername')} error={errors.adminUsername} dir="ltr" />
        </Field>
        <Field label="رمز عبور" required error={errors.password} hint="حداقل ۸ نویسه">
          <TextInput type="password" value={form.password} onChange={set('password')} error={errors.password} dir="ltr" />
        </Field>
        <Field label="تکرار رمز عبور" required error={errors.confirmPassword}>
          <TextInput type="password" value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} dir="ltr" />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <Button type="submit" className="w-full" loading={busy}>
          ایجاد مدیر سامانه و شروع به کار
        </Button>
      </form>
    </Shell>
  );
}

export function ChangePasswordPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const forced = user?.mustChangePassword;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      const data = await api<{ user: User }>('/auth/change-password', { method: 'POST', json: form });
      setUser(data.user);
      toast.success('رمز عبور با موفقیت تغییر کرد');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setErrors(err.fields);
        setFormError(err.message);
      } else setFormError('تغییر رمز عبور با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">تغییر رمز عبور</h1>
        {forced ? (
          <p className="mt-2 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-800">رمز عبور شما موقت است. برای ادامه، باید رمز عبور جدید تعیین کنید.</p>
        ) : (
          <p className="mt-1 text-sm text-gray-500">رمز عبور جدید خود را وارد کنید.</p>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm" noValidate>
        <Field label="رمز عبور فعلی" required error={errors.currentPassword}>
          <TextInput type="password" value={form.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} dir="ltr" autoComplete="current-password" />
        </Field>
        <Field label="رمز عبور جدید" required error={errors.newPassword} hint="حداقل ۸ نویسه شامل حرف و عدد">
          <TextInput type="password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword} dir="ltr" autoComplete="new-password" />
        </Field>
        <Field label="تکرار رمز عبور جدید" required error={errors.confirmPassword}>
          <TextInput type="password" value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} dir="ltr" autoComplete="new-password" />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <Button type="submit" loading={busy} className="w-full">
          ذخیره رمز عبور جدید
        </Button>
      </form>
    </div>
  );
}
