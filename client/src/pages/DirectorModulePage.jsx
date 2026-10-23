import { useEffect, useState } from 'react'
import {
  Activity,
  BadgeInfo,
  Building2,
  Calculator,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  HeartPulse,
  MessageCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { InlineLoading, SkeletonCards } from '../components/LoadingStates'
import { apiRequest } from '../lib/api'
import { useTheme } from '../theme/useTheme'

const MODULES = {
  accounting: {
    title: 'Accounting & Finance',
    eyebrow: 'Financial operations',
    description: 'Review organizational income, expenditure, balances, and transaction records.',
    icon: Wallet,
    available: false,
    dataNeeded: ['Income and expenditure records', 'Transaction categories and dates', 'Verified balances and summaries'],
  },
  health: {
    title: 'Health Service',
    eyebrow: 'Community health',
    description: 'Monitor service delivery and outcomes using privacy-conscious, aggregated data.',
    icon: HeartPulse,
    available: false,
    dataNeeded: ['Aggregated service volumes', 'Beneficiary counts and time periods', 'Health-service reporting records'],
  },
  communication: {
    title: 'Communication',
    eyebrow: 'Organization communications',
    description: 'Manage organization announcements and review communication history.',
    icon: MessageCircle,
    available: false,
    dataNeeded: ['Announcement and message records', 'Recipients and delivery status', 'Read states and timestamps'],
  },
  budget: {
    title: 'Budget',
    eyebrow: 'Financial planning',
    description: 'Review approved allocations and monitor organizational budget performance.',
    icon: Calculator,
    available: false,
    dataNeeded: ['Approved budget records', 'Department allocations', 'Actual expenditure'],
  },
  'monthly-reports': {
    title: 'Monthly Report',
    eyebrow: 'Reporting workspace',
    description: 'Follow departmental submissions and review reporting-period progress.',
    icon: CalendarDays,
    available: false,
    dataNeeded: ['Department submissions', 'Reporting periods', 'Review and approval status'],
  },
  reports: {
    title: 'Reports & Analytics',
    eyebrow: 'Organizational insights',
    description: 'Explore historical trends and compare performance across departments.',
    icon: ChartNoAxesCombined,
    available: false,
    dataNeeded: ['Historical operational records', 'Financial and service reports', 'Export support'],
  },
  notifications: {
    title: 'Notifications',
    eyebrow: 'Updates and requests',
    description: 'Stay informed about organization updates and items that need your attention.',
    icon: BadgeInfo,
    available: false,
    dataNeeded: ['Notification records', 'Read status and timestamps', 'Links to related records'],
  },
  'audit-logs': {
    title: 'Audit Logs',
    eyebrow: 'System activity',
    description: 'Review a traceable history of important actions performed in the system.',
    icon: ClipboardList,
    available: false,
    dataNeeded: ['Append-only audit events', 'Actor and resource details', 'Date and activity filters'],
  },
}

const DEPARTMENTS = [
  { name: 'Accounting & Finance', key: 'accounting', description: 'Finance team accounts', icon: Wallet },
  { name: 'Health Service', key: 'health', description: 'Health team accounts', icon: HeartPulse },
  { name: 'Communication', key: 'communication', description: 'Communication team accounts', icon: MessageCircle },
  { name: 'Saving Group', key: 'savings', description: 'Savings group managers', icon: Activity },
]

function PageHeader({ eyebrow, title, description }) {
  const { t } = useTheme()
  return (
    <section className="page-header">
      <div>
        <p className="eyebrow">{t(eyebrow)}</p>
        <h1>{t(title)}</h1>
        <p className="page-description">{t(description)}</p>
      </div>
    </section>
  )
}

export function DepartmentPage() {
  const { period } = useOutletContext()
  const [refreshKey, setRefreshKey] = useState(0)
  const [request, setRequest] = useState({ key: null, summary: null, error: '' })
  const requestKey = `${period.month}-${period.year}-${refreshKey}`
  const currentRequest = request.key === requestKey
  const summary = request.summary
  const error = currentRequest ? request.error : ''
  const loading = !currentRequest

  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`/api/dashboard/summary?month=${period.month}&year=${period.year}`, { signal: controller.signal })
      .then((response) => setRequest({ key: requestKey, summary: response, error: '' }))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setRequest({ key: requestKey, summary: null, error: requestError.message })
        }
      })
    return () => controller.abort()
  }, [period.month, period.year, refreshKey, requestKey])

  const counts = new Map((summary?.departments || []).map(({ name, staffCount }) => [name, staffCount]))
  const staffCountByDepartment = {
    accounting: counts.get('Accounting and Finance') || 0,
    health: counts.get('Health Services') || 0,
    communication: counts.get('Communication') || 0,
    savings: counts.get('Savings Groups') || 0,
  }

  return (
    <>
      <PageHeader
        eyebrow="Organization structure"
        title="Department"
        description="A live overview of the departments represented in the staff directory."
      />
      {loading && summary && <div className="section-refreshing"><InlineLoading>Updating department overview…</InlineLoading></div>}
      {error && (
        <div className="form-alert form-alert--with-action" role="alert">
          <span>{error}</span>
          <button className="secondary-btn" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw size={14} aria-hidden="true" /> Retry
          </button>
        </div>
      )}
      {loading && !summary ? <SkeletonCards count={2} label="Loading department summary" /> : (
      <section className="summary-grid module-summary-grid" aria-label="Department overview" aria-busy={loading}>
        <article className="summary-card">
          <div className="summary-card__top"><span>Departments</span><span className="summary-icon"><Building2 size={18} /></span></div>
          <strong>{error && !summary ? '—' : summary?.departments?.length ?? 0}</strong>
          <small>Configured staff departments</small>
        </article>
        <article className="summary-card">
          <div className="summary-card__top"><span>Active staff</span><span className="summary-icon"><Activity size={18} /></span></div>
          <strong>{error && !summary ? '—' : summary?.staffCount ?? 0}</strong>
          <small>Active non-director accounts</small>
        </article>
      </section>
      )}
      <section className="panel module-directory">
        <div className="panel-header">
          <div><p className="eyebrow">Department directory</p><h2>Teams and active staff</h2></div>
          <Link className="secondary-btn" to="/staff">View staff directory</Link>
        </div>
        {loading && !summary ? (
          <div aria-busy="true">
            <span className="visually-hidden" role="status">Loading department overview...</span>
            <div className="department-grid" aria-hidden="true">
              {DEPARTMENTS.map(({ key }) => (
                <article className="department-card department-card--skeleton" key={key}>
                  <span className="skeleton-block department-card__skeleton-icon" />
                  <span className="department-card__body">
                    <span className="skeleton-block department-card__skeleton-title" />
                    <span className="skeleton-block department-card__skeleton-copy" />
                  </span>
                  <span className="skeleton-block department-card__skeleton-count" />
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="department-grid">
            {DEPARTMENTS.map(({ name, key, description, icon: Icon }) => (
              <article className="department-card" key={key}>
                <span className="department-card__icon"><Icon size={19} aria-hidden="true" /></span>
                <div className="department-card__body">
                  <h3>{name}</h3>
                  <p>{description}</p>
                </div>
                <strong>{error ? '—' : staffCountByDepartment[key]}</strong>
                <small>{error ? 'unavailable' : `active ${staffCountByDepartment[key] === 1 ? 'account' : 'accounts'}`}</small>
              </article>
            ))}
          </div>
        )}
        <p className="module-footnote">
          Department names and counts reflect the current staff role model. Department heads and department-level targets are not stored in the available records.
        </p>
      </section>
    </>
  )
}

export function DirectorModulePage({ module }) {
  const { user } = useAuth()
  const config = MODULES[module]
  const Icon = config.icon

  return (
    <>
      <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} />
      <section className="module-empty-panel" aria-labelledby="module-status-title">
        <div className="module-empty-icon"><Icon size={22} aria-hidden="true" /></div>
        <p className="eyebrow">Module status</p>
        <h2 id="module-status-title">No connected records yet</h2>
        <p>
          {user.name.split(' ')[0]}, this workspace is ready for {config.title.toLowerCase()} data, but the current application does not have a connected record source for this module.
        </p>
        <div className="module-status-callout" role="status">
          <BadgeInfo size={18} aria-hidden="true" />
          <span>Live metrics and actions will appear here when the relevant backend workflow is available. No sample records are shown.</span>
        </div>
        <div className="module-needs">
          <h3>Data needed for this workspace</h3>
          <ul>{config.dataNeeded.map((item) => <li key={item}><FileText size={15} aria-hidden="true" />{item}</li>)}</ul>
        </div>
        <Link className="secondary-btn" to="/dashboard">Return to dashboard</Link>
      </section>
    </>
  )
}
