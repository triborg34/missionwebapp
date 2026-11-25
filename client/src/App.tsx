import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/auth';
import { Layout } from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import type { Role } from './lib/types';
import { LoginPage, SetupPage, ChangePasswordPage } from './pages/auth';
import { DashboardPage } from './pages/dashboard';
import { MissionListPage } from './pages/mission-list';
import { MissionFormPage } from './pages/mission-form';
import { MissionDetailPage } from './pages/mission-detail';
import { DecisionsPage, SignaturePage } from './pages/manager';
import { UsersPage, ReportsPage, SettingsPage, AuditPage } from './pages/admin';
import { ProfilePage } from './pages/profile';

/** Requires a signed-in user; forces the password change before any other page. */
function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

/** Allows only the listed roles; others go back to the dashboard. */
function RoleGuard({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/missions/:id" element={<MissionDetailPage />} />

          <Route element={<RoleGuard roles={['EMPLOYEE']} />}>
            <Route path="/missions/new" element={<MissionFormPage />} />
            <Route path="/missions/:id/edit" element={<MissionFormPage />} />
            <Route path="/my-missions" element={<MissionListPage scope="own" title="مأموریت‌های من" />} />
          </Route>

          <Route element={<RoleGuard roles={['MANAGER']} />}>
            <Route path="/pending" element={<MissionListPage scope="all" status="PENDING" title="درخواست‌های در انتظار تأیید" />} />
            <Route path="/missions" element={<MissionListPage scope="all" title="همه مأموریت‌ها" />} />
            <Route path="/decisions" element={<DecisionsPage />} />
            <Route path="/settings" element={<SignaturePage />} />
          </Route>

          <Route element={<RoleGuard roles={['ADMIN']} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/employees" element={<UsersPage role="EMPLOYEE" />} />
            <Route path="/admin/managers" element={<UsersPage role="MANAGER" />} />
            <Route path="/admin/missions" element={<MissionListPage scope="all" title="مدیریت مأموریت‌ها" />} />
            <Route path="/admin/reports" element={<ReportsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/audit" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
