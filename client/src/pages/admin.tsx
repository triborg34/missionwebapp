import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, KeyRound, Pencil, Plus, Power, Trash2, Stamp, Upload } from 'lucide-react';
import { api, ApiError, apiUrl, qs } from '../lib/api';
import { ACTION_LABEL, formatDateTime, ROLE_LABEL } from '../lib/format';
import type { AdminUser, AssetInfo, Department, Paginated, Role } from '../lib/types';
import { AssetPanel } from './manager';
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  TextInput,
  useToast,
  td,
  th,
} from '../components/ui';

// ---------- Users / employees / managers ----------

const PAGE_TITLES: Record<string, string> = {
  ALL: 'مدیریت کاربران',
  EMPLOYEE: 'مدیریت کارکنان',
  MANAGER: 'مدیریت مدیران',
};

interface UserForm {
  fullName: string;
  username: string;
  role: Role;
  employeeCode: string;
  departmentId: string;
  jobTitle: string;
  phone: string;
  managerId: string;
}

const emptyForm = (role: Role): UserForm => ({ fullName: '', username: '', role, employeeCode: '', departmentId: '', jobTitle: '', phone: '', managerId: '' });

export function UsersPage({ role }: { role?: Role }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', departmentId: '', status: '', role: role ?? '' });
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<AdminUser[]>([]);
  const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; user: AdminUser } | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'reset' | 'delete'; user: AdminUser }>(null);
  const [assetsFor, setAssetsFor] = useState<AdminUser | null>(null);
  const [assets, setAssets] = useState<{ SIGNATURE: AssetInfo | null; STAMP: AssetInfo | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pageTitle = PAGE_TITLES[role ?? 'ALL'];
  const lockedRole = role;

  useEffect(() => {
    api<{ items: Department[] }>('/departments').then((d) => setDepartments(d.items)).catch(() => setDepartments([]));
  }, []);

  const loadManagers = useCallback(() => {
    api<Paginated<AdminUser>>('/admin/users?role=MANAGER&status=active&pageSize=100')
      .then((d) => setManagers(d.items))
      .catch(() => setManagers([]));
  }, []);

  useEffect(() => {
    loadManagers();
  }, [loadManagers, reloadKey]);

  useEffect(() => {
    setData(null);
    const t = setTimeout(() => {
      api<Paginated<AdminUser>>(`/admin/users${qs({ ...filters, role: lockedRole ?? filters.role, page, pageSize })}`)
        .then(setData)
        .catch(() => setData({ items: [], total: 0, page, pageSize }));
    }, 250);
    return () => clearTimeout(t);
  }, [filters, page, lockedRole, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);
  const setFilter = (key: keyof typeof filters) => (value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  const runAction = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      setConfirm(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'عملیات با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = (u: AdminUser) =>
    runAction(() => api(`/admin/users/${u.id}`, { method: 'PATCH', json: { isActive: !u.isActive } }), u.isActive ? 'کاربر غیرفعال شد' : 'کاربر فعال شد');

  const openAssets = async (u: AdminUser) => {
    setAssetsFor(u);
    setAssets(null);
    setAssets(await api<{ SIGNATURE: AssetInfo | null; STAMP: AssetInfo | null }>(`/admin/managers/${u.id}/assets`));
  };

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={data ? `${data.total.toLocaleString('fa-IR')} کاربر` : undefined}
        actions={
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus className="h-4 w-4" />
            {role === 'MANAGER' ? 'افزودن مدیر' : role === 'EMPLOYEE' ? 'افزودن کارمند' : 'افزودن کاربر'}
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="جستجو (نام، نام کاربری، کد پرسنلی)">
            <TextInput value={filters.q} onChange={(e) => setFilter('q')(e.target.value)} placeholder="جستجو..." />
          </Field>
          {!lockedRole && (
            <Field label="نقش">
              <Select value={filters.role} onChange={(e) => setFilter('role')(e.target.value)}>
                <option value="">همه نقش‌ها</option>
                <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                <option value="MANAGER">{ROLE_LABEL.MANAGER}</option>
                <option value="EMPLOYEE">{ROLE_LABEL.EMPLOYEE}</option>
              </Select>
            </Field>
          )}
          <Field label="واحد سازمانی">
            <Select value={filters.departmentId} onChange={(e) => setFilter('departmentId')(e.target.value)}>
              <option value="">همه واحدها</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="وضعیت حساب">
            <Select value={filters.status} onChange={(e) => setFilter('status')(e.target.value)}>
              <option value="">همه</option>
              <option value="active">فعال</option>
              <option value="inactive">غیرفعال</option>
            </Select>
          </Field>
        </div>
      </Card>

      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState title="کاربری یافت نشد" />
        </Card>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <th className={th}>نام و نام خانوادگی</th>
                <th className={th}>نام کاربری</th>
                <th className={th}>کد پرسنلی</th>
                <th className={th}>نقش</th>
                <th className={th}>واحد</th>
                <th className={th}>سمت</th>
                {(!lockedRole || lockedRole === 'EMPLOYEE') && <th className={th}>مدیر مسئول</th>}
                <th className={th}>وضعیت</th>
                <th className={`${th} text-left`}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'bg-gray-50 text-gray-500'}>
                  <td className={`${td} font-medium`}>{u.fullName}</td>
                  <td className={`${td} font-mono text-xs`} dir="ltr">{u.username}</td>
                  <td className={td}>{u.employeeCode}</td>
                  <td className={td}>{ROLE_LABEL[u.role]}</td>
                  <td className={td}>{u.departmentName ?? '—'}</td>
                  <td className={td}>{u.jobTitle || '—'}</td>
                  {(!lockedRole || lockedRole === 'EMPLOYEE') && <td className={td}>{u.managerName ?? '—'}</td>}
                  <td className={td}>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                      {u.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap justify-end gap-1">
                      <IconBtn title="ویرایش" onClick={() => setEditing({ mode: 'edit', user: u })}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      {u.role === 'MANAGER' && (
                        <IconBtn title="مهر و امضا" onClick={() => openAssets(u)}>
                          <Stamp className="h-4 w-4" />
                        </IconBtn>
                      )}
                      <IconBtn title="بازنشانی رمز عبور" onClick={() => setConfirm({ kind: 'reset', user: u })}>
                        <KeyRound className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title={u.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'} onClick={() => toggleActive(u)}>
                        <Power className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title="حذف" danger onClick={() => setConfirm({ kind: 'delete', user: u })}>
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />
        </>
      )}

      {editing && (
        <UserFormModal
          key={editing.mode === 'edit' ? editing.user.id : 'new'}
          state={editing}
          lockedRole={lockedRole}
          departments={departments}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        title="بازنشانی رمز عبور"
        message={`رمز عبور «${confirm?.user.fullName ?? ''}» به مقدار پیش‌فرض بازنشانی می‌شود و کاربر در ورود بعدی باید رمز جدید تعیین کند. نشست‌های فعال او بسته می‌شوند.`}
        confirmLabel="بازنشانی"
        danger
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && runAction(() => api(`/admin/users/${confirm.user.id}/reset-password`, { method: 'POST' }), 'رمز عبور بازنشانی شد')}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="حذف کاربر"
        message={`آیا از حذف «${confirm?.user.fullName ?? ''}» اطمینان دارید؟ کاربرانی که سابقه مأموریت یا تصمیم دارند حذف نمی‌شوند و باید غیرفعال شوند.`}
        confirmLabel="حذف"
        danger
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && runAction(() => api(`/admin/users/${confirm.user.id}`, { method: 'DELETE' }), 'کاربر حذف شد')}
      />

      <Modal open={Boolean(assetsFor)} title={`مهر و امضای ${assetsFor?.fullName ?? ''}`} onClose={() => setAssetsFor(null)} wide>
        {assetsFor && assets ? (
          <AssetPanel assetsBase={`/admin/managers/${assetsFor.id}/assets`} assets={assets} onChanged={() => openAssets(assetsFor)} />
        ) : (
          <Spinner />
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-100 hover:text-brand-700'}`}
    >
      {children}
    </button>
  );
}

function UserFormModal({
  state,
  lockedRole,
  departments,
  managers,
  onClose,
  onSaved,
}: {
  state: { mode: 'create' } | { mode: 'edit'; user: AdminUser };
  lockedRole?: Role;
  departments: Department[];
  managers: AdminUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const initial: UserForm =
    state.mode === 'edit'
      ? {
          fullName: state.user.fullName,
          username: state.user.username,
          role: state.user.role,
          employeeCode: state.user.employeeCode,
          departmentId: state.user.departmentId ? String(state.user.departmentId) : '',
          jobTitle: state.user.jobTitle ?? '',
          phone: state.user.phone ?? '',
          managerId: state.user.managerId ? String(state.user.managerId) : '',
        }
      : emptyForm(lockedRole ?? 'EMPLOYEE');
  const [form, setForm] = useState<UserForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: keyof UserForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    const payload = {
      fullName: form.fullName.trim(),
      username: form.username.trim(),
      role: form.role,
      employeeCode: form.employeeCode.trim(),
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      jobTitle: form.jobTitle.trim(),
      phone: form.phone.trim(),
      managerId: form.role === 'EMPLOYEE' && form.managerId ? Number(form.managerId) : null,
    };
    try {
      if (state.mode === 'create') {
        await api('/admin/users', { method: 'POST', json: payload });
        toast.success('کاربر جدید ایجاد شد. رمز عبور پیش‌فرض ۱۲۳۴۵۶ است و در اولین ورود تغییر می‌کند');
      } else {
        await api(`/admin/users/${state.user.id}`, { method: 'PATCH', json: payload });
        toast.success('اطلاعات کاربر ذخیره شد');
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setFormError(err instanceof ApiError ? err.message : 'ذخیره با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={state.mode === 'create' ? 'افزودن کاربر' : `ویرایش ${state.user.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button type="submit" form="user-form" loading={busy}>
            ذخیره
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
        <Field label="نام و نام خانوادگی" required error={errors.fullName}>
          <TextInput value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
        </Field>
        <Field label="نام کاربری" required error={errors.username} hint="حروف انگلیسی، عدد، «.»، «_» یا «-»">
          <TextInput value={form.username} onChange={set('username')} error={errors.username} dir="ltr" />
        </Field>
        <Field label="کد پرسنلی" required error={errors.employeeCode}>
          <TextInput value={form.employeeCode} onChange={set('employeeCode')} error={errors.employeeCode} dir="ltr" />
        </Field>
        <Field label="نقش" required error={errors.role}>
          <Select value={form.role} onChange={set('role')} error={errors.role} disabled={Boolean(lockedRole)}>
            <option value="EMPLOYEE">{ROLE_LABEL.EMPLOYEE}</option>
            <option value="MANAGER">{ROLE_LABEL.MANAGER}</option>
            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
          </Select>
        </Field>
        <Field label="واحد سازمانی" error={errors.departmentId}>
          <Select value={form.departmentId} onChange={set('departmentId')} error={errors.departmentId}>
            <option value="">بدون واحد</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="سمت شغلی" required error={errors.jobTitle}>
          <TextInput value={form.jobTitle} onChange={set('jobTitle')} error={errors.jobTitle} />
        </Field>
        <Field label="تلفن همراه" error={errors.phone}>
          <TextInput value={form.phone} onChange={set('phone')} error={errors.phone} dir="ltr" />
        </Field>
        {form.role === 'EMPLOYEE' && (
          <Field label="مدیر مسئول" error={errors.managerId} hint="مدیری که درخواست‌های این کارمند را تأیید می‌کند">
            <Select value={form.managerId} onChange={set('managerId')} error={errors.managerId}>
              <option value="">بدون مدیر</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {formError && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">{formError}</p>}
      </form>
    </Modal>
  );
}

// ---------- Reports ----------

export function ReportsPage() {
  const [data, setData] = useState<{
    byDepartment: { name: string; PENDING: number; APPROVED: number; REJECTED: number; CANCELLED: number; TOTAL: number }[];
    byManager: { name: string; decisions: number }[];
    topDestinations: { name: string; count: number }[];
  } | null>(null);

  useEffect(() => {
    api<typeof data>('/admin/reports/summary').then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="گزارش‌ها"
        description="خلاصه آماری مأموریت‌ها بر اساس واحد، مدیر و مقصد"
        actions={
          <a href={apiUrl('/missions/export.xlsx')} download>
            <Button variant="secondary">
              <Download className="h-4 w-4" />
              خروجی کامل اکسل
            </Button>
          </a>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <h2 className="mb-4 font-semibold">مأموریت‌ها بر اساس واحد سازمانی</h2>
          {data.byDepartment.length === 0 ? (
            <EmptyState title="داده‌ای برای نمایش وجود ندارد" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th className={th}>واحد</th>
                  <th className={th}>کل</th>
                  <th className={th}>در انتظار</th>
                  <th className={th}>تأیید شده</th>
                  <th className={th}>رد شده</th>
                  <th className={th}>لغو شده</th>
                </tr>
              </thead>
              <tbody>
                {data.byDepartment.map((r) => (
                  <tr key={r.name}>
                    <td className={`${td} font-medium`}>{r.name}</td>
                    <td className={td}>{r.TOTAL}</td>
                    <td className={td}>{r.PENDING}</td>
                    <td className={td}>{r.APPROVED}</td>
                    <td className={td}>{r.REJECTED}</td>
                    <td className={td}>{r.CANCELLED}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">تعداد تصمیم‌گیری مدیران</h2>
          {data.byManager.length === 0 ? (
            <EmptyState title="هنوز تصمیمی ثبت نشده" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th className={th}>مدیر</th>
                  <th className={th}>تعداد تصمیم</th>
                </tr>
              </thead>
              <tbody>
                {data.byManager.map((r) => (
                  <tr key={r.name}>
                    <td className={td}>{r.name}</td>
                    <td className={td}>{r.decisions}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">پرتکرارترین مقصدها</h2>
          {data.topDestinations.length === 0 ? (
            <EmptyState title="داده‌ای برای نمایش وجود ندارد" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th className={th}>مقصد</th>
                  <th className={th}>تعداد</th>
                </tr>
              </thead>
              <tbody>
                {data.topDestinations.map((r) => (
                  <tr key={r.name}>
                    <td className={td}>{r.name}</td>
                    <td className={td}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- System settings (org, logo, departments) ----------

export function SettingsPage() {
  const toast = useToast();
  const [orgName, setOrgName] = useState('');
  const [hasLogo, setHasLogo] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDept, setNewDept] = useState('');
  const [editDept, setEditDept] = useState<{ id: number; name: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const loadDepartments = useCallback(() => {
    api<{ items: Department[] }>('/departments').then((d) => setDepartments(d.items));
  }, []);

  useEffect(() => {
    api<{ orgName: string; hasLogo: boolean }>('/admin/settings').then((s) => {
      setOrgName(s.orgName);
      setHasLogo(s.hasLogo);
      setLoaded(true);
    });
    loadDepartments();
  }, [loadDepartments]);

  const saveOrg = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api<{ orgName: string }>('/admin/settings', { method: 'PATCH', json: { orgName: orgName.trim() } });
      setOrgName(res.orgName);
      toast.success('نام سازمان ذخیره شد');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ذخیره با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', logoFile);
      const res = await api<{ hasLogo: boolean }>('/admin/settings/logo', { method: 'PUT', body });
      setHasLogo(res.hasLogo);
      setLogoVersion((v) => v + 1);
      setLogoFile(null);
      toast.success('لوگوی سازمان به‌روزرسانی شد');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'بارگذاری لوگو با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const deleteLogo = async () => {
    setBusy(true);
    try {
      await api('/admin/settings/logo', { method: 'DELETE' });
      setHasLogo(false);
      setRemoveLogo(false);
      toast.success('لوگو حذف شد');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'حذف لوگو با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const addDept = async (e: FormEvent) => {
    e.preventDefault();
    if (newDept.trim().length < 2) return toast.error('نام واحد باید حداقل ۲ نویسه باشد');
    setBusy(true);
    try {
      await api('/departments', { method: 'POST', json: { name: newDept.trim() } });
      setNewDept('');
      toast.success('واحد سازمانی افزوده شد');
      loadDepartments();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'افزودن واحد با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  const renameDept = async (e: FormEvent) => {
    e.preventDefault();
    if (!editDept) return;
    if (editDept.name.trim().length < 2) return toast.error('نام واحد باید حداقل ۲ نویسه باشد');
    setBusy(true);
    try {
      await api(`/departments/${editDept.id}`, { method: 'PATCH', json: { name: editDept.name.trim() } });
      setEditDept(null);
      toast.success('نام واحد ویرایش شد');
      loadDepartments();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'ویرایش واحد با خطا مواجه شد');
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Spinner />;

  return (
    <div>
      <PageHeader title="تنظیمات سامانه" description="اطلاعات سازمان، لوگو و واحدهای سازمانی" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">اطلاعات سازمان</h2>
          <form onSubmit={saveOrg} className="space-y-4" noValidate>
            <Field label="نام سازمان" required error={error}>
              <TextInput value={orgName} onChange={(e) => setOrgName(e.target.value)} error={error} />
            </Field>
            <Button type="submit" loading={busy}>
              ذخیره نام سازمان
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">لوگوی سازمان</h2>
          <div className="mb-4 flex h-32 items-center justify-center rounded-lg border border-dashed bg-gray-50 p-3">
            {hasLogo && !removeLogo ? (
              <img src={apiUrl(`/public/logo?v=${logoVersion}`)} alt="لوگوی سازمان" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-sm text-gray-400">لوگویی ثبت نشده است</span>
            )}
          </div>
          <div className="space-y-3">
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={uploadLogo} disabled={!logoFile} loading={busy}>
                <Upload className="h-4 w-4" />
                بارگذاری لوگو
              </Button>
              {hasLogo && (
                <Button variant="secondary" onClick={() => setRemoveLogo(true)} disabled={busy}>
                  <Trash2 className="h-4 w-4" />
                  حذف لوگو
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h2 className="mb-4 font-semibold">واحدهای سازمانی</h2>
          <form onSubmit={addDept} className="mb-5 flex gap-2">
            <TextInput value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="نام واحد جدید" className="max-w-sm" />
            <Button type="submit" loading={busy}>
              <Plus className="h-4 w-4" />
              افزودن واحد
            </Button>
          </form>
          {departments.length === 0 ? (
            <EmptyState title="واحدی تعریف نشده است" />
          ) : (
            <ul className="divide-y rounded-lg border">
              {departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  {editDept?.id === d.id ? (
                    <form onSubmit={renameDept} className="flex flex-1 gap-2">
                      <TextInput value={editDept.name} onChange={(e) => setEditDept({ id: d.id, name: e.target.value })} className="max-w-sm" />
                      <Button type="submit" loading={busy}>
                        ذخیره
                      </Button>
                      <Button variant="secondary" type="button" onClick={() => setEditDept(null)}>
                        انصراف
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="font-medium">{d.name}</span>
                      <Button variant="ghost" onClick={() => setEditDept({ id: d.id, name: d.name })}>
                        <Pencil className="h-4 w-4" />
                        ویرایش
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={removeLogo}
        title="حذف لوگو"
        message="لوگوی سازمان از سامانه حذف می‌شود. برگه‌های قبلاً صادرشده تغییر نمی‌کنند."
        confirmLabel="حذف"
        danger
        loading={busy}
        onCancel={() => setRemoveLogo(false)}
        onConfirm={deleteLogo}
      />
    </div>
  );
}

// ---------- Audit log ----------

interface AuditRow {
  id: number;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export function AuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [data, setData] = useState<Paginated<AuditRow> | null>(null);

  useEffect(() => {
    setData(null);
    const t = setTimeout(() => {
      api<Paginated<AuditRow>>(`/admin/audit${qs({ q, action, page, pageSize })}`)
        .then(setData)
        .catch(() => setData({ items: [], total: 0, page, pageSize }));
    }, 250);
    return () => clearTimeout(t);
  }, [q, action, page]);

  return (
    <div>
      <PageHeader title="گزارش فعالیت‌ها" description="ثبت تمام اقدامات مهم کاربران در سامانه" />
      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="جستجو">
            <TextInput value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="نام کاربر، جزئیات..." />
          </Field>
          <Field label="نوع اقدام">
            <Select value={action} onChange={(e) => (setAction(e.target.value), setPage(1))}>
              <option value="">همه اقدامات</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState title="رویدادی یافت نشد" />
        </Card>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <th className={th}>زمان</th>
                <th className={th}>کاربر</th>
                <th className={th}>اقدام</th>
                <th className={th}>موجودیت</th>
                <th className={th}>جزئیات</th>
                <th className={th}>نشانی IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} whitespace-nowrap text-xs`}>{formatDateTime(a.createdAt)}</td>
                  <td className={td}>{a.actorName ?? 'سامانه'}</td>
                  <td className={td}>{ACTION_LABEL[a.action] ?? a.action}</td>
                  <td className={td}>{a.entityType ? `${a.entityType} ${a.entityId ?? ''}` : '—'}</td>
                  <td className={`${td} max-w-xs break-all text-xs text-gray-600`}>{a.details ?? '—'}</td>
                  <td className={`${td} font-mono text-xs`} dir="ltr">{a.ip ?? '—'}</td>
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

