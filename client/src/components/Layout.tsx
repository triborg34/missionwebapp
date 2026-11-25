import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, UserCircle } from 'lucide-react';
import { useAuth } from '../context/auth';
import { api } from '../lib/api';
import { ROLE_LABEL } from '../lib/format';
import type { Role } from '../lib/types';
import { useToast } from './ui';
import { LayoutDashboard, PlusCircle, ListChecks, ClipboardList, FileCheck2, Stamp, Users, UserCog, Briefcase, Settings, Activity, BarChart3 } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  EMPLOYEE: [
    { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true },
    { to: '/missions/new', label: 'ثبت مأموریت جدید', icon: PlusCircle },
    { to: '/my-missions', label: 'مأموریت‌های من', icon: ClipboardList },
    { to: '/profile', label: 'پروفایل', icon: UserCircle },
    { to: '/change-password', label: 'تغییر رمز عبور', icon: Settings },
  ],
  MANAGER: [
    { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true },
    { to: '/pending', label: 'درخواست‌های در انتظار تأیید', icon: ListChecks },
    { to: '/missions', label: 'همه مأموریت‌ها', icon: ClipboardList },
    { to: '/decisions', label: 'تاریخچه تصمیمات', icon: FileCheck2 },
    { to: '/settings', label: 'تنظیمات مهر و امضا', icon: Stamp },
    { to: '/profile', label: 'پروفایل', icon: UserCircle },
  ],
  ADMIN: [
    { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'مدیریت کاربران', icon: Users },
    { to: '/admin/employees', label: 'مدیریت کارکنان', icon: UserCog },
    { to: '/admin/managers', label: 'مدیریت مدیران', icon: Briefcase },
    { to: '/admin/missions', label: 'مدیریت مأموریت‌ها', icon: ClipboardList },
    { to: '/admin/reports', label: 'گزارش‌ها', icon: BarChart3 },
    { to: '/admin/settings', label: 'تنظیمات سامانه', icon: Settings },
    { to: '/admin/audit', label: 'گزارش فعالیت‌ها', icon: Activity },
    { to: '/profile', label: 'پروفایل', icon: UserCircle },
  ],
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [org, setOrg] = useState<{ orgName: string; hasLogo: boolean } | null>(null);

  useEffect(() => {
    api<{ orgName: string; hasLogo: boolean }>('/public/settings')
      .then(setOrg)
      .catch(() => setOrg({ orgName: 'سازمان', hasLogo: false }));
  }, []);

  if (!user) return null;

  const onLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      toast.error('خروج با خطا مواجه شد');
    }
  };

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-nav text-gray-200">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          {org?.hasLogo ? (
            <img src="/api/public/logo" alt="" className="h-10 w-10 rounded bg-white object-contain p-0.5" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-brand-600 text-white">م</div>
          )}
          <div className="min-w-0">
            <div className="truncate font-bold text-white">{org?.orgName ?? '…'}</div>
            <div className="text-xs text-gray-400">مدیریت مأموریت</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV[user.role].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? 'bg-brand-600 text-white' : 'hover:bg-white/10'}`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="truncate font-medium text-white">{user.fullName}</div>
          <div className="text-xs text-gray-400">{ROLE_LABEL[user.role]}</div>
          <button onClick={onLogout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-gray-300 hover:bg-white/10">
            <LogOut className="h-4 w-4" />
            خروج از سامانه
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
