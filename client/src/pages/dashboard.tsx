import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '../context/auth';
import { api } from '../lib/api';
import { ACTION_LABEL, formatDateTime, formatNumber } from '../lib/format';
import type { Mission, Paginated } from '../lib/types';
import { Button, Card, DataTable, EmptyState, PageHeader, Spinner, StatCard, StatusBadge, td, th } from '../components/ui';

type Summary = { TOTAL: number; PENDING: number; APPROVED: number; REJECTED: number; CANCELLED: number };

interface AdminStats {
  users: { employees: number; managers: number; admins: number };
  missions: { total: number; pending: number; approved: number; rejected: number };
  recentMissions: { id: number; missionNumber: string; employeeName: string; destination: string; status: Mission['status']; createdAt: string }[];
  recentActivity: { id: number; actorName: string | null; action: string; createdAt: string }[];
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'ADMIN') return <AdminDashboard />;
  return <MissionDashboard isManager={user.role === 'MANAGER'} />;
}

function MissionDashboard({ isManager }: { isManager: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Mission[] | null>(null);

  useEffect(() => {
    api<Summary>('/missions/summary').then(setSummary).catch(() => setSummary(null));
    api<Paginated<Mission>>('/missions?pageSize=5').then((d) => setRecent(d.items)).catch(() => setRecent([]));
  }, []);

  return (
    <div>
      <PageHeader
        title={`خوش آمدید، ${user?.fullName ?? ''}`}
        description={isManager ? 'خلاصه وضعیت مأموریت‌های سازمان' : 'خلاصه وضعیت درخواست‌های مأموریت شما'}
        actions={
          !isManager && (
            <Link to="/missions/new">
              <Button>
                <PlusCircle className="h-4 w-4" />
                ثبت مأموریت جدید
              </Button>
            </Link>
          )
        }
      />
      {!summary ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="کل مأموریت‌ها" value={formatNumber(summary.TOTAL)} tone="gray" onClick={() => navigate(isManager ? '/missions' : '/my-missions')} />
          <StatCard label="در انتظار تأیید" value={formatNumber(summary.PENDING)} tone="orange" onClick={() => navigate(isManager ? '/pending' : '/my-missions')} />
          <StatCard label="تأیید شده" value={formatNumber(summary.APPROVED)} tone="green" onClick={() => navigate(isManager ? '/missions' : '/my-missions')} />
          <StatCard label="رد شده" value={formatNumber(summary.REJECTED)} tone="red" onClick={() => navigate(isManager ? '/missions' : '/my-missions')} />
        </div>
      )}

      <Card className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">آخرین مأموریت‌ها</h2>
          <Link to={isManager ? '/missions' : '/my-missions'} className="text-sm text-brand-700 hover:underline">
            مشاهده همه
          </Link>
        </div>
        {!recent ? (
          <Spinner />
        ) : recent.length === 0 ? (
          <EmptyState title="هنوز مأموریتی ثبت نشده است" action={!isManager && <Link to="/missions/new" className="text-brand-700 hover:underline">ثبت اولین مأموریت</Link>} />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className={th}>شماره مأموریت</th>
                <th className={th}>کارمند</th>
                <th className={th}>مقصد</th>
                <th className={th}>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((m) => (
                <tr key={m.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/missions/${m.id}`)}>
                  <td className={td}>{m.missionNumber}</td>
                  <td className={td}>{m.employee.fullName}</td>
                  <td className={td}>{m.destination}</td>
                  <td className={td}>
                    <StatusBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api<AdminStats>('/admin/stats').then(setStats).catch(() => setStats(null));
  }, []);

  if (!stats) return <Spinner />;

  return (
    <div>
      <PageHeader title="داشبورد مدیریت سامانه" description="آمار کلی کاربران و مأموریت‌ها" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="کارکنان" value={formatNumber(stats.users.employees)} tone="gray" onClick={() => navigate('/admin/employees')} />
        <StatCard label="مدیران سازمان" value={formatNumber(stats.users.managers)} tone="blue" onClick={() => navigate('/admin/managers')} />
        <StatCard label="کل مأموریت‌ها" value={formatNumber(stats.missions.total)} tone="gray" onClick={() => navigate('/admin/missions')} />
        <StatCard label="در انتظار تأیید" value={formatNumber(stats.missions.pending)} tone="orange" onClick={() => navigate('/admin/missions')} />
        <StatCard label="تأیید شده" value={formatNumber(stats.missions.approved)} tone="green" onClick={() => navigate('/admin/missions')} />
        <StatCard label="رد شده" value={formatNumber(stats.missions.rejected)} tone="red" onClick={() => navigate('/admin/missions')} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-gray-900">آخرین مأموریت‌ها</h2>
          {stats.recentMissions.length === 0 ? (
            <EmptyState title="مأموریتی ثبت نشده است" />
          ) : (
            <ul className="divide-y">
              {stats.recentMissions.map((m) => (
                <li key={m.id}>
                  <Link to={`/missions/${m.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.employeeName} — {m.destination}</span>
                      <span className="block text-xs text-gray-500">{m.missionNumber}</span>
                    </span>
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-gray-900">آخرین فعالیت‌ها</h2>
          {stats.recentActivity.length === 0 ? (
            <EmptyState title="فعالیتی ثبت نشده است" />
          ) : (
            <ul className="divide-y text-sm">
              {stats.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-medium">{a.actorName ?? 'سامانه'}</span> — {ACTION_LABEL[a.action] ?? a.action}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
