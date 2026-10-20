import { useState } from 'react'
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  PiggyBank,
  Receipt,
  Search,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from './ThemeToggle'

const ROLE_LABELS = {
  director: 'Director',
  accountant: 'Accountant',
  health_officer: 'Health Manager',
  communication_officer: 'Communication Manager',
  savings_group_manager: 'Savings Group Manager',
  member: 'Community Member',
  parent: 'Parent',
  pending: 'Pending approval',
}

const NAV_BY_ROLE = {
  director: [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Departments', path: null, icon: Building2 },
    { label: 'Staff and Users', path: '/staff', icon: Users },
    { label: 'Accounting and Finance', path: '/accounting', icon: WalletCards },
    { label: 'Health Services', path: '/health', icon: HeartPulse },
    { label: 'Communication', path: '/communication', icon: MessageSquareText },
    { label: 'Savings Groups', path: '/savings-groups', icon: PiggyBank },
    { label: 'Budgets', path: null, icon: Receipt },
    { label: 'Monthly Reports', path: null, icon: FileText },
    { label: 'Reports and Analytics', path: null, icon: BarChart3 },
    { label: 'Notifications', path: null, icon: Bell },
    { label: 'Audit Logs', path: null, icon: ShieldCheck },
    { label: 'Settings', path: null, icon: BriefcaseBusiness },
  ],
  accountant: [
    { label: 'Dashboard', path: '/accounting', icon: LayoutDashboard },
    { label: 'Accounting and Finance', path: '/accounting', icon: WalletCards },
    { label: 'Savings Groups', path: '/savings-groups', icon: PiggyBank },
    { label: 'Budgets', path: null, icon: Receipt },
    { label: 'Monthly Reports', path: null, icon: FileText },
    { label: 'Reports and Analytics', path: null, icon: BarChart3 },
  ],
  health_officer: [
    { label: 'Dashboard', path: '/health', icon: LayoutDashboard },
    { label: 'Health Services', path: '/health', icon: HeartPulse },
    { label: 'Monthly Reports', path: null, icon: FileText },
  ],
  communication_officer: [
    { label: 'Dashboard', path: '/communication', icon: LayoutDashboard },
    { label: 'Communication', path: '/communication', icon: MessageSquareText },
    { label: 'Monthly Reports', path: null, icon: FileText },
  ],
  savings_group_manager: [
    { label: 'Assigned Savings Groups', path: '/savings-groups', icon: PiggyBank },
    { label: 'Monthly Reports', path: null, icon: FileText },
  ],
  member: [
    { label: 'Dashboard', path: '/member-dashboard', icon: LayoutDashboard },
  ],
  parent: [
    { label: 'Parent Dashboard', path: '/parent-dashboard', icon: LayoutDashboard },
  ],
}

function currentPeriod() {
  const now = new Date()
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() }
}

function formatPeriod({ month, year }) {
  return new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1))) + ` ${year}`
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [period, setPeriod] = useState(currentPeriod)
  const [search, setSearch] = useState('')
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error.message)
    }
  }

  function submitSearch(event) {
    event.preventDefault()
    navigate(`/staff?search=${encodeURIComponent(search.trim())}`)
  }

  const navItems = NAV_BY_ROLE[user.role] || []
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand-box" to={user.role === 'director' ? '/dashboard' : NAV_BY_ROLE[user.role]?.[0]?.path || '/dashboard'}>
          <div className="brand-mark">E</div>
          <div>
            <h2>EPR MUCUBIRA</h2>
            <p>Compassion</p>
          </div>
        </Link>

        <nav className="nav-menu" aria-label="Main navigation">
          {navItems.map(({ label, path, icon: Icon }) => path ? (
            <NavLink
              key={label}
              end={label === 'Dashboard'}
              to={path}
              className={({ isActive }) => `nav-item ${isActive && path === location.pathname ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ) : (
            <button key={label} className="nav-item nav-item--disabled" type="button" disabled title="This module is not implemented yet">
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
          <button className="nav-item nav-logout" type="button" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <main className="main-panel">
        <header className="top-bar">
          {user.role === 'director' ? (
            <form className="search-box" onSubmit={submitSearch} role="search">
              <Search size={16} />
              <input
                aria-label="Search staff"
                placeholder="Search staff by name or email..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>
          ) : <div className="top-bar__spacer" />}

          <div className="top-bar__right">
            <ThemeToggle />
            <label className="month-selector">
              <span>{formatPeriod(period)}</span>
              <ChevronDown size={16} />
              <select
                aria-label="Reporting month"
                value={period.month}
                onChange={(event) => setPeriod((old) => ({ ...old, month: Number(event.target.value) }))}
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, index, 1))}
                  </option>
                ))}
              </select>
              <select
                aria-label="Reporting year"
                value={period.year}
                onChange={(event) => setPeriod((old) => ({ ...old, year: Number(event.target.value) }))}
              >
                {Array.from({ length: 8 }, (_, index) => new Date().getUTCFullYear() - 3 + index).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <div className="profile-pill">
              <div className="avatar">{initials}</div>
              <div>
                <strong>{user.name}</strong>
                <small>{ROLE_LABELS[user.role]}</small>
              </div>
            </div>
          </div>
        </header>

        {logoutError && <p className="form-alert inline-alert" role="alert">{logoutError}</p>}
        <Outlet context={{ period, setPeriod }} />
      </main>
    </div>
  )
}

export const ROLE_LABELS_BY_ROLE = ROLE_LABELS
