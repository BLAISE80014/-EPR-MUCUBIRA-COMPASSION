import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { HOME_PATH_BY_ROLE } from './auth/roleRoutes'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MemberDashboardPage } from './pages/MemberDashboardPage'
import { ParentDashboardPage } from './pages/ParentDashboardPage'
import { SavingsGroupsPage } from './pages/SavingsGroupsPage'
import { SignupPage } from './pages/SignupPage'
import { StaffPage } from './pages/StaffPage'
import { ThemeProvider } from './theme/ThemeProvider'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <main className="loading-page" aria-live="polite">Loading your session…</main>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth()

  if (!roles.includes(user.role)) {
    return <Navigate to={HOME_PATH_BY_ROLE[user.role] || '/dashboard'} replace />
  }

  return children
}

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={HOME_PATH_BY_ROLE[user.role] || '/dashboard'} replace />
}

function NotFoundPage() {
  return (
    <section className="panel not-found">
      <p className="eyebrow">Page not found</p>
      <h1>This page is not available</h1>
      <p className="page-description">The page may have moved or you may not have access to it.</p>
    </section>
  )
}

function ApplicationRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={(
            <RoleRoute roles={['director']}>
              <DashboardPage />
            </RoleRoute>
          )} />
          <Route path="member-dashboard" element={(
            <RoleRoute roles={['member']}>
              <MemberDashboardPage />
            </RoleRoute>
          )} />
          <Route path="parent-dashboard" element={(
            <RoleRoute roles={['parent']}>
              <ParentDashboardPage />
            </RoleRoute>
          )} />
          <Route path="accounting" element={(
            <RoleRoute roles={['director', 'accountant']}>
              <DashboardPage />
            </RoleRoute>
          )} />
          <Route path="health" element={(
            <RoleRoute roles={['director', 'health_officer']}>
              <DashboardPage />
            </RoleRoute>
          )} />
          <Route path="communication" element={(
            <RoleRoute roles={['director', 'communication_officer']}>
              <DashboardPage />
            </RoleRoute>
          )} />
          <Route path="staff" element={(
            <RoleRoute roles={['director']}>
              <StaffPage />
            </RoleRoute>
          )} />
          <Route path="savings-groups" element={(
            <RoleRoute roles={['director', 'accountant', 'savings_group_manager']}>
              <SavingsGroupsPage />
            </RoleRoute>
          )} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ApplicationRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
