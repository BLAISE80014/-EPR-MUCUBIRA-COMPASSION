import { useEffect, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  HeartHandshake,
  HeartPulse,
  RefreshCw,
  UsersRound,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SkeletonCards, SkeletonChart } from '../components/LoadingStates'
import { apiRequest } from '../lib/api'
import { useTheme } from '../theme/useTheme'

const DEPARTMENT_LABELS = {
  accounting: 'Accounting & Finance',
  health: 'Health Service',
  communication: 'Communication',
  savings: 'Saving Group',
  community: 'Community',
}

const DASHBOARD_COPY = {
  director: {
    eyebrow: 'Organization overview',
    title: 'Director Dashboard',
    description: 'Monitor organizational performance, resources, and community impact.',
  },
  accountant: {
    eyebrow: 'Accounting and finance',
    title: 'Accounting Dashboard',
    description: 'Review your organizational access and the connected information available to your role.',
  },
  health_officer: {
    eyebrow: 'Health services',
    title: 'Health Service Dashboard',
    description: 'Review your organizational access and the connected information available to your role.',
  },
  communication_officer: {
    eyebrow: 'Communication',
    title: 'Communication Dashboard',
    description: 'Review your organizational access and the connected information available to your role.',
  },
  savings_group_manager: {
    eyebrow: 'Saving group',
    title: 'Assigned Saving Groups',
    description: 'Only groups assigned to your account are included in your workspace.',
  },
}

const MODULE_LINKS = [
  { label: 'Departments', description: 'Team structure and staffing', to: '/departments', icon: Building2, roles: ['director'] },
  { label: 'Staff & Users', description: 'Manage staff access', to: '/staff', icon: UsersRound, roles: ['director'] },
  { label: 'Saving Group', description: 'View registered groups', to: '/savings-groups', icon: HeartHandshake, roles: ['director', 'savings_group_manager'] },
  { label: 'Budget', description: 'Budget records are not connected', to: '/budget', icon: Wallet, roles: ['director', 'accountant'] },
  { label: 'Monthly Report', description: 'Reporting workflows are not connected', to: '/monthly-reports', icon: FileText, roles: ['director', 'accountant', 'health_officer', 'communication_officer', 'savings_group_manager'] },
  { label: 'Health Service', description: 'Health records are not connected', to: '/health', icon: HeartPulse, roles: ['director', 'health_officer'] },
  { label: 'Communication', description: 'Communication records are not connected', to: '/communication', icon: FileText, roles: ['director', 'communication_officer'] },
]

function formatDate(date, locale) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

