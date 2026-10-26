import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BookOpen, CalendarDays, Check, CirclePlus, Coins, Landmark, RefreshCw, Scale, Trash2, Undo2, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'
import './AccountingPage.css'

const TABS = ['Overview', 'Journal Entries', 'Chart of Accounts', 'Financial Years', 'Reports', 'Audit Log']
const SOURCE_TYPES = ['journal', 'income', 'expense', 'transfer', 'adjustment']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function asDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function amount(value, currency, minorUnitDigits = 0) {
  const numeric = Number(value || 0) / (10 ** minorUnitDigits)
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'RWF',
      minimumFractionDigits: minorUnitDigits,
      maximumFractionDigits: minorUnitDigits,
    }).format(numeric)
  } catch {
    return `${currency || ''} ${new Intl.NumberFormat(undefined, { maximumFractionDigits: minorUnitDigits }).format(numeric)}`.trim()
  }
}

function formatChange(change, currency, minorUnitDigits) {
  if (!change) return '—'
  const sign = change.amountMinor > 0 ? '+' : ''
  const formatted = amount(change.amountMinor, currency, minorUnitDigits)
  const percentage = change.percent === null ? ' (prior year was zero)' : ` (${change.percent > 0 ? '+' : ''}${change.percent}%)`
  return `${sign}${formatted}${percentage}`
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
  const [minorUnitDigits, setMinorUnitDigits] = useState(0)
  const [entries, setEntries] = useState([])
  const [entryPage, setEntryPage] = useState(1)
  const [entryTotal, setEntryTotal] = useState(0)
  const [report, setReport] = useState(null)
  const [auditEvents, setAuditEvents] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [entryFrom, setEntryFrom] = useState('')
  const [entryTo, setEntryTo] = useState('')
  const [reportMonth, setReportMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [busyId, setBusyId] = useState('')
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showYearForm, setShowYearForm] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [entryError, setEntryError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [yearError, setYearError] = useState('')
  const [entryForm, setEntryForm] = useState({ reference: '', entryDate: dateToday(), description: '', sourceType: 'journal', lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }] })
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'asset', cashOrBank: false })
  const [yearForm, setYearForm] = useState(() => {
    const today = dateToday()
    return { name: today.slice(0, 4), startDate: startOfYear(today), endDate: endOfYear(today) }
  })

  const selectedYearRecord = useMemo(() => years.find((year) => year.id === selectedYear), [years, selectedYear])
  const activeAccounts = useMemo(() => accounts.filter((account) => account.active !== false), [accounts])
  const filteredEntries = useMemo(() => entries.filter((entry) => (
    (statusFilter === 'all' || entry.status === statusFilter)
    && (sourceFilter === 'all' || entry.sourceType === sourceFilter)
    && (!search.trim() || `${entry.reference} ${entry.description}`.toLowerCase().includes(search.trim().toLowerCase()))
  )), [entries, search, sourceFilter, statusFilter])
  const minorUnitFactor = 10 ** minorUnitDigits
  const debitTotal = entryForm.lines.reduce((sum, line) => (
    sum + (line.debit === '' ? 0 : Math.round(Number(line.debit) * minorUnitFactor))
  ), 0)
  const creditTotal = entryForm.lines.reduce((sum, line) => (
    sum + (line.credit === '' ? 0 : Math.round(Number(line.credit) * minorUnitFactor))
  ), 0)

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
      setMinorUnitDigits(accountResult.minorUnitDigits ?? 0)
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
      const params = new URLSearchParams({
        yearId: selectedYear,
        page: String(entryPage),
        limit: '25',
      })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (sourceFilter !== 'all') params.set('sourceType', sourceFilter)
      if (entryFrom) params.set('from', entryFrom)
      if (entryTo) params.set('to', entryTo)
      if (search.trim()) params.set('search', search.trim())
      const result = await apiRequest(`/api/finance/journal-entries?${params}`)
      setEntries(result.entries || [])
      setEntryTotal(result.total || 0)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setEntriesLoading(false)
    }
  }, [entryFrom, entryPage, entryTo, search, selectedYear, sourceFilter, statusFilter])

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

  useEffect(() => {
    if (tab !== 'Audit Log' || user?.role !== 'director') return undefined
    const controller = new AbortController()
    setAuditLoading(true)
    apiRequest('/api/finance/audit-log?page=1&limit=100', { signal: controller.signal })
      .then((result) => setAuditEvents(result.events || []))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuditLoading(false)
      })
    return () => controller.abort()
  }, [tab, user?.role, refresh])

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
      debitMinor: line.debit === '' ? 0 : Math.round(Number(line.debit) * minorUnitFactor),
      creditMinor: line.credit === '' ? 0 : Math.round(Number(line.credit) * minorUnitFactor),
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
    if (lines.some((line, index) => (
      (entryForm.lines[index].debit !== '' && Number(entryForm.lines[index].debit) * minorUnitFactor !== line.debitMinor)
      || (entryForm.lines[index].credit !== '' && Number(entryForm.lines[index].credit) * minorUnitFactor !== line.creditMinor)
    ))) return setEntryError(`Amounts may have no more than ${minorUnitDigits} decimal places.`)
    setSaving(true)
    try {
      await apiRequest(editingEntryId
        ? `/api/finance/journal-entries/${editingEntryId}`
        : '/api/finance/journal-entries', {
        method: editingEntryId ? 'PATCH' : 'POST',
        timeoutMs: 15_000,
        body: { reference: entryForm.reference.trim(), entryDate: entryForm.entryDate, financialYearId: selectedYear, description: entryForm.description.trim(), sourceType: entryForm.sourceType, currency, lines },
      })
      setNotice(editingEntryId ? 'Draft journal entry updated.' : 'Draft journal entry created.')
      setEditingEntryId('')
      setEntryForm({ reference: '', entryDate: dateToday(), description: '', sourceType: 'journal', lines: [{ accountId: '', debit: '', credit: '', description: '' }, { accountId: '', debit: '', credit: '', description: '' }] })
      setShowEntryForm(false)
      await loadEntries()
    } catch (requestError) {
      setEntryError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function editDraft(entry) {
    if (!selectedYearRecord || selectedYearRecord.status !== 'open') {
      setError('Only draft entries in an open financial year can be edited.')
      return
    }
    setEditingEntryId(entry._id)
    setEntryError('')
    setShowEntryForm(true)
    setEntryForm({
      reference: entry.reference,
      entryDate: String(entry.entryDate).slice(0, 10),
      description: entry.description,
      sourceType: entry.sourceType,
      lines: entry.lines.map((line) => ({
        accountId: typeof line.account === 'string' ? line.account : line.account?._id,
        debit: line.debitMinor ? String(line.debitMinor / minorUnitFactor) : '',
        credit: line.creditMinor ? String(line.creditMinor / minorUnitFactor) : '',
        description: line.description || '',
      })),
    })
  }

  function cancelEntryForm() {
    setEditingEntryId('')
    setEntryError('')
    setShowEntryForm(false)
    setEntryForm({
      reference: '',
      entryDate: dateToday(),
      description: '',
      sourceType: 'journal',
      lines: [
        { accountId: '', debit: '', credit: '', description: '' },
        { accountId: '', debit: '', credit: '', description: '' },
      ],
    })
  }

  async function submitEntry(entry) {
    setBusyId(entry._id)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/finance/journal-entries/${entry._id}/submit`, { method: 'POST', timeoutMs: 15_000 })
      setNotice(`Entry ${entry.reference} submitted for review.`)
      await loadEntries()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId('')
    }
  }

  async function deleteDraft(entry) {
    if (!window.confirm(`Delete your draft ${entry.reference}? Drafts cannot be recovered.`)) return
    setBusyId(entry._id)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/finance/journal-entries/${entry._id}`, { method: 'DELETE', timeoutMs: 15_000 })
      setNotice(`Draft ${entry.reference} deleted.`)
      await loadEntries()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId('')
    }
  }

  async function reviewEntry(entry, decision) {
    const reason = decision === 'return'
      ? window.prompt(`Why is ${entry.reference} being returned for correction?`)
      : ''
    if (decision === 'return' && (reason === null || reason.trim().length < 5)) {
      if (reason !== null) setError('Add a return comment of at least 5 characters.')
      return
    }
    const action = decision === 'approve' ? 'approve' : 'return'
    setBusyId(entry._id)
    setError('')
    setNotice('')
    try {
      await apiRequest(`/api/finance/journal-entries/${entry._id}/${action}`, {
        method: 'POST',
        timeoutMs: 15_000,
        ...(decision === 'return' ? { body: { reason: reason.trim() } } : {}),
      })
      setNotice(decision === 'approve' ? `Entry ${entry.reference} posted.` : `Entry ${entry.reference} returned for correction.`)
      await Promise.all([loadEntries(), loadReport()])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId('')
    }
  }

  async function reverseEntry(entry) {
    if (!selectedYearRecord || selectedYearRecord.status !== 'open') {
      setError('Select an open financial year before creating a reversal draft.')
      return
    }
    const reversalDate = window.prompt('Reversal date (YYYY-MM-DD):', dateToday())
    if (reversalDate === null) return
    const defaultReference = `REV-${entry.reference}-${reversalDate.replaceAll('-', '')}`.slice(0, 40)
    const reference = window.prompt('Reversal reference:', defaultReference)
    if (reference === null) return
    const description = window.prompt('Reason for reversal:', `Reversal of ${entry.reference}`)
    if (description === null || description.trim().length < 3) {
      if (description !== null) setError('Provide a reversal description of at least 3 characters.')
      return
    }
    setBusyId(entry._id)
    setError('')
    setNotice('')
    try {
      const result = await apiRequest(`/api/finance/journal-entries/${entry._id}/reverse`, {
        method: 'POST',
        timeoutMs: 15_000,
        body: {
          reference: reference.trim(),
          entryDate: reversalDate,
          financialYearId: selectedYear,
          description: description.trim(),
        },
      })
      setNotice(`Reversal draft ${result.entry.reference} created for review.`)
      await loadEntries()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyId('')
    }
  }

  async function changeFinancialYearStatus(year, action) {
    const reason = action === 'reopen'
      ? window.prompt(`Reason for reopening ${year.name} (at least 10 characters):`)
      : null
    if (action === 'reopen' && (reason === null || reason.trim().length < 10)) {
      if (reason !== null) setError('A reason of at least 10 characters is required to reopen a year.')
      return
    }
    if (action === 'close' && !window.confirm(`Close ${year.name}? No more journal entries can be recorded unless a Director reopens it.`)) return
    setError('')
    setNotice('')
    setBusyId(year.id)
    try {
      await apiRequest(`/api/finance/years/${year.id}/${action}`, {
        method: 'POST',
        timeoutMs: 15_000,
        ...(action === 'reopen' ? { body: { reason: reason.trim() } } : {}),
      })
      setNotice(`${year.name} ${action === 'close' ? 'closed' : 'reopened'}.`)
      await loadReferenceData()
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
      const result = await apiRequest('/api/finance/accounts/standard-chart', { method: 'POST', timeoutMs: 15_000 })
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
      const result = await apiRequest('/api/finance/accounts', { method: 'POST', timeoutMs: 15_000, body: { ...accountForm, code: accountForm.code.trim(), name: accountForm.name.trim() } })
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
      const result = await apiRequest('/api/finance/years', { method: 'POST', timeoutMs: 15_000, body: { name: yearForm.name.trim(), startDate: yearForm.startDate, endDate: yearForm.endDate } })
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
    <div className="accounting-page">
      <header className="accounting-heading">
        <div>
          <p className="accounting-eyebrow">Finance workspace</p>
          <h1>Accounting</h1>
          <p className="accounting-subtitle">A clear view of your organization’s ledger, accounts, and reporting periods.</p>
        </div>
        <div className="accounting-heading-meta">
          <span className="accounting-currency"><Coins size={16} aria-hidden="true" />{currency || 'Loading currency'}</span>
          <span className="accounting-basis">{user?.role === 'director' ? 'Director review workspace' : 'Accrual-basis ledger'}</span>
        </div>
      </header>

      {(error || notice) && (
        <div className={error ? 'accounting-alert' : 'accounting-notice'} role={error ? 'alert' : 'status'}>
          <span>{error || notice}</span>
          {error && <button className="accounting-btn accounting-btn--quiet" type="button" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Retry</button>}
        </div>
      )}

      <nav className="accounting-tabs" aria-label="Accounting sections" role="tablist">
        {TABS.filter((item) => item !== 'Audit Log' || user?.role === 'director').map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => changeTab(item)}>{item}</button>)}
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
                    <Metric icon={ArrowDownLeft} label="Income" value={amount(overviewTotals?.incomeMinor, currency, minorUnitDigits)} />
                    <Metric icon={ArrowUpRight} label="Expenses" value={amount(overviewTotals?.expensesMinor, currency, minorUnitDigits)} />
                    <Metric icon={Scale} label="Net surplus" value={amount(overviewTotals?.netSurplusMinor, currency, minorUnitDigits)} />
                    <Metric icon={Wallet} label="Cash & bank closing" value={amount(overviewTotals?.cashAndBankClosingMinor, currency, minorUnitDigits)} />
                  </div>
                  <div className="accounting-two-column">
                    <article className="accounting-panel">
                      <div className="accounting-panel-heading"><div><h3>{selectedYearRecord?.name || 'Financial year'}</h3><p>{asDate(selectedYearRecord?.startDate)} – {asDate(selectedYearRecord?.endDate)}</p></div><StatusPill status={selectedYearRecord?.status} /></div>
                      <dl className="accounting-summary-list">
                        <SummaryRow label="Opening cash & bank" value={amount(report.opening?.cashAndBankMinor, currency, minorUnitDigits)} />
                        <SummaryRow label="Cash & bank movement" value={amount(overviewTotals?.cashAndBankMovementMinor, currency, minorUnitDigits)} />
                        <SummaryRow label="Year-to-date income" value={amount(report.yearToDate?.incomeMinor, currency, minorUnitDigits)} />
                        <SummaryRow label="Year-to-date expenses" value={amount(report.yearToDate?.expensesMinor, currency, minorUnitDigits)} />
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
              <div className="accounting-filters accounting-filters--wide">
                <label>Search<input aria-label="Search journal entries" type="search" value={search} placeholder="Reference or description" onChange={(event) => { setEntryPage(1); setSearch(event.target.value) }} /></label>
                <label htmlFor="entry-status">Status
                  <select id="entry-status" value={statusFilter} onChange={(event) => { setEntryPage(1); setStatusFilter(event.target.value) }}>
                    <option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="posted">Posted</option>
                  </select>
                </label>
                <label htmlFor="entry-source">Type
                  <select id="entry-source" value={sourceFilter} onChange={(event) => { setEntryPage(1); setSourceFilter(event.target.value) }}>
                    <option value="all">All types</option>{SOURCE_TYPES.map((source) => <option key={source} value={source}>{source.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <label>From<input type="date" value={entryFrom} onChange={(event) => { setEntryPage(1); setEntryFrom(event.target.value) }} /></label>
                <label>To<input type="date" value={entryTo} onChange={(event) => { setEntryPage(1); setEntryTo(event.target.value) }} /></label>
              </div>
              {showEntryForm && accountant && <form className="accounting-panel accounting-form" onSubmit={createEntry}>
                <div className="accounting-panel-heading"><div><h3>{editingEntryId ? 'Edit journal draft' : 'New journal draft'}</h3><p>Enter amounts in {currency || 'the configured currency'}; debits must equal credits.</p></div></div>
                {entryError && <p className="accounting-form-error" role="alert">{entryError}</p>}
                <div className="accounting-form-grid">
                  <label>Reference<input value={entryForm.reference} maxLength={40} onChange={(event) => setEntryForm({ ...entryForm, reference: event.target.value })} required /></label>
                  <label>Entry date<input type="date" value={entryForm.entryDate} min={selectedYearRecord?.startDate} max={selectedYearRecord?.endDate} onChange={(event) => setEntryForm({ ...entryForm, entryDate: event.target.value })} required /></label>
                  <label>Source type<select value={entryForm.sourceType} onChange={(event) => setEntryForm({ ...entryForm, sourceType: event.target.value })}>{SOURCE_TYPES.map((source) => <option key={source} value={source}>{source.replace('_', ' ')}</option>)}</select></label>
                  <label className="accounting-form-grid__wide">Description<input value={entryForm.description} maxLength={500} onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })} required /></label>
                </div>
                <div className="accounting-lines-heading"><strong>Entry lines</strong><span>Debit total {amount(debitTotal, currency, minorUnitDigits)} · Credit total {amount(creditTotal, currency, minorUnitDigits)}</span></div>
                <div className="accounting-lines">
                  {entryForm.lines.map((line, index) => <div className="accounting-line" key={index}>
                    <label>Account<select value={line.accountId} onChange={(event) => setLine(index, 'accountId', event.target.value)} required><option value="">Select account</option>{activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.code} · {account.name}</option>)}</select></label>
                    <label>Debit<input type="number" min="0" step={1 / minorUnitFactor} inputMode="decimal" value={line.debit} onChange={(event) => { setLine(index, 'debit', event.target.value); if (event.target.value) setLine(index, 'credit', '') }} /></label>
                    <label>Credit<input type="number" min="0" step={1 / minorUnitFactor} inputMode="decimal" value={line.credit} onChange={(event) => { setLine(index, 'credit', event.target.value); if (event.target.value) setLine(index, 'debit', '') }} /></label>
                    <label>Line description<input value={line.description} maxLength={300} onChange={(event) => setLine(index, 'description', event.target.value)} /></label>
                  </div>)}
                </div>
                <div className="accounting-form-actions"><button type="button" className="accounting-btn accounting-btn--secondary" onClick={addLine} disabled={entryForm.lines.length >= 30}>Add line</button><button type="button" className="accounting-btn accounting-btn--secondary" onClick={cancelEntryForm} disabled={saving}>Cancel</button><button type="submit" className="accounting-btn accounting-btn--primary" disabled={saving || debitTotal <= 0 || debitTotal !== creditTotal}>{saving ? 'Saving…' : editingEntryId ? 'Save changes' : 'Save draft'}</button></div>
              </form>}
              {entriesLoading ? <div className="accounting-loading" role="status">Loading journal entries…</div> : filteredEntries.length === 0 ? <EmptyState title="No journal entries" detail={statusFilter === 'all' ? 'No entries exist for this financial year yet.' : `No ${statusFilter} entries for this financial year.`} /> : (
                <div className="accounting-table-wrap"><table className="accounting-table">
                  <thead><tr><th scope="col">Reference & description</th><th scope="col">Date</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Amount</th><th scope="col">Action</th></tr></thead>
                  <tbody>{filteredEntries.map((entry) => {
                    const debit = (entry.lines || []).reduce((sum, line) => sum + Number(line.debitMinor || 0), 0)
                    const creatorId = typeof entry.createdBy === 'string' ? entry.createdBy : entry.createdBy?._id
                    const ownDraft = accountant && entry.status === 'draft' && creatorId === user.id
                    const canReview = user?.role === 'director' && entry.status === 'submitted'
                    return <tr key={entry._id}>
                      <td><strong>{entry.reference}</strong><span>{entry.description}</span>{entry.reviewComment && <span className="accounting-review-comment">Returned: {entry.reviewComment}</span>}</td>
                      <td>{asDate(entry.entryDate)}</td><td className="accounting-capitalize">{String(entry.sourceType || '').replace('_', ' ')}</td>
                      <td><StatusPill status={entry.status} /></td><td>{amount(debit, entry.currency || currency, minorUnitDigits)}</td>
                      <td>
                        {ownDraft && <div className="accounting-row-actions">
                          <button className="accounting-btn accounting-btn--small" type="button" disabled={busyId === entry._id} onClick={() => editDraft(entry)}>Edit</button>
                          <button className="accounting-btn accounting-btn--small" type="button" disabled={busyId === entry._id} onClick={() => submitEntry(entry)}>Submit</button>
                          <button className="accounting-btn accounting-btn--quiet" type="button" aria-label={`Delete draft ${entry.reference}`} disabled={busyId === entry._id} onClick={() => deleteDraft(entry)}><Trash2 size={14} aria-hidden="true" /></button>
                        </div>}
                        {canReview && <div className="accounting-row-actions">
                          <button className="accounting-btn accounting-btn--small" type="button" disabled={busyId === entry._id} onClick={() => reviewEntry(entry, 'approve')}><Check size={14} aria-hidden="true" />Post</button>
                          <button className="accounting-btn accounting-btn--quiet" type="button" aria-label={`Return ${entry.reference} for correction`} disabled={busyId === entry._id} onClick={() => reviewEntry(entry, 'return')}><Undo2 size={14} aria-hidden="true" />Return</button>
                        </div>}
                        {accountant && entry.status === 'posted' && <button className="accounting-btn accounting-btn--secondary" type="button" disabled={busyId === entry._id || selectedYearRecord?.status !== 'open'} onClick={() => reverseEntry(entry)}>Reverse</button>}
                        {!ownDraft && !canReview && '—'}
                      </td>
                    </tr>
                  })}</tbody>
                </table></div>
              )}
              {!entriesLoading && entryTotal > 0 && <div className="accounting-pagination">
                <span>Showing {(entryPage - 1) * 25 + 1}–{Math.min(entryPage * 25, entryTotal)} of {entryTotal}</span>
                <div>
                  <button className="accounting-btn accounting-btn--secondary" type="button" disabled={entryPage <= 1} onClick={() => setEntryPage((page) => Math.max(1, page - 1))}>Previous</button>
                  <button className="accounting-btn accounting-btn--secondary" type="button" disabled={entryPage * 25 >= entryTotal} onClick={() => setEntryPage((page) => page + 1)}>Next</button>
                </div>
              </div>}
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
              {years.length === 0 ? <EmptyState title="No financial years" detail="Create a January–December financial year to start a ledger period." /> : <div className="accounting-year-list">{years.map((year) => <article className="accounting-year-card" key={year.id}><div className="accounting-year-icon"><CalendarDays size={19} aria-hidden="true" /></div><div className="accounting-year-details"><strong>{year.name}</strong><span>{asDate(year.startDate)} – {asDate(year.endDate)}</span><small>{year.closedAt ? `Closed ${asDate(year.closedAt)}` : 'Calendar reporting period'}</small></div><StatusPill status={year.status} />{!accountant && <div className="accounting-year-actions">{year.status === 'open' ? <button className="accounting-btn accounting-btn--small" type="button" disabled={busyId === year.id} onClick={() => changeFinancialYearStatus(year, 'close')}>{busyId === year.id ? 'Closing…' : 'Close year'}</button> : <button className="accounting-btn accounting-btn--secondary" type="button" disabled={busyId === year.id} onClick={() => changeFinancialYearStatus(year, 'reopen')}>{busyId === year.id ? 'Reopening…' : 'Reopen'}</button>}</div>}</article>)}</div>}
            </section>
          )}

          {tab === 'Reports' && (
            <section className="accounting-section" aria-labelledby="accounting-reports-title">
              <div className="accounting-section-heading"><div><h2 id="accounting-reports-title">Reports</h2><p>Accrual-basis ledger summary using posted records only.</p></div><div className="accounting-toolbar"><YearSelect years={years} selectedYear={selectedYear} onChange={setSelectedYear} /><label className="accounting-month-select"><span className="sr-only">Report period</span><select value={reportMonth} onChange={(event) => setReportMonth(event.target.value)}><option value="">Full year</option>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></div></div>
              <p className="accounting-disclaimer">This is an accrual-basis ledger summary, not a complete statutory financial statement.</p>
              {reportLoading ? <div className="accounting-loading" role="status">Loading report…</div> : !report ? <EmptyState title="No report available" detail={years.length ? 'Report data could not be loaded for the selected period.' : 'Create a financial year before viewing a report.'} /> : (
                <>
                  <div className="accounting-report-meta">
                    <span>{report.period?.id || (reportMonth ? `${selectedYearRecord?.name}-${String(reportMonth).padStart(2, '0')}` : selectedYearRecord?.name)}</span>
                    <span>{asDate(report.period?.startDate)} – {asDate(report.period?.endDate)}</span>
                    <span>Basis: {report.basis === 'accrual_double_entry' ? 'Accrual double-entry' : 'Accrual'}</span>
                    <span>{Number(report.recordsIncluded || 0)} posted records included</span>
                  </div>
                  <div className="accounting-metrics accounting-metrics--reports">
                    <Metric icon={ArrowDownLeft} label="Income" value={amount(report.current?.incomeMinor, currency, minorUnitDigits)} />
                    <Metric icon={ArrowUpRight} label="Expenses" value={amount(report.current?.expensesMinor, currency, minorUnitDigits)} />
                    <Metric icon={Scale} label="Net surplus" value={amount(report.current?.netSurplusMinor, currency, minorUnitDigits)} />
                    <Metric icon={Wallet} label="Cash & bank closing" value={amount(report.current?.cashAndBankClosingMinor, currency, minorUnitDigits)} />
                  </div>
                  <div className="accounting-two-column">
                    <article className="accounting-panel"><div className="accounting-panel-heading"><div><h3>Period summary</h3><p>{reportMonth ? MONTHS[Number(reportMonth) - 1] : 'Full financial year'}</p></div></div><dl className="accounting-summary-list"><SummaryRow label="Opening cash & bank" value={amount(report.opening?.cashAndBankMinor, currency, minorUnitDigits)} /><SummaryRow label="Cash & bank movement" value={amount(report.current?.cashAndBankMovementMinor, currency, minorUnitDigits)} /><SummaryRow label="Cash & bank closing" value={amount(report.current?.cashAndBankClosingMinor, currency, minorUnitDigits)} /><SummaryRow label="Net surplus year to date" value={amount(report.yearToDate?.netSurplusMinor, currency, minorUnitDigits)} /></dl>
                      {report.current?.cashAndBankAccounts?.length > 0 && <div className="accounting-balances"><h3>Cash and bank by account</h3><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th scope="col">Account</th><th scope="col">Opening</th><th scope="col">Movement</th><th scope="col">Closing</th></tr></thead><tbody>{report.current.cashAndBankAccounts.map((item) => <tr key={item.accountId}><td>{item.code} · {item.name}</td><td>{amount(item.openingBalanceMinor, currency, minorUnitDigits)}</td><td>{amount(item.movementMinor, currency, minorUnitDigits)}</td><td>{amount(item.closingBalanceMinor, currency, minorUnitDigits)}</td></tr>)}</tbody></table></div></div>}
                    </article>
                    <article className="accounting-panel"><div className="accounting-panel-heading"><div><h3>Monthly trend</h3><p>Income and expenses across the selected year</p></div></div>{(report.monthlyTrend || []).length ? <div className="accounting-trend">{report.monthlyTrend.map((item) => <div key={item.month}><span>{MONTHS[Number(item.month) - 1] || item.month}</span><span>{amount(item.incomeMinor, currency, minorUnitDigits)} income</span><span>{amount(item.expensesMinor, currency, minorUnitDigits)} expenses</span></div>)}</div> : <p className="accounting-muted">Select Full year to view the monthly trend.</p>}</article>
                  </div>
                  {report.current?.accountBalances?.length > 0 && <div className="accounting-panel accounting-balances"><h3>Account movements during period</h3><div className="accounting-table-wrap"><table className="accounting-table"><thead><tr><th scope="col">Account</th><th scope="col">Period net movement</th></tr></thead><tbody>{report.current.accountBalances.map((item) => <tr key={item.accountId}><td>{item.code} · {item.name}</td><td>{amount(item.balanceMinor, currency, minorUnitDigits)}</td></tr>)}</tbody></table></div></div>}
                  {!reportMonth && report.comparison && <div className="accounting-panel"><h3>Year-over-year comparison</h3><p>Compared with {report.comparison.year.name}.</p><div className="accounting-comparison"><SummaryRow label="Prior-year income" value={amount(report.comparison.incomeMinor, currency, minorUnitDigits)} /><SummaryRow label="Current-year income change" value={formatChange(report.comparison.change?.income, currency, minorUnitDigits)} /><SummaryRow label="Prior-year expenses" value={amount(report.comparison.expensesMinor, currency, minorUnitDigits)} /><SummaryRow label="Current-year expense change" value={formatChange(report.comparison.change?.expenses, currency, minorUnitDigits)} /><SummaryRow label="Prior-year net surplus" value={amount(report.comparison.netSurplusMinor, currency, minorUnitDigits)} /><SummaryRow label="Current-year surplus change" value={formatChange(report.comparison.change?.netSurplus, currency, minorUnitDigits)} /></div></div>}
                  {!reportMonth && !report.comparison && <p className="accounting-disclaimer">No previous calendar year is configured for comparison.</p>}
                </>
              )}
            </section>
          )}

          {tab === 'Audit Log' && user?.role === 'director' && (
            <section className="accounting-section" aria-labelledby="accounting-audit-title">
              <div className="accounting-section-heading">
                <div><h2 id="accounting-audit-title">Financial audit log</h2><p>Recorded finance actions and their actors. Events are retained for traceability.</p></div>
              </div>
              {auditLoading ? <div className="accounting-loading" role="status">Loading audit events…</div> : auditEvents.length === 0 ? <EmptyState title="No audit events" detail="Financial actions will appear here as the ledger is used." /> : (
                <div className="accounting-table-wrap">
                  <table className="accounting-table">
                    <thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Record</th><th scope="col">Details</th></tr></thead>
                    <tbody>{auditEvents.map((event) => <tr key={event._id}>
                      <td>{asDate(event.createdAt)}</td>
                      <td>{event.actor?.name || 'Unknown user'}</td>
                      <td>{String(event.action || '').replaceAll('_', ' ')}</td>
                      <td>{event.resourceType} · {String(event.resourceId).slice(-8)}</td>
                      <td>{event.reason || JSON.stringify(event.details || {})}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
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
