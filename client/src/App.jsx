import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { AppLoadingError, AppLoadingScreen } from './components/LoadingStates'
import { HOME_PATH_BY_ROLE } from './auth/roleRoutes'
import { DashboardPage } from './pages/DashboardPage'
import { DepartmentPage, DirectorModulePage, SettingsPage } from './pages/DirectorModulePage'
import { LoginPage } from './pages/LoginPage'
import { MemberDashboardPage } from './pages/MemberDashboardPage'
import { ParentDashboardPage } from './pages/ParentDashboardPage'
import { SavingsGroupsPage } from './pages/SavingsGroupsPage'
import { SignupPage } from './pages/SignupPage'
import { StaffPage } from './pages/StaffPage'
import { ThemeProvider } from './theme/ThemeProvider'

const MINIMUM_STARTUP_DURATION_MS = 4000

function ProtectedRoutes() {
  const { user, loading, sessionError, retrySession } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return <AppLoadingScreen message="Checking your session..." />
  }

  if (sessionError) {
    return (
      <AppLoadingError
        message={sessionError}
        onRetry={retrySession}
        onLogin={() => navigate('/login', { replace: true })}
        retrying={loading}
      />
    )
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

function RoleAwareModulePage({ module }) {
  const { user } = useAuth()
  return user.role === 'director'
    ? <DirectorModulePage module={module} />
    : <DashboardPage />
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
          <Route path="departments" element={(
            <RoleRoute roles={['director']}>
              <DepartmentPage />
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
              <RoleAwareModulePage module="accounting" />
            </RoleRoute>
          )} />
          <Route path="health" element={(
            <RoleRoute roles={['director', 'health_officer']}>
              <RoleAwareModulePage module="health" />
            </RoleRoute>
          )} />
          <Route path="communication" element={(
            <RoleRoute roles={['director', 'communication_officer']}>
              <RoleAwareModulePage module="communication" />
            </RoleRoute>
          )} />
          <Route path="budget" element={(
            <RoleRoute roles={['director', 'accountant']}>
              <DirectorModulePage module="budget" />
            </RoleRoute>
          )} />
          <Route path="monthly-reports" element={(
            <RoleRoute roles={['director', 'accountant', 'health_officer', 'communication_officer', 'savings_group_manager']}>
              <DirectorModulePage module="monthly-reports" />
            </RoleRoute>
          )} />
          <Route path="reports" element={(
            <RoleRoute roles={['director', 'accountant']}>
              <DirectorModulePage module="reports" />
            </RoleRoute>
          )} />
          <Route path="notifications" element={(
            <RoleRoute roles={['director']}>
              <DirectorModulePage module="notifications" />
            </RoleRoute>
          )} />
          <Route path="audit-logs" element={(
            <RoleRoute roles={['director']}>
              <DirectorModulePage module="audit-logs" />
            </RoleRoute>
          )} />
          <Route path="settings" element={<SettingsPage />} />
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

function SessionInitialization() {
  const { loading } = useAuth()
  const [minimumStartupElapsed, setMinimumStartupElapsed] = useState(false)

  useEffect(() => {
    const startupTimer = window.setTimeout(
      () => setMinimumStartupElapsed(true),
      MINIMUM_STARTUP_DURATION_MS,
    )
    return () => window.clearTimeout(startupTimer)
  }, [])

  if (loading || !minimumStartupElapsed) {
    return (
      <AppLoadingScreen
        message="Preparing your workspace..."
        progressDurationMs={MINIMUM_STARTUP_DURATION_MS}
      />
    )
  }

  return <ApplicationRoutes />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <SessionInitialization />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
