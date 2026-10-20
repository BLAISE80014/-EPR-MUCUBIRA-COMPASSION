import { useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, HeartHandshake, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { HOME_PATH_BY_ROLE } from '../auth/roleRoutes'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [helpMessage, setHelpMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)

  if (user) return <Navigate to={HOME_PATH_BY_ROLE[user.role] || '/dashboard'} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionLock.current) return
    if (!accountType || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError('Choose your account type and enter a valid email address and password.')
      return
    }
    submissionLock.current = true
    setError('')
    setSubmitting(true)
    try {
      const signedInUser = await login(email.trim(), password, rememberMe, accountType)
      navigate(HOME_PATH_BY_ROLE[signedInUser.role] || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="login-card">
        <div className="auth-card-brand">
          <div className="auth-card-brand__mark"><HeartHandshake size={20} aria-hidden="true" /></div>
          <div><strong>EPR MUCUBIRA</strong><span>COMPASSION</span></div>
        </div>
        <p className="eyebrow">Staff, parent, and community access</p>
        <h1>Welcome Back</h1>
        <p className="login-intro">Use the email address and password you registered with to access your dashboard.</p>

        {error && <p className="form-alert" role="alert">{error}</p>}
        {helpMessage && <p className="auth-notice" role="status">{helpMessage}</p>}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-account-type">Account type</label>
          <div className="auth-input-wrap">
            <UserRound size={18} aria-hidden="true" />
            <select
              id="login-account-type"
              name="accountType"
              value={accountType}
              onChange={(event) => setAccountType(event.target.value)}
              required
              aria-label="Account type"
            >
              <option value="">Choose your account type</option>
              <option value="director">Director</option>
              <option value="accountant">Accountant</option>
              <option value="health_officer">Health Manager</option>
              <option value="communication_officer">Communication Manager</option>
              <option value="savings_group_manager">Savings Group Manager</option>
              <option value="parent">Parent</option>
              <option value="member">Community Member</option>
            </select>
          </div>
          <label htmlFor="login-email">Email Address</label>
          <div className="auth-input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input
              autoComplete="username"
              id="login-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
            />
          </div>
          <label htmlFor="login-password">Password</label>
          <div className="password-field auth-input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              autoComplete="current-password"
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
              required
            />
            <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <div className="login-options">
            <label className="remember-option">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>Remember me</span>
            </label>
            <button className="forgot-link" type="button" onClick={() => setHelpMessage('Password reset is not configured yet. Please contact your Director for help.')}>
              Forgot password?
            </button>
          </div>
          <button className="primary-btn login-submit" type="submit" disabled={submitting}>
            {submitting ? <span className="login-spinner" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
            <span aria-live="polite">{submitting ? 'Signing in…' : 'Sign In'}</span>
          </button>
        </form>
        <p className="auth-links">Don’t have an account? <Link to="/signup">Create one</Link></p>
      </div>
    </AuthLayout>
  )
}
