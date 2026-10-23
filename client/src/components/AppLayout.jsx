import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  HeartHandshake,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  UsersRound,
  Wallet,
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

const DIRECTOR_NAV = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Department', path: '/departments', icon: Building2 },
  { label: 'Staff & Users', path: '/staff', icon: UsersRound },
  { label: 'Accounting & Finance', path: '/accounting', icon: Wallet },
  { label: 'Health Service', path: '/health', icon: HeartPulse },
  { label: 'Communication', path: '/communication', icon: MessageCircle },
  { label: 'Saving Group', path: '/savings-groups', icon: HeartHandshake },
  { label: 'Budget', path: '/budget', icon: Calculator },
  { label: 'Monthly Report', path: '/monthly-reports', icon: CalendarDays },
  { label: 'Reports & Analytics', path: '/reports', icon: ChartNoAxesCombined },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Audit Logs', path: '/audit-logs', icon: ClipboardList },
  { label: 'Settings', path: '/settings', icon: Settings },
]

const NAV_BY_ROLE = {
  director: DIRECTOR_NAV,
  accountant: [
    { label: 'Dashboard', path: '/accounting', icon: LayoutDashboard },
    { label: 'Accounting & Finance', path: '/accounting', icon: Wallet },
    { label: 'Saving Group', path: '/savings-groups', icon: HeartHandshake },
    { label: 'Budget', path: '/budget', icon: Calculator },
    { label: 'Monthly Report', path: '/monthly-reports', icon: CalendarDays },
    { label: 'Reports & Analytics', path: '/reports', icon: ChartNoAxesCombined },
  ],
  health_officer: [
    { label: 'Dashboard', path: '/health', icon: LayoutDashboard },
    { label: 'Health Service', path: '/health', icon: HeartPulse },
    { label: 'Monthly Report', path: '/monthly-reports', icon: CalendarDays },
  ],
  communication_officer: [
    { label: 'Dashboard', path: '/communication', icon: LayoutDashboard },
    { label: 'Communication', path: '/communication', icon: MessageCircle },
    { label: 'Monthly Report', path: '/monthly-reports', icon: CalendarDays },
  ],
  savings_group_manager: [
    { label: 'Saving Group', path: '/savings-groups', icon: HeartHandshake },
    { label: 'Monthly Report', path: '/monthly-reports', icon: CalendarDays },
  ],
  member: [{ label: 'Dashboard', path: '/member-dashboard', icon: LayoutDashboard }],
  parent: [{ label: 'Dashboard', path: '/parent-dashboard', icon: LayoutDashboard }],
}

const PAGE_TITLES = Object.fromEntries(
  DIRECTOR_NAV.map(({ label, path }) => [path, label]),
)

const NAV_GROUPS = [
  { label: 'Main menu', paths: ['/dashboard', '/departments', '/staff', '/member-dashboard', '/parent-dashboard'] },
  { label: 'Operations', paths: ['/accounting', '/health', '/communication', '/savings-groups', '/budget'] },
  { label: 'Reporting', paths: ['/monthly-reports', '/reports'] },
  { label: 'System', paths: ['/notifications', '/audit-logs', '/settings'] },
]

