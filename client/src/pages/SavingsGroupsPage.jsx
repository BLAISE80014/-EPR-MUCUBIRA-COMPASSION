import { useEffect, useRef, useState } from 'react'
import { CirclePlus, PiggyBank, RefreshCw, UserRoundX } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { FormField } from '../components/FormField'
import { InlineLoading, SkeletonTable } from '../components/LoadingStates'
import { apiRequest } from '../lib/api'
import { useTheme } from '../theme/useTheme'
import { getLocale } from '../i18n/translations'

function formatDate(value, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

export function SavingsGroupsPage() {
  const { user } = useAuth()
  const { t, preferences } = useTheme()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const submissionLock = useRef(false)
  const canManage = user.role === 'director'

  async function loadGroups(signal) {
    setLoading(true)
    try {
      const response = await apiRequest('/api/savings-groups', { signal })
      setGroups(response.groups)
      setError('')
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    loadGroups(controller.signal)
    return () => controller.abort()
  }, [refreshKey])

  async function handleCreate(event) {
    event.preventDefault()
    if (submissionLock.current) return
    setFormError('')
    setSuccessMessage('')
    const trimmedName = name.trim()
    const trimmedCode = code.trim().toUpperCase()
    const nextErrors = {}
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      nextErrors.name = 'Enter a group name between 2 and 120 characters.'
    }
    if (!/^[A-Z0-9_-]{2,32}$/.test(trimmedCode)) {
      nextErrors.code = 'Use 2–32 letters, numbers, hyphens, or underscores.'
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return
    }
    setFieldErrors({})
    submissionLock.current = true
    setSaving(true)
    try {
      const response = await apiRequest('/api/savings-groups', {
        method: 'POST',
        body: { name: trimmedName, code: trimmedCode },
      })
      setGroups((old) => [...old, response.group].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setCode('')
      setCreating(false)
      setFieldErrors({})
      setSuccessMessage('Saving group created successfully.')
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      submissionLock.current = false
      setSaving(false)
    }
  }

  async function toggleActive(group) {
    setError('')
    try {
      const response = await apiRequest(`/api/savings-groups/${group.id}`, {
        method: 'PATCH',
        body: { active: !group.active },
      })
      if (response.group.active) {
        await loadGroups()
      } else {
        setGroups((old) => old.filter((item) => item.id !== group.id))
      }
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('Savings group management')}</p>
          <h1>{t(user.role === 'savings_group_manager' ? 'Assigned Saving Groups' : 'Saving Group')}</h1>
          <p className="page-description">
            {t(user.role === 'savings_group_manager'
              ? 'This list is limited to the groups assigned to your account.'
              : 'Group identities remain separate, with responsible staff assignments shown for each group.')}
          </p>
        </div>
        {canManage && (
          <button className="primary-btn" type="button" onClick={() => {
            setCreating((value) => !value)
            setFormError('')
            setFieldErrors({})
            setSuccessMessage('')
          }}>
            <CirclePlus size={16} />
            {t(creating ? 'Close form' : 'Add savings group')}
          </button>
        )}
      </section>

      {error && (
        <div className="form-alert form-alert--with-action" role="alert">
          <span>{t(error)}</span>
          <button className="secondary-btn" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw size={14} aria-hidden="true" /> {t('Retry')}
          </button>
        </div>
      )}
      {successMessage && <p className="form-success" role="status">{t(successMessage)}</p>}

      {creating && canManage && (
        <form className="panel group-create-form" onSubmit={handleCreate} noValidate>
          <div>
            <p className="eyebrow">{t('New group')}</p>
              <h3>{t('Register a savings group')}</h3>
              <p className="form-intro">{t('Add the group name and a short unique identifier for staff to recognize.')}</p>
          </div>
          {formError && <p className="form-alert" role="alert">{t(formError)}</p>}
          <FormField id="group-name" label="Group name" required hint="Use the name recognized by your community." error={fieldErrors.name}>
            {(attrs) => <input {...attrs} value={name} onChange={(event) => {
              setName(event.target.value)
              setFieldErrors((old) => ({ ...old, name: '' }))
              setFormError('')
            }} placeholder="e.g. Abizeranye Savings Group" maxLength={120} />}
          </FormField>
          <FormField id="group-code" label="Unique group ID" required hint="2–32 letters, numbers, hyphens, or underscores." error={fieldErrors.code}>
            {(attrs) => <input {...attrs} value={code} onChange={(event) => {
              setCode(event.target.value.toUpperCase())
              setFieldErrors((old) => ({ ...old, code: '' }))
              setFormError('')
            }} placeholder="e.g. ABZ-001" maxLength={32} />}
          </FormField>
          <div className="form-actions">
            <button className="secondary-btn" type="button" onClick={() => {
              setCreating(false)
              setFormError('')
              setFieldErrors({})
            }} disabled={saving}>{t('Cancel')}</button>
            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? <><span className="button-spinner" aria-hidden="true" />{t('Creating…')}</> : t('Create group')}
            </button>
          </div>
        </form>
      )}

      <section className="panel staff-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{groups.length} {t('active')} {t(groups.length === 1 ? 'group' : 'groups')}</p>
            <h3>{t('Registered savings groups')}</h3>
          </div>
          <button className="secondary-btn" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} aria-hidden="true" />
            {t('Refresh')}
          </button>
        </div>
        {loading && groups.length === 0 ? <SkeletonTable columns={canManage ? 5 : 4} label="Loading savings groups" /> : error && groups.length === 0 ? (
          <div className="empty-state">
            <strong>{t('Savings groups are unavailable')}</strong>
            <span>{t('Retry the request to load available groups.')}</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <PiggyBank size={22} />
            <strong>{t('No active savings groups')}</strong>
            <span>{t(canManage ? 'Create a group before assigning Savings Group Managers.' : 'No groups are currently assigned to your account.')}</span>
          </div>
        ) : (
          <>
          {loading && <div className="section-refreshing"><InlineLoading>{t('Refreshing savings groups…')}</InlineLoading></div>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Group')}</th>
                  <th>{t('Responsible staff')}</th>
                  <th>{t('Created')}</th>
                  <th>{t('Status')}</th>
                  {canManage && <th>{t('Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td><strong>{group.name}</strong><span className="table-secondary">ID: {group.code}</span></td>
                    <td>{group.managers.length ? group.managers.map((manager) => <span className="manager-name" key={manager.id}>{manager.name}</span>) : t('Not assigned')}</td>
                    <td>{formatDate(group.createdAt, getLocale(preferences.language))}</td>
                    <td><span className="status-badge approved">{t('Active')}</span></td>
                    {canManage && <td>
                      <button className="table-action table-action--subtle" type="button" onClick={() => toggleActive(group)}>
                        <UserRoundX size={15} /> {t('Deactivate')}
                      </button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </>
  )
}
