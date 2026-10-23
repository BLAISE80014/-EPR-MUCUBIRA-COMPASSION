import { HeartHandshake, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/useTheme'

export function MemberDashboardPage() {
  const { user } = useAuth()
  const { t } = useTheme()

  return (
    <div className="member-dashboard member-dashboard--workspace">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">{t('Community member')}</p>
          <h1>{t('Welcome,')} {user.name}</h1>
          <p className="page-description">{t('Your community workspace and account updates are shown here when they are available.')}</p>
        </div>
        <span className="member-dashboard__icon"><HeartHandshake size={25} aria-hidden="true" /></span>
      </header>
      <section className="summary-grid parent-dashboard__cards">
        <article className="summary-card">
          <div className="summary-card__top"><span>{t('Community updates')}</span><HeartHandshake size={18} aria-hidden="true" /></div>
          <strong>{t('Not available yet')}</strong>
          <small>{t('No community updates are connected to your account yet.')}</small>
        </article>
        <article className="summary-card">
          <div className="summary-card__top"><span>{t('Community workspace')}</span><UsersRound size={18} aria-hidden="true" /></div>
          <strong>{t('Member access')}</strong>
          <small>{t('Your account does not have staff management permissions.')}</small>
        </article>
      </section>
      <div className="parent-dashboard__note"><UsersRound size={20} aria-hidden="true" /><span>{t('Thank you for supporting stronger, more compassionate communities.')}</span></div>
    </div>
  )
}
