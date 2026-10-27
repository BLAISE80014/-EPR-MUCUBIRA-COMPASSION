import { useEffect, useMemo, useState } from 'react'
import { Download, Printer, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import './AccountantTransactionsPage.css'

const PAGE_SIZE = 100

function displayDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function formatMoney(value, currency, digits) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'RWF',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0) / (10 ** digits))
}

function entryAmount(entry) {
  return (entry.lines || []).reduce((total, line) => total + Number(line.debitMinor || 0), 0)
}

function cashMovement(entry) {
  return (entry.lines || []).reduce((total, line) => {
    if (!line.account?.cashOrBank) return total
    return total + Number(line.debitMinor || 0) - Number(line.creditMinor || 0)
  }, 0)
}

function downloadCsv(entries, currency, digits) {
  const rows = [
    ['Date', 'Type', 'Received from / Paid to', 'Description', 'Category', 'Income', 'Expense', 'Balance after', 'Payment method', 'Recorded by', 'Reference', 'Status'],
    ...entries.map((entry) => {
      const value = entryAmount(entry) / (10 ** digits)
      const income = entry.sourceType === 'income'
      const category = [...new Set((entry.lines || []).map((line) => line.account?.name).filter(Boolean))].join('; ')
      return [
        String(entry.entryDate || '').slice(0, 10),
        entry.sourceType,
        entry.counterparty,
        entry.description,
        category,
        income ? value.toFixed(digits) : '',
        entry.sourceType === 'expense' ? value.toFixed(digits) : '',
        entry.balanceAfterMinor === null || entry.balanceAfterMinor === undefined
          ? ''
          : (entry.balanceAfterMinor / (10 ** digits)).toFixed(digits),
        entry.paymentMethod,
        entry.createdBy?.name || '',
        entry.reference,
        entry.status,
      ]
    }),
  ]
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `transactions-${currency || 'RWF'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function AccountantTransactionsPage() {
  const [years, setYears] = useState([])
  const [yearId, setYearId] = useState('')
  const [entries, setEntries] = useState([])
  const [currency, setCurrency] = useState('RWF')
  const [digits, setDigits] = useState(0)
  const [openingBalance, setOpeningBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadedYearId, setLoadedYearId] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const controller = new AbortController()
    async function loadYears() {
      setLoading(true)
      setError('')
      try {
        const [yearResult, accountResult] = await Promise.all([
          apiRequest('/api/finance/years', { signal: controller.signal }),
          apiRequest('/api/finance/accounts', { signal: controller.signal }),
        ])
        const available = yearResult.years || []
        setYears(available)
        const open = available.find((year) => year.status === 'open')
        setYearId((current) => current && available.some((year) => year.id === current) ? current : open?.id || available[0]?.id || '')
        setCurrency(accountResult.currency || 'RWF')
        setDigits(accountResult.minorUnitDigits ?? 0)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadYears()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!yearId) {
      return undefined
    }
    const controller = new AbortController()
    async function loadHistory() {
      try {
        const reportResult = await apiRequest(`/api/finance/reports?yearId=${encodeURIComponent(yearId)}`, { signal: controller.signal })
        setOpeningBalance(Number(reportResult.opening?.cashAndBankMinor || 0))
        const firstPage = await apiRequest(`/api/finance/journal-entries?yearId=${encodeURIComponent(yearId)}&page=1&limit=${PAGE_SIZE}`, { signal: controller.signal })
        const allEntries = [...(firstPage.entries || [])]
        const pages = Math.ceil(Number(firstPage.total || 0) / PAGE_SIZE)
        for (let currentPage = 2; currentPage <= pages; currentPage += 1) {
          const result = await apiRequest(`/api/finance/journal-entries?yearId=${encodeURIComponent(yearId)}&page=${currentPage}&limit=${PAGE_SIZE}`, { signal: controller.signal })
          allEntries.push(...(result.entries || []))
        }
        setEntries(allEntries)
        setLoadedYearId(yearId)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadHistory()
    return () => controller.abort()
  }, [yearId])

  const rowsWithBalances = useMemo(() => {
    const chronological = [...entries].sort((a, b) => (
      String(a.entryDate).localeCompare(String(b.entryDate))
      || String(a.createdAt).localeCompare(String(b.createdAt))
      || String(a._id).localeCompare(String(b._id))
    ))
    let balance = openingBalance
    const running = new Map()
    for (const entry of chronological) {
      if (entry.status !== 'posted') continue
      balance += cashMovement(entry)
      running.set(entry._id, balance)
    }
    return entries.map((entry) => ({
      ...entry,
      balanceAfterMinor: running.get(entry._id) ?? null,
    }))
  }, [entries, openingBalance])

  const categories = useMemo(() => [...new Set(rowsWithBalances
    .flatMap((entry) => (entry.lines || []).map((line) => line.account?.name).filter(Boolean)))].sort(), [rowsWithBalances])
  const filtered = useMemo(() => rowsWithBalances.filter((entry) => {
    const terms = `${entry.reference} ${entry.description} ${entry.counterparty} ${entry.createdBy?.name || ''}`.toLowerCase()
    const entryDate = String(entry.entryDate || '').slice(0, 10)
    const categoryNames = (entry.lines || []).map((line) => line.account?.name).filter(Boolean)
    return (!search.trim() || terms.includes(search.trim().toLowerCase()))
      && (typeFilter === 'all' || entry.sourceType === typeFilter)
      && (statusFilter === 'all' || entry.status === statusFilter)
      && (categoryFilter === 'all' || categoryNames.includes(categoryFilter))
      && (!from || entryDate >= from)
      && (!to || entryDate <= to)
  }), [categoryFilter, from, rowsWithBalances, search, statusFilter, to, typeFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const historyLoading = loading || Boolean(yearId && loadedYearId !== yearId && !error)
  const pageEntries = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <main className="accountant-history">
      <header className="accountant-history__header">
        <div>
          <p>Finance workspace</p>
          <h1>Transaction history</h1>
          <span>Review saved entries, posted amounts, and running available-money balance.</span>
        </div>
        <div className="accountant-history__actions">
          <button type="button" onClick={() => downloadCsv(filtered, currency, digits)} disabled={!filtered.length}><Download size={16} /> Export CSV</button>
          <button type="button" onClick={() => window.print()}><Printer size={16} /> Print</button>
        </div>
      </header>

      {error && <div className="accountant-history__error" role="alert">{error}</div>}

      <section className="accountant-history__panel">
        <div className="accountant-history__filters">
          <label>
            Financial year
            <select value={yearId} onChange={(event) => { setPage(1); setLoadedYearId(''); setError(''); setYearId(event.target.value) }}>
              {!years.length && <option value="">No financial year</option>}
              {years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
            </select>
          </label>
          <label className="accountant-history__search">
            Search
            <span><Search size={16} /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value) }} placeholder="Description, person, reference" /></span>
          </label>
          <label>Type
            <select value={typeFilter} onChange={(event) => { setPage(1); setTypeFilter(event.target.value) }}>
              <option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option>
            </select>
          </label>
          <label>Status
            <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value) }}>
              <option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="posted">Posted</option>
            </select>
          </label>
          <label>Category
            <select value={categoryFilter} onChange={(event) => { setPage(1); setCategoryFilter(event.target.value) }}>
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>From<input type="date" value={from} min={years.find((year) => year.id === yearId)?.startDate} max={years.find((year) => year.id === yearId)?.endDate} onChange={(event) => { setPage(1); setFrom(event.target.value) }} /></label>
          <label>To<input type="date" value={to} min={years.find((year) => year.id === yearId)?.startDate} max={years.find((year) => year.id === yearId)?.endDate} onChange={(event) => { setPage(1); setTo(event.target.value) }} /></label>
        </div>

        {historyLoading ? <div className="accountant-history__empty" role="status">Loading transactions…</div> : pageEntries.length ? (
          <div className="accountant-history__table-scroll">
            <table>
              <thead><tr>
                <th>Date</th><th>Type</th><th>Received from / Paid to</th><th>Description</th><th>Category</th>
                <th className="accountant-history__number">Income</th><th className="accountant-history__number">Expense</th>
                <th className="accountant-history__number">Balance after</th><th>Method</th><th>Recorded by</th><th>Reference</th><th>Status</th>
              </tr></thead>
              <tbody>{pageEntries.map((entry) => {
                const income = entry.sourceType === 'income'
                const expense = entry.sourceType === 'expense'
                const value = entryAmount(entry)
                const categoriesForEntry = [...new Set((entry.lines || []).map((line) => line.account?.name).filter(Boolean))].join(', ')
                return <tr key={entry._id}>
                  <td>{displayDate(entry.entryDate)}</td>
                  <td><span className={`accountant-history__type accountant-history__type--${entry.sourceType}`}>{entry.sourceType?.replaceAll('_', ' ')}</span></td>
                  <td>{entry.counterparty || '—'}</td>
                  <td>{entry.description}</td>
                  <td>{categoriesForEntry || '—'}</td>
                  <td className="accountant-history__number">{income ? formatMoney(value, currency, digits) : '—'}</td>
                  <td className="accountant-history__number">{expense ? formatMoney(value, currency, digits) : '—'}</td>
                  <td className="accountant-history__number">{entry.balanceAfterMinor === null ? '—' : formatMoney(entry.balanceAfterMinor, currency, digits)}</td>
                  <td>{String(entry.paymentMethod || '—').replaceAll('_', ' ')}</td>
                  <td>{entry.createdBy?.name || '—'}</td>
                  <td>{entry.reference}</td>
                  <td><span className={`accountant-history__status accountant-history__status--${entry.status}`}>{entry.status}</span></td>
                </tr>
              })}</tbody>
            </table>
          </div>
        ) : <div className="accountant-history__empty">{entries.length ? 'No transactions match these filters.' : 'No transactions have been recorded for this financial year.'}</div>}

        <footer className="accountant-history__pagination">
          <span>{filtered.length} transaction{filtered.length === 1 ? '' : 's'} · Page {currentPage} of {pageCount}</span>
          <div>
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1 || historyLoading}>Previous</button>
            <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount || historyLoading}>Next</button>
          </div>
        </footer>
      </section>

      <p className="accountant-history__note">Running balances are calculated from the selected year’s opening cash/bank position and posted cash/bank movements. Draft and submitted entries are preserved in history but do not change balances until posted.</p>
      <div className="accountant-history__quick-links">
        <Link to="/accountant/income">Record income</Link><Link to="/accountant/expense">Record expense</Link><Link to="/accounting/reports">Financial reports</Link>
      </div>
    </main>
  )
}
