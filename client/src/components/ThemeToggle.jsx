import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/useTheme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'light' ? 'dark' : 'light'
  const Icon = theme === 'light' ? Sun : Moon

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={`Current theme: ${theme}. Switch to ${nextTheme} mode.`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${nextTheme} mode`}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
