import { useRef, useState } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { InlineLoading } from '../components/LoadingStates'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/useTheme'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUCCESS_MESSAGE = 'If an account exists with this email, password reset instructions will be sent shortly.'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const { t } = useTheme()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionLock.current) return
    const normalizedEmail = email.trim()
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
      setError(t('Enter a valid email address.'))
      setSuccess('')
      return
    }

    submissionLock.current = true
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const response = await requestPasswordReset(normalizedEmail)
      setSuccess(t(response.message || SUCCESS_MESSAGE))
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
          <div className="auth-card-brand__mark"><Mail size={20} aria-hidden="true" /></div>
          <div><strong>EPR MUCUBIRA</strong><span>COMPASSION</span></div>
        </div>
        <p className="eyebrow">{t('Account recovery')}</p>
        <h1>{t('Forgot Password?')}</h1>
        <p className="login-intro">
          {t("Don't worry! Enter your registered email address, and we'll send you instructions to reset your password.")}
        </p>

        {error && <p className="form-alert" role="alert">{error}</p>}
        {success && <p className="auth-notice" role="status">{t(success)}</p>}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="forgot-email">{t('Email address')} <span className="auth-required" aria-hidden="true">*</span></label>
          <div className={`auth-input-wrap${error ? ' auth-input-wrap--invalid' : ''}`}>
            <Mail size={18} aria-hidden="true" />
            <input
              autoComplete="email"
              autoFocus
              id="forgot-email"
              name="email"
              type="email"
              placeholder={t('you@example.com')}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
                setSuccess('')
              }}
              maxLength={254}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'forgot-email-error' : undefined}
            />
          </div>
          {error && <span className="auth-field-error" id="forgot-email-error">{error}</span>}
          <button className="primary-btn login-submit" type="submit" disabled={submitting}>
            {submitting ? <InlineLoading>{t('Sending reset link…')}</InlineLoading> : t('Send Reset Link')}
          </button>
        </form>
        <p className="auth-links"><Link to="/login"><ArrowLeft size={14} aria-hidden="true" />{t('Back to Login')}</Link></p>
      </div>
    </AuthLayout>
  )
}
