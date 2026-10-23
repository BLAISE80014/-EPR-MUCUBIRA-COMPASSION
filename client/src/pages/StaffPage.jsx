import { useEffect, useRef, useState } from 'react'
import { Check, Edit3, Plus, RefreshCw, Search, UserRoundX, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { FormField } from '../components/FormField'
import { InlineLoading, SkeletonTable } from '../components/LoadingStates'
import { apiRequest } from '../lib/api'
import { useTheme } from '../theme/useTheme'
import { getLocale } from '../i18n/translations'

const STAFF_ROLES = [
  { value: 'accountant', label: 'Accountant' },
  { value: 'health_officer', label: 'Health Manager' },
  { value: 'communication_officer', label: 'Communication Manager' },
  { value: 'savings_group_manager', label: 'Savings Group Manager' },
  { value: 'member', label: 'Community Member' },
  { value: 'parent', label: 'Parent' },
  { value: 'pending', label: 'Pending approval' },
]

const ROLE_LABELS = Object.fromEntries(STAFF_ROLES.map(({ value, label }) => [value, label]))
const DEPARTMENT_LABELS = {
  accounting: 'Accounting and Finance',
  health: 'Health Services',
  communication: 'Communication',
  savings: 'Savings Groups',
  community: 'Community',
  pending: 'Pending approval',
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'accountant',
  groupIds: [],
}

function formatDate(value, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

export function StaffPage() {
  const { t, preferences } = useTheme()
  const [queryParams, setQueryParams] = useSearchParams()
  const [search, setSearch] = useState(queryParams.get('search') || '')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [staff, setStaff] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [togglingStaffId, setTogglingStaffId] = useState(null)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const closeButtonRef = useRef(null)
  const discardCancelRef = useRef(null)
  const modalRef = useRef(null)
  const requestCloseRef = useRef(() => {})
  const submissionLock = useRef(false)

  useEffect(() => {
    if (!dialogOpen) return undefined

    const previousFocus = document.activeElement
    ;(discardOpen ? discardCancelRef : closeButtonRef).current?.focus()
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) {
        if (discardOpen) setDiscardOpen(false)
        else requestCloseRef.current()
      }
      if (event.key === 'Tab') {
        const activeDialog = discardOpen
          ? document.querySelector('.discard-dialog')
          : modalRef.current
        const focusable = activeDialog?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      previousFocus?.focus?.()
    }
  }, [dialogOpen, discardOpen, saving])

  useEffect(() => {
    setSearch(queryParams.get('search') || '')
  }, [queryParams])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (roleFilter) params.set('role', roleFilter)
    if (statusFilter) params.set('status', statusFilter)

    setLoading(true)
    Promise.all([
      apiRequest(`/api/staff?${params.toString()}`, { signal: controller.signal }),
      apiRequest('/api/savings-groups', { signal: controller.signal }),
    ])
      .then(([staffResponse, groupResponse]) => {
        setStaff(staffResponse.staff)
        setGroups(groupResponse.groups)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [search, roleFilter, statusFilter, refreshKey])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setFieldErrors({})
    setDiscardOpen(false)
    setSuccessMessage('')
    setDialogOpen(true)
  }

  function openEdit(member) {
    setEditing(member)
    setForm({
      name: member.name,
      email: member.email,
      phone: member.phone || '',
      password: '',
      role: member.role,
      groupIds: member.groupIds,
    })
    setFormError('')
    setFieldErrors({})
    setDiscardOpen(false)
    setSuccessMessage('')
    setDialogOpen(true)
  }

  function isFormDirty() {
    if (editing) {
      return form.name !== editing.name
        || form.email !== editing.email
        || form.phone !== (editing.phone || '')
        || form.role !== editing.role
        || form.groupIds.join(',') !== (editing.groupIds || []).join(',')
        || Boolean(form.password)
    }
    return Boolean(form.name || form.email || form.phone || form.password)
      || form.role !== emptyForm.role
      || form.groupIds.length > 0
  }

  function requestClose() {
    if (saving) return
    if (isFormDirty()) {
      setDiscardOpen(true)
      return
    }
    setDialogOpen(false)
  }

  requestCloseRef.current = requestClose

  function updateFormField(field, value) {
    setForm((old) => ({ ...old, [field]: value }))
    setFieldErrors((old) => ({ ...old, [field]: '' }))
    setFormError('')
  }

  function toggleGroup(groupId) {
    setForm((old) => ({
      ...old,
      groupIds: old.groupIds.includes(groupId)
        ? old.groupIds.filter((id) => id !== groupId)
        : [...old.groupIds, groupId],
    }))
    setFieldErrors((old) => ({ ...old, groupIds: '' }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionLock.current) return
    setFormError('')
    const errors = {}
    const name = form.name.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()

    if (name.length < 2 || name.length > 120) errors.name = 'Enter a name between 2 and 120 characters.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Enter a valid email address.'
    if (phone && !/^[+()\d\s.-]{7,32}$/.test(phone)) errors.phone = 'Enter a valid phone number or leave this field blank.'
    if (!editing && (
      form.password.length < 12
      || form.password.length > 128
      || new TextEncoder().encode(form.password).byteLength > 72
    )) {
      errors.password = 'Use 12–128 characters and no more than 72 UTF-8 bytes.'
    }
    if (editing && form.password && (
      form.password.length < 12
      || form.password.length > 128
      || new TextEncoder().encode(form.password).byteLength > 72
    )) {
      errors.password = 'Use 12–128 characters and no more than 72 UTF-8 bytes.'
    }
    if (form.role === 'savings_group_manager' && form.groupIds.length === 0) {
      errors.groupIds = 'Select at least one active saving group for this role.'
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    submissionLock.current = true
    setSaving(true)
    const payload = {
      name,
      email,
      phone,
      role: form.role,
      groupIds: form.role === 'savings_group_manager' ? form.groupIds : [],
    }
    if (!editing || form.password) payload.password = form.password

    try {
      const response = editing
        ? await apiRequest(`/api/staff/${editing.id}`, { method: 'PATCH', body: payload })
        : await apiRequest('/api/staff', { method: 'POST', body: payload })
      if (editing) {
        setStaff((old) => old.map((member) => member.id === editing.id ? response.staff : member))
        if (statusFilter === 'pending' && response.staff.role !== 'pending') {
          setStatusFilter('')
        }
      } else {
        setStaff((old) => [response.staff, ...old])
      }
      setSuccessMessage(editing ? 'Staff account updated successfully.' : 'Staff account created successfully.')
      setDialogOpen(false)
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      submissionLock.current = false
      setSaving(false)
    }
  }

  async function toggleActive(member) {
    setError('')
    setTogglingStaffId(member.id)
    try {
      const response = await apiRequest(`/api/staff/${member.id}`, {
        method: 'PATCH',
        body: { active: !member.active },
      })
      setStaff((old) => old.map((item) => item.id === member.id ? response.staff : item))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setTogglingStaffId(null)
    }
  }

  function updateQuery(value) {
    setSearch(value)
    if (value) setQueryParams({ search: value }, { replace: true })
    else setQueryParams({}, { replace: true })
  }

  return (
    <>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('Organization administration')}</p>
          <h1>{t('Staff & Users')}</h1>
          <p className="page-description">{t('Create accounts and manage staff access, roles, and assigned savings groups.')}</p>
        </div>
        <div className="header-actions">
          <button className="secondary-btn" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} aria-hidden="true" />
            {t('Refresh')}
          </button>
          <button className="primary-btn" type="button" onClick={openCreate}>
            <Plus size={16} />
            {t('Add staff account')}
          </button>
        </div>
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

      <section className="panel staff-panel">
        <div className="staff-toolbar">
          <label className="staff-search">
            <Search size={16} />
            <input
              aria-label={t('Search staff')}
              placeholder={t('Search by name or email')}
              value={search}
              onChange={(event) => updateQuery(event.target.value)}
            />
          </label>
          <div className="filter-controls">
            <label>
              <span className="visually-hidden">{t('Filter by role')}</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="">{t('All roles')}</option>
                {STAFF_ROLES.map((role) => <option value={role.value} key={role.value}>{t(role.label)}</option>)}
              </select>
            </label>
            <label>
              <span className="visually-hidden">{t('Filter by account status')}</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">{t('All statuses')}</option>
                <option value="active">{t('Active')}</option>
                <option value="inactive">{t('Inactive')}</option>
                <option value="pending">{t('Pending approval')}</option>
              </select>
            </label>
          </div>
        </div>

        {loading && staff.length === 0 ? <SkeletonTable columns={6} label="Loading staff records" /> : error && staff.length === 0 ? (
          <div className="empty-state">
            <strong>{t('Staff records are unavailable')}</strong>
            <span>{t('Retry the request to load staff accounts.')}</span>
          </div>
        ) : staff.length === 0 ? (
          <div className="empty-state">
            <UsersIcon />
            <strong>{t('No staff accounts found')}</strong>
            <span>{t('Create an account or adjust the search and filters.')}</span>
          </div>
        ) : (
          <>
          {loading && <div className="section-refreshing"><InlineLoading>{t('Refreshing staff records…')}</InlineLoading></div>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Staff member')}</th>
                  <th>{t('Role / Department')}</th>
                  <th>{t('Savings groups')}</th>
                  <th>{t('Created')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const assignedGroups = groups.filter((group) => member.groupIds.includes(group.id))
                  return (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                        <span className="table-secondary">{member.email}</span>
                        {member.phone && <span className="table-secondary">{member.phone}</span>}
                      </td>
                      <td>
                        <strong>{t(ROLE_LABELS[member.role] || member.role)}</strong>
                        <span className="table-secondary">{t(DEPARTMENT_LABELS[member.department] || member.department)}</span>
                      </td>
                      <td>{assignedGroups.length ? assignedGroups.map((group) => group.code).join(', ') : '—'}</td>
                      <td>{formatDate(member.createdAt, getLocale(preferences.language))}</td>
                      <td><span className={`status-badge ${member.role === 'pending' ? 'under-review' : member.active ? 'approved' : 'rejected'}`}>{t(member.role === 'pending' ? 'Pending approval' : member.active ? 'Active' : 'Inactive')}</span></td>
                      <td>
                        <div className="table-actions">
                          <button className="table-action" type="button" onClick={() => openEdit(member)} aria-label={`Edit ${member.name}`}>
                            <Edit3 size={15} /> {t('Edit')}
                          </button>
                          <button className="table-action table-action--subtle" type="button" onClick={() => toggleActive(member)} disabled={(member.role === 'pending' && !member.active) || togglingStaffId === member.id} aria-label={member.role === 'pending' ? `Assign an approved role to ${member.name} before activation` : `${member.active ? 'Deactivate' : 'Activate'} ${member.name}`}>
                            {togglingStaffId === member.id
                              ? <InlineLoading>{t('Updating…')}</InlineLoading>
                              : <>{member.active ? <UserRoundX size={15} /> : <Check size={15} />}{t(member.role === 'pending' ? 'Assign role first' : member.active ? 'Deactivate' : 'Activate')}</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestClose()
        }}>
          <section ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" aria-describedby="staff-dialog-description">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t(editing ? 'Account details' : 'New account')}</p>
                <h3 id="staff-dialog-title">{t(editing ? 'Edit staff account' : 'Create staff account')}</h3>
                <p className="form-intro" id="staff-dialog-description">{t(editing ? 'Update this account’s contact details and access.' : 'Create secure access for a member of your organization.')}</p>
              </div>
              <button ref={closeButtonRef} className="icon-button" type="button" onClick={requestClose} disabled={saving} aria-label={t('Close dialog')}><X size={18} /></button>
            </div>
            {formError && <p className="form-alert" role="alert">{t(formError)}</p>}
            <form className="staff-form" onSubmit={handleSubmit} noValidate>
              <p className="form-section-title">{t('Account details')}</p>
              <FormField id="staff-name" label="Full name" required error={fieldErrors.name}>
                {(attrs) => <input {...attrs} autoComplete="name" placeholder={t('e.g. Aline Mukamana')} value={form.name} onChange={(event) => updateFormField('name', event.target.value)} maxLength={120} />}
              </FormField>
              <FormField id="staff-email" label="Email address" required error={fieldErrors.email}>
                {(attrs) => <input {...attrs} autoComplete="email" type="email" placeholder={t('name@organization.org')} value={form.email} onChange={(event) => updateFormField('email', event.target.value)} maxLength={254} />}
              </FormField>
              <FormField id="staff-phone" label="Phone number" optional error={fieldErrors.phone}>
                {(attrs) => <input {...attrs} autoComplete="tel" type="tel" placeholder="+250 7XX XXX XXX" value={form.phone} onChange={(event) => updateFormField('phone', event.target.value)} maxLength={32} />}
              </FormField>
              <div className="form-section-title form-section-title--spaced">Access &amp; security</div>
              <FormField id="staff-role" label="Role" required hint="Role determines which areas this account can access.">
                {(attrs) => <select {...attrs} value={form.role} onChange={(event) => {
                  const role = event.target.value
                  setForm((old) => ({ ...old, role, groupIds: role === 'savings_group_manager' ? old.groupIds : [] }))
                  setFieldErrors((old) => ({ ...old, groupIds: '' }))
                }}>
                  {(editing?.role === 'pending' ? STAFF_ROLES : STAFF_ROLES.filter((role) => role.value !== 'pending')).map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}
                </select>}
              </FormField>
              <FormField
                id="staff-password"
                label={editing ? 'Reset password' : 'Temporary password'}
                required={!editing}
                optional={Boolean(editing)}
                error={fieldErrors.password}
                hint={!editing ? 'Share this temporary password with the staff member securely.' : undefined}
              >
                {(attrs) => <input {...attrs} autoComplete="new-password" type="password" value={form.password} onChange={(event) => updateFormField('password', event.target.value)} maxLength={128} placeholder={editing ? 'Leave blank to keep current password' : '12+ characters, max 72 UTF-8 bytes'} />}
              </FormField>

              {form.role === 'savings_group_manager' && (
                <fieldset className={`group-picker${fieldErrors.groupIds ? ' group-picker--invalid' : ''}`} aria-describedby={fieldErrors.groupIds ? 'staff-groups-error' : undefined}>
                  <legend>Assigned saving groups <span className="required-mark" aria-hidden="true">*</span></legend>
                  {groups.filter((group) => group.active).length === 0 ? (
                    <p className="field-help">Create an active savings group before assigning this role.</p>
                  ) : groups.filter((group) => group.active).map((group) => (
                    <label className="checkbox-row" key={group.id}>
                      <input type="checkbox" checked={form.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                      <span>{group.name} <small>({group.code})</small></span>
                    </label>
                  ))}
                  <p className="field-help">At least one group is required. Managers can access only selected groups.</p>
                  {fieldErrors.groupIds && <p className="form-field__error" id="staff-groups-error" role="alert">{fieldErrors.groupIds}</p>}
                </fieldset>
              )}

              <div className="modal-actions">
                <button className="secondary-btn" type="button" onClick={requestClose} disabled={saving}>Cancel</button>
                <button className="primary-btn" type="submit" disabled={saving}>
                  {saving ? <InlineLoading>{t('Saving…')}</InlineLoading> : t(editing ? 'Save changes' : 'Create account')}
                </button>
              </div>
            </form>
          </section>
          {discardOpen && (
            <div className="discard-backdrop">
              <section className="discard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description">
                <span className="discard-dialog__icon"><X size={18} aria-hidden="true" /></span>
                <h3 id="discard-title">Discard unsaved changes?</h3>
                <p id="discard-description">Your changes to this staff account will be lost.</p>
                <div className="discard-dialog__actions">
                  <button ref={discardCancelRef} className="secondary-btn" type="button" onClick={() => setDiscardOpen(false)}>Keep editing</button>
                  <button className="danger-btn" type="button" onClick={() => {
                    setDiscardOpen(false)
                    setDialogOpen(false)
                  }}>Discard changes</button>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function UsersIcon() {
  return <RefreshCw size={20} aria-hidden="true" />
}
