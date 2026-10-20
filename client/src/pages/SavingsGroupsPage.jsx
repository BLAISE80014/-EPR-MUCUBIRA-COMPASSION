import { useEffect, useState } from 'react'
import { Check, CirclePlus, PiggyBank, UserRoundX } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../lib/api'

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

export function SavingsGroupsPage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
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
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      const response = await apiRequest('/api/savings-groups', {
        method: 'POST',
        body: { name, code },
      })
      setGroups((old) => [...old, response.group].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setCode('')
      setCreating(false)
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
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
          <p className="eyebrow">Savings group management</p>
          <h1>{user.role === 'savings_group_manager' ? 'Assigned Savings Groups' : 'Savings Groups'}</h1>
          <p className="page-description">
            {user.role === 'savings_group_manager'
              ? 'This list is limited to the groups assigned to your account.'
              : 'Group identities remain separate, with responsible staff assignments shown for each group.'}
          </p>
        </div>
        {canManage && (
          <button className="primary-btn" type="button" onClick={() => { setCreating((value) => !value); setFormError('') }}>
            <CirclePlus size={16} />
            {creating ? 'Close form' : 'Add savings group'}
          </button>
        )}
      </section>

      {error && <p className="form-alert" role="alert">{error}</p>}

      {creating && canManage && (
        <form className="panel group-create-form" onSubmit={handleCreate}>
          <div>
            <p className="eyebrow">New group</p>
            <h3>Register a savings group</h3>
          </div>
          {formError && <p className="form-alert" role="alert">{formError}</p>}
          <label>
            Group name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required />
          </label>
          <label>
            Unique group ID
            <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]+" required />
          </label>
          <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create group'}</button>
        </form>
      )}

      <section className="panel staff-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{groups.length} active {groups.length === 1 ? 'group' : 'groups'}</p>
            <h3>Registered savings groups</h3>
          </div>
        </div>
        {loading ? <p className="empty-state">Loading savings groups…</p> : groups.length === 0 ? (
          <div className="empty-state">
            <PiggyBank size={22} />
            <strong>No active savings groups</strong>
            <span>{canManage ? 'Create a group before assigning Savings Group Managers.' : 'No groups are currently assigned to your account.'}</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Responsible staff</th>
                  <th>Created</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td><strong>{group.name}</strong><span className="table-secondary">ID: {group.code}</span></td>
                    <td>{group.managers.length ? group.managers.map((manager) => <span className="manager-name" key={manager.id}>{manager.name}</span>) : 'Not assigned'}</td>
                    <td>{formatDate(group.createdAt)}</td>
                    <td><span className="status-badge approved">Active</span></td>
                    {canManage && <td>
                      <button className="table-action table-action--subtle" type="button" onClick={() => toggleActive(group)}>
                        <UserRoundX size={15} /> Deactivate
                      </button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
