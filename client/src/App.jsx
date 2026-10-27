import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { AppLoadingError, AppLoadingScreen } from './components/LoadingStates'
import { HOME_PATH_BY_ROLE } from './auth/roleRoutes'
import { AccountantDashboardPage } from './pages/AccountantDashboardPage'
import { AccountantEntryPage } from './pages/AccountantEntryPage'
import { AccountantOperationsPage } from './pages/AccountantOperationsPage'
import { AccountantTransactionsPage } from './pages/AccountantTransactionsPage'
import { AccountingPage } from './pages/AccountingPage'
import { DashboardPage } from './pages/DashboardPage'
import { DepartmentPage, DirectorModulePage } from './pages/DirectorModulePage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { MemberDashboardPage } from './pages/MemberDashboardPage'
import { ParentDashboardPage } from './pages/ParentDashboardPage'
import { SavingsGroupsPage } from './pages/SavingsGroupsPage'
import { SignupPage } from './pages/SignupPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { StaffPage } from './pages/StaffPage'
import { SystemSettingsPage } from './pages/SystemSettingsPage'
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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={(
            <RoleRoute roles={['director']}>
              <DashboardPage />
            </RoleRoute>
          )} />
          <Route path="accountant-dashboard" element={(
            <RoleRoute roles={['accountant']}>
              <AccountantDashboardPage />
            </RoleRoute>
          )} />
          <Route path="accountant/income" element={(
            <RoleRoute roles={['accountant']}>
              <AccountantEntryPage type="income" />
            </RoleRoute>
          )} />
          <Route path="accountant/expense" element={(
            <RoleRoute roles={['accountant']}>
              <AccountantEntryPage type="expense" />
            </RoleRoute>
          )} />
          <Route path="accountant/transactions" element={(
            <RoleRoute roles={['accountant']}>
              <AccountantTransactionsPage />
            </RoleRoute>
          )} />
          <Route path="accountant/setup" element={(
            <RoleRoute roles={['accountant']}>
              <AccountingPage key="accountant-financial-years" initialTab="Financial Years" />
            </RoleRoute>
          )} />
          <Route path="accounting/operations" element={(
            <RoleRoute roles={['accountant']}>
              <AccountantOperationsPage />
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
              <AccountingPage key="accounting-overview" initialTab="Overview" />
            </RoleRoute>
          )} />
          <Route path="accounting/transactions" element={(
            <RoleRoute roles={['director']}>
              <AccountingPage key="accounting-journals" initialTab="Journal Entries" />
            </RoleRoute>
          )} />
          <Route path="accounting/accounts" element={(
            <RoleRoute roles={['director']}>
              <AccountingPage key="accounting-accounts" initialTab="Chart of Accounts" />
            </RoleRoute>
          )} />
          <Route path="accounting/reports" element={(
            <RoleRoute roles={['director', 'accountant']}>
              <AccountingPage key="accounting-reports" initialTab="Reports" />
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
          <Route path="settings" element={<SystemSettingsPage />} />
          <Route path="staff" element={(
            <RoleRoute roles={['director']}>
              <StaffPage />
            </RoleRoute>
          )} />
          <Route path="savings-groups" element={(
            <RoleRoute roles={['director', 'savings_group_manager']}>
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

  return loading || !minimumStartupElapsed
    ? <AppLoadingScreen message="Checking your session..." progressDurationMs={MINIMUM_STARTUP_DURATION_MS} />
    : <ApplicationRoutes />
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
