import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CircleOff,
  Database,
  Gauge,
  Globe2,
  LockKeyhole,
  Mail,
  Palette,
  PanelLeft,
  Phone,
  Plug,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { InlineLoading } from '../components/LoadingStates'
import { apiRequest } from '../lib/api'
import { useTheme } from '../theme/useTheme'
import { SUPPORTED_LANGUAGES } from '../i18n/translations'

const DEFAULT_PREFERENCES = {
  animationMode: 'system',
  animationSpeed: 'normal',
  sidebarCollapsed: false,
  showNavigationHeadings: true,
  navigationDensity: 'comfortable',
  language: 'en',
  currency: 'RWF',
}

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: Settings2, keywords: 'account profile organization details' },
  { id: 'appearance', label: 'Appearance', icon: Palette, keywords: 'theme color light dark' },
  { id: 'motion', label: 'Animations', icon: Sparkles, keywords: 'motion reduced speed accessibility' },
  { id: 'navigation', label: 'Sidebar & navigation', icon: PanelLeft, keywords: 'sidebar collapse headings density' },
  { id: 'access', label: 'User access', icon: UserRound, keywords: 'roles permissions staff' },
  { id: 'security', label: 'Security', icon: ShieldCheck, keywords: 'authentication session password' },
  { id: 'notifications', label: 'Notifications', icon: Bell, keywords: 'alerts delivery email' },
  { id: 'regional', label: 'Regional & language', icon: Globe2, keywords: 'locale language timezone date currency' },
  { id: 'data', label: 'Data & backup', icon: Database, keywords: 'export backup restore' },
  { id: 'audit', label: 'Audit history', icon: ScrollText, keywords: 'logs events activity history' },
  { id: 'integrations', label: 'Integrations', icon: Plug, keywords: 'services connections api' },
  { id: 'system', label: 'System information', icon: Activity, keywords: 'status version database health' },
]

