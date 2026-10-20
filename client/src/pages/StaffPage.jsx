import { useEffect, useState } from 'react'
import { Check, Edit3, Plus, RefreshCw, Search, UserRoundX, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { apiRequest } from '../lib/api'

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

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

export function StaffPage() {
  const [queryParams, setQueryParams] = useSearchParams()
  const [search, setSearch] = useState(queryParams.get('search') || '')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [staff, setStaff] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

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
  }, [search, roleFilter, statusFilter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
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
    setDialogOpen(true)
  }

  function toggleGroup(groupId) {
    setForm((old) => ({
      ...old,
      groupIds: old.groupIds.includes(groupId)
        ? old.groupIds.filter((id) => id !== groupId)
        : [...old.groupIds, groupId],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setSaving(true)
    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
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
      setDialogOpen(false)
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(member) {
    setError('')
    try {
      const response = await apiRequest(`/api/staff/${member.id}`, {
        method: 'PATCH',
        body: { active: !member.active },
      })
      setStaff((old) => old.map((item) => item.id === member.id ? response.staff : item))
    } catch (requestError) {
      setError(requestError.message)
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
          <p className="eyebrow">Organization administration</p>
          <h1>Staff and Users</h1>
          <p className="page-description">Create accounts and manage staff access, roles, and assigned savings groups.</p>
        </div>
        <div className="header-actions">
          <button className="primary-btn" type="button" onClick={openCreate}>
            <Plus size={16} />
            Add staff account
          </button>
        </div>
      </section>

      {error && <p className="form-alert" role="alert">{error}</p>}

      <section className="panel staff-panel">
        <div className="staff-toolbar">
          <label className="staff-search">
            <Search size={16} />
            <input
              aria-label="Search staff"
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => updateQuery(event.target.value)}
            />
          </label>
          <div className="filter-controls">
            <label>
              <span className="visually-hidden">Filter by role</span>
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="">All roles</option>
                {STAFF_ROLES.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}
              </select>
            </label>
            <label>
              <span className="visually-hidden">Filter by account status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending approval</option>
              </select>
            </label>
          </div>
        </div>

        {loading ? <p className="empty-state">Loading staff records…</p> : staff.length === 0 ? (
          <div className="empty-state">
            <UsersIcon />
            <strong>No staff accounts found</strong>
            <span>Create an account or adjust the search and filters.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role / Department</th>
                  <th>Savings groups</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
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
                        <strong>{ROLE_LABELS[member.role] || member.role}</strong>
                        <span className="table-secondary">{DEPARTMENT_LABELS[member.department] || member.department}</span>
                      </td>
                      <td>{assignedGroups.length ? assignedGroups.map((group) => group.code).join(', ') : '—'}</td>
                      <td>{formatDate(member.createdAt)}</td>
                      <td><span className={`status-badge ${member.role === 'pending' ? 'under-review' : member.active ? 'approved' : 'rejected'}`}>{member.role === 'pending' ? 'Pending approval' : member.active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="table-actions">
                          <button className="table-action" type="button" onClick={() => openEdit(member)} aria-label={`Edit ${member.name}`}>
                            <Edit3 size={15} /> Edit
                          </button>
                          <button className="table-action table-action--subtle" type="button" onClick={() => toggleActive(member)} disabled={member.role === 'pending' && !member.active} aria-label={member.role === 'pending' ? `Assign an approved role to ${member.name} before activation` : `${member.active ? 'Deactivate' : 'Activate'} ${member.name}`}>
                            {member.active ? <UserRoundX size={15} /> : <Check size={15} />}
                            {member.role === 'pending' ? 'Assign role first' : member.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setDialogOpen(false)
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{editing ? 'Account details' : 'New account'}</p>
                <h3 id="staff-dialog-title">{editing ? 'Edit staff account' : 'Create staff account'}</h3>
              </div>
              <button className="icon-button" type="button" onClick={() => setDialogOpen(false)} disabled={saving} aria-label="Close dialog"><X size={18} /></button>
            </div>
            {formError && <p className="form-alert" role="alert">{formError}</p>}
            <form className="staff-form" onSubmit={handleSubmit}>
              <label>
                Full name
                <input autoComplete="name" value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} minLength={2} maxLength={120} required />
              </label>
              <label>
                Email address
                <input autoComplete="email" type="email" value={form.email} onChange={(event) => setForm((old) => ({ ...old, email: event.target.value }))} maxLength={254} required />
              </label>
              <label>
                Phone number <span className="field-optional">Optional</span>
                <input autoComplete="tel" type="tel" value={form.phone} onChange={(event) => setForm((old) => ({ ...old, phone: event.target.value }))} maxLength={32} />
              </label>
              <label>
                Role
                <select value={form.role} onChange={(event) => setForm((old) => ({ ...old, role: event.target.value, groupIds: event.target.value === 'savings_group_manager' ? old.groupIds : [] }))}>
                  {(editing?.role === 'pending' ? STAFF_ROLES : STAFF_ROLES.filter((role) => role.value !== 'pending')).map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}
                </select>
              </label>
              <label>
                {editing ? 'Reset password (optional)' : 'Temporary password'}
                <input
                  autoComplete="new-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((old) => ({ ...old, password: event.target.value }))}
                  minLength={12}
                  maxLength={128}
                  required={!editing}
                  placeholder={editing ? 'Leave blank to keep current password' : '12+ characters, max 72 UTF-8 bytes'}
                />
              </label>

              {form.role === 'savings_group_manager' && (
                <fieldset className="group-picker">
                  <legend>Assigned savings groups</legend>
                  {groups.filter((group) => group.active).length === 0 ? (
                    <p className="field-help">Create an active savings group before assigning this role.</p>
                  ) : groups.filter((group) => group.active).map((group) => (
                    <label className="checkbox-row" key={group.id}>
                      <input type="checkbox" checked={form.groupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />
                      <span>{group.name} <small>({group.code})</small></span>
                    </label>
                  ))}
                  <p className="field-help">At least one group is required. Managers can access only selected groups.</p>
                </fieldset>
              )}

              <div className="modal-actions">
                <button className="secondary-btn" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button>
                <button className="primary-btn" type="submit" disabled={saving || (form.role === 'savings_group_manager' && form.groupIds.length === 0)}>
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}

function UsersIcon() {
  return <RefreshCw size={20} aria-hidden="true" />
}
