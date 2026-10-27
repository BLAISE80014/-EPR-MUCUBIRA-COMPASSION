import { useCallback, useEffect, useState } from 'react'
import { CirclePlus, Download, Eye, Pencil, RefreshCw, Trash2, Wrench, X } from 'lucide-react'
import { apiRequest } from '../lib/api'
import './AccountantOperationsPage.css'

const MANAGEMENT_TABS = ['Assets', 'Projects & Budgets', 'Employee Performance']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDate(value) {
  return value ? String(value).slice(0, 10) : ''
}

function money(minor, digits) {
  const numeric = Number(minor || 0) / (10 ** digits)
  return `RWF ${numeric.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function majorToMinor(value, digits) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d*)?$/.test(value)) return NaN
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > digits) return NaN
  const factor = 10n ** BigInt(digits)
  const minor = BigInt(whole) * factor
    + BigInt((fraction + '0'.repeat(digits)).slice(0, digits) || '0')
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : NaN
}

function minorToMajor(value, digits) {
  return value === undefined || value === null ? '' : (Number(value) / (10 ** digits)).toFixed(digits)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const emptyAsset = () => ({
  assetCode: '', name: '', description: '', condition: '', category: '',
  acquisitionValue: '', acquisitionDate: today(), endOfUseDate: '', source: 'purchase',
  depreciationMethod: 'none', usefulLifeMonths: '1', salvageValue: '',
  donorOrSupplier: '', location: '', photoUrl: '', supportingDocumentUrl: '',
  department: '', responsibleEmployee: '', status: 'active', statusNote: '', notes: '',
})

const emptyProject = () => ({
  projectCode: '', title: '', description: '', expectedResults: '',
  responsibleEmployee: '', responsibleTeam: '', startDate: today(),
  deadline: today(), timeframe: '', estimatedBudget: '', approvedBudget: '',
  fundingSource: '', category: '', priority: 'normal', status: 'planned', notes: '',
})

const emptyPerformance = () => ({
  employee: '', title: '', year: String(new Date().getUTCFullYear()),
  month: String(new Date().getUTCMonth() + 1), target: '', actual: '',
  salesCount: '0', salesValue: '', workCompleted: '', notes: '',
})

function currentPerformancePeriod() {
  const now = new Date()
  return {
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1),
  }
}

function downloadCsv(filename, rows) {
  const body = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function AccountantOperationsPage() {
  const [tab, setTab] = useState('Assets')
  const [assets, setAssets] = useState([])
  const [projects, setProjects] = useState([])
  const [performance, setPerformance] = useState([])
  const [employees, setEmployees] = useState([])
  const [minorUnitDigits, setMinorUnitDigits] = useState(0)
  const [assetTotals, setAssetTotals] = useState(null)
  const [projectTotals, setProjectTotals] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [assetForm, setAssetForm] = useState(null)
  const [maintenanceForm, setMaintenanceForm] = useState(null)
  const [projectForm, setProjectForm] = useState(null)
  const [performanceForm, setPerformanceForm] = useState(null)
  const [performancePeriod, setPerformancePeriod] = useState(currentPerformancePeriod)
  const [viewedRecord, setViewedRecord] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [assetResult, projectResult, performanceResult, employeeResult, accountResult] = await Promise.all([
        apiRequest('/api/finance/management/assets'),
        apiRequest('/api/finance/management/projects'),
        apiRequest(`/api/finance/management/performance?year=${performancePeriod.year}&month=${performancePeriod.month}`),
        apiRequest('/api/finance/employees'),
        apiRequest('/api/finance/accounts'),
      ])
      setAssets(assetResult.assets || [])
      setAssetTotals(assetResult.totals)
      setProjects(projectResult.projects || [])
      setProjectTotals(projectResult.totals)
      setPerformance(performanceResult.records || [])
      setEmployees(employeeResult.employees || [])
      setMinorUnitDigits(accountResult.minorUnitDigits ?? 0)
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [performancePeriod])

  useEffect(() => { loadData() }, [loadData])

  async function saveAsset(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const body = {
      ...assetForm,
      acquisitionValueMinor: majorToMinor(assetForm.acquisitionValue, minorUnitDigits),
      usefulLifeMonths: Number(assetForm.usefulLifeMonths),
      salvageValueMinor: majorToMinor(assetForm.salvageValue || '0', minorUnitDigits),
      responsibleEmployee: assetForm.responsibleEmployee || null,
    }
    delete body.acquisitionValue
    delete body.salvageValue
    try {
      await apiRequest(assetForm._id
        ? `/api/finance/management/assets/${assetForm._id}`
        : '/api/finance/management/assets', {
        method: assetForm._id ? 'PATCH' : 'POST',
        timeoutMs: 15_000,
        body,
      })
      setAssetForm(null)
      setNotice(assetForm._id ? 'Asset updated.' : 'Asset registered.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveProject(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const body = {
      ...projectForm,
      estimatedBudgetMinor: majorToMinor(projectForm.estimatedBudget || '0', minorUnitDigits),
      approvedBudgetMinor: majorToMinor(projectForm.approvedBudget || '0', minorUnitDigits),
      responsibleEmployee: projectForm.responsibleEmployee || null,
    }
    delete body.estimatedBudget
    delete body.approvedBudget
    try {
      await apiRequest(projectForm._id
        ? `/api/finance/management/projects/${projectForm._id}`
        : '/api/finance/management/projects', {
        method: projectForm._id ? 'PATCH' : 'POST',
        timeoutMs: 15_000,
        body,
      })
      setProjectForm(null)
      setNotice(projectForm._id ? 'Project updated.' : 'Project budget created.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveMaintenance(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const body = {
      date: maintenanceForm.date,
      description: maintenanceForm.description,
      costMinor: majorToMinor(maintenanceForm.cost, minorUnitDigits),
      notes: maintenanceForm.notes,
    }
    try {
      await apiRequest(`/api/finance/management/assets/${maintenanceForm.assetId}/maintenance`, {
        method: 'POST',
        timeoutMs: 15_000,
        body,
      })
      setMaintenanceForm(null)
      setNotice('Maintenance record saved to the asset history.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function savePerformance(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const { employee, year, month, title, target, actual, salesCount, salesValue, ...details } = performanceForm
    try {
      await apiRequest(`/api/finance/management/performance/${employee}/${year}/${month}`, {
        method: 'PUT',
        timeoutMs: 15_000,
        body: {
          ...details,
          title: title.trim(),
          target: Number(target),
          actual: Number(actual),
          salesCount: Number(salesCount),
          salesValueMinor: majorToMinor(salesValue || '0', minorUnitDigits),
        },
      })
      setPerformanceForm(null)
      setNotice('Monthly performance saved.')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  function editAsset(asset) {
    setAssetForm({
      ...asset,
      _id: asset._id,
      acquisitionValue: minorToMajor(asset.acquisitionValueMinor, minorUnitDigits),
      acquisitionDate: toDate(asset.acquisitionDate),
      endOfUseDate: toDate(asset.endOfUseDate),
      salvageValue: minorToMajor(asset.salvageValueMinor, minorUnitDigits),
      usefulLifeMonths: String(asset.usefulLifeMonths || 1),
      responsibleEmployee: asset.responsibleEmployee?._id || '',
      statusNote: '',
    })
  }

  function editProject(project) {
    setProjectForm({
      ...project,
      startDate: toDate(project.startDate),
      deadline: toDate(project.deadline),
      timeframe: project.timeframe || '',
      estimatedBudget: minorToMajor(project.estimatedBudgetMinor, minorUnitDigits),
      approvedBudget: minorToMajor(project.approvedBudgetMinor, minorUnitDigits),
      responsibleEmployee: project.responsibleEmployee?._id || '',
    })
  }

  function editPerformance(record) {
    setPerformanceForm({
      _id: record._id,
      employee: record.employee?._id || '',
      title: record.title || '',
      year: String(record.year),
      month: String(record.month),
      target: String(record.target),
      actual: String(record.actual),
      salesCount: String(record.salesCount || 0),
      salesValue: minorToMajor(record.salesValueMinor, minorUnitDigits),
      workCompleted: record.workCompleted || '',
      notes: record.notes || '',
    })
  }

  async function deleteRecord(type, record) {
    const labels = {
      asset: `asset "${record.name}"`,
      project: `budget "${record.title}"`,
      performance: `performance record for "${record.employee?.name || 'Unknown employee'}"`,
    }
    if (!window.confirm(`Delete this ${labels[type]}? This action cannot be undone.`)) return
    setError('')
    setNotice('')
    try {
      const path = type === 'asset'
        ? `/api/finance/management/assets/${record._id}`
        : type === 'project'
          ? `/api/finance/management/projects/${record._id}`
          : `/api/finance/management/performance/${record._id}`
      await apiRequest(path, { method: 'DELETE', timeoutMs: 15_000 })
      setViewedRecord(null)
      setNotice(`${type === 'asset' ? 'Asset' : type === 'project' ? 'Budget' : 'Performance record'} deleted.`)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function recordDetails(type, record) {
    if (type === 'asset') return [
      ['Asset code', record.assetCode],
      ['Name', record.name],
      ['Where from', record.donorOrSupplier || record.source],
      ['Acquired', toDate(record.acquisitionDate)],
      ['Expected end of use', toDate(record.endOfUseDate) || 'Not specified'],
      ['Location', record.location || '—'],
      ['Category', record.category || '—'],
      ['Status', record.status],
      ['Acquisition value', money(record.acquisitionValueMinor, minorUnitDigits)],
      ['Description', record.description || '—'],
      ['Notes', record.notes || '—'],
    ]
    if (type === 'project') return [
      ['Project / budget', record.title],
      ['Code', record.projectCode],
      ['What to do', record.description || '—'],
      ['Date from', toDate(record.startDate)],
      ['Date end', toDate(record.deadline)],
      ['Time period', record.timeframe || '—'],
      ['Status', record.status.replaceAll('_', ' ')],
      ['Approved budget', money(record.approvedBudgetMinor, minorUnitDigits)],
      ['Spent', money(record.actualExpenditureMinor, minorUnitDigits)],
      ['Remaining', money(record.remainingBudgetMinor, minorUnitDigits)],
      ['Responsible', record.responsibleEmployee?.name || record.responsibleTeam || 'Unassigned'],
    ]
    return [
      ['Employee', record.employee?.name || 'Unknown'],
      ['Title', record.title || '—'],
      ['Department', record.employee?.department || '—'],
      ['Period', `${MONTH_NAMES[record.month - 1]} ${record.year}`],
      ['Target', record.target],
      ['Actual', record.actual],
      ['Achievement', record.achievementPercent === null ? 'No target set' : `${record.achievementPercent}%`],
      ['Sales count', record.salesCount || 0],
      ['Sales value', money(record.salesValueMinor, minorUnitDigits)],
      ['Work completed', record.workCompleted || '—'],
      ['Notes', record.notes || '—'],
    ]
  }

  return (
    <main className="accountant-operations">
      <header className="accountant-operations__header">
        <div>
          <p>Finance workspace</p>
          <h1>Assets, budgets &amp; people</h1>
          <span>Manage asset records, project budgets and monthly employee performance.</span>
        </div>
        <button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={loadData} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>

      {error && <p className="accountant-operations__error" role="alert">{error}</p>}
      {notice && <p className="accountant-operations__notice" role="status">{notice}</p>}

      <nav className="accountant-operations__tabs" aria-label="Accountant management sections">
        {MANAGEMENT_TABS.map((item) => (
          <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => { setTab(item); setError(''); setNotice('') }}>
            {item}
          </button>
        ))}
      </nav>

      {loading ? <div className="accountant-operations__loading" role="status">Loading saved records…</div> : (
        <>
          {tab === 'Assets' && (
            <section className="accountant-operations__section">
              <div className="accountant-operations__summary">
                <article><span>Registered assets</span><strong>{assetTotals?.count || 0}</strong></article>
                <article><span>Acquisition value</span><strong>{money(assetTotals?.acquisitionValueMinor, minorUnitDigits)}</strong></article>
                <article><span>Book value after depreciation</span><strong>{money(assetTotals?.bookValueMinor, minorUnitDigits)}</strong></article>
              </div>
              <div className="accountant-operations__section-heading">
                <div><h2>Asset register</h2><p>Asset values are recorded separately from operating expense journals.</p></div>
                <div className="accountant-operations__toolbar">
                  <button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => downloadCsv('asset-register.csv', [
                    ['Asset code', 'Name', 'Category', 'Status', 'Source', 'Location', 'Acquisition date', 'End of use', 'Acquisition value', 'Book value'],
                    ...assets.map((asset) => [asset.assetCode, asset.name, asset.category, asset.status, asset.source, asset.location, toDate(asset.acquisitionDate), toDate(asset.endOfUseDate), Number(asset.acquisitionValueMinor || 0) / (10 ** minorUnitDigits), Number(asset.bookValueMinor || 0) / (10 ** minorUnitDigits)]),
                  ])}><Download size={15} aria-hidden="true" /> Export CSV</button>
                  <button type="button" className="accountant-operations__button" onClick={() => setAssetForm(emptyAsset())}><CirclePlus size={16} aria-hidden="true" /> Add asset</button>
                </div>
              </div>
              {assetForm && <form className="accountant-operations__form" onSubmit={saveAsset}>
                <h3>{assetForm._id ? 'Edit asset' : 'Register an asset'}</h3>
                <div className="accountant-operations__grid">
                  <label>Asset code<input value={assetForm.assetCode} onChange={(event) => setAssetForm({ ...assetForm, assetCode: event.target.value })} required /></label>
                  <label>Asset name<input value={assetForm.name} onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })} required /></label>
                  <label>Category<input value={assetForm.category} onChange={(event) => setAssetForm({ ...assetForm, category: event.target.value })} /></label>
                  <label>Acquisition value (RWF)<input type="number" min="0" step={10 ** -minorUnitDigits} value={assetForm.acquisitionValue} onChange={(event) => setAssetForm({ ...assetForm, acquisitionValue: event.target.value })} required /></label>
                  <label>Date received / acquired<input type="date" value={assetForm.acquisitionDate} onChange={(event) => setAssetForm({ ...assetForm, acquisitionDate: event.target.value })} required /></label>
                  <label>Expected last day in use<input type="date" value={assetForm.endOfUseDate} min={assetForm.acquisitionDate} onChange={(event) => setAssetForm({ ...assetForm, endOfUseDate: event.target.value })} /></label>
                  <label>Source<select value={assetForm.source} onChange={(event) => setAssetForm({ ...assetForm, source: event.target.value })}><option value="purchase">Organizational purchase</option><option value="donor">Donor</option><option value="donation">Donation</option><option value="grant">Grant</option><option value="other">Other</option></select></label>
                  <label>Where from (donor or supplier)<input value={assetForm.donorOrSupplier} onChange={(event) => setAssetForm({ ...assetForm, donorOrSupplier: event.target.value })} /></label>
                  <label>Location<input value={assetForm.location} onChange={(event) => setAssetForm({ ...assetForm, location: event.target.value })} /></label>
                  <label>Department<input value={assetForm.department} onChange={(event) => setAssetForm({ ...assetForm, department: event.target.value })} /></label>
                  <label>Responsible employee<select value={assetForm.responsibleEmployee} onChange={(event) => setAssetForm({ ...assetForm, responsibleEmployee: event.target.value })}><option value="">Unassigned</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>
                  <label>Status<select value={assetForm.status} onChange={(event) => setAssetForm({ ...assetForm, status: event.target.value })}><option value="active">Active / in use</option><option value="inactive">Inactive</option><option value="maintenance">Under maintenance</option><option value="disposed">Disposed / sold</option></select></label>
                  {assetForm._id && <label>Status change note<input value={assetForm.statusNote} onChange={(event) => setAssetForm({ ...assetForm, statusNote: event.target.value })} maxLength="500" /></label>}
                  <label>Condition<input value={assetForm.condition} onChange={(event) => setAssetForm({ ...assetForm, condition: event.target.value })} /></label>
                  <label>Depreciation<select value={assetForm.depreciationMethod} onChange={(event) => setAssetForm({ ...assetForm, depreciationMethod: event.target.value })}><option value="none">Not depreciated</option><option value="straight_line">Straight-line</option></select></label>
                  {assetForm.depreciationMethod === 'straight_line' && <>
                    <label>Useful life (months)<input type="number" min="1" value={assetForm.usefulLifeMonths} onChange={(event) => setAssetForm({ ...assetForm, usefulLifeMonths: event.target.value })} /></label>
                    <label>Salvage value (RWF)<input type="number" min="0" step={10 ** -minorUnitDigits} value={assetForm.salvageValue} onChange={(event) => setAssetForm({ ...assetForm, salvageValue: event.target.value })} /></label>
                  </>}
                  <label>Image URL (optional)<input type="url" placeholder="https://…" value={assetForm.photoUrl} onChange={(event) => setAssetForm({ ...assetForm, photoUrl: event.target.value })} /></label>
                  <label>Supporting document URL<input type="url" placeholder="https://…" value={assetForm.supportingDocumentUrl} onChange={(event) => setAssetForm({ ...assetForm, supportingDocumentUrl: event.target.value })} /></label>
                  <label className="accountant-operations__wide">Description<input value={assetForm.description} onChange={(event) => setAssetForm({ ...assetForm, description: event.target.value })} /></label>
                  <label className="accountant-operations__wide">Notes<input value={assetForm.notes} onChange={(event) => setAssetForm({ ...assetForm, notes: event.target.value })} /></label>
                </div>
                {assetForm.photoUrl && <img className="accountant-operations__asset-preview" src={assetForm.photoUrl} alt={`Preview of ${assetForm.name || 'asset'}`} />}
                <div className="accountant-operations__form-actions"><button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => setAssetForm(null)}>Cancel</button><button className="accountant-operations__button" disabled={saving}>{saving ? 'Saving…' : 'Save asset'}</button></div>
              </form>}
              {maintenanceForm && <form className="accountant-operations__form" onSubmit={saveMaintenance}>
                <h3>Record maintenance · {maintenanceForm.assetName}</h3>
                <div className="accountant-operations__grid">
                  <label>Date<input type="date" value={maintenanceForm.date} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, date: event.target.value })} required /></label>
                  <label>Cost (RWF)<input type="number" min="0" step={10 ** -minorUnitDigits} value={maintenanceForm.cost} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, cost: event.target.value })} required /></label>
                  <label>Description<input value={maintenanceForm.description} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })} minLength="3" maxLength="500" required /></label>
                  <label className="accountant-operations__wide">Notes<input value={maintenanceForm.notes} onChange={(event) => setMaintenanceForm({ ...maintenanceForm, notes: event.target.value })} maxLength="500" /></label>
                </div>
                <p className="accountant-operations__hint">This adds an auditable record to the asset. It does not create an expense journal or affect financial reports.</p>
                <div className="accountant-operations__form-actions"><button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => setMaintenanceForm(null)}>Cancel</button><button className="accountant-operations__button" disabled={saving}>{saving ? 'Saving…' : 'Save maintenance record'}</button></div>
              </form>}
              {assets.length ? <div className="accountant-operations__table-wrap"><table><thead><tr><th>Asset</th><th>Status</th><th>Source / location</th><th>Acquired / end of use</th><th>Cost</th><th>Book value</th><th>Actions</th></tr></thead><tbody>
                {assets.map((asset) => <tr key={asset._id}>
                  <td><div className="accountant-operations__asset-cell">{asset.photoUrl && <img src={asset.photoUrl} alt="" />}<span><strong>{asset.assetCode} · {asset.name}</strong><small>{asset.category || asset.condition || '—'}</small></span></div>
                    <details className="accountant-operations__history"><summary>Asset history ({(asset.statusHistory || []).length + (asset.maintenanceHistory || []).length})</summary>
                      <ul>{(asset.statusHistory || []).map((item, index) => <li key={`status-${index}`}>{toDate(item.changedAt)} · Status: {item.from} → {item.to}{item.note ? ` — ${item.note}` : ''}</li>)}
                        {(asset.maintenanceHistory || []).map((item) => <li key={item._id}>{toDate(item.date)} · Maintenance: {item.description} ({money(item.costMinor, minorUnitDigits)}){item.notes ? ` — ${item.notes}` : ''}</li>)}</ul>
                    </details>
                  </td>
                  <td><span className={`accountant-operations__badge accountant-operations__badge--${asset.status}`}>{asset.status.replaceAll('_', ' ')}</span></td>
                  <td>{asset.donorOrSupplier || asset.source}<small>{asset.location}</small></td>
                  <td>{toDate(asset.acquisitionDate)}<small>End: {toDate(asset.endOfUseDate) || 'Not set'}</small></td>
                  <td>{money(asset.acquisitionValueMinor, minorUnitDigits)}</td>
                  <td>{money(asset.bookValueMinor, minorUnitDigits)}</td>
                  <td><div className="accountant-operations__actions">
                    <button type="button" className="accountant-operations__icon-button" onClick={() => setViewedRecord({ type: 'asset', record: asset })} aria-label={`View ${asset.name}`}><Eye size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => editAsset(asset)} aria-label={`Edit ${asset.name}`}><Pencil size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => deleteRecord('asset', asset)} aria-label={`Delete ${asset.name}`}><Trash2 size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => setMaintenanceForm({ assetId: asset._id, assetName: asset.name, date: today(), cost: '', description: '', notes: '' })} aria-label={`Record maintenance for ${asset.name}`}><Wrench size={15} /></button>
                  </div></td>
                </tr>)}
              </tbody></table></div> : <div className="accountant-operations__empty">No assets registered yet. Add actual organizational assets to start the register.</div>}
            </section>
          )}

          {tab === 'Projects & Budgets' && (
            <section className="accountant-operations__section">
              <div className="accountant-operations__summary">
                <article><span>Projects</span><strong>{projectTotals?.count || 0}</strong></article>
                <article><span>Approved budgets</span><strong>{money(projectTotals?.approvedBudgetMinor, minorUnitDigits)}</strong></article>
                <article><span>Posted expenditure</span><strong>{money(projectTotals?.actualExpenditureMinor, minorUnitDigits)}</strong></article>
                <article><span>Over budget / overdue</span><strong>{projectTotals?.overBudgetCount || 0} / {projectTotals?.overdueCount || 0}</strong></article>
              </div>
              <div className="accountant-operations__section-heading">
                <div><h2>Tasks and project budgets</h2><p>Actual costs are calculated from posted expense journal lines matching the project code.</p></div>
                <div className="accountant-operations__toolbar">
                  <button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => downloadCsv('project-budgets.csv', [
                    ['Project code', 'Title', 'Description', 'Status', 'Time period', 'Start date', 'Deadline', 'Approved budget', 'Posted expenditure', 'Remaining budget', 'Over budget', 'Overdue'],
                    ...projects.map((project) => [project.projectCode, project.title, project.description, project.status, project.timeframe, toDate(project.startDate), toDate(project.deadline), Number(project.approvedBudgetMinor || 0) / (10 ** minorUnitDigits), Number(project.actualExpenditureMinor || 0) / (10 ** minorUnitDigits), Number(project.remainingBudgetMinor || 0) / (10 ** minorUnitDigits), project.overBudget, project.overdue]),
                  ])}><Download size={15} aria-hidden="true" /> Export CSV</button>
                  <button type="button" className="accountant-operations__button" onClick={() => setProjectForm(emptyProject())}><CirclePlus size={16} aria-hidden="true" /> Add project</button>
                </div>
              </div>
              {projectForm && <form className="accountant-operations__form" onSubmit={saveProject}>
                <h3>{projectForm._id ? 'Edit project' : 'Create a project budget'}</h3>
                <div className="accountant-operations__grid">
                  <label>Project code<input value={projectForm.projectCode} onChange={(event) => setProjectForm({ ...projectForm, projectCode: event.target.value })} required /></label>
                  <label>Title<input value={projectForm.title} onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })} required /></label>
                  <label>Category<input value={projectForm.category} onChange={(event) => setProjectForm({ ...projectForm, category: event.target.value })} /></label>
                  <label>Start date<input type="date" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} required /></label>
                  <label>End date<input type="date" min={projectForm.startDate} value={projectForm.deadline} onChange={(event) => setProjectForm({ ...projectForm, deadline: event.target.value })} required /></label>
                  <label>Time period<input value={projectForm.timeframe} onChange={(event) => setProjectForm({ ...projectForm, timeframe: event.target.value })} maxLength="80" placeholder="e.g. 3 months, Q1 2027" /></label>
                  <label>Estimated budget (RWF)<input type="number" min="0" step={10 ** -minorUnitDigits} value={projectForm.estimatedBudget} onChange={(event) => setProjectForm({ ...projectForm, estimatedBudget: event.target.value })} /></label>
                  <label>Approved budget (RWF)<input type="number" min="0" step={10 ** -minorUnitDigits} value={projectForm.approvedBudget} onChange={(event) => setProjectForm({ ...projectForm, approvedBudget: event.target.value })} /></label>
                  <label>Funding source<input value={projectForm.fundingSource} onChange={(event) => setProjectForm({ ...projectForm, fundingSource: event.target.value })} /></label>
                  <label>Responsible employee<select value={projectForm.responsibleEmployee} onChange={(event) => setProjectForm({ ...projectForm, responsibleEmployee: event.target.value })}><option value="">Unassigned</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>
                  <label>Responsible team<input value={projectForm.responsibleTeam} onChange={(event) => setProjectForm({ ...projectForm, responsibleTeam: event.target.value })} /></label>
                  <label>Priority<select value={projectForm.priority} onChange={(event) => setProjectForm({ ...projectForm, priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                  <label>Finished or current status<select value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value })}><option value="planned">Not started</option><option value="in_progress">In progress</option><option value="completed">Finished</option><option value="on_hold">On hold</option><option value="cancelled">Cancelled</option></select></label>
                  <label className="accountant-operations__wide">What do you want to do?<textarea rows="3" value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} maxLength="1500" required /></label>
                  <label className="accountant-operations__wide">Expected results<input value={projectForm.expectedResults} onChange={(event) => setProjectForm({ ...projectForm, expectedResults: event.target.value })} /></label>
                  <label className="accountant-operations__wide">Notes<input value={projectForm.notes} onChange={(event) => setProjectForm({ ...projectForm, notes: event.target.value })} /></label>
                </div>
                <p className="accountant-operations__hint">To link an expense, enter this exact project code in its journal draft’s “Project or task reference” field and have the Director post it.</p>
                <div className="accountant-operations__form-actions"><button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => setProjectForm(null)}>Cancel</button><button className="accountant-operations__button" disabled={saving}>{saving ? 'Saving…' : 'Save project'}</button></div>
              </form>}
              {projects.length ? <div className="accountant-operations__table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Deadline</th><th>Approved</th><th>Spent</th><th>Remaining</th><th>Used</th><th>Action</th></tr></thead><tbody>
                {projects.map((project) => <tr key={project._id}>
                  <td><strong>{project.projectCode} · {project.title}</strong><small>{project.description || 'No activity description'} · {project.responsibleEmployee?.name || project.responsibleTeam || 'Unassigned'}</small></td>
                  <td><span className={`accountant-operations__badge accountant-operations__badge--${project.overBudget ? 'overdue' : project.status}`}>{project.overBudget ? 'Over budget' : project.status.replaceAll('_', ' ')}</span></td>
                  <td>{toDate(project.deadline)}{project.overdue && <small className="accountant-operations__danger">Past deadline</small>}</td>
                  <td>{money(project.approvedBudgetMinor, minorUnitDigits)}</td><td>{money(project.actualExpenditureMinor, minorUnitDigits)}</td><td>{money(project.remainingBudgetMinor, minorUnitDigits)}</td><td>{project.utilizationPercent === null ? '—' : `${project.utilizationPercent}%`}</td>
                  <td><div className="accountant-operations__actions">
                    <button type="button" className="accountant-operations__icon-button" onClick={() => setViewedRecord({ type: 'project', record: project })} aria-label={`View ${project.title}`}><Eye size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => editProject(project)} aria-label={`Edit ${project.title}`}><Pencil size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => deleteRecord('project', project)} aria-label={`Delete ${project.title}`}><Trash2 size={15} /></button>
                  </div></td>
                </tr>)}
              </tbody></table></div> : <div className="accountant-operations__empty">No projects yet. Project expenditure will only appear after linked expense entries are posted.</div>}
            </section>
          )}

          {tab === 'Employee Performance' && (
            <section className="accountant-operations__section">
              <div className="accountant-operations__section-heading">
                <div><h2>Monthly employee performance</h2><p>Set targets by each employee’s responsibilities; sales are optional.</p></div>
                <div className="accountant-operations__toolbar">
                  <label>Year<input type="number" min="2000" max="2200" value={performancePeriod.year} onChange={(event) => setPerformancePeriod({ ...performancePeriod, year: event.target.value })} /></label>
                  <label>Month<select value={performancePeriod.month} onChange={(event) => setPerformancePeriod({ ...performancePeriod, month: event.target.value })}>{MONTH_NAMES.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
                  <button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => downloadCsv('employee-performance.csv', [
                    ['Employee', 'Title', 'Department', 'Year', 'Month', 'Target', 'Actual', 'Achievement percent', 'Sales count', 'Sales value', 'Work completed', 'Notes'],
                    ...performance.map((record) => [record.employee?.name, record.title, record.employee?.department, record.year, record.month, record.target, record.actual, record.achievementPercent, record.salesCount, Number(record.salesValueMinor || 0) / (10 ** minorUnitDigits), record.workCompleted, record.notes]),
                  ])}><Download size={15} aria-hidden="true" /> Export CSV</button>
                  <button type="button" className="accountant-operations__button" onClick={() => setPerformanceForm(emptyPerformance())}><CirclePlus size={16} aria-hidden="true" /> Record review</button>
                </div>
              </div>
              {performanceForm && <form className="accountant-operations__form" onSubmit={savePerformance}>
                <h3>{performanceForm._id ? 'Edit employee performance' : 'Record monthly performance'}</h3>
                <div className="accountant-operations__grid">
                  <label>Employee name<select value={performanceForm.employee} onChange={(event) => setPerformanceForm({ ...performanceForm, employee: event.target.value })} required disabled={Boolean(performanceForm._id)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.department}</option>)}</select></label>
                  <label>Employee title<input value={performanceForm.title} onChange={(event) => setPerformanceForm({ ...performanceForm, title: event.target.value })} minLength="2" maxLength="120" placeholder="Job title or responsibility" required /></label>
                  <label>Year<input type="number" min="2000" max="2200" value={performanceForm.year} onChange={(event) => setPerformanceForm({ ...performanceForm, year: event.target.value })} required disabled={Boolean(performanceForm._id)} /></label>
                  <label>Month<select value={performanceForm.month} onChange={(event) => setPerformanceForm({ ...performanceForm, month: event.target.value })} disabled={Boolean(performanceForm._id)}>{MONTH_NAMES.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
                  <label>Target<input type="number" min="0" step="any" value={performanceForm.target} onChange={(event) => setPerformanceForm({ ...performanceForm, target: event.target.value })} required /></label>
                  <label>Actual achieved<input type="number" min="0" step="any" value={performanceForm.actual} onChange={(event) => setPerformanceForm({ ...performanceForm, actual: event.target.value })} required /></label>
                  <label>Sales count (if applicable)<input type="number" min="0" step="1" value={performanceForm.salesCount} onChange={(event) => setPerformanceForm({ ...performanceForm, salesCount: event.target.value })} /></label>
                  <label>Sales value (RWF)<input type="number" min="0" step={10 ** -minorUnitDigits} value={performanceForm.salesValue} onChange={(event) => setPerformanceForm({ ...performanceForm, salesValue: event.target.value })} /></label>
                  <label className="accountant-operations__wide">Work completed<input value={performanceForm.workCompleted} onChange={(event) => setPerformanceForm({ ...performanceForm, workCompleted: event.target.value })} /></label>
                  <label className="accountant-operations__wide">Performance notes<input value={performanceForm.notes} onChange={(event) => setPerformanceForm({ ...performanceForm, notes: event.target.value })} /></label>
                </div>
                <div className="accountant-operations__form-actions"><button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => setPerformanceForm(null)}>Cancel</button><button className="accountant-operations__button" disabled={saving}>{saving ? 'Saving…' : 'Save review'}</button></div>
              </form>}
              {performance.length ? <div className="accountant-operations__table-wrap"><table><thead><tr><th>Employee</th><th>Title</th><th>Target</th><th>Actual</th><th>Achievement</th><th>Sales</th><th>Sales value</th><th>Reviewer</th><th>Actions</th></tr></thead><tbody>
                {performance.map((record) => <tr key={record._id}>
                  <td><strong>{record.employee?.name || 'Unknown'}</strong><small>{record.employee?.department || '—'}</small></td><td>{record.title || '—'}</td><td>{record.target}</td><td>{record.actual}</td>
                  <td>{record.achievementPercent === null ? 'No target set' : `${record.achievementPercent}%`}</td><td>{record.salesCount || 0}</td><td>{money(record.salesValueMinor, minorUnitDigits)}</td><td>{record.reviewer?.name || '—'}</td>
                  <td><div className="accountant-operations__actions">
                    <button type="button" className="accountant-operations__icon-button" onClick={() => setViewedRecord({ type: 'performance', record })} aria-label={`View performance for ${record.employee?.name || 'employee'}`}><Eye size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => editPerformance(record)} aria-label={`Edit performance for ${record.employee?.name || 'employee'}`}><Pencil size={15} /></button>
                    <button type="button" className="accountant-operations__icon-button" onClick={() => deleteRecord('performance', record)} aria-label={`Delete performance for ${record.employee?.name || 'employee'}`}><Trash2 size={15} /></button>
                  </div></td>
                </tr>)}
              </tbody></table></div> : <div className="accountant-operations__empty">No reviews for this month. Record performance against each employee’s agreed responsibilities.</div>}
            </section>
          )}
        </>
      )}
      {viewedRecord && (
        <div className="accountant-operations__modal-backdrop" onClick={() => setViewedRecord(null)}>
          <section
            className="accountant-operations__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accountant-record-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p>Record details</p>
                <h2 id="accountant-record-title">{viewedRecord.type === 'asset' ? viewedRecord.record.name : viewedRecord.type === 'project' ? viewedRecord.record.title : viewedRecord.record.employee?.name || 'Employee performance'}</h2>
              </div>
              <button type="button" className="accountant-operations__icon-button" onClick={() => setViewedRecord(null)} aria-label="Close record details"><X size={17} /></button>
            </header>
            {viewedRecord.type === 'asset' && viewedRecord.record.photoUrl && (
              <img className="accountant-operations__modal-image" src={viewedRecord.record.photoUrl} alt={viewedRecord.record.name} />
            )}
            <dl>{recordDetails(viewedRecord.type, viewedRecord.record).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}</dl>
            <footer>
              <button type="button" className="accountant-operations__button accountant-operations__button--quiet" onClick={() => setViewedRecord(null)}>Close</button>
              <button type="button" className="accountant-operations__button" onClick={() => {
                if (viewedRecord.type === 'asset') editAsset(viewedRecord.record)
                else if (viewedRecord.type === 'project') editProject(viewedRecord.record)
                else editPerformance(viewedRecord.record)
                setViewedRecord(null)
              }}><Pencil size={15} aria-hidden="true" /> Edit</button>
              <button type="button" className="accountant-operations__button accountant-operations__button--danger" onClick={() => deleteRecord(viewedRecord.type, viewedRecord.record)}><Trash2 size={15} aria-hidden="true" /> Delete</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}
