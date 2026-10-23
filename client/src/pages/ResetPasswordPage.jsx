import { useRef, useState } from 'react'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { InlineLoading } from '../components/LoadingStates'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/useTheme'

const MAX_PASSWORD_BYTES = 72

export function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const { t } = useTheme()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submissionLock.current) return
    if (!token) {
      setError(t('This password reset link is invalid or has expired. Request a new link.'))
      return
    }
    if (password.length < 12 || password.length > 128 || new TextEncoder().encode(password).byteLength > MAX_PASSWORD_BYTES) {
      setError(t('Use a password of 12–128 characters and no more than 72 UTF-8 bytes.'))
      return
    }
    if (password !== passwordConfirmation) {
      setError(t('Passwords do not match.'))
      return
    }

    submissionLock.current = true
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const response = await resetPassword(token, password, passwordConfirmation)
      setSuccess(t(response.message))
      setPassword('')
      setPasswordConfirmation('')
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
          <div className="auth-card-brand__mark"><LockKeyhole size={20} aria-hidden="true" /></div>
          <div><strong>EPR MUCUBIRA</strong><span>COMPASSION</span></div>
        </div>
        <p className="eyebrow">{t('Account recovery')}</p>
        <h1>{t('Create a new password')}</h1>
        <p className="login-intro">{t('Choose a strong password to secure your account.')}</p>
        {error && <p className="form-alert" role="alert">{error}</p>}
        {success && <p className="auth-notice" role="status">{t(success)}</p>}

        {success ? (
          <p className="auth-links"><Link to="/login">{t('Back to Login')}</Link></p>
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="reset-password">{t('New password')} <span className="auth-required" aria-hidden="true">*</span></label>
            <div className={`auth-input-wrap${error && error.includes('password') ? ' auth-input-wrap--invalid' : ''}`}>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                autoComplete="new-password"
                autoFocus
                id="reset-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                }}
                maxLength={128}
                required
              />
            </div>
            <label htmlFor="reset-password-confirmation">{t('Confirm new password')} <span className="auth-required" aria-hidden="true">*</span></label>
            <div className="auth-input-wrap">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                autoComplete="new-password"
                id="reset-password-confirmation"
                name="passwordConfirmation"
                type="password"
                value={passwordConfirmation}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value)
                  setError('')
                }}
                maxLength={128}
                required
              />
            </div>
            <p className="password-guidance">{t('Use at least 12 characters. Maximum 72 UTF-8 bytes.')}</p>
            <button className="primary-btn login-submit" type="submit" disabled={submitting}>
              {submitting ? <InlineLoading>{t('Saving new password…')}</InlineLoading> : t('Reset Password')}
            </button>
          </form>
        )}
        {!success && <p className="auth-links"><Link to="/forgot-password"><ArrowLeft size={14} aria-hidden="true" />{t('Request a new reset link')}</Link></p>}
      </div>
    </AuthLayout>
  )
}
