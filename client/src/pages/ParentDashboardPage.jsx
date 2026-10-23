import { Baby, BellRing, HeartHandshake } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/useTheme'

export function ParentDashboardPage() {
  const { user } = useAuth()
  const { t } = useTheme()

  return (
    <section className="parent-dashboard">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('Parent portal')}</p>
          <h1>{t('Welcome,')} {user.name}</h1>
          <p className="page-description">
            {t('Your parent account is ready. This space is for updates and information shared with families.')}
          </p>
        </div>
      </header>
      <div className="summary-grid parent-dashboard__cards">
        <article className="summary-card">
          <div className="summary-card__top">
            <span>{t('Family updates')}</span>
            <BellRing size={19} aria-hidden="true" />
          </div>
          <strong>{t('Not available yet')}</strong>
          <small>{t('There are no updates to display yet.')}</small>
        </article>
        <article className="summary-card">
          <div className="summary-card__top">
            <span>{t('Parent resources')}</span>
            <Baby size={19} aria-hidden="true" />
          </div>
          <strong>{t('Not available yet')}</strong>
          <small>{t('Resources will appear here when available.')}</small>
        </article>
      </div>
      <div className="parent-dashboard__note">
        <HeartHandshake size={21} aria-hidden="true" />
        <span>{t('For account help, please contact the organization directly.')}</span>
      </div>
    </section>
  )
}
