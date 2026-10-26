import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BookOpen, CalendarDays, CirclePlus, Coins, Landmark, RefreshCw, Scale, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import './AccountingPage.css'

const TABS = ['Overview', 'Journal Entries', 'Chart of Accounts', 'Financial Years', 'Reports']
const SOURCE_TYPES = ['journal', 'income', 'expense', 'transfer', 'adjustment']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function asDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function amount(value, currency) {
  const numeric = Number(value || 0)
  return `${currency || ''} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(numeric)}`.trim()
}

function dateToday() {
  return new Date().toISOString().slice(0, 10)
}

function startOfYear(date) {
  return `${date.slice(0, 4)}-01-01`
}

function endOfYear(date) {
  return `${date.slice(0, 4)}-12-31`
}

function StatusPill({ status }) {
  return <span className={`accounting-status accounting-status--${String(status || 'unknown').toLowerCase()}`}>{status || 'Unknown'}</span>
}

function EmptyState({ title, detail }) {
  return <div className="accounting-empty"><BookOpen size={22} aria-hidden="true" /><strong>{title}</strong><span>{detail}</span></div>
}

export function AccountingPage() {
  const { user } = useAuth()
  const accountant = user?.role === 'accountant'
  const [tab, setTab] = useState('Overview')
  const [years, setYears] = useState([])
  const [accounts, setAccounts] = useState([])
  const [currency, setCurrency] = useState('')
  const [entries, setEntries] = useState([])
  const [report, setReport] = useState(null)
  const [selectedYear, setSelectedYear] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [reportMonth, setReportMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [myDrafts, setMyDrafts] = useState([])
  const [busyId, setBusyId] = useState('')
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showYearForm, setShowYearForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entryError, setEntryError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [yearError, setYearError] = useState('')
  const [entryForm, setEntryForm] = useState({ reference: '', entryDate: dateToday(), description: '', sourceType: 'journal', lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }] })
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'asset', cashOrBank: false })
  const [yearForm, setYearForm] = useState({ name: `${new Date().getFullYear()}`, startDate: startOfYear(dateToday()), endDate: endOfYear(dateToday()) })

  const selectedYearRecord = useMemo(() => years.find((year) => year.id === selectedYear), [years, selectedYear])
  const activeAccounts = useMemo(() => accounts.filter((account) => account.active !== false), [accounts])
  const filteredEntries = useMemo(() => entries.filter((entry) => statusFilter === 'all' || entry.status === statusFilter), [entries, statusFilter])
  const debitTotal = entryForm.lines.reduce((sum, line) => sum + (line.debit === '' ? 0 : Number(line.debit)), 0)
  const creditTotal = entryForm.lines.reduce((sum, line) => sum + (line.credit === '' ? 0 : Number(line.credit)), 0)

  const loadReferenceData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [yearResult, accountResult] = await Promise.all([
        apiRequest('/api/finance/years'),
        apiRequest('/api/finance/accounts'),
      ])
      setYears(yearResult.years || [])
      setAccounts(accountResult.accounts || [])
      setCurrency(accountResult.currency || '')
      setSelectedYear((current) => current && yearResult.years?.some((year) => year.id === current)
        ? current
        : yearResult.years?.[0]?.id || '')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadReferenceData() }, [loadReferenceData, refresh])

  const loadEntries = useCallback(async () => {
    if (!selectedYear) {
      setEntries([])
      return
    }
    setEntriesLoading(true)
    try {
      const result = await apiRequest(`/api/finance/journal-entries?yearId=${encodeURIComponent(selectedYear)}&page=1&limit=100`)
      setEntries(result.entries || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setEntriesLoading(false)
    }
  }, [selectedYear])

  useEffect(() => { loadEntries() }, [loadEntries, refresh])

  const loadReport = useCallback(async () => {
    if (!selectedYear) {
      setReport(null)
      return
    }
    setReportLoading(true)
    try {
      const monthQuery = reportMonth ? `&month=${reportMonth}` : ''
      const result = await apiRequest(`/api/finance/reports?yearId=${encodeURIComponent(selectedYear)}${monthQuery}`)
      setReport(result)
    } catch (requestError) {
      setError(requestError.message)
      setReport(null)
    } finally {
      setReportLoading(false)
    }
  }, [selectedYear, reportMonth])

  useEffect(() => { loadReport() }, [loadReport, refresh])

  function setLine(index, key, value) {
    setEntryForm((form) => ({ ...form, lines: form.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line) }))
  }

  function addLine() {
    if (entryForm.lines.length < 30) setEntryForm((form) => ({ ...form, lines: [...form.lines, { accountId: '', debit: '', credit: '', description: '' }] }))
  }

  async function createEntry(event) {
    event.preventDefault()
    setEntryError('')
    const lines = entryForm.lines.map((line) => ({
      accountId: line.accountId,
      debitMinor: line.debit === '' ? 0 : Number(line.debit),
      creditMinor: line.credit === '' ? 0 : Number(line.credit),
      description: line.description.trim(),
    }))
    const amountsValid = lines.every((line) => Number.isSafeInteger(line.debitMinor) && Number.isSafeInteger(line.creditMinor)
      && line.debitMinor >= 0 && line.creditMinor >= 0 && !(line.debitMinor > 0 && line.creditMinor > 0)
      && (line.debitMinor > 0 || line.creditMinor > 0))
    const totalDebit = lines.reduce((sum, line) => sum + line.debitMinor, 0)
    const totalCredit = lines.reduce((sum, line) => sum + line.creditMinor, 0)
    if (!selectedYear || !selectedYearRecord || selectedYearRecord.status !== 'open') return setEntryError('Choose an open financial year before creating a draft.')
    if (entryForm.reference.trim().length < 1 || entryForm.reference.trim().length > 40) return setEntryError('Enter a reference of up to 40 characters.')
    if (entryForm.description.trim().length < 3) return setEntryError('Add a description of at least 3 characters.')
    if (!entryForm.entryDate || entryForm.entryDate < selectedYearRecord.startDate || entryForm.entryDate > selectedYearRecord.endDate) return setEntryError('The entry date must be within the selected financial year.')
    if (lines.length < 2 || lines.some((line) => !line.accountId) || !amountsValid) return setEntryError('Choose an account and enter one non-zero integer debit or credit amount on each line.')
    if (totalDebit <= 0 || totalDebit !== totalCredit) return setEntryError('Debits and credits must be equal and greater than zero.')
    setSaving(true)
    try {
      const result = await apiRequest('/api/finance/journal-entries', {
        method: 'POST',
        body: { reference: entryForm.reference.trim(), entryDate: entryForm.entryDate, financialYearId: selectedYear, description: entryForm.description.trim(), sourceType: entryForm.sourceType, currency, lines },
      })
      const created = result.entry
      setMyDrafts((previous) => [...previous, created._id])
      setNotice('Draft journal entry created.')
      setEntryForm({ reference: '', entryDate: dateToday(), description: '', sourceType: 'journal', lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }] })
      setShowEntryForm(false)
      await loadEntries()
    } catch (requestError) {
      setEntryError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitEntry(entry) {
    setBusyId(entry._id)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/finance/journal-entries/${entry._id}/submit`, { method: 'POST' })
      setNotice(`Entry ${entry.reference} submitted for review.`)
      setMyDrafts((previous) => previous.filter((id) => id !== entry._id))
      await loadEntries()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId('')
    }
  }

  async function seedChart() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest('/api/finance/accounts/standard-chart', { method: 'POST' })
      setAccounts(result.accounts || [])
      setCurrency(result.currency || currency)
      setNotice('Standard chart of accounts is ready. Existing accounts were preserved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function createAccount(event) {
    event.preventDefault()
    setAccountError('')
    if (!/^[A-Z0-9_-]{2,20}$/i.test(accountForm.code.trim())) return setAccountError('Use a 2–20 character account code with letters, numbers, hyphens, or underscores.')
    if (accountForm.name.trim().length < 2) return setAccountError('Enter an account name of at least 2 characters.')
    setSaving(true)
    try {
      const result = await apiRequest('/api/finance/accounts', { method: 'POST', body: { ...accountForm, code: accountForm.code.trim(), name: accountForm.name.trim() } })
      setAccounts((current) => [...current, result.account].sort((a, b) => a.code.localeCompare(b.code)))
      setAccountForm({ code: '', name: '', type: 'asset', cashOrBank: false })
      setShowAccountForm(false)
      setNotice('Account added.')
    } catch (requestError) {
      setAccountError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function createYear(event) {
    event.preventDefault()
    setYearError('')
    if (!yearForm.name.trim() || yearForm.name.trim().length > 40) return setYearError('Enter a name of up to 40 characters.')
    const start = new Date(`${yearForm.startDate}T00:00:00`)
    const end = new Date(`${yearForm.endDate}T00:00:00`)
    if (!yearForm.startDate || !yearForm.endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      || start.getMonth() !== 0 || start.getDate() !== 1 || end.getMonth() !== 11 || end.getDate() !== 31 || start.getFullYear() !== end.getFullYear()) {
      return setYearError('Financial years must run from January 1 through December 31 of the same year.')
    }
    setSaving(true)
    try {
      const result = await apiRequest('/api/finance/years', { method: 'POST', body: { name: yearForm.name.trim(), startDate: yearForm.startDate, endDate: yearForm.endDate } })
      setYears((previous) => [result.year, ...previous].sort((a, b) => b.startDate.localeCompare(a.startDate)))
      setSelectedYear(result.year.id)
      setShowYearForm(false)
      setNotice('Financial year created.')
    } catch (requestError) {
      setYearError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function changeTab(nextTab) {
    setTab(nextTab)
    setError('')
    setNotice('')
  }

  const overviewTotals = report?.current

  return (
    <main className="accounting-page">
      <header className="accounting-heading">
        <div>
          <p className="accounting-eyebrow">Finance workspace</p>
          <h1>Accounting</h1>
          <p className="accounting-subtitle">A clear view of your organization’s ledger, accounts, and reporting periods.</p>
        </div>
        <div className="accounting-heading-meta">
          <span className="accounting-currency"><Coins size={16} aria-hidden="true" />{currency || 'Loading currency'}</span>
          <span className="accounting-basis">Accrual-basis ledger</span>
        </div>
      </header>

      {(error || notice) && (
        <div className={error ? 'accounting-alert' : 'accounting-notice'} role={error ? 'alert' : 'status'}>
          <span>{error || notice}</span>
          {error && <button className="accounting-btn accounting-btn--quiet" type="button" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Retry</button>}
        </div>
      )}

      <nav className="accounting-tabs" aria-label="Accounting sections" role="tablist">
        {TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => changeTab(item)}>{item}</button>)}
      </nav>

      {loading ? <div className="accounting-loading" role="status" aria-live="polite">Loading accounting workspace…</div> : (
        <>
          {tab === 'Overview' && (
            <section className="accounting-section" aria-labelledby="accounting-overview-title">
              <div className="accounting-section-heading">
                <div><h2 id="accounting-overview-title">Overview</h2><p>Posted ledger activity for the selected financial year.</p></div>
                <YearSelect years={years} selectedYear={selectedYear} onChange={setSelectedYear} />
              </div>
              {years.length === 0 ? <EmptyState title="No financial years yet" detail="Create a financial year to begin organizing ledger activity." /> : reportLoading ? <div className="accounting-loading" role="status">Loading report…</div> : report ? (
                <>
                  <div className="accounting-metrics">
                    <Metric icon={ArrowDownLeft} label="Income" value={amount(overviewTotals?.incomeMinor, currency)} />
                    <Metric icon={ArrowUpRight} label="Expenses" value={amount(overviewTotals?.expensesMinor, currency)} />
                    <Metric icon={Scale} label="Net surplus" value={amount(overviewTotals?.netSurplusMinor, currency)} />
                    <Metric icon={Wallet} label="Cash & bank closing" value={amount(overviewTotals?.cashAndBankClosingMinor, currency)} />
                  </div>
                  <div className="accounting-two-column">
                    <article className="accounting-panel">
                      <div className="accounting-panel-heading"><div><h3>{selectedYearRecord?.name || 'Financial year'}</h3><p>{asDate(selectedYearRecord?.startDate)} – {asDate(selectedYearRecord?.endDate)}</p></div><StatusPill status={selectedYearRecord?.status} /></div>
                      <dl className="accounting-summary-list">
                        <SummaryRow label="Opening cash & bank" value={amount(report.opening?.cashAndBankMinor, currency)} />
                        <SummaryRow label="Cash & bank movement" value={amount(overviewTotals?.cashAndBankMovementMinor, currency)} />
                        <SummaryRow label="Year-to-date income" value={amount(report.yearToDate?.incomeMinor, currency)} />
                        <SummaryRow label="Year-to-date expenses" value={amount(report.yearToDate?.expensesMinor, currency)} />
                      </dl>
                    </article>
                    <article className="accounting-panel accounting-callout">
                      <Landmark size={22} aria-hidden="true" />
                      <h3>Ledger summary</h3>
                      <p>This accrual-basis ledger summary includes posted records only. It is not a complete statutory financial statement.</p>
                      <button className="accounting-btn accounting-btn--secondary" type="button" onClick={() => changeTab('Reports')}>View reports</button>
                    </article>
                  </div>
                </>
              ) : <EmptyState title="Report unavailable" detail="There is no report data to show for this period yet." />}
            </section>
          )}

          {tab === 'Journal Entries' && (
            <section className="accounting-section" aria-labelledby="accounting-journal-title">
              <div className="accounting-section-heading">
                <div><h2 id="accounting-journal-title">Journal entries</h2><p>Create balanced drafts and track their review status.</p></div>
                <div className="accounting-toolbar">
                  <YearSelect years={years} selectedYear={selectedYear} onChange={setSelectedYear} />
                  {accountant && <button className="accounting-btn accounting-btn--primary" type="button" onClick={() => { setShowEntryForm((current) => !current); setEntryError('') }} disabled={!selectedYearRecord || selectedYearRecord.status !== 'open'}><CirclePlus size={16} aria-hidden="true" />{showEntryForm ? 'Close form' : 'New draft'}</button>}
                </div>
              </div>
              <div className="accounting-filters">
                <label htmlFor="entry-status">Filter by status</label>
                <select id="entry-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="posted">Posted</option>
                </select>
              </div>
              {showEntryForm && accountant && <form className="accounting-panel accounting-form" onSubmit={createEntry}>
                <div className="accounting-panel-heading"><div><h3>New journal draft</h3><p>Amounts are entered as whole {currency || 'currency'} units. Debits must equal credits.</p></div></div>
                {entryError && <p className="accounting-form-error" role="alert">{entryError}</p>}
                <div className="accounting-form-grid">
                  <label>Reference<input value={entryForm.reference} maxLength={40} onChange={(event) => setEntryForm({ ...entryForm, reference: event.target.value })} required /></label>
                  <label>Entry date<input type="date" value={entryForm.entryDate} min={selectedYearRecord?.startDate} max={selectedYearRecord?.endDate} onChange={(event) => setEntryForm({ ...entryForm, entryDate: event.target.value })} required /></label>
                  <label>Source type<select value={entryForm.sourceType} onChange={(event) => setEntryForm({ ...entryForm, sourceType: event.target.value })}>{SOURCE_TYPES.map((source) => <option key={source} value={source}>{source.replace('_', ' ')}</option>)}</select></label>
                  <label className="accounting-form-grid__wide">Description<input value={entryForm.description} maxLength={500} onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })} required /></label>
                </div>
                <div className="accounting-lines-heading"><strong>Entry lines</strong><span>Debit total {amount(debitTotal, currency)} · Credit total {amount(creditTotal, currency)}</span></div>
                <div className="accounting-lines">
                  {entryForm.lines.map((line, index) => <div className="accounting-line" key={index}>
                    <label>Account<select value={line.accountId} onChange={(event) => setLine(index, 'accountId', event.target.value)} required><option value="">Select account</option>{activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.code} · {account.name}</option>)}</select></label>
                    <label>Debit<input type="number" min="0" step="1" inputMode="numeric" value={line.debit} onChange={(event) => { setLine(index, 'debit', event.target.value); if (event.target.value) setLine(index, 'credit', '') }} /></label>
                    <label>Credit<input type="number" min="0" step="1" inputMode="numeric" value={line.credit} onChange={(event) => { setLine(index, 'credit', event.target.value); if (event.target.value) setLine(index, 'debit', '') }} /></label>
                    <label>Line description<input value={line.description} maxLength={300} onChange={(event) => setLine(index, 'description', event.target.value)} /></label>
                  </div>)}
                </div>
                <div className="accounting-form-actions"><button type="button" className="accounting-btn accounting-btn--secondary" onClick={addLine} disabled={entryForm.lines.length >= 30}>Add line</button><button type="submit" className="accounting-btn accounting-btn--primary" disabled={saving || debitTotal <= 0 || debitTotal !== creditTotal}>{saving ? 'Saving…' : 'Save draft'}</button></div>
              </form>}
              {entriesLoading ? <div className="accounting-loading" role="status">Loading journal entries…</div> : filteredEntries.length === 0 ? <EmptyState title="No journal entries" detail={statusFilter === 'all' ? 'No entries exist for this financial year yet.' : `No ${statusFilter} entries for this financial year.`} /> : (
                <div className="accounting-table-wrap"><table className="accounting-table">
                  <thead><tr><th scope="col">Reference & description</th><th scope="col">Date</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Amount</th>{accountant && <th scope="col">Action</th>}</tr></thead>
                  <tbody>{filteredEntries.map((entry) => {
                    const debit = (entry.lines || []).reduce((sum, line) => sum + Number(line.debitMinor || 0), 0)
                    return <tr key={entry._id}><td><strong>{entry.reference}</strong><span>{entry.description}</span></td><td>{asDate(entry.entryDate)}</td><td className="accounting-capitalize">{String(entry.sourceType || '').replace('_', ' ')}</td><td><StatusPill status={entry.status} /></td><td>{amount(debit, entry.currency || currency)}</td>{accountant && <td>{entry.status === 'draft' && myDrafts.includes(entry._id) ? <button className="accounting-btn accounting-btn--small" type="button" disabled={busyId === entry._id} onClick={() => submitEntry(entry)}>{busyId === entry._id ? 'Submitting…' : 'Submit draft'}</button> : '—'}</td>}</tr>
                  })}</tbody>
                </table></div>
              )}
            </section>
          )}

          {tab === 'Chart of Accounts' && (
            <section className="accounting-section" aria-labelledby="accounting-accounts-title">
              <div className="accounting-section-heading"><div><h2 id="accounting-accounts-title">Chart of accounts</h2><p>Accounts used to classify journal activity.</p></div>
                {accountant && <div className="accounting-toolbar"><button type="button" className="accounting-btn accounting-btn--secondary" onClick={seedChart} disabled={saving}><RefreshCw size={15} aria-hidden="true" />{saving ? 'Working…' : 'Seed standard chart'}</button><button type="button" className="accounting-btn accounting-btn--primary" onClick={() => { setShowAccountForm((current) => !current); setAccountError('') }}><CirclePlus size={16} aria-hidden="true" />{showAccountForm ? 'Close form' : 'Add account'}</button></div>}
              </div>
              {showAccountForm && accountant && <form className="accounting-panel accounting-form" onSubmit={createAccount}>
                <h3>Add account</h3>{accountError && <p className="accounting-form-error" role="alert">{accountError}</p>}
                <div className="accounting-form-grid"><label>Account code<input value={accountForm.code} maxLength={20} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value })} required /></label><label>Account name<input value={accountForm.name} maxLength={120} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} required /></label><label>Type<select value={accountForm.type} onChange={(event) => setAccountForm({ ...accountForm, type: event.target.value, cashOrBank: event.target.value === 'asset' ? accountForm.cashOrBank : false })}><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option></select></label><label className="accounting-checkbox"><input type="checkbox" checked={accountForm.cashOrBank} disabled={accountForm.type !== 'asset'} onChange={(event) => setAccountForm({ ...accountForm, cashOrBank: event.target.checked })} />Cash or bank</label></div>
                <div className="accounting-form-actions"><button className="accounting-btn accounting-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Add account'}</button></div>
              </form>}
              {accounts.length === 0 ? <EmptyState title="No accounts yet" detail={accountant ? 'Seed the standard chart to add common accounts, or add an account yourself.' : 'An accountant has not added any accounts yet.'} /> : <div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th scope="col">Code</th><th scope="col">Account</th><th scope="col">Type</th><th scope="col">Cash or bank</th><th scope="col">Status</th></tr></thead><tbody>{accounts.map((account) => <tr key={account._id}><td><strong>{account.code}</strong></td><td>{account.name}</td><td className="accounting-capitalize">{account.type}</td><td>{account.cashOrBank ? 'Yes' : 'No'}</td><td><StatusPill status={account.active === false ? 'inactive' : 'active'} /></td></tr>)}</tbody></table></div>}
            </section>
          )}

          {tab === 'Financial Years' && (
            <section className="accounting-section" aria-labelledby="accounting-years-title">
              <div className="accounting-section-heading"><div><h2 id="accounting-years-title">Financial years</h2><p>Calendar-year periods help keep entries and reports organized.</p></div>{accountant && <button type="button" className="accounting-btn accounting-btn--primary" onClick={() => { setShowYearForm((current) => !current); setYearError('') }}><CirclePlus size={16} aria-hidden="true" />{showYearForm ? 'Close form' : 'New financial year'}</button>}</div>
              {showYearForm && accountant && <form className="accounting-panel accounting-form" onSubmit={createYear}><h3>Create financial year</h3><p className="accounting-form-hint">Guidance: financial years run January 1–December 31. Saved dates are shown below.</p>{yearError && <p className="accounting-form-error" role="alert">{yearError}</p>}<div className="accounting-form-grid"><label>Name<input value={yearForm.name} maxLength={40} onChange={(event) => setYearForm({ ...yearForm, name: event.target.value })} required /></label><label>Start date<input type="date" value={yearForm.startDate} onChange={(event) => setYearForm({ ...yearForm, startDate: event.target.value })} required /></label><label>End date<input type="date" value={yearForm.endDate} onChange={(event) => setYearForm({ ...yearForm, endDate: event.target.value })} required /></label></div><div className="accounting-form-actions"><button className="accounting-btn accounting-btn--primary" disabled={saving}>{saving ? 'Creating…' : 'Create year'}</button></div></form>}
              {years.length === 0 ? <EmptyState title="No financial years" detail="Create a January–December financial year to start a ledger period." /> : <div className="accounting-year-list">{years.map((year) => <article className="accounting-year-card" key={year.id}><div className="accounting-year-icon"><CalendarDays size={19} aria-hidden="true" /></div><div className="accounting-year-details"><strong>{year.name}</strong><span>{asDate(year.startDate)} – {asDate(year.endDate)}</span><small>Saved dates</small></div><StatusPill status={year.status} /></article>)}</div>}
            </section>
          )}

          {tab === 'Reports' && (
            <section className="accounting-section" aria-labelledby="accounting-reports-title">
              <div className="accounting-section-heading"><div><h2 id="accounting-reports-title">Reports</h2><p>Accrual-basis ledger summary using posted records only.</p></div><div className="accounting-toolbar"><YearSelect years={years} selectedYear={selectedYear} onChange={setSelectedYear} /><label className="accounting-month-select"><span className="sr-only">Report period</span><select value={reportMonth} onChange={(event) => setReportMonth(event.target.value)}><option value="">Full year</option>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></div></div>
              <p className="accounting-disclaimer">This is an accrual-basis ledger summary, not a complete statutory financial statement.</p>
              {reportLoading ? <div className="accounting-loading" role="status">Loading report…</div> : !report ? <EmptyState title="No report available" detail={years.length ? 'Report data could not be loaded for the selected period.' : 'Create a financial year before viewing a report.'} /> : (
                <>
                  <div className="accounting-report-meta"><span>{report.period || (reportMonth ? `${MONTHS[Number(reportMonth) - 1]} ${selectedYearRecord?.name || ''}` : selectedYearRecord?.name)}</span><span>Basis: {report.basis || 'Accrual'}</span><span>{Number(report.recordsIncluded || 0)} posted records included</span></div>
                  <div className="accounting-metrics accounting-metrics--reports">
                    <Metric icon={ArrowDownLeft} label="Income" value={amount(report.current?.incomeMinor, currency)} />
                    <Metric icon={ArrowUpRight} label="Expenses" value={amount(report.current?.expensesMinor, currency)} />
                    <Metric icon={Scale} label="Net surplus" value={amount(report.current?.netSurplusMinor, currency)} />
                    <Metric icon={Wallet} label="Cash & bank closing" value={amount(report.current?.cashAndBankClosingMinor, currency)} />
                  </div>
                  <div className="accounting-two-column">
                    <article className="accounting-panel"><div className="accounting-panel-heading"><div><h3>Period summary</h3><p>{reportMonth ? MONTHS[Number(reportMonth) - 1] : 'Full financial year'}</p></div></div><dl className="accounting-summary-list"><SummaryRow label="Opening cash & bank" value={amount(report.opening?.cashAndBankMinor, currency)} /><SummaryRow label="Cash & bank movement" value={amount(report.current?.cashAndBankMovementMinor, currency)} /><SummaryRow label="Cash & bank closing" value={amount(report.current?.cashAndBankClosingMinor, currency)} /><SummaryRow label="Net surplus year to date" value={amount(report.yearToDate?.netSurplusMinor, currency)} /></dl></article>
                    <article className="accounting-panel"><div className="accounting-panel-heading"><div><h3>Monthly trend</h3><p>Income and expenses across the selected year</p></div></div>{(report.monthlyTrend || []).length ? <div className="accounting-trend">{report.monthlyTrend.map((item) => <div key={item.month}><span>{MONTHS[Number(item.month) - 1] || item.month}</span><span>{amount(item.incomeMinor, currency)} income</span><span>{amount(item.expensesMinor, currency)} expenses</span></div>)}</div> : <p className="accounting-muted">No monthly data for this year.</p>}</article>
                  </div>
                  {report.current?.accountBalances?.length > 0 && <div className="accounting-panel accounting-balances"><h3>Account balances</h3><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th scope="col">Account</th><th scope="col">Balance</th></tr></thead><tbody>{report.current.accountBalances.map((item, index) => <tr key={item.accountId || item._id || index}><td>{item.code ? `${item.code} · ` : ''}{item.name || item.accountName || 'Account'}</td><td>{amount(item.balanceMinor ?? item.amountMinor, currency)}</td></tr>)}</tbody></table></div></div>}
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}

function YearSelect({ years, selectedYear, onChange }) {
  return <label className="accounting-year-select"><span>Financial year</span><select aria-label="Financial year" value={selectedYear} onChange={(event) => onChange(event.target.value)}><option value="">Select year</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</select></label>
}

function Metric({ icon: Icon, label, value }) {
  return <article className="accounting-metric"><div className="accounting-metric-icon"><Icon size={19} aria-hidden="true" /></div><span>{label}</span><strong>{value}</strong></article>
}

function SummaryRow({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}