function currentPeriod() {
  const now = new Date()
  return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() }
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [period, setPeriod] = useState(currentPeriod)
  const [search, setSearch] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = window.localStorage.getItem('compassion-sidebar-collapsed')
      return saved === 'true'
    } catch {
      return false
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const searchInputRef = useRef(null)
  const drawerRef = useRef(null)
  const drawerCloseRef = useRef(null)
  const drawerTriggerRef = useRef(null)
  const drawerWasOpenRef = useRef(false)

  useEffect(() => {
    try {
      window.localStorage.setItem('compassion-sidebar-collapsed', String(collapsed))
    } catch {
      // Ignore storage access issues in privacy-restricted browsers.
    }
  }, [collapsed])

  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add('navigation-drawer-open')
      drawerWasOpenRef.current = true
      drawerCloseRef.current?.focus()
    } else {
      document.body.classList.remove('navigation-drawer-open')
      if (drawerWasOpenRef.current) {
        drawerTriggerRef.current?.focus()
        drawerWasOpenRef.current = false
      }
    }

    return () => document.body.classList.remove('navigation-drawer-open')
  }, [drawerOpen])

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        setProfileOpen(false)
      }
      if (drawerOpen && event.key === 'Tab') {
        const focusableItems = [...(drawerRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || [])].filter((item) => item.getClientRects().length > 0)
        if (!focusableItems?.length) return
        const firstItem = focusableItems[0]
        const lastItem = focusableItems[focusableItems.length - 1]
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault()
          lastItem.focus()
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault()
          firstItem.focus()
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [drawerOpen])

  const navItems = NAV_BY_ROLE[user.role] || []
  const navGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: navItems.filter(({ path }) => group.paths.includes(path)),
    }))
    .filter(({ items }) => items.length > 0)
  const activeNavItem = navItems
    .filter(({ path }) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    .sort((first, second) => (
      second.path.length - first.path.length
      || Number(second.label === PAGE_TITLES[second.path]) - Number(first.label === PAGE_TITLES[first.path])
    ))[0]
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const pageTitle = PAGE_TITLES[location.pathname] || (
    location.pathname === '/member-dashboard' || location.pathname === '/parent-dashboard'
      ? 'Dashboard'
      : 'Compassion'
  )
  const reportingPeriodVisible = useMemo(
    () => ['/dashboard', '/accounting', '/health', '/communication'].includes(location.pathname),
    [location.pathname],
  )

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error.message)
      setProfileOpen(false)
    }
  }

  function submitSearch(event) {
    event.preventDefault()
    navigate(`/staff?search=${encodeURIComponent(search.trim())}`)
    setDrawerOpen(false)
  }

  return (
    <div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}${drawerOpen ? ' app-shell--drawer-open' : ''}`}>
      {drawerOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        ref={drawerRef}
        id="application-navigation"
        className="sidebar"
        aria-label="Application sidebar"
        aria-modal={drawerOpen ? 'true' : undefined}
        role={drawerOpen ? 'dialog' : undefined}
      >
        <div className="sidebar-header">
          <Link className="brand-box" to={user.role === 'director' ? '/dashboard' : navItems[0]?.path || '/dashboard'}>
            <span className="brand-mark"><HeartHandshake size={21} aria-hidden="true" /></span>
            <span className="brand-copy">
              <strong>Compassion</strong>
              <small>Management System</small>
            </span>
          </Link>
          <div className="sidebar-header-actions">
            <button
              className="sidebar-collapse"
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              ref={drawerCloseRef}
              className="sidebar-drawer-close"
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="sidebar-navigation">
          <nav aria-label="Main navigation">
            {navGroups.map(({ label, items }) => (
              <section className="sidebar-nav-group" key={label} aria-label={label}>
                <h2 className="sidebar-section-label">{label}</h2>
                <div className="nav-menu">
                  {items.map(({ label: itemLabel, path, icon: Icon }) => (
                    <NavLink
                      key={`${itemLabel}-${path}`}
                      to={path}
                      title={collapsed ? itemLabel : undefined}
                      aria-label={collapsed ? itemLabel : undefined}
                      className={() => `nav-item${activeNavItem?.path === path && activeNavItem.label === itemLabel ? ' active' : ''}`}
                      aria-current={activeNavItem?.path === path && activeNavItem.label === itemLabel ? 'page' : undefined}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                      <span>{itemLabel}</span>
                    </NavLink>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </div>

        {user.role === 'director' && (
          <div className="sidebar-mission">
            <HeartHandshake size={17} aria-hidden="true" />
            <p>Together for stronger, more compassionate communities.</p>
          </div>
        )}

        <div className="sidebar-bottom">
          <div className="sidebar-user" title={collapsed ? `${user.name} · ${ROLE_LABELS[user.role] || 'Team member'}` : undefined}>
            <span className="sidebar-user__avatar" aria-hidden="true">{initials}</span>
            <span className="sidebar-user__copy">
              <strong>{user.name}</strong>
              <small>{ROLE_LABELS[user.role] || 'Team member'}</small>
            </span>
          </div>
          <div className="sidebar-account-label">Account</div>
          <button className="nav-item nav-logout" type="button" onClick={handleLogout} title={collapsed ? 'Log out' : undefined}>
            <LogOut size={19} strokeWidth={1.8} aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="main-panel" inert={drawerOpen}>
        <header className="top-bar">
          <div className="top-bar__leading">
            <button
              ref={drawerTriggerRef}
              className="icon-button sidebar-toggle"
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="application-navigation"
            >
              <Menu size={19} aria-hidden="true" />
            </button>

            <div className="breadcrumbs" aria-label="Breadcrumb">
              <span>Workspace</span>
              <span className="breadcrumb-divider">/</span>
              <strong>{pageTitle}</strong>
            </div>
          </div>

          <div className="top-bar__right">
            {user.role === 'director' && (
              <form className="search-box top-search" onSubmit={submitSearch} role="search">
                <Search size={16} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  aria-label="Search staff"
                  placeholder="Search staff"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <kbd>⌘ K</kbd>
              </form>
            )}

            {reportingPeriodVisible && (
              <label className="month-selector">
                <CalendarDays size={16} aria-hidden="true" />
                <select
                  className="month-selector__month"
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
                  className="month-selector__year"
                  aria-label="Reporting year"
                  value={period.year}
                  onChange={(event) => setPeriod((old) => ({ ...old, year: Number(event.target.value) }))}
                >
                  {Array.from({ length: 8 }, (_, index) => period.year - 3 + index).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>
            )}

            <ThemeToggle />

            {user.role === 'director' && (
              <Link className="icon-button notification-link" to="/notifications" aria-label="View notifications" title="Notifications">
                <Bell size={18} aria-hidden="true" />
              </Link>
            )}

            <div className="profile-menu">
              <button
                className={`profile-pill${profileOpen ? ' is-open' : ''}`}
                type="button"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => setProfileOpen((value) => !value)}
              >
                <span className="avatar">{initials}</span>
                <span className="profile-copy">
                  <strong>{user.name}</strong>
                  <small>{ROLE_LABELS[user.role] || 'Team member'}</small>
                </span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>

              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="profile-dropdown__identity">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <Link to="/settings#profile" role="menuitem" onClick={() => setProfileOpen(false)}><BriefcaseBusiness size={16} />View profile</Link>
                  <Link to="/settings" role="menuitem" onClick={() => setProfileOpen(false)}><Settings size={16} />Account settings</Link>
                  <button type="button" role="menuitem" onClick={handleLogout}><LogOut size={16} />Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {logoutError && <p className="form-alert inline-alert" role="alert">{logoutError}</p>}

        <div className="page-content">
          <Outlet context={{ period, setPeriod }} />
          <footer className="app-footer">
            <span><Activity size={14} aria-hidden="true" /> Compassion Management System</span>
            <span>Secure workspace</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export const ROLE_LABELS_BY_ROLE = ROLE_LABELS
