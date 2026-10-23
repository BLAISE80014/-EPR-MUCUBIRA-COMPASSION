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
  { label: 'Departments', description: 'Team structure and staffing', to: '/departments', icon: Building2 },
  { label: 'Staff & Users', description: 'Manage staff access', to: '/staff', icon: UsersRound },
  { label: 'Saving Group', description: 'View registered groups', to: '/savings-groups', icon: HeartHandshake },
  { label: 'Budget', description: 'Budget records are not connected', to: '/budget', icon: Wallet },
  { label: 'Monthly Report', description: 'Reporting workflows are not connected', to: '/monthly-reports', icon: FileText },
  { label: 'Health Service', description: 'Health records are not connected', to: '/health', icon: HeartPulse },
]

function formatDate(date) {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

export function DashboardPage() {
  const { user } = useAuth()
  const { period } = useOutletContext()
  const [refreshKey, setRefreshKey] = useState(0)
  const [today] = useState(() => new Date())
  const [request, setRequest] = useState({ key: null, summary: null, error: '' })
  const requestKey = `${period.month}-${period.year}-${refreshKey}`
  const currentRequest = request.key === requestKey
  const summary = request.summary
  const error = currentRequest ? request.error : ''
  const loading = !currentRequest
  const copy = DASHBOARD_COPY[user.role] || DASHBOARD_COPY.director

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
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="page-description">{copy.description}</p>
          <p className="welcome-message">Welcome back, <strong>{user.name}</strong></p>
        </div>
        <div className="dashboard-date">
          <CalendarDays size={17} aria-hidden="true" />
          <span>{formatDate(today)}</span>
        </div>
      </section>

      <section className="dashboard-section" aria-busy={loading}>
        <div className="section-heading">
          <div><h2>Organization at a glance</h2><p>Current records for the selected reporting period</p></div>
          <button className="secondary-btn" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} aria-hidden="true" />
            Refresh
          </button>
        </div>
        {error && <p className="form-alert" role="alert">{error}</p>}
        {loading && !summary ? (
          <SkeletonCards count={cards.length} label="Loading dashboard summary" />
        ) : (
          <section className={`summary-grid ${cards.length === 3 ? 'summary-grid--three' : ''}`} aria-label="Dashboard summary" aria-busy={loading}>
            {cards.map(({ label, value, detail, icon: Icon, tone }) => (
              <article className="summary-card" key={label}>
                <div className="summary-card__top">
                  <span>{label}</span>
                  <span className={`summary-icon summary-icon--${tone}`}><Icon size={18} aria-hidden="true" /></span>
                </div>
                <strong>{error && !summary ? '—' : value ?? '0'}</strong>
                <small>{detail}</small>
              </article>
            ))}
          </section>
        )}
      </section>

      {user.role === 'director' && (
        <>
          <section className="executive-grid">
            <article className="panel analytics-panel">
              <div className="panel-header">
                <div><p className="eyebrow">People and teams</p><h2>Active staff by department</h2></div>
                <Link className="text-link" to="/departments">Department overview <ArrowRight size={15} /></Link>
              </div>
              {loading && !summary ? (
                <SkeletonChart />
              ) : error && !summary ? (
                <div className="chart-placeholder" role="status">Department totals are unavailable until the summary service responds.</div>
              ) : summary?.departments?.length ? (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={270}>
                    <BarChart data={summary.departments} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(21, 128, 61, 0.06)' }} />
                      <Bar dataKey="staffCount" name="Active staff" fill="#15803d" radius={[6, 6, 0, 0]} maxBarSize={52} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="empty-state"><UsersRound size={22} aria-hidden="true" /><strong>No staff records available</strong><span>Department totals will appear here when staff accounts are registered.</span></div>
              )}
            </article>

            <article className="panel operations-panel">
              <div className="panel-header">
                <div><p className="eyebrow">System overview</p><h2>Operational modules</h2></div>
              </div>
              <p className="panel-intro">Explore areas of the organization and see which data sources are connected.</p>
              <div className="module-link-list">
                {MODULE_LINKS.map(({ label, description, to, icon: Icon }) => (
                  <Link to={to} className="module-link-row" key={label}>
                    <span className="module-link-icon"><Icon size={17} aria-hidden="true" /></span>
                    <span><strong>{label}</strong><small>{description}</small></span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </article>
          </section>

          <section className="dashboard-bottom-grid">
            <article className="panel availability-panel">
              <div className="panel-header">
                <div><p className="eyebrow">Data availability</p><h2>What is connected</h2></div>
                <span className="status-badge submitted">Live data</span>
              </div>
              <div className="availability-row">
                <span className="availability-mark availability-mark--on"><Activity size={16} /></span>
                <div><strong>Staff and department roles</strong><small>Connected to current active user records</small></div>
                <span className="availability-label">Connected</span>
              </div>
              <div className="availability-row">
                <span className="availability-mark availability-mark--on"><HeartHandshake size={16} /></span>
                <div><strong>Saving group directory</strong><small>Names, IDs, status, and manager assignments</small></div>
                <span className="availability-label">Connected</span>
              </div>
              <div className="availability-row">
                <span className="availability-mark availability-mark--off"><ArrowDownRight size={16} /></span>
                <div><strong>Finance, health, and monthly reports</strong><small>Backend records are not configured yet</small></div>
                <span className="availability-label availability-label--muted">Not connected</span>
              </div>
            </article>
            <article className="dashboard-quick-panel">
              <p className="eyebrow">Director tools</p>
              <h2>Quick access</h2>
              <p>Go directly to the areas you manage most.</p>
              <div className="quick-action-list">
                <Link to="/staff"><UsersRound size={17} />Manage staff<ArrowRight size={15} /></Link>
                <Link to="/savings-groups"><HeartHandshake size={17} />View saving groups<ArrowRight size={15} /></Link>
                <Link to="/budget"><Wallet size={17} />Review budget module<ArrowRight size={15} /></Link>
              </div>
            </article>
          </section>
        </>
      )}

      {user.role !== 'director' && (
        <section className="panel dashboard-notice">
          <div className="availability-card">
            {user.role === 'health_officer'
              ? <HeartPulse size={22} aria-hidden="true" />
              : user.role === 'savings_group_manager'
                ? <HeartHandshake size={22} aria-hidden="true" />
                : user.role === 'communication_officer'
                  ? <FileText size={22} aria-hidden="true" />
                  : <Wallet size={22} aria-hidden="true" />}
            <div>
              <strong>{copy.title}</strong>
              <p>The connected summary includes access-scoped staff and group records. Detailed {user.role === 'health_officer' ? 'health activity' : user.role === 'accountant' ? 'financial transactions' : user.role === 'communication_officer' ? 'communications' : 'savings balances'} are not stored in the current system.</p>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
