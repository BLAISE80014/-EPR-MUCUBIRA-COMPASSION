import '../pages/LoginPage.css'
import { ChevronDown, Globe2, Heart, HeartHandshake, ShieldCheck, TrendingUp, UsersRound } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

const VALUES = [
  { label: 'Community\nDevelopment', icon: UsersRound },
  { label: 'Transparency\n& Trust', icon: ShieldCheck },
  { label: 'Sustainable\nImpact', icon: TrendingUp },
  { label: 'Compassion\nin Action', icon: Heart },
]

export function AuthLayout({ children, contentClassName = '' }) {
  return (
    <main className="login-page">
      <section className="login-aside" aria-label="EPR Mucubira Compassion">
        <div className="auth-background-shape auth-background-shape--one" aria-hidden="true" />
        <div className="auth-background-shape auth-background-shape--two" aria-hidden="true" />
        <header className="login-brand">
          <div className="brand-mark"><HeartHandshake size={25} aria-hidden="true" /></div>
          <div className="login-brand__text">
            <strong>EPR MUCUBIRA</strong>
            <span>COMPASSION</span>
            <small>Managing Resources. Empowering Communities.</small>
          </div>
        </header>

        <div className="login-aside-message">
          <p className="eyebrow">Together, we make a difference</p>
          <h2>Together for a<br />Better <span>Tomorrow</span></h2>
          <p>We believe in the power of people, resources and collaboration to create lasting change in our communities.</p>
        </div>

        <div className="auth-values" aria-label="Our values">
          {VALUES.map(({ label, icon: Icon }) => (
            <div className="auth-value" key={label}>
              <span className="auth-value__icon"><Icon size={19} aria-hidden="true" /></span>
              <span>{label.split('\n').map((line) => <span key={line}>{line}</span>)}</span>
            </div>
          ))}
        </div>

        <div className="community-landscape" role="img" aria-label="Illustration of a community standing together above a green landscape">
          <svg viewBox="0 0 900 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="landscape-sky" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#b8dff3" />
                <stop offset="1" stopColor="#b8e7db" />
              </linearGradient>
              <linearGradient id="landscape-hill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#78b7a0" />
                <stop offset="1" stopColor="#4d8f80" />
              </linearGradient>
              <linearGradient id="landscape-shade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="1" stopColor="#ffffff" stopOpacity=".42" />
              </linearGradient>
            </defs>
            <rect width="900" height="340" fill="url(#landscape-sky)" />
            <circle cx="704" cy="86" r="39" fill="#e4c987" opacity=".72" />
            <path d="M0 206 126 120l92 77 138-123 164 139 114-99 266 100v126H0Z" fill="#84aeb1" opacity=".55" />
            <path d="m0 236 151-82 127 97 150-122 140 109 156-103 176 84v121H0Z" fill="url(#landscape-hill)" />
            <path d="M0 271c131-58 242-39 349 2 129 49 230-37 340-24 83 10 142 55 211 61v30H0Z" fill="#468274" />
            <g opacity=".98">
              <g transform="translate(205 162)"><circle cy="21" r="13" fill="#a96f4f" /><path d="M-18 47q18-18 36 0v53h-36Z" fill="#ecbf73" /><path d="M-12 99h10v43h-10Zm15 0h10v43H3Z" fill="#142e43" /></g>
              <g transform="translate(300 145)"><circle cy="21" r="14" fill="#714630" /><path d="M-20 48q20-20 40 0v59h-40Z" fill="#bd6470" /><path d="M-13 105h11v43h-11Zm16 0h11v43H3Z" fill="#17334a" /></g>
              <g transform="translate(402 133)"><circle cy="21" r="15" fill="#8d583a" /><path d="M-21 50q21-21 42 0v62h-42Z" fill="#e8e0bd" /><path d="M-14 110h11v43h-11Zm17 0h11v43H3Z" fill="#243d50" /></g>
              <g transform="translate(510 147)"><circle cy="21" r="14" fill="#5c392a" /><path d="M-20 48q20-20 40 0v59h-40Z" fill="#57928a" /><path d="M-13 105h11v43h-11Zm16 0h11v43H3Z" fill="#122e45" /></g>
              <g transform="translate(606 164)"><circle cy="21" r="13" fill="#aa7452" /><path d="M-18 47q18-18 36 0v53h-36Z" fill="#dca755" /><path d="M-12 99h10v43h-10Zm15 0h10v43H3Z" fill="#17334a" /></g>
            </g>
            <rect width="900" height="340" fill="url(#landscape-shade)" />
          </svg>
          <div className="community-landscape__caption">
            <span>Stronger Communities</span>
            <strong>Brighter Futures</strong>
            <i aria-hidden="true" />
          </div>
        </div>
      </section>

      <section className={`login-content ${contentClassName}`}>
        <div className="auth-topbar">
          <ThemeToggle />
          <label className="language-selector">
            <Globe2 size={16} aria-hidden="true" />
            <select aria-label="Language">
              <option value="en">EN</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
        {children}
      </section>
    </main>
  )
}
