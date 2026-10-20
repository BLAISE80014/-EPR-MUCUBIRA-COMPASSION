import { HeartHandshake, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export function MemberDashboardPage() {
  const { user } = useAuth()

  return (
    <section className="member-dashboard panel">
      <div className="member-dashboard__icon">
        <HeartHandshake size={28} aria-hidden="true" />
      </div>
      <p className="eyebrow">Community member</p>
      <h1>Welcome, {user.name}</h1>
      <p className="page-description">
        Your account is ready. This community dashboard is intentionally limited;
        a Director must assign a staff role before organization management tools are available.
      </p>
      <div className="member-dashboard__note">
        <UsersRound size={20} aria-hidden="true" />
        <span>Thank you for supporting stronger, more compassionate communities.</span>
      </div>
    </section>
  )
}
