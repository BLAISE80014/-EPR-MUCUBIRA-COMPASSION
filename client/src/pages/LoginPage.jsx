import { useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, HeartHandshake, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { HOME_PATH_BY_ROLE } from '../auth/roleRoutes'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/useTheme'

export function LoginPage() {
  const { user, login } = useAuth()
  const { t } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [helpMessage, setHelpMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)

  if (user) return <Navigate to={HOME_PATH_BY_ROLE[user.role] || '/dashboard'} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionLock.current) return
    const errors = {}
    if (!accountType) errors.accountType = t('Choose your account type.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = t('Enter a valid email address.')
    if (!password) errors.password = t('Enter your password.')
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      setError('')
      return
    }
    submissionLock.current = true
    setFieldErrors({})
    setError('')
    setSubmitting(true)
    try {
      const signedInUser = await login(email.trim(), password, rememberMe, accountType)
      navigate(HOME_PATH_BY_ROLE[signedInUser.role] || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(t(requestError.message))
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
        <p className="eyebrow">{t('Staff, parent, and community access')}</p>
        <h1>{t('Welcome Back')}</h1>
        <p className="login-intro">{t('Use the email address and password you registered with to access your dashboard.')}</p>

        {error && <p className="form-alert" role="alert">{error}</p>}
        {helpMessage && <p className="auth-notice" role="status">{helpMessage}</p>}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-account-type">{t('Account type')} <span className="auth-required" aria-hidden="true">*</span></label>
          <div className={`auth-input-wrap${fieldErrors.accountType ? ' auth-input-wrap--invalid' : ''}`}>
            <UserRound size={18} aria-hidden="true" />
            <select
              id="login-account-type"
              name="accountType"
              value={accountType}
              onChange={(event) => {
                setAccountType(event.target.value)
                setFieldErrors((old) => ({ ...old, accountType: '' }))
              }}
              required
              aria-label={t('Account type')}
              aria-invalid={Boolean(fieldErrors.accountType)}
              aria-describedby={fieldErrors.accountType ? 'login-account-type-error' : undefined}
            >
              <option value="">{t('Choose your account type')}</option>
              <option value="director">{t('Director')}</option>
              <option value="accountant">{t('Accountant')}</option>
              <option value="health_officer">{t('Health Manager')}</option>
              <option value="communication_officer">{t('Communication Manager')}</option>
              <option value="savings_group_manager">{t('Savings Group Manager')}</option>
              <option value="parent">{t('Parent')}</option>
              <option value="member">{t('Community Member')}</option>
            </select>
          </div>
          {fieldErrors.accountType && <span className="form-field__error" id="login-account-type-error" role="alert">{fieldErrors.accountType}</span>}
          <label htmlFor="login-email">{t('Email address')} <span className="auth-required" aria-hidden="true">*</span></label>
          <div className={`auth-input-wrap${fieldErrors.email ? ' auth-input-wrap--invalid' : ''}`}>
            <Mail size={18} aria-hidden="true" />
            <input
              autoComplete="username"
              id="login-email"
              name="email"
              type="email"
              placeholder={t('you@example.com')}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setFieldErrors((old) => ({ ...old, email: '' }))
              }}
              maxLength={254}
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            />
          </div>
          {fieldErrors.email && <span className="form-field__error" id="login-email-error" role="alert">{fieldErrors.email}</span>}
          <label htmlFor="login-password">{t('Password')} <span className="auth-required" aria-hidden="true">*</span></label>
          <div className={`password-field auth-input-wrap${fieldErrors.password ? ' auth-input-wrap--invalid' : ''}`}>
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              autoComplete="current-password"
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('Enter your password')}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setFieldErrors((old) => ({ ...old, password: '' }))
              }}
              maxLength={128}
              required
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            />
            <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={t(showPassword ? 'Hide password' : 'Show password')} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {fieldErrors.password && <span className="form-field__error" id="login-password-error" role="alert">{fieldErrors.password}</span>}
          <div className="login-options">
            <label className="remember-option">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>{t('Remember me')}</span>
            </label>
            <button className="forgot-link" type="button" onClick={() => setHelpMessage(t('Password reset is not configured yet. Please contact your Director for help.'))}>
              {t('Forgot password?')}
            </button>
          </div>
          <button className="primary-btn login-submit" type="submit" disabled={submitting}>
            {submitting ? <span className="login-spinner" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
            <span aria-live="polite">{submitting ? t('Signing in…') : t('Sign In')}</span>
          </button>
        </form>
        <p className="auth-links">{t('Don’t have an account?')} <Link to="/signup">{t('Create one')}</Link></p>
      </div>
    </AuthLayout>
  )
}
