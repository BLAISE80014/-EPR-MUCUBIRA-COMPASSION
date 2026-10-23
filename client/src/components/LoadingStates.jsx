import { HeartHandshake, RefreshCw } from 'lucide-react'

export function AppLoadingScreen({
  message = 'Preparing your workspace...',
  progressDurationMs = 4000,
}) {
  return (
    <main className="app-loading-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="app-loading-glow" aria-hidden="true" />
      <div className="app-loading-content">
        <span className="app-loading-brand" aria-hidden="true">
          <HeartHandshake size={32} strokeWidth={1.8} />
        </span>
        <p className="app-loading-eyebrow">EPR Mucubira Compassion</p>
        <h1>Compassion Management System</h1>
        <span className="app-loading-spinner" aria-hidden="true" />
        <p className="app-loading-message">{message}</p>
        <div className="app-loading-progress" aria-hidden="true">
          <span style={{ '--startup-duration': `${progressDurationMs}ms` }} />
        </div>
        <p className="app-loading-hint">This usually takes a few seconds.</p>
      </div>
    </main>
  )
}

export function AppLoadingError({ message, onRetry, onLogin, retrying = false }) {
  return (
    <main className="app-loading-screen">
      <div className="app-loading-content app-loading-content--error">
        <span className="app-loading-brand" aria-hidden="true">
          <HeartHandshake size={32} strokeWidth={1.8} />
        </span>
        <p className="app-loading-eyebrow">EPR Mucubira Compassion</p>
        <h1>We couldn’t load your workspace</h1>
        <p className="app-loading-error-message" role="alert">{message}</p>
        <div className="app-loading-actions">
          <button className="primary-btn" type="button" onClick={onRetry} disabled={retrying}>
            {retrying ? <span className="button-spinner" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {retrying ? 'Checking connection…' : 'Retry'}
          </button>
          <button className="secondary-btn" type="button" onClick={onLogin}>Go to sign in</button>
        </div>
      </div>
    </main>
  )
}

export function SkeletonCards({ count = 4, label = 'Loading summary cards' }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className={`loading-skeleton-cards${count === 3 ? ' loading-skeleton-cards--three' : ''}`} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="loading-skeleton-card" key={index}>
            <span className="skeleton-block loading-skeleton-card__label" />
            <span className="skeleton-block loading-skeleton-card__icon" />
            <span className="skeleton-block loading-skeleton-card__value" />
            <span className="skeleton-block loading-skeleton-card__detail" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({ label = 'Loading chart data' }) {
  return (
    <div className="skeleton-chart" role="status" aria-label={label} aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="skeleton-chart__bars" aria-hidden="true">
        {[42, 68, 52, 86, 61, 74].map((height, index) => (
          <span className="skeleton-block" style={{ '--skeleton-bar-height': `${height}%` }} key={index} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonTable({ columns = 5, rows = 5, label = 'Loading records' }) {
  return (
    <div className="loading-table-wrap" role="status" aria-label={label} aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <table className="loading-table" aria-hidden="true">
        <thead>
          <tr>{Array.from({ length: columns }, (_, index) => <th key={index}><span className="skeleton-block" /></th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_, column) => (
                <td key={column}><span className={`skeleton-block${column === 0 ? ' loading-table__primary' : ''}`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InlineLoading({ children = 'Loading...', label = children }) {
  return (
    <span className="inline-loading" role="status" aria-label={label}>
      <span className="inline-loading__spinner" aria-hidden="true" />
      {children}
    </span>
  )
}
