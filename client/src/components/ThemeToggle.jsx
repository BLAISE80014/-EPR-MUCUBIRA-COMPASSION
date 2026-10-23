import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/useTheme'

export function ThemeToggle() {
  const { theme, toggleTheme, t } = useTheme()
  const nextTheme = theme === 'light' ? 'dark' : 'light'
  const Icon = theme === 'light' ? Sun : Moon

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={t(`Current theme: ${theme}. Switch to ${nextTheme} mode.`)}
      aria-pressed={theme === 'dark'}
      title={t(`Switch to ${nextTheme} mode`)}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{t(theme === 'light' ? 'Light' : 'Dark')}</span>
    </button>
  )
}
