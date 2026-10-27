import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  Download,
  FileText,
  Landmark,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import './AccountantDashboardPage.css'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatMoney(minorAmount, currency, digits) {
  if (minorAmount === undefined || minorAmount === null) return 'Not tracked'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'RWF',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(minorAmount) / (10 ** digits))
  } catch {
    return `${currency || ''} ${(Number(minorAmount) / (10 ** digits)).toLocaleString()}`.trim()
  }
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Prior period was zero'
  const sign = value > 0 ? '+' : ''
  return `${sign}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}% vs prior year`
}

function shortDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

function downloadTransactions(entries, currency, digits) {
  const columns = ['Reference', 'Date', 'Description', 'Account category', 'Source or recipient', 'Type', 'Payment method', 'Status', 'Amount', 'Currency']
  const rows = entries.map((entry) => {
    const amountMinor = (entry.lines || []).reduce((total, line) => total + Number(line.debitMinor || 0), 0)
    const categories = [...new Set((entry.lines || []).map((line) => line.account?.name).filter(Boolean))].join('; ')
    return [entry.reference, String(entry.entryDate || '').slice(0, 10), entry.description, categories, entry.counterparty || entry.projectReference, entry.sourceType, entry.paymentMethod,
      entry.status,
      (amountMinor / (10 ** digits)).toFixed(digits), entry.currency || currency]
  })
  const csv = [columns, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = 'recent-ledger-transactions.csv'
  link.click()
  URL.revokeObjectURL(objectUrl)
}

function downloadReport(report, currency, digits) {
  const rows = [
    ['Financial report', report.year?.name || ''],
    ['Period', `${report.period?.startDate || ''} to ${report.period?.endDate || ''}`],
    ['Currency', currency],
    ['Basis', 'Accrual double-entry'],
    ['Posted records included', report.recordsIncluded || 0],
    [],
    ['Summary', 'Amount'],
    ['Income', Number(report.current?.incomeMinor || 0) / (10 ** digits)],
    ['Expenses', Number(report.current?.expensesMinor || 0) / (10 ** digits)],
    ['Net income / surplus', Number(report.current?.netSurplusMinor || 0) / (10 ** digits)],
    ['Cash and bank movement', Number(report.current?.cashAndBankMovementMinor || 0) / (10 ** digits)],
    ['Cash and bank closing balance', Number(report.current?.cashAndBankClosingMinor || 0) / (10 ** digits)],
    [],
    ['Cash and bank account', 'Opening', 'Movement', 'Closing'],
    ...(report.current?.cashAndBankAccounts || []).map((account) => [
      `${account.code} ${account.name}`,
      Number(account.openingBalanceMinor || 0) / (10 ** digits),
      Number(account.movementMinor || 0) / (10 ** digits),
      Number(account.closingBalanceMinor || 0) / (10 ** digits),
    ]),
    [],
    ['Account', 'Type', 'Debit', 'Credit', 'Balance'],
    ...(report.current?.accountBalances || []).map((account) => [
      `${account.code} ${account.name}`,
      account.type,
      (Number(account.debitMinor || 0) / (10 ** digits)).toFixed(digits),
      (Number(account.creditMinor || 0) / (10 ** digits)).toFixed(digits),
      (Number(account.balanceMinor || 0) / (10 ** digits)).toFixed(digits),
    ]),
    ...(report.monthlyTrend?.length ? [
      [],
      ['Month', 'Income', 'Expenses'],
      ...report.monthlyTrend.map((row) => [
        MONTH_NAMES[Number(row.month) - 1] || row.month,
        (Number(row.incomeMinor || 0) / (10 ** digits)).toFixed(digits),
        (Number(row.expensesMinor || 0) / (10 ** digits)).toFixed(digits),
      ]),
    ] : []),
  ]
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `financial-report-${report.period?.id || report.year?.name || 'period'}.csv`
  link.click()
  URL.revokeObjectURL(objectUrl)
}

function SummaryCard({ title, value, change, Icon, tone, note }) {
  return (
    <article className={`accountant-summary-card accountant-summary-card--${tone}`}>
      <div className="accountant-summary-card__top">
        <span>{title}</span>
        <span className="accountant-summary-card__icon"><Icon size={18} aria-hidden="true" /></span>
      </div>
      <strong className="accountant-summary-card__value">{value}</strong>
      <div className="accountant-summary-card__foot">
        {change !== undefined
          ? <span className={Number(change) > 0 ? 'accountant-change--up' : Number(change) < 0 ? 'accountant-change--down' : ''}>
            {Number(change) > 0 ? <ArrowUpRight size={14} aria-hidden="true" /> : Number(change) < 0 ? <ArrowDownRight size={14} aria-hidden="true" /> : null}
            {formatPercent(change)}
          </span>
          : <span>{note || 'Comparison unavailable'}</span>}
      </div>
    </article>
  )
}

export function AccountantDashboardPage() {
  const [years, setYears] = useState([])
  const [yearId, setYearId] = useState('')
  const [periodType, setPeriodType] = useState('year')
  const [periodMonth, setPeriodMonth] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [report, setReport] = useState(null)
  const [entries, setEntries] = useState([])
  const [entryCounts, setEntryCounts] = useState({ draft: 0, submitted: 0 })
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadReferenceData() {
      setLoading(true)
      setError('')
      try {
        const yearResult = await apiRequest('/api/finance/years', { signal: controller.signal })
        const availableYears = yearResult.years || []
        setYears(availableYears)
        setYearId((current) => {
          if (current && availableYears.some((year) => year.id === current)) return current
          const openYears = availableYears.filter((year) => year.status === 'open')
          const choices = openYears.length ? openYears : availableYears
          return [...choices].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0]?.id || ''
        })
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadReferenceData()
    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') setRefreshKey((current) => current + 1)
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    if (!yearId) return undefined
    const hasValidPeriod = periodType === 'year'
      || (periodType === 'month' && periodMonth)
      || (periodType === 'day' && reportDate)
      || (periodType === 'range' && rangeStart && rangeEnd && rangeStart <= rangeEnd)
    if (!hasValidPeriod) return undefined
    const controller = new AbortController()
    async function loadDashboardData() {
      setLoading(true)
      setError('')
      const periodQuery = periodType === 'month'
        ? `&month=${encodeURIComponent(periodMonth)}`
        : periodType === 'day'
          ? `&date=${encodeURIComponent(reportDate)}`
          : periodType === 'range'
            ? `&from=${encodeURIComponent(rangeStart)}&to=${encodeURIComponent(rangeEnd)}`
            : ''
      const searchQuery = search ? `&search=${encodeURIComponent(search)}` : ''
      try {
        const [reportResult, entryResult, draftResult, submittedResult] = await Promise.all([
          apiRequest(`/api/finance/reports?yearId=${encodeURIComponent(yearId)}${periodQuery}`, { signal: controller.signal }),
          apiRequest(`/api/finance/journal-entries?yearId=${encodeURIComponent(yearId)}&limit=8${searchQuery}`, { signal: controller.signal }),
          apiRequest(`/api/finance/journal-entries?yearId=${encodeURIComponent(yearId)}&status=draft&limit=1`, { signal: controller.signal }),
          apiRequest(`/api/finance/journal-entries?yearId=${encodeURIComponent(yearId)}&status=submitted&limit=1`, { signal: controller.signal }),
        ])
        setReport(reportResult)
        setEntries(entryResult.entries || [])
        setEntryCounts({ draft: draftResult.total || 0, submitted: submittedResult.total || 0 })
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadDashboardData()
    return () => controller.abort()
  }, [yearId, periodType, periodMonth, reportDate, rangeStart, rangeEnd, search, refreshKey])

  const currency = report?.currency || 'RWF'
  const digits = Number(report?.minorUnitDigits || 0)
  const current = report?.current
  const receivables = undefined
  const payables = undefined
  const trend = (report?.monthlyTrend || []).map((row) => ({
    ...row,
    monthName: MONTH_NAMES[Number(row.month) - 1] || String(row.month),
    income: Number(row.incomeMinor || 0) / (10 ** digits),
    expenses: Number(row.expensesMinor || 0) / (10 ** digits),
  }))
  const categoryData = useMemo(() => {
    const balances = current?.accountBalances || []
    const categories = (type) => balances
      .filter((account) => account.type === type && Number(account.balanceMinor) > 0)
      .sort((a, b) => Number(b.balanceMinor) - Number(a.balanceMinor))
      .slice(0, 5)
      .map((account) => ({
        name: account.name,
        amount: Number(account.balanceMinor) / (10 ** digits),
      }))
    return { income: categories('revenue'), expenses: categories('expense') }
  }, [current, digits])

  const comparison = report?.comparison?.change
  const periodLabel = report?.period?.startDate && report?.period?.endDate
    ? `${shortDate(report.period.startDate)} – ${shortDate(report.period.endDate)}`
    : report?.year?.name || 'Selected period'
  const selectedYearRecord = years.find((year) => year.id === yearId)
  const periodReady = periodType === 'year'
    || (periodType === 'month' && Boolean(periodMonth))
    || (periodType === 'day' && Boolean(reportDate))
    || (periodType === 'range' && Boolean(rangeStart && rangeEnd && rangeStart <= rangeEnd))

  return (
    <main className="accountant-dashboard">
      <header className="accountant-dashboard__header">
        <div>
          <p className="accountant-dashboard__eyebrow">Finance workspace</p>
          <h1>Accountant dashboard</h1>
          <p>Ledger-backed financial activity and review tools for your organization.</p>
        </div>
        <div className="accountant-dashboard__filters">
          <label>
            Financial year
            <select value={yearId} onChange={(event) => { setYearId(event.target.value); setPeriodMonth('') }} disabled={!years.length}>
              {!years.length && <option value="">No financial year</option>}
              {years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
            </select>
          </label>
          <label>
            Period
            <select value={periodType} onChange={(event) => setPeriodType(event.target.value)} disabled={!yearId}>
              <option value="year">Full year</option>
              <option value="month">Month</option>
              <option value="day">Day</option>
              <option value="range">Custom range</option>
            </select>
          </label>
          {periodType === 'month' && <label>
            Month
            <select value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} disabled={!yearId}>
              <option value="">Choose month</option>
              {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>}
          {periodType === 'day' && <label>
            Date
            <input type="date" value={reportDate} min={selectedYearRecord?.startDate} max={selectedYearRecord?.endDate} onChange={(event) => setReportDate(event.target.value)} disabled={!yearId} />
          </label>}
          {periodType === 'range' && <>
            <label>
              From
              <input type="date" value={rangeStart} min={selectedYearRecord?.startDate} max={selectedYearRecord?.endDate} onChange={(event) => setRangeStart(event.target.value)} disabled={!yearId} />
            </label>
            <label>
              To
              <input type="date" value={rangeEnd} min={selectedYearRecord?.startDate} max={selectedYearRecord?.endDate} onChange={(event) => setRangeEnd(event.target.value)} disabled={!yearId} />
            </label>
          </>}
        </div>
        <div className="accountant-dashboard__report-actions">
          <button type="button" className="accountant-dashboard__export" onClick={() => downloadReport(report, currency, digits)} disabled={!report}>
            <Download size={15} aria-hidden="true" /> Export report CSV
          </button>
          <button type="button" className="accountant-dashboard__refresh" onClick={() => window.print()} disabled={!report}>
            Print / PDF
          </button>
        </div>
      </header>

      {error && <div className="accountant-dashboard__error" role="alert">{error}</div>}
      {!periodReady && !error && <div className="accountant-dashboard__error" role="status">{periodType === 'range' && rangeStart && rangeEnd && rangeStart > rangeEnd ? 'The start date must be on or before the end date.' : 'Select a reporting period to load ledger data.'}</div>}
      {loading && <div className="accountant-dashboard__loading" role="status">Loading ledger data…</div>}

      {!loading && !error && !years.length && (
        <section className="accountant-dashboard__empty">
          <Landmark size={25} aria-hidden="true" />
          <h2>Create a financial year to get started</h2>
          <p>Your dashboard will calculate totals from posted ledger entries. Drafts are not included in financial reports.</p>
          <Link className="accountant-dashboard__button" to="/accounting">Set up financial year</Link>
        </section>
      )}

      {!loading && !error && periodReady && report && (
        <>
          <div className="accountant-dashboard__period-note">
            <span><Activity size={16} aria-hidden="true" /> {periodLabel}</span>
            <span>{Number(report.recordsIncluded || 0)} posted {Number(report.recordsIncluded || 0) === 1 ? 'entry' : 'entries'} included · Accrual basis
              {(entryCounts.draft > 0 || entryCounts.submitted > 0) && ` · ${entryCounts.draft} draft${entryCounts.draft === 1 ? '' : 's'} · ${entryCounts.submitted} awaiting review`}
            </span>
          </div>

          <section className="accountant-dashboard__hero" aria-label="Finance overview highlight">
            <div className="accountant-dashboard__hero-copy">
              <p>Available cash position</p>
              <h2>{formatMoney(current?.cashAndBankClosingMinor, currency, digits)}</h2>
              <div className="accountant-dashboard__hero-meta">
                <span>Period: {periodLabel}</span>
                <span>{Number(report.recordsIncluded || 0)} posted entries</span>
              </div>
            </div>
            <div className="accountant-dashboard__hero-stats">
              <div>
                <span>Income</span>
                <strong>{formatMoney(current?.incomeMinor, currency, digits)}</strong>
              </div>
              <div>
                <span>Expenses</span>
                <strong>{formatMoney(current?.expensesMinor, currency, digits)}</strong>
              </div>
              <div>
                <span>Net</span>
                <strong>{formatMoney(current?.netSurplusMinor, currency, digits)}</strong>
              </div>
            </div>
          </section>

          <section className="accountant-dashboard__cards" aria-label="Financial summary">
            <SummaryCard title="Total money available" value={formatMoney(current?.cashAndBankClosingMinor, currency, digits)} change={comparison?.netSurplus?.percent} Icon={Wallet} tone="green" note="Opening balance + income - expenses" />
            <SummaryCard title="Total income this month" value={formatMoney(current?.incomeMinor, currency, digits)} change={comparison?.income?.percent} Icon={ArrowUpRight} tone="blue" note="Valid posted income for the selected period" />
            <SummaryCard title="Total expenses this month" value={formatMoney(current?.expensesMinor, currency, digits)} change={comparison?.expenses?.percent} Icon={ArrowDownRight} tone="amber" note="Valid posted expenses for the selected period" />
            <SummaryCard title="Net movement this month" value={formatMoney(current?.netSurplusMinor, currency, digits)} change={comparison?.netSurplus?.percent} Icon={Activity} tone="violet" note="Income minus expenses" />
            <SummaryCard title="Accounts receivable" value={formatMoney(receivables, currency, digits)} Icon={FileText} tone="teal" note="Invoice tracking is not yet available" />
            <SummaryCard title="Accounts payable" value={formatMoney(payables, currency, digits)} Icon={Banknote} tone="rose" note="Bill tracking is not yet available" />
          </section>

          <section className="accountant-dashboard__quick-actions">
            <article className="accountant-dashboard__panel">
              <div className="accountant-dashboard__panel-heading">
                <div>
                  <h2>Quick actions</h2>
                  <p>Record everyday transactions and review their status in one place.</p>
                </div>
              </div>
              <div className="accountant-dashboard__action-grid">
                <Link to="/accountant/income" className="accountant-dashboard__action-card accountant-dashboard__action-card--income">
                  <ArrowUpRight size={19} aria-hidden="true" />
                  <span><strong>Record income</strong><small>Log money received</small></span>
                </Link>
                <Link to="/accountant/expense" className="accountant-dashboard__action-card accountant-dashboard__action-card--expense">
                  <ArrowDownRight size={19} aria-hidden="true" />
                  <span><strong>Record expense</strong><small>Log money spent</small></span>
                </Link>
                <Link to="/accountant/transactions" className="accountant-dashboard__action-card">
                  <FileText size={19} aria-hidden="true" />
                  <span><strong>Transaction history</strong><small>Search and export records</small></span>
                </Link>
                <Link to="/accounting/reports" className="accountant-dashboard__action-card">
                  <ChartNoAxesCombined size={19} aria-hidden="true" />
                  <span><strong>Financial reports</strong><small>Monthly and annual views</small></span>
                </Link>
              </div>
            </article>
          </section>

          <section className="accountant-dashboard__charts">
            <article className="accountant-dashboard__panel accountant-dashboard__trend">
              <div className="accountant-dashboard__panel-heading">
                <div><h2>Revenue vs expenses</h2><p>Monthly posted ledger activity</p></div>
                <Link to="/accountant/transactions">Transaction history</Link>
              </div>
              {trend.length ? (
                <div className="accountant-dashboard__chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4e87f1" stopOpacity={0.2} /><stop offset="95%" stopColor="#4e87f1" stopOpacity={0} /></linearGradient>
                        <linearGradient id="dashboardExpenses" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f0a34a" stopOpacity={0.18} /><stop offset="95%" stopColor="#f0a34a" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9edf4" />
                      <XAxis dataKey="monthName" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} width={70} tickFormatter={(value) => Number(value).toLocaleString()} />
                      <Tooltip formatter={(value) => formatMoney(Number(value) * (10 ** digits), currency, digits)} />
                      <Legend />
                      <Area type="monotone" dataKey="income" name="Revenue" stroke="#4e87f1" strokeWidth={2.5} fill="url(#dashboardRevenue)" />
                      <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#e59b3d" strokeWidth={2.5} fill="url(#dashboardExpenses)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="accountant-dashboard__chart-empty">
                  {periodType !== 'year' ? 'Select Full year to view the monthly trend.' : 'No monthly report data is available for this period yet.'}
                </div>
              )}
            </article>

            <article className="accountant-dashboard__panel accountant-dashboard__categories">
              <div className="accountant-dashboard__panel-heading">
                <div><h2>Income &amp; expense accounts</h2><p>Posted balances by chart-of-accounts category</p></div>
              </div>
              {categoryData.income.length || categoryData.expenses.length ? (
                <div className="accountant-dashboard__category-charts">
                  <div><h3>Income</h3><ResponsiveContainer width="100%" height={150}>
                    <BarChart data={categoryData.income} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
                      <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => formatMoney(Number(value) * (10 ** digits), currency, digits)} />
                      <Bar dataKey="amount" fill="#4e87f1" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer></div>
                  <div><h3>Expenses</h3><ResponsiveContainer width="100%" height={150}>
                    <BarChart data={categoryData.expenses} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
                      <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => formatMoney(Number(value) * (10 ** digits), currency, digits)} />
                      <Bar dataKey="amount" fill="#e59b3d" radius={[0, 5, 5, 0]} />
                    </BarChart>
                  </ResponsiveContainer></div>
                </div>
              ) : <div className="accountant-dashboard__chart-empty">Posted income and expense balances will appear here.</div>}
            </article>
          </section>

          <section className="accountant-dashboard__panel accountant-dashboard__cash-accounts">
            <div className="accountant-dashboard__panel-heading">
              <div><h2>Cash and bank by account</h2><p>Balances are shown separately for each cash or bank account</p></div>
            </div>
            {current?.cashAndBankAccounts?.length ? (
              <div className="accountant-dashboard__table-wrap">
                <table>
                  <thead><tr><th scope="col">Account</th><th scope="col" className="accountant-dashboard__amount">Opening</th><th scope="col" className="accountant-dashboard__amount">Period movement</th><th scope="col" className="accountant-dashboard__amount">Closing</th></tr></thead>
                  <tbody>{current.cashAndBankAccounts.map((account) => (
                    <tr key={account.accountId}>
                      <td><strong>{account.code} · {account.name}</strong></td>
                      <td className="accountant-dashboard__amount">{formatMoney(account.openingBalanceMinor, currency, digits)}</td>
                      <td className="accountant-dashboard__amount">{formatMoney(account.movementMinor, currency, digits)}</td>
                      <td className="accountant-dashboard__amount">{formatMoney(account.closingBalanceMinor, currency, digits)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="accountant-dashboard__chart-empty">Add active cash or bank accounts to see individual balances.</div>}
          </section>

          <section className="accountant-dashboard__panel accountant-dashboard__transactions">
            <div className="accountant-dashboard__panel-heading">
              <div><h2>Recent ledger entries</h2><p>Recent entries for the selected financial year</p></div>
              <div className="accountant-dashboard__table-actions">
                <label className="accountant-dashboard__search">
                  <Search size={16} aria-hidden="true" />
                  <span className="visually-hidden">Search ledger entries</span>
                  <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search entries" />
                </label>
                <button type="button" className="accountant-dashboard__export" onClick={() => downloadTransactions(entries, currency, digits)} disabled={!entries.length}>
                  <Download size={15} aria-hidden="true" /> Export CSV
                </button>
                <button type="button" className="accountant-dashboard__refresh" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading} aria-label="Refresh dashboard data">
                  <RefreshCw size={15} aria-hidden="true" /> Refresh
                </button>
                <Link to="/accountant/transactions">View all</Link>
              </div>
            </div>
            {entries.length ? (
              <div className="accountant-dashboard__table-wrap">
                <table>
                  <thead><tr><th scope="col">Reference</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Account category</th><th scope="col">Source / recipient</th><th scope="col">Type</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col" className="accountant-dashboard__amount">Amount</th></tr></thead>
                  <tbody>{entries.map((entry) => {
                    const debitMinor = (entry.lines || []).reduce((total, line) => total + Number(line.debitMinor || 0), 0)
                    return <tr key={entry._id}>
                      <td><strong>{entry.reference}</strong></td>
                      <td>{shortDate(entry.entryDate)}</td>
                      <td>{entry.description}</td>
                      <td>{[...new Set((entry.lines || []).map((line) => line.account?.name).filter(Boolean))].join(', ') || '—'}</td>
                      <td>{entry.counterparty || entry.projectReference || '—'}</td>
                      <td className="accountant-dashboard__capitalize">{String(entry.sourceType || '').replaceAll('_', ' ')}</td>
                      <td className="accountant-dashboard__capitalize">{String(entry.paymentMethod || '—').replaceAll('_', ' ')}</td>
                      <td><span className={`accountant-dashboard__status accountant-dashboard__status--${entry.status}`}>{entry.status}</span></td>
                      <td className="accountant-dashboard__amount">{formatMoney(debitMinor, entry.currency || currency, digits)}</td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
            ) : <div className="accountant-dashboard__chart-empty">{search ? 'No entries match that search.' : 'No journal entries have been recorded for this financial year.'}</div>}
            <p className="accountant-dashboard__footnote"><Landmark size={14} aria-hidden="true" /> Report cards include posted entries only. Drafts and submitted entries are saved and listed here, but they do not affect financial totals until the Director posts them. Invoice receivables and bill payables are not yet tracked by this ledger.</p>
          </section>
        </>
      )}
    </main>
  )
}
