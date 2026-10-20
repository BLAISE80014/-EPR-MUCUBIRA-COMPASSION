import { useEffect, useState } from 'react'
import { Building2, FileText, HeartPulse, PiggyBank, Users, WalletCards } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS_BY_ROLE } from '../components/AppLayout'
import { apiRequest } from '../lib/api'

const DASHBOARD_COPY = {
  director: {
    eyebrow: 'Organization overview',
    title: 'Director Dashboard',
    description: 'Organization-wide staff and savings group overview.',
  },
  accountant: {
    eyebrow: 'Accounting and finance',
    title: 'Accounting Dashboard',
    description: 'Finance records are not connected to the database yet.',
  },
  health_officer: {
    eyebrow: 'Health services',
    title: 'Health Services Dashboard',
    description: 'Health activity records are not connected to the database yet.',
  },
  communication_officer: {
    eyebrow: 'Communication',
    title: 'Communication Dashboard',
    description: 'Communication activity records are not connected to the database yet.',
  },
  savings_group_manager: {
    eyebrow: 'Savings groups',
    title: 'Assigned Savings Groups Dashboard',
    description: 'Only groups assigned to your account are shown.',
  },
}

export function DashboardPage() {
  const { user } = useAuth()
  const { period } = useOutletContext()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const copy = DASHBOARD_COPY[user.role] || DASHBOARD_COPY.director

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    apiRequest(`/api/dashboard/summary?month=${period.month}&year=${period.year}`, { signal: controller.signal })
      .then((data) => {
        setSummary(data)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [period.month, period.year])

  const cards = user.role === 'director'
    ? [
      { label: 'Departments', value: summary?.departments?.length, detail: 'Organization departments', icon: Building2 },
      { label: 'Active staff', value: summary?.staffCount, detail: 'Across all departments', icon: Users },
      { label: 'Active savings groups', value: summary?.activeGroupCount, detail: 'Distinct registered groups', icon: PiggyBank },
      { label: 'Reporting period', value: `${String(period.month).padStart(2, '0')}/${period.year}`, detail: 'Selected month and year', icon: FileText },
    ]
    : user.role === 'savings_group_manager'
      ? [
        { label: 'Assigned groups', value: summary?.assignedGroupCount, detail: 'Groups assigned to your account', icon: PiggyBank },
        { label: 'Active assigned groups', value: summary?.activeGroupCount, detail: 'Currently active', icon: Building2 },
        { label: 'Reporting period', value: `${String(period.month).padStart(2, '0')}/${period.year}`, detail: 'Selected month and year', icon: FileText },
      ]
      : [
        { label: 'Department', value: ROLE_LABELS_BY_ROLE[user.role], detail: 'Your assigned department', icon: Building2 },
        { label: 'Active department staff', value: summary?.staffCount, detail: 'Active accounts in this department', icon: Users },
        { label: 'Reporting period', value: `${String(period.month).padStart(2, '0')}/${period.year}`, detail: 'Selected month and year', icon: FileText },
      ]

  return (
    <>
      <section className="page-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="page-description">{copy.description}</p>
        </div>
      </section>

      {error && <p className="form-alert" role="alert">{error}</p>}
      <section className={`summary-grid ${cards.length === 3 ? 'summary-grid--three' : ''}`} aria-label="Dashboard summary">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article className="summary-card" key={label}>
            <div className="summary-card__top">
              <span>{label}</span>
              <div className="summary-icon"><Icon size={18} /></div>
            </div>
            <strong>{loading ? '…' : value ?? '0'}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      {user.role === 'director' && (
        <section className="content-grid dashboard-content">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Staff distribution</p>
                <h3>Active staff by department</h3>
              </div>
            </div>
            {loading ? <p className="empty-state">Loading current staff totals…</p> : summary?.departments?.length ? (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary.departments} margin={{ left: 0, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="staffCount" name="Active staff" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="empty-state">No staff records are available.</p>}
          </div>
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Data availability</p>
                <h3>Monthly operations</h3>
              </div>
            </div>
            <div className="availability-card">
              <WalletCards size={22} />
              <div>
                <strong>Finance and monthly reports are not configured</strong>
                <p>These totals will appear after transaction and reporting records are connected to MongoDB.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {user.role !== 'director' && (
        <section className="panel dashboard-notice">
          <div className="availability-card">
            {user.role === 'health_officer' ? <HeartPulse size={22} /> : user.role === 'savings_group_manager' ? <PiggyBank size={22} /> : user.role === 'communication_officer' ? <FileText size={22} /> : <WalletCards size={22} />}
            <div>
              <strong>{copy.title}</strong>
              <p>{copy.description} No sample organizational records are being displayed.</p>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
