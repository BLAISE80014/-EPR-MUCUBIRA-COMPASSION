import { Baby, BellRing, HeartHandshake } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export function ParentDashboardPage() {
  const { user } = useAuth()

  return (
    <section className="parent-dashboard">
      <header className="page-header">
        <div>
          <p className="eyebrow">Parent portal</p>
          <h1>Welcome, {user.name}</h1>
          <p className="page-description">
            Your parent account is ready. This space is for updates and information shared with families.
          </p>
        </div>
      </header>
      <div className="summary-grid parent-dashboard__cards">
        <article className="summary-card">
          <div className="summary-card__top">
            <span>Family updates</span>
            <BellRing size={19} aria-hidden="true" />
          </div>
          <strong>Coming soon</strong>
          <small>There are no updates to display yet.</small>
        </article>
        <article className="summary-card">
          <div className="summary-card__top">
            <span>Parent resources</span>
            <Baby size={19} aria-hidden="true" />
          </div>
          <strong>Coming soon</strong>
          <small>Resources will appear here when available.</small>
        </article>
      </div>
      <div className="parent-dashboard__note">
        <HeartHandshake size={21} aria-hidden="true" />
        <span>For account help, please contact the organization directly.</span>
      </div>
    </section>
  )
}
