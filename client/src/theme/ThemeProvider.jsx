import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './ThemeContext'
import { getLocale, SUPPORTED_LANGUAGES, translate } from '../i18n/translations'

const THEME_STORAGE_KEY = 'epr-mucubira-theme'
const PREFERENCES_STORAGE_KEY = 'epr-mucubira-ui-preferences'
const DEFAULT_PREFERENCES = Object.freeze({
  animationMode: 'system',
  animationSpeed: 'normal',
  sidebarCollapsed: false,
  showNavigationHeadings: true,
  navigationDensity: 'comfortable',
  language: 'en',
  currency: 'RWF',
})

function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function getSavedPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || '{}')
    const legacySidebar = localStorage.getItem('compassion-sidebar-collapsed') === 'true'
    return {
      animationMode: ['full', 'reduced', 'minimal', 'system'].includes(saved.animationMode)
        ? saved.animationMode
        : DEFAULT_PREFERENCES.animationMode,
      animationSpeed: ['slow', 'normal', 'fast'].includes(saved.animationSpeed)
        ? saved.animationSpeed
        : DEFAULT_PREFERENCES.animationSpeed,
      sidebarCollapsed: saved.sidebarCollapsed === undefined
        ? legacySidebar
        : saved.sidebarCollapsed === true,
      showNavigationHeadings: saved.showNavigationHeadings !== false,
      navigationDensity: saved.navigationDensity === 'compact' ? 'compact' : 'comfortable',
      language: SUPPORTED_LANGUAGES.some(({ code }) => code === saved.language) ? saved.language : 'en',
      currency: ['RWF', 'USD'].includes(saved.currency) ? saved.currency : 'RWF',
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getSavedTheme)
  const [preferences, setPreferences] = useState(getSavedPreferences)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Theme still applies for this page session when storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.animationMode = preferences.animationMode
    root.dataset.animationSpeed = preferences.animationSpeed
    root.dataset.navigationDensity = preferences.navigationDensity
    root.dataset.navigationHeadings = String(preferences.showNavigationHeadings)
    root.dataset.language = preferences.language
    root.dataset.currency = preferences.currency
    root.lang = preferences.language

    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Preferences still apply for this page session when storage is unavailable.
    }
  }, [preferences])

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'light' ? 'dark' : 'light')
  }, [])

  const updatePreferences = useCallback((updates) => {
    setPreferences((current) => ({ ...current, ...updates }))
  }, [])

  const t = useCallback((message) => translate(preferences.language, message), [preferences.language])
  const formatCurrency = useCallback((amount) => {
    if (!Number.isFinite(amount)) return '—'
    try {
      return new Intl.NumberFormat(getLocale(preferences.language), {
        style: 'currency',
        currency: preferences.currency,
        maximumFractionDigits: preferences.currency === 'RWF' ? 0 : 2,
      }).format(amount)
    } catch {
      return `${preferences.currency} ${amount.toLocaleString()}`
    }
  }, [preferences.currency, preferences.language])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, preferences, updatePreferences, t, formatCurrency }),
    [theme, toggleTheme, preferences, updatePreferences, t, formatCurrency],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
