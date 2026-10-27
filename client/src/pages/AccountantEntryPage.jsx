import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import './AccountantEntryPage.css'

function initialForm() {
  return {
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    counterparty: '',
    description: '',
    paymentMethod: 'bank_transfer',
    reference: '',
    supportingDocumentUrl: '',
    notes: '',
    accountId: '',
  }
}

function amountToMinor(value, digits) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > digits) return null
  const factor = 10n ** BigInt(digits)
  const minor = BigInt(whole) * factor + BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0')
  return minor > 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null
}

function generatedReference(type) {
  const token = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12).toUpperCase()
    || Math.random().toString(36).slice(2, 14).toUpperCase()
  return `${type === 'income' ? 'INC' : 'EXP'}-${token}`
}

function formatAmount(value, currency, digits) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'RWF',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) / (10 ** digits))
}

export function AccountantEntryPage({ type }) {
  const isIncome = type === 'income'
  const [years, setYears] = useState([])
  const [accounts, setAccounts] = useState([])
  const [yearId, setYearId] = useState('')
  const [currency, setCurrency] = useState('RWF')
  const [digits, setDigits] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const categoryAccounts = useMemo(
    () => accounts.filter((account) => account.type === (isIncome ? 'revenue' : 'expense') && account.active !== false),
    [accounts, isIncome],
  )

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [yearResult, accountResult] = await Promise.all([
          apiRequest('/api/finance/years', { signal: controller.signal }),
          apiRequest('/api/finance/accounts', { signal: controller.signal }),
        ])
        const availableYears = yearResult.years || []
        setYears(availableYears)
        const openYear = availableYears.find((year) => year.status === 'open')
        setYearId((current) => current && availableYears.some((year) => year.id === current)
          ? current
          : openYear?.id || '')
        setCurrency(accountResult.currency || 'RWF')
        setDigits(accountResult.minorUnitDigits ?? 0)
        let configuredAccounts = accountResult.accounts || []
        if (configuredAccounts.length === 0) {
          const setupResult = await apiRequest('/api/finance/accounts/standard-chart', {
            method: 'POST',
            timeoutMs: 15_000,
            signal: controller.signal,
          })
          configuredAccounts = setupResult.accounts || []
        }
        setAccounts(configuredAccounts)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  async function save(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!yearId) {
      setError('There is no open financial year for this transaction date.')
      return
    }

    const selectedYear = years.find((year) => year.id === yearId)
    if (!selectedYear || form.date < selectedYear.startDate || form.date > selectedYear.endDate) {
      setError('Choose a transaction date inside the selected financial year.')
      return
    }

    const minorAmount = amountToMinor(form.amount, digits)
    if (minorAmount === null) {
      setError(`Enter an amount greater than zero with no more than ${digits} decimal places.`)
      return
    }

    const categoryAccount = form.accountId
      ? categoryAccounts.find((account) => account._id === form.accountId)
      : categoryAccounts[0]
    if (!categoryAccount) {
      setError('The finance setup is missing an active cash/bank account or income/expense category. Contact the finance administrator.')
      return
    }

    const reference = form.reference.trim() || generatedReference(type)
    if (!form.reference.trim()) setForm((current) => ({ ...current, reference }))
    setSaving(true)
    try {
      await apiRequest('/api/finance/daily-transactions', {
        method: 'POST',
        timeoutMs: 15_000,
        body: {
          financialYearId: yearId,
          reference,
          entryDate: form.date,
          description: form.description.trim(),
          sourceType: type,
          currency,
          amountMinor: minorAmount,
          paymentMethod: form.paymentMethod,
          counterparty: form.counterparty.trim(),
          categoryAccountId: categoryAccount._id,
          supportingDocumentUrl: form.supportingDocumentUrl.trim(),
          notes: form.notes.trim(),
        },
      })
      setForm(initialForm())
      setSuccess(`Transaction ${reference} was saved and posted. Dashboard totals and reports now include it.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function initializeChart() {
    setSettingUp(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiRequest('/api/finance/accounts/standard-chart', {
        method: 'POST',
        timeoutMs: 15_000,
      })
      setAccounts(result.accounts || [])
      setCurrency(result.currency || 'RWF')
      setSuccess('Finance accounts are ready. You can now record income or expenses.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSettingUp(false)
    }
  }

  return (
    <main className="accountant-entry">
      <header className="accountant-entry__header">
        <div>
          <p className="accountant-entry__eyebrow">Daily finance</p>
          <h1>{isIncome ? 'Record income' : 'Record expense'}</h1>
          <p>{isIncome ? 'Record money received with a short, clear entry.' : 'Record money spent with a short, clear entry.'}</p>
        </div>
        <Link to="/accountant-dashboard">Back to dashboard</Link>
      </header>

      {error && <div className="accountant-entry__message accountant-entry__message--error" role="alert">{error}</div>}
      {success && <div className="accountant-entry__message accountant-entry__message--success" role="status"><CheckCircle2 size={18} />{success}</div>}
      {loading ? <div className="accountant-entry__loading" role="status">Loading finance setup…</div> : (
        <div className="accountant-entry__layout">
          <section className={`accountant-entry__form-panel${isIncome ? ' accountant-entry__form-panel--income' : ' accountant-entry__form-panel--expense'}`}>
            <div className="accountant-entry__form-heading">
              <span className="accountant-entry__icon">{isIncome ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}</span>
              <div><h2>{isIncome ? 'Money received' : 'Money spent'}</h2><p>All amounts are recorded in {currency}.</p></div>
            </div>
            {!years.some((year) => year.status === 'open') && <div className="accountant-entry__message accountant-entry__message--error" role="status">Create a financial year before recording transactions. <Link to="/accountant/setup">Set up financial year</Link></div>}
            {!accounts.length && (
              <div className="accountant-entry__setup" role="status">
                <div>
                  <strong>Finance accounts need initial setup</strong>
                  <span>The finance reset removed the internal accounts used to calculate and report transactions. Initialize the standard accounts once to continue.</span>
                </div>
                <button type="button" onClick={initializeChart} disabled={settingUp}>
                  {settingUp ? 'Setting up…' : 'Initialize finance accounts'}
                </button>
              </div>
            )}
            <form onSubmit={save}>
              <label>
                Transaction date
                <input type="date" value={form.date} min={years.find((year) => year.id === yearId)?.startDate} max={years.find((year) => year.id === yearId)?.endDate} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required />
              </label>
              <label>
                Amount ({currency})
                <input type="number" min="0" step={digits ? `0.${'0'.repeat(Math.max(0, digits - 1))}1` : '1'} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0" required />
              </label>
              <label>
                {isIncome ? 'Received from' : 'Paid to'}
                <input type="text" maxLength="120" value={form.counterparty} onChange={(event) => setForm((current) => ({ ...current, counterparty: event.target.value }))} placeholder={isIncome ? 'Donor or organization' : 'Supplier or recipient'} required />
              </label>
              <label>
                Description
                <input type="text" minLength="3" maxLength="500" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={isIncome ? 'What was the money received for?' : 'What was purchased or paid for?'} required />
              </label>
              <label>
                {isIncome ? 'Income category (optional)' : 'Expense category (optional)'}
                <select value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}>
                  <option value="">Default category</option>
                  {categoryAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
                </select>
              </label>
              <label>
                Payment method
                <select value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                  <option value="bank_transfer">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Reference / receipt number (optional)
                <input type="text" maxLength="40" pattern="[A-Za-z0-9_-]{2,40}" value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} placeholder="Generated if left blank" />
              </label>
              <label>
                Supporting document link (optional)
                <input type="url" maxLength="500" value={form.supportingDocumentUrl} onChange={(event) => setForm((current) => ({ ...current, supportingDocumentUrl: event.target.value }))} placeholder="https://…" />
              </label>
              <label className="accountant-entry__full">
                Notes (optional)
                <textarea rows="3" maxLength="500" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="accountant-entry__actions">
                <button type="submit" disabled={saving || !yearId || !accounts.length}>{saving ? 'Saving…' : isIncome ? 'Save income' : 'Save expense'}</button>
                <Link to="/accountant/transactions">View transaction history</Link>
              </div>
            </form>
          </section>

          <aside className="accountant-entry__aside">
            <p className="accountant-entry__eyebrow">What happens next</p>
            <h2>One entry, securely tracked</h2>
            <ol>
              <li>We validate the date, amount, currency, and required details.</li>
              <li>The server creates one balanced finance record in the existing ledger.</li>
              <li>Routine income and expense entries are posted immediately when saved.</li>
              <li>The dashboard, transaction history, and reports update from that posted entry.</li>
            </ol>
            <p>Financial year</p>
            <select value={yearId} onChange={(event) => setYearId(event.target.value)} aria-label="Financial year">
              {years.filter((year) => year.status === 'open').map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
              {!years.some((year) => year.status === 'open') && <option value="">No open year</option>}
            </select>
            <p>Expected amount</p>
            <strong>{form.amount && amountToMinor(form.amount, digits) !== null ? formatAmount(amountToMinor(form.amount, digits), currency, digits) : `0 ${currency}`}</strong>
          </aside>
        </div>
      )}
    </main>
  )
}
