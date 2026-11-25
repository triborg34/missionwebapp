import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, PlusCircle, Search, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/auth';
import { api, apiUrl, qs } from '../lib/api';
import { formatDate, formatDateTime, STATUS_LABEL } from '../lib/format';
import type { AdminUser, Department, MissionStatus, Mission, Paginated } from '../lib/types';
import { Button, Card, DataTable, DateField, EmptyState, Field, PageHeader, Pagination, Select, Spinner, StatusBadge, TextInput, th, td } from '../components/ui';

interface Props {
  /** `own` lists only the signed-in employee's missions; `all` is limited server-side by role. */
  scope: 'own' | 'all';
  status?: MissionStatus;
  title: string;
}

interface Filters {
  q: string;
  status: string;
  departmentId: string;
  destination: string;
  approverId: string;
  missionFrom: string;
  missionTo: string;
  submittedFrom: string;
  submittedTo: string;
  sortBy: string;
  sortDir: string;
}

const EMPTY_FILTERS: Filters = {
  q: '',
  status: '',
  departmentId: '',
  destination: '',
  approverId: '',
  missionFrom: '',
  missionTo: '',
  submittedFrom: '',
  submittedTo: '',
  sortBy: 'createdAt',
  sortDir: 'desc',
};

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'تاریخ ثبت' },
  { value: 'missionDate', label: 'تاریخ مأموریت' },
  { value: 'missionNumber', label: 'شماره مأموریت' },
  { value: 'destination', label: 'مقصد' },
  { value: 'status', label: 'وضعیت' },
];

export function MissionListPage({ scope, status, title }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedText, setDebouncedText] = useState({ q: '', destination: '' });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [data, setData] = useState<Paginated<Mission> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<AdminUser[]>([]);

  const isEmployee = user?.role === 'EMPLOYEE';
  const isAdmin = user?.role === 'ADMIN';
  const canExport = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => {
    api<{ items: Department[] }>('/departments').then((d) => setDepartments(d.items)).catch(() => setDepartments([]));
    if (isAdmin) {
      api<Paginated<AdminUser>>('/admin/users?role=MANAGER&pageSize=100')
        .then((d) => setManagers(d.items))
        .catch(() => setManagers([]));
    }
  }, [isAdmin]);

  // Debounce free-text filters so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedText({ q: filters.q, destination: filters.destination });
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filters.q, filters.destination]);

  const params = useMemo(
    () => ({
      q: debouncedText.q.trim(),
      destination: debouncedText.destination.trim(),
      status: status ?? filters.status,
      departmentId: isEmployee ? '' : filters.departmentId,
      approverId: isAdmin ? filters.approverId : '',
      missionFrom: filters.missionFrom,
      missionTo: filters.missionTo,
      submittedFrom: filters.submittedFrom,
      submittedTo: filters.submittedTo,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    }),
    [debouncedText, status, filters, isEmployee, isAdmin],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api<Paginated<Mission>>(`/missions${qs({ ...params, page, pageSize })}`)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params, page, pageSize]);

  const set = (key: keyof Filters) => (value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    if (!['q', 'destination'].includes(key)) setPage(1);
  };

  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setDebouncedText({ q: '', destination: '' });
    setPage(1);
  };

  const hasActiveFilter =
    filters.q !== '' || filters.status !== '' || filters.departmentId !== '' || filters.destination !== '' || filters.approverId !== '' ||
    filters.missionFrom !== '' || filters.missionTo !== '' || filters.submittedFrom !== '' || filters.submittedTo !== '';

  return (
    <div>
      <PageHeader
        title={title}
        description={data ? `${data.total.toLocaleString('fa-IR')} مأموریت` : undefined}
        actions={
          <>
            {canExport && (
              <a href={apiUrl(`/missions/export.xlsx${qs(params)}`)} download>
                <Button variant="secondary">
                  <Download className="h-4 w-4" />
                  خروجی اکسل
                </Button>
              </a>
            )}
            {scope === 'own' && (
              <Link to="/missions/new">
                <Button>
                  <PlusCircle className="h-4 w-4" />
                  ثبت مأموریت جدید
                </Button>
              </Link>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="جستجو (نام کارمند، شماره مأموریت)">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
              <TextInput value={filters.q} onChange={(e) => set('q')(e.target.value)} placeholder="جستجو..." className="pr-9" />
            </div>
          </Field>
          {!status && (
            <Field label="وضعیت">
              <Select value={filters.status} onChange={(e) => set('status')(e.target.value)}>
                <option value="">همه وضعیت‌ها</option>
                {(Object.keys(STATUS_LABEL) as MissionStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {!isEmployee && (
            <Field label="واحد سازمانی">
              <Select value={filters.departmentId} onChange={(e) => set('departmentId')(e.target.value)}>
                <option value="">همه واحدها</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="مقصد">
            <TextInput value={filters.destination} onChange={(e) => set('destination')(e.target.value)} placeholder="مقصد مأموریت" />
          </Field>
          {isAdmin && (
            <Field label="مدیر تأییدکننده">
              <Select value={filters.approverId} onChange={(e) => set('approverId')(e.target.value)}>
                <option value="">همه مدیران</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="تاریخ مأموریت از">
            <DateField value={filters.missionFrom} onChange={set('missionFrom')} />
          </Field>
          <Field label="تاریخ مأموریت تا">
            <DateField value={filters.missionTo} onChange={set('missionTo')} />
          </Field>
          <Field label="تاریخ ثبت از">
            <DateField value={filters.submittedFrom} onChange={set('submittedFrom')} />
          </Field>
          <Field label="تاریخ ثبت تا">
            <DateField value={filters.submittedTo} onChange={set('submittedTo')} />
          </Field>
          <Field label="مرتب‌سازی">
            <div className="flex gap-2">
              <Select value={filters.sortBy} onChange={(e) => set('sortBy')(e.target.value)} className="flex-1">
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <Select value={filters.sortDir} onChange={(e) => set('sortDir')(e.target.value)} className="w-28">
                <option value="desc">نزولی</option>
                <option value="asc">صعودی</option>
              </Select>
            </div>
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" onClick={reset} disabled={!hasActiveFilter}>
              <RotateCcw className="h-4 w-4" />
              پاک کردن فیلترها
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {loading && !data ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <Card>
          <EmptyState
            title={hasActiveFilter ? 'نتیجه‌ای با این فیلترها یافت نشد' : 'مأموریتی برای نمایش وجود ندارد'}
            action={scope === 'own' && !hasActiveFilter && <Link to="/missions/new" className="text-brand-700 hover:underline">ثبت مأموریت جدید</Link>}
          />
        </Card>
      ) : (
        <div className={loading ? 'opacity-60 transition' : ''}>
          <DataTable>
            <thead>
              <tr>
                <th className={th}>شماره مأموریت</th>
                <th className={th}>کارمند</th>
                <th className={th}>واحد</th>
                <th className={th}>مقصد</th>
                <th className={th}>تاریخ مأموریت</th>
                <th className={th}>تاریخ ثبت</th>
                <th className={th}>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/missions/${m.id}`)}>
                  <td className={`${td} font-medium`}>{m.missionNumber}</td>
                  <td className={td}>{m.employee.fullName}</td>
                  <td className={td}>{m.department}</td>
                  <td className={td}>{m.destination}</td>
                  <td className={td}>{formatDate(m.missionDate)}</td>
                  <td className={td}>{formatDateTime(m.createdAt)}</td>
                  <td className={td}>
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