const SECTION_STATUS = {
  general: 'Account details',
  appearance: 'Available',
  motion: 'Available',
  navigation: 'Available',
  access: 'Role managed',
  security: 'Available',
  notifications: 'Unavailable',
  regional: 'Available',
  data: 'Unavailable',
  audit: 'Unavailable',
  integrations: 'Unavailable',
  system: 'Live status',
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function SettingChoice({ checked, onChange, label, description, name, value }) {
  const { t } = useTheme()
  return (
    <label className={`settings-choice${checked ? ' is-selected' : ''}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="settings-choice__copy">
        <strong>{t(label)}</strong>
        <small>{t(description)}</small>
      </span>
      <span className="settings-choice__check" aria-hidden="true"><Check size={15} /></span>
    </label>
  )
}

function UnavailableFeature({ title, children }) {
  const { t } = useTheme()
  return (
    <div className="settings-unavailable">
      <span className="settings-unavailable__icon"><CircleOff size={17} aria-hidden="true" /></span>
      <div>
        <strong>{t(title)} {t('is not connected')}</strong>
        <p>{t(children)}</p>
      </div>
      <span className="settings-status settings-status--unavailable">{t('Unavailable')}</span>
    </div>
  )
}

export function SystemSettingsPage() {
  const { user, updateProfile, changePassword } = useAuth()
  const { theme, setTheme, preferences, updatePreferences, t } = useTheme()
  const [activeSection, setActiveSection] = useState('general')
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(() => ({ theme, ...preferences }))
  const [draft, setDraft] = useState(() => ({ theme, ...preferences }))
  const [saveMessage, setSaveMessage] = useState('')
  const [profileDraft, setProfileDraft] = useState(() => ({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
  }))
  const [profileSaved, setProfileSaved] = useState(() => ({
    name: user.name,
    email: user.email,
    phone: user.phone || '',
  }))
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('')
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [systemStatus, setSystemStatus] = useState({ loading: true, data: null, error: '' })
  const [statusRefresh, setStatusRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('/api/health', { signal: controller.signal })
      .then((data) => setSystemStatus({ loading: false, data, error: '' }))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSystemStatus({ loading: false, data: null, error: error.message })
        }
      })
    return () => controller.abort()
  }, [statusRefresh])

  const matchingSections = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return SETTINGS_SECTIONS
    return SETTINGS_SECTIONS.filter(({ label, keywords }) => `${label} ${keywords}`.toLocaleLowerCase().includes(query))
  }, [search])
  const selectedSection = matchingSections.find(({ id }) => id === activeSection) || matchingSections[0]
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(saved)

  function updateDraft(updates) {
    setDraft((current) => ({ ...current, ...updates }))
    setSaveMessage('')
  }

  function selectTheme(theme) {
    updateDraft({ theme })
    setSaved((current) => ({ ...current, theme }))
    setTheme(theme)
  }

  function saveSettings() {
    setTheme(draft.theme)
    updatePreferences({
      animationMode: draft.animationMode,
      animationSpeed: draft.animationSpeed,
      sidebarCollapsed: draft.sidebarCollapsed,
      showNavigationHeadings: draft.showNavigationHeadings,
      navigationDensity: draft.navigationDensity,
      language: draft.language,
      currency: draft.currency,
    })
    const nextSaved = { ...draft }
    setSaved(nextSaved)
    setSaveMessage(t('Your preferences have been saved in this browser.'))
  }

  function discardChanges() {
    setDraft(saved)
    setSaveMessage('')
  }

  function restoreDefaults() {
    setDraft({ theme: 'light', ...DEFAULT_PREFERENCES })
    setSaveMessage('')
  }

  function refreshSystemStatus() {
    setSystemStatus((current) => ({ ...current, loading: true, error: '' }))
    setStatusRefresh((value) => value + 1)
  }

  async function submitProfile(event) {
    event.preventDefault()
    setProfileSubmitting(true)
    setProfileError('')
    setProfileMessage('')
    try {
      const userUpdate = {
        ...profileDraft,
        ...(profileDraft.email.trim().toLowerCase() !== profileSaved.email.toLowerCase()
          ? { currentPassword: profileCurrentPassword }
          : {}),
      }
      const updatedUser = await updateProfile(userUpdate)
      const nextProfile = { name: updatedUser.name, email: updatedUser.email, phone: updatedUser.phone || '' }
      setProfileDraft(nextProfile)
      setProfileSaved(nextProfile)
      setProfileCurrentPassword('')
      setProfileMessage(t('Profile information has been saved to your account.'))
    } catch (error) {
      setProfileError(error.message)
    } finally {
      setProfileSubmitting(false)
    }
  }

  async function submitPassword(event) {
    event.preventDefault()
    setPasswordSubmitting(true)
    setPasswordError('')
    setPasswordMessage('')
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      setPasswordError(t('The new passwords do not match.'))
      setPasswordSubmitting(false)
      return
    }
    try {
      const result = await changePassword(passwordDraft.currentPassword, passwordDraft.newPassword)
      setPasswordDraft({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordMessage(t(result.message))
    } catch (error) {
      setPasswordError(error.message)
    } finally {
      setPasswordSubmitting(false)
    }
  }

  function renderSection() {
    switch (selectedSection?.id) {
      case 'general':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">{t('Your account')}</p>
              <h2>{t('General')}</h2>
              <p>{t('Edit the profile details associated with your account.')}</p>
            </div>
            <div className="settings-profile">
              <span className="avatar settings-avatar">{initials(user.name)}</span>
              <div><strong>{user.name}</strong><small>{user.email}</small></div>
            </div>
            <form className="settings-profile-form" onSubmit={submitProfile}>
              <label className="settings-form-field">
                <span>{t('Full name')}</span>
                <span className="settings-input-wrap"><UserRound size={16} aria-hidden="true" /><input autoComplete="name" required minLength={2} maxLength={120} value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></span>
              </label>
              <label className="settings-form-field">
                <span>{t('Email address')}</span>
                <span className="settings-input-wrap"><Mail size={16} aria-hidden="true" /><input type="email" autoComplete="email" required maxLength={254} value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} /></span>
              </label>
              <label className="settings-form-field">
                <span>{t('Phone number')}</span>
                <span className="settings-input-wrap"><Phone size={16} aria-hidden="true" /><input type="tel" autoComplete="tel" maxLength={32} value={profileDraft.phone} onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))} /></span>
              </label>
              {profileDraft.email.trim().toLowerCase() !== profileSaved.email.toLowerCase() && (
                <label className="settings-form-field">
                  <span>{t('Current password')} <small>{t('Required to change your email')}</small></span>
                  <span className="settings-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input type="password" autoComplete="current-password" required value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} /></span>
                </label>
              )}
              {profileError && <p className="settings-error" role="alert">{profileError}</p>}
              {profileMessage && <p className="settings-success" role="status">{profileMessage}</p>}
              <button className="primary-btn settings-save-button" type="submit" disabled={profileSubmitting || JSON.stringify(profileDraft) === JSON.stringify(profileSaved)}>
                {profileSubmitting ? <InlineLoading>{t('Saving…')}</InlineLoading> : <><Save size={15} aria-hidden="true" />{t('Save profile')}</>}
              </button>
            </form>
            <dl className="settings-details">
              <div><dt>{t('Assigned role')}</dt><dd>{user.role.replaceAll('_', ' ')}</dd></div>
              <div><dt>{t('Department')}</dt><dd>{user.department || t('Not assigned')}</dd></div>
              <div><dt>{t('Account status')}</dt><dd>{user.active ? t('Active') : t('Inactive')}</dd></div>
            </dl>
            <p className="settings-note">{t('Your name, email, and phone number are saved to your account on the server. A current-password confirmation is required when changing email.')}</p>
          </>
        )
      case 'appearance':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">Workspace preferences</p>
              <h2>Appearance</h2>
              <p>Choose the color theme for the application on this browser.</p>
            </div>
            <div className="settings-option-grid">
              <SettingChoice name="theme" value="light" checked={draft.theme === 'light'} onChange={() => selectTheme('light')} label="Light" description="Bright surfaces and dark text" />
              <SettingChoice name="theme" value="dark" checked={draft.theme === 'dark'} onChange={() => selectTheme('dark')} label="Dark" description="Dim surfaces for low-light work" />
            </div>
            <div className={`settings-theme-preview settings-theme-preview--${draft.theme}`} aria-label={`${draft.theme} theme preview`}>
              <span className="settings-theme-preview__rail" />
              <span className="settings-theme-preview__content">
                <strong>{draft.theme === 'dark' ? 'Dark workspace' : 'Light workspace'}</strong>
                <small>Theme changes apply across the signed-in application.</small>
              </span>
              <Palette size={20} aria-hidden="true" />
            </div>
            <p className="settings-note">This is a browser-local preference. It is not synchronized across devices or stored on your account.</p>
          </>
        )
      case 'motion':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">Comfort & accessibility</p>
              <h2>Animations</h2>
              <p>Control interface motion. Your operating system’s reduced-motion preference is always respected.</p>
            </div>
            <div className="settings-choice-list">
              <SettingChoice name="animationMode" value="system" checked={draft.animationMode === 'system'} onChange={() => updateDraft({ animationMode: 'system' })} label="Use device setting" description="Follow your operating system's motion preference" />
              <SettingChoice name="animationMode" value="full" checked={draft.animationMode === 'full'} onChange={() => updateDraft({ animationMode: 'full' })} label="Full motion" description="Keep the interface's standard transitions and animations" />
              <SettingChoice name="animationMode" value="reduced" checked={draft.animationMode === 'reduced'} onChange={() => updateDraft({ animationMode: 'reduced' })} label="Reduced motion" description="Shorten transitions and stop looping decorative motion" />
              <SettingChoice name="animationMode" value="minimal" checked={draft.animationMode === 'minimal'} onChange={() => updateDraft({ animationMode: 'minimal' })} label="Minimal motion" description="Turn off interface animations and transitions" />
            </div>
            <fieldset className="settings-fieldset">
              <legend>Transition speed</legend>
              <div className="settings-option-grid settings-option-grid--three">
                {[
                  ['slow', 'Slow', 'Gentler transitions'],
                  ['normal', 'Standard', 'Default timing'],
                  ['fast', 'Fast', 'Shorter transitions'],
                ].map(([value, label, description]) => (
                  <SettingChoice key={value} name="animationSpeed" value={value} checked={draft.animationSpeed === value} onChange={() => updateDraft({ animationSpeed: value })} label={label} description={description} />
                ))}
              </div>
            </fieldset>
          </>
        )
      case 'navigation':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">Your workspace</p>
              <h2>Sidebar & navigation</h2>
              <p>Set how the application navigation appears when you open your workspace.</p>
            </div>
            <div className="settings-choice-list">
              <SettingChoice name="navigationDensity" value="comfortable" checked={draft.navigationDensity === 'comfortable'} onChange={() => updateDraft({ navigationDensity: 'comfortable' })} label="Comfortable spacing" description="Default item height and spacing" />
              <SettingChoice name="navigationDensity" value="compact" checked={draft.navigationDensity === 'compact'} onChange={() => updateDraft({ navigationDensity: 'compact' })} label="Compact spacing" description="Fit more navigation items in the sidebar" />
            </div>
            <div className="settings-switch-list">
              <label className="settings-switch-row">
                <span><strong>Start with the sidebar collapsed</strong><small>Use icons-only navigation when you open the workspace.</small></span>
                <input type="checkbox" checked={draft.sidebarCollapsed} onChange={(event) => updateDraft({ sidebarCollapsed: event.target.checked })} />
              </label>
              <label className="settings-switch-row">
                <span><strong>Show navigation group headings</strong><small>Keep labels such as Main menu, Operations, and Reporting visible.</small></span>
                <input type="checkbox" checked={draft.showNavigationHeadings} onChange={(event) => updateDraft({ showNavigationHeadings: event.target.checked })} />
              </label>
            </div>
            <p className="settings-note">You can still expand or collapse the sidebar at any time using its control.</p>
          </>
        )
      case 'access':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">Roles & permissions</p>
              <h2>User access</h2>
              <p>Access is based on the role assigned to your account by the server.</p>
            </div>
            <div className="settings-access-summary">
              <span className="settings-access-summary__icon"><ShieldCheck size={20} aria-hidden="true" /></span>
              <div><strong>Your role: {user.role.replaceAll('_', ' ')}</strong><p>Dashboard routes and protected API operations enforce role permissions. Public signup cannot assign staff roles.</p></div>
            </div>
            {user.role === 'director' ? (
              <Link className="settings-action-link" to="/staff"><UserRound size={17} aria-hidden="true" />Open staff & user directory<ChevronRight size={16} aria-hidden="true" /></Link>
            ) : (
              <p className="settings-note">Only an authorized Director can manage staff accounts and assigned roles. Contact your Director if your access needs to change.</p>
            )}
          </>
        )
      case 'security':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">{t('Authentication')}</p>
              <h2>{t('Security')}</h2>
              <p>{t('These details describe current server behavior; they are not security guarantees or configurable controls.')}</p>
            </div>
            <div className="settings-security-grid">
              <article><LockKeyhole size={19} aria-hidden="true" /><strong>Session-based access</strong><p>Sign-in uses a signed JWT in an HttpOnly, SameSite=Strict cookie.</p></article>
              <article><Gauge size={19} aria-hidden="true" /><strong>Session duration</strong><p>8 hours normally; up to 30 days when “Remember me” is selected.</p></article>
              <article><ShieldCheck size={19} aria-hidden="true" /><strong>Sign-in throttling</strong><p>Up to 10 attempts per 15 minutes per client, enforced by the API.</p></article>
            </div>
            <form className="settings-password-form" onSubmit={submitPassword}>
              <h3>{t('Change password')}</h3>
              <p>{t('Use your current password to set a new password. The new password may be up to 128 characters and 72 UTF-8 bytes.')}</p>
              <label className="settings-form-field">
                <span>{t('Current password')}</span>
                <span className="settings-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input type="password" autoComplete="current-password" required maxLength={128} value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft((current) => ({ ...current, currentPassword: event.target.value }))} /></span>
              </label>
              <label className="settings-form-field">
                <span>{t('New password')}</span>
                <span className="settings-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input type="password" autoComplete="new-password" required minLength={1} maxLength={128} value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft((current) => ({ ...current, newPassword: event.target.value }))} /></span>
              </label>
              <label className="settings-form-field">
                <span>{t('Confirm new password')}</span>
                <span className="settings-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input type="password" autoComplete="new-password" required maxLength={128} value={passwordDraft.confirmPassword} onChange={(event) => setPasswordDraft((current) => ({ ...current, confirmPassword: event.target.value }))} /></span>
              </label>
              {passwordError && <p className="settings-error" role="alert">{passwordError}</p>}
              {passwordMessage && <p className="settings-success" role="status">{passwordMessage}</p>}
              <button className="primary-btn settings-save-button" type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? <InlineLoading>{t('Changing…')}</InlineLoading> : <><LockKeyhole size={15} aria-hidden="true" />{t('Change password')}</>}
              </button>
            </form>
          </>
        )
      case 'system':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">Live service check</p>
              <h2>System information</h2>
              <p>Connection status reported by the application health endpoint.</p>
            </div>
            <div className="settings-system-status" aria-live="polite" aria-busy={systemStatus.loading}>
              <div><span className={`settings-health-indicator${systemStatus.data?.status === 'ok' ? ' is-healthy' : ''}`} /><strong>Application API</strong><span>{systemStatus.loading ? <InlineLoading>{t('Checking…')}</InlineLoading> : systemStatus.data?.status || t('Unavailable')}</span></div>
              <div><Database size={17} aria-hidden="true" /><strong>Database</strong><span>{systemStatus.loading ? <InlineLoading>{t('Checking…')}</InlineLoading> : systemStatus.data?.database || t('Unknown')}</span></div>
            </div>
            {systemStatus.error && <p className="settings-error" role="alert">{systemStatus.error}</p>}
            <button className="settings-action-link settings-action-link--button" type="button" onClick={refreshSystemStatus} disabled={systemStatus.loading}>
              <Activity size={17} className={systemStatus.loading ? 'spin' : ''} aria-hidden="true" />{systemStatus.loading ? t('Checking…') : t('Refresh system status')}
            </button>
            <p className="settings-note">A connected health check confirms the API's reported connection only; it does not guarantee service availability or data integrity.</p>
          </>
        )
      case 'notifications':
        return <UnavailableFeature title="Notifications">The application does not currently provide notification preferences or a notification delivery service.</UnavailableFeature>
      case 'regional':
        return (
          <>
            <div className="settings-section-heading">
              <p className="eyebrow">{t('Localization')}</p>
              <h2>{t('Regional & language')}</h2>
              <p>{t('Choose the language and display currency for this browser.')}</p>
            </div>
            <div className="settings-localization-grid">
              <label className="settings-form-field">
                <span>{t('Language')}</span>
                <span className="settings-select-wrap"><Globe2 size={16} aria-hidden="true" />
                  <select value={draft.language} onChange={(event) => updateDraft({ language: event.target.value })}>
                    {SUPPORTED_LANGUAGES.map(({ code, label, nativeLabel }) => <option key={code} value={code}>{nativeLabel || label}</option>)}
                  </select>
                </span>
              </label>
              <label className="settings-form-field">
                <span>{t('Currency')}</span>
                <span className="settings-select-wrap"><Database size={16} aria-hidden="true" />
                  <select value={draft.currency} onChange={(event) => updateDraft({ currency: event.target.value })}>
                    <option value="RWF">{t('RWF — Rwandan franc')}</option>
                    <option value="USD">{t('USD — US dollar')}</option>
                  </select>
                </span>
              </label>
            </div>
            <p className="settings-note">{t('Language changes apply across the shared navigation, dashboard, and settings interface. Currency changes the display format only; the system does not currently store monetary transactions or convert exchange rates.')}</p>
            <p className="settings-note">{t('Save preferences to apply these choices across the application.')}</p>
          </>
        )
      case 'data':
        return <UnavailableFeature title="Backup and export">No backup, restore, or user-facing data export workflow is connected to this application.</UnavailableFeature>
      case 'audit':
        return <UnavailableFeature title="Audit history">An append-only audit event API and audit records are not available, so there is no activity history to display.</UnavailableFeature>
      case 'integrations':
        return <UnavailableFeature title="Integrations">No integration management API is connected. No integration controls or connection status are simulated here.</UnavailableFeature>
      default:
        return null
    }
  }

  const ActiveIcon = selectedSection?.icon || Settings2

  return (
    <div className="system-settings-page">
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">{t('Workspace administration')}</p>
          <h1>{t('Settings center')}</h1>
          <p className="page-description">{t('Manage personal workspace preferences and review the settings currently supported by this system.')}</p>
        </div>
        <span className="settings-page-header__user"><span className="avatar">{initials(user.name)}</span>{user.name}</span>
      </header>

      <div className="settings-center-layout">
        <aside className="settings-navigation" aria-label="Settings categories">
          <label className="settings-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Find a setting')} aria-label={t('Find a setting')} />
          </label>
          <nav>
            {matchingSections.length ? matchingSections.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className={`settings-nav-item${selectedSection?.id === id ? ' is-active' : ''}`} onClick={() => setActiveSection(id)}>
                <Icon size={17} aria-hidden="true" /><span>{t(label)}</span><ChevronRight size={15} aria-hidden="true" />
              </button>
            )) : <p className="settings-no-results">{t('No categories match')} “{search}”.</p>}
          </nav>
          {user.role === 'director' && <Link className="settings-staff-link" to="/staff"><Building2 size={16} aria-hidden="true" />{t('Manage staff accounts')}</Link>}
        </aside>

        <div className="settings-content panel">
          {selectedSection && (
            <div className="settings-content__topline">
              <span><ActiveIcon size={17} aria-hidden="true" />{t(selectedSection.label)}</span>
              <span className={`settings-status${SECTION_STATUS[selectedSection.id] === 'Unavailable' ? ' settings-status--unavailable' : ''}`}>{t(SECTION_STATUS[selectedSection.id])}</span>
            </div>
          )}
          <div className="settings-content__body" id={selectedSection?.id === 'general' ? 'profile' : undefined}>{renderSection()}</div>
          {['appearance', 'motion', 'navigation', 'regional'].includes(selectedSection?.id) && (
            <footer className="settings-actions">
              <div className="settings-actions__message" aria-live="polite">{saveMessage || (hasChanges ? t('You have unsaved preference changes.') : t('Preferences are saved in this browser.'))}</div>
              <div className="settings-actions__buttons">
                <button className="secondary-btn" type="button" onClick={restoreDefaults}><RotateCcw size={15} aria-hidden="true" />{t('Restore defaults')}</button>
                {hasChanges && <button className="secondary-btn" type="button" onClick={discardChanges}>{t('Discard')}</button>}
                <button className="primary-btn settings-save-button" type="button" onClick={saveSettings} disabled={!hasChanges}><Save size={15} aria-hidden="true" />{t('Save preferences')}</button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}