export function DashboardPage() {
  const { user } = useAuth()
  const { period } = useOutletContext()
  const { t, preferences } = useTheme()
  const [refreshKey, setRefreshKey] = useState(0)
  const [today] = useState(() => new Date())
  const [request, setRequest] = useState({ key: null, summary: null, error: '' })
  const requestKey = `${period.month}-${period.year}-${refreshKey}`
  const currentRequest = request.key === requestKey
  const summary = request.summary
  const error = currentRequest ? request.error : ''
  const loading = !currentRequest
  const copy = DASHBOARD_COPY[user.role] || DASHBOARD_COPY.director
  const visibleModuleLinks = MODULE_LINKS.filter(({ roles }) => roles.includes(user.role))
  const scopedChartData = user.role === 'director'
    ? summary?.departments || []
    : [{
      name: user.role === 'savings_group_manager'
        ? t('Assigned groups')
        : DEPARTMENT_LABELS[summary?.department] || t('Assigned department'),
      staffCount: user.role === 'savings_group_manager'
        ? summary?.assignedGroupCount
        : summary?.staffCount,
    }]
  const chartMetricName = user.role === 'savings_group_manager' ? t('Assigned groups') : t('Active staff')

  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`/api/dashboard/summary?month=${period.month}&year=${period.year}`, { signal: controller.signal })
      .then((data) => setRequest({ key: requestKey, summary: data, error: '' }))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setRequest({ key: requestKey, summary: null, error: requestError.message })
        }
      })

    return () => controller.abort()
  }, [period.month, period.year, refreshKey, requestKey])

  const cards = user.role === 'director'
    ? [
      { label: 'Departments', value: summary?.departments?.length, detail: 'Organization departments', icon: Building2, tone: 'green' },
      { label: 'Active staff', value: summary?.staffCount, detail: 'Across all departments', icon: UsersRound, tone: 'blue' },
      { label: 'Active saving groups', value: summary?.activeGroupCount, detail: 'Registered groups', icon: HeartHandshake, tone: 'violet' },
      { label: 'Reporting period', value: `${String(period.month).padStart(2, '0')}/${period.year}`, detail: 'Selected month and year', icon: CalendarDays, tone: 'amber' },
    ]
    : user.role === 'savings_group_manager'
      ? [
        { label: 'Assigned groups', value: summary?.assignedGroupCount, detail: 'Groups assigned to you', icon: HeartHandshake, tone: 'green' },
        { label: 'Active assigned groups', value: summary?.activeGroupCount, detail: 'Currently active', icon: Building2, tone: 'blue' },
        { label: 'Reporting period', value: `${String(period.month).padStart(2, '0')}/${period.year}`, detail: 'Selected month and year', icon: CalendarDays, tone: 'amber' },
      ]
      : [
        { label: 'Department', value: DEPARTMENT_LABELS[summary?.department] || 'Assigned department', detail: 'Your assigned department', icon: Building2, tone: 'green' },
        { label: 'Active department staff', value: summary?.staffCount, detail: 'Active accounts in this department', icon: UsersRound, tone: 'blue' },
        { label: 'Reporting period', value: `${String(period.month).padStart(2, '0')}/${period.year}`, detail: 'Selected month and year', icon: CalendarDays, tone: 'amber' },
      ]

  return (
    <>
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">{t(copy.eyebrow)}</p>
          <h1>{t(copy.title)}</h1>
          <p className="page-description">{t(copy.description)}</p>
          <p className="welcome-message">{t('Welcome back,')} <strong>{user.name}</strong></p>
        </div>
        <div className="dashboard-date">
          <CalendarDays size={17} aria-hidden="true" />
          <span>{formatDate(today, preferences.language === 'rw' ? 'rw-RW' : preferences.language === 'fr' ? 'fr-RW' : 'en-RW')}</span>
        </div>
      </section>

      <section className="dashboard-section" aria-busy={loading}>
        <div className="section-heading">
          <div><h2>{t('Organization at a glance')}</h2><p>{t('Current active account and group totals. These are all-time totals, not period activity.')}</p></div>
          <button className="secondary-btn" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} aria-hidden="true" />
            {t('Refresh')}
          </button>
        </div>
        {error && <p className="form-alert" role="alert">{error}</p>}
        {loading && !summary ? (
          <SkeletonCards count={cards.length} label="Loading dashboard summary" />
        ) : (
          <section className={`summary-grid ${cards.length === 3 ? 'summary-grid--three' : ''}`} aria-label={t('Dashboard summary')} aria-busy={loading}>
            {cards.map(({ label, value, detail, icon: Icon, tone }) => (
              <article className="summary-card" key={label}>
                <div className="summary-card__top">
                  <span>{label}</span>
                  <span className={`summary-icon summary-icon--${tone}`}><Icon size={18} aria-hidden="true" /></span>
                </div>
                <strong>{error && !summary ? '—' : value ?? '—'}</strong>
                <small>{t(detail)}</small>
              </article>
            ))}
          </section>
        )}
      </section>

      {(
        <>
          <section className="executive-grid">
            <article className="panel analytics-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{t(user.role === 'director' ? 'People and teams' : 'Your team')}</p>
                  <h2>{t(user.role === 'director' ? 'Active staff by department' : user.role === 'savings_group_manager' ? 'Your assigned groups' : 'Active staff in your department')}</h2>
                </div>
                <Link className="text-link" to={user.role === 'director' ? '/departments' : user.role === 'savings_group_manager' ? '/savings-groups' : visibleModuleLinks[0]?.to || '/dashboard'}>
                  {t(user.role === 'director' ? 'Department overview' : user.role === 'savings_group_manager' ? 'View saving groups' : 'Open your workspace')} <ArrowRight size={15} />
                </Link>
              </div>
              {loading && !summary ? (
                <SkeletonChart />
              ) : error && !summary ? (
                <div className="chart-placeholder" role="status">{t('Dashboard totals are unavailable until the summary service responds.')}</div>
              ) : scopedChartData.length && scopedChartData.some(({ staffCount }) => staffCount !== undefined) ? (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={270}>
                    <BarChart data={scopedChartData} layout="vertical" margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(78, 135, 241, 0.08)' }} />
                      <Bar dataKey="staffCount" name={chartMetricName} fill="#4e87f1" radius={[6, 6, 0, 0]} maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-state"><UsersRound size={22} aria-hidden="true" /><strong>{t(user.role === 'savings_group_manager' ? 'No groups are assigned' : 'No staff records available')}</strong><span>{t(user.role === 'savings_group_manager' ? 'Ask the Director to assign a savings group to your account.' : 'Department totals will appear here when staff accounts are registered.')}</span></div>
              )}
            </article>

            <article className="panel operations-panel">
              <div className="panel-header">
                <div><p className="eyebrow">{t('System overview')}</p><h2>{t('Operational modules')}</h2></div>
              </div>
              <p className="panel-intro">{t('Open the workspaces available to your assigned role.')}</p>
              <div className="module-link-list">
                {visibleModuleLinks.map(({ label, description, to, icon: Icon }) => (
                  <Link to={to} className="module-link-row" key={label}>
                    <span className="module-link-icon"><Icon size={17} aria-hidden="true" /></span>
                    <span><strong>{t(label)}</strong><small>{t(description)}</small></span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </article>
          </section>

          <section className="dashboard-bottom-grid">
            <article className="panel availability-panel">
              <div className="panel-header">
                <div><p className="eyebrow">{t('Data availability')}</p><h2>{t('What is connected')}</h2></div>
                <span className="status-badge submitted">{t('Live data')}</span>
              </div>
              <div className="availability-row">
                <span className="availability-mark availability-mark--on"><Activity size={16} /></span>
                <div><strong>{t(user.role === 'director' ? 'Staff and department roles' : 'Your role and department')}</strong><small>{t('Connected to current active user records')}</small></div>
                <span className="availability-label">{t('Connected')}</span>
              </div>
              {(user.role === 'director' || user.role === 'savings_group_manager') && <div className="availability-row">
                <span className="availability-mark availability-mark--on"><HeartHandshake size={16} /></span>
                <div><strong>{t('Saving group directory')}</strong><small>{t('Names, IDs, status, and manager assignments')}</small></div>
                <span className="availability-label">{t('Connected')}</span>
              </div>}
              <div className="availability-row">
                <span className="availability-mark availability-mark--off"><ArrowDownRight size={16} /></span>
                <div><strong>{t(user.role === 'health_officer' ? 'Health service activity' : user.role === 'communication_officer' ? 'Communications and delivery' : 'Financial transactions, budgets, and reports')}</strong><small>{t('Backend records are not configured yet')}</small></div>
                <span className="availability-label availability-label--muted">{t('Not connected')}</span>
              </div>
            </article>
            <article className="dashboard-quick-panel">
              <p className="eyebrow">{t('Role-based tools')}</p>
              <h2>{t('Quick access')}</h2>
              <p>{t('Go directly to the workspaces available to your role.')}</p>
              <div className="quick-action-list">
                {visibleModuleLinks.slice(0, 3).map(({ label, to, icon: Icon }) => (
                  <Link to={to} key={to}><Icon size={17} />{t(label)}<ArrowRight size={15} /></Link>
                ))}
              </div>
            </article>
          </section>
        </>
      )}
    </>
  )
}
