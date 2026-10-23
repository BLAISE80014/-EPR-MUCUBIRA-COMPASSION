import { useRef, useState } from 'react'
import { Eye, EyeOff, HeartHandshake, LockKeyhole, Mail, Phone, UserPlus, UserRound, UsersRound } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { HOME_PATH_BY_ROLE } from '../auth/roleRoutes'
import { useAuth } from '../auth/AuthContext'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordStrength(password) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 14) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

export function SignupPage() {
  const { user, register } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirmation: '',
    termsAccepted: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submissionLock = useRef(false)

  if (user) return <Navigate to={HOME_PATH_BY_ROLE[user.role] || '/dashboard'} replace />

  const strength = passwordStrength(form.password)
  const strengthLabel = ['Not set', 'Weak', 'Fair', 'Good', 'Strong'][strength]

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const nextErrors = {}
    if (form.name.trim().length < 2 || form.name.trim().length > 120) {
      nextErrors.name = 'Enter a name between 2 and 120 characters.'
    }
    if (!EMAIL_PATTERN.test(form.email.trim()) || form.email.trim().length > 254) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (form.phone.trim() && !/^[+()\d\s.-]{7,32}$/.test(form.phone.trim())) {
      nextErrors.phone = 'Enter a valid phone number or leave this field blank.'
    }
    if (form.password.length < 1 || form.password.length > 128 || new TextEncoder().encode(form.password).byteLength > 72) {
      nextErrors.password = 'Enter a password of up to 128 characters and no more than 72 UTF-8 bytes.'
    }
    if (form.password !== form.passwordConfirmation) {
      nextErrors.passwordConfirmation = 'The passwords do not match.'
    }
    if (!form.termsAccepted) {
      nextErrors.termsAccepted = 'Please confirm the account and access terms.'
    }

    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    if (submissionLock.current) return
    submissionLock.current = true
    setSubmitting(true)
    try {
      const response = await register({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      })
      setSuccess(response.message)
      setForm((current) => ({
        ...current,
        password: '',
        passwordConfirmation: '',
        termsAccepted: false,
      }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout contentClassName="login-content--signup">
      <div className="login-card signup-card">
        <div className="auth-card-brand">
          <div className="auth-card-brand__mark"><HeartHandshake size={20} aria-hidden="true" /></div>
          <div><strong>EPR MUCUBIRA</strong><span>COMPASSION</span></div>
        </div>
        <p className="eyebrow">Request secure access</p>
        <h1>Create your account</h1>
        <p className="login-intro">Create your own email and password, then use those same credentials each time you sign in.</p>

        {error && <p className="form-alert" role="alert">{error}</p>}
        {success && <p className="auth-notice" role="status">{success}</p>}

        <form className="login-form signup-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="signup-account-type">Account type</label>
          <div className="auth-input-wrap signup-input-wrap">
            <UsersRound size={18} aria-hidden="true" />
            <select id="signup-account-type" value="parent" disabled aria-label="Account type">
              <option value="parent">Parent</option>
            </select>
          </div>
          <p className="role-guidance">Staff accounts are created by a Director.</p>

          <label htmlFor="signup-name">Full name <span className="auth-required" aria-hidden="true">*</span></label>
          <div className="auth-input-wrap signup-input-wrap">
            <UserRound size={18} aria-hidden="true" />
            <input
              autoComplete="name"
              id="signup-name"
              name="name"
              placeholder="Your full name"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              minLength={2}
              maxLength={120}
              required
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'signup-name-error' : undefined}
            />
          </div>
          {errors.name && <span className="auth-field-error" id="signup-name-error">{errors.name}</span>}

          <label htmlFor="signup-email">Email address <span className="auth-required" aria-hidden="true">*</span></label>
          <div className="auth-input-wrap signup-input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input
              autoComplete="email"
              id="signup-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              maxLength={254}
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'signup-email-error' : undefined}
            />
          </div>
          {errors.email && <span className="auth-field-error" id="signup-email-error">{errors.email}</span>}

          <label htmlFor="signup-phone">Phone number <span className="field-optional">Optional</span></label>
          <div className="auth-input-wrap signup-input-wrap">
            <Phone size={18} aria-hidden="true" />
            <input
              autoComplete="tel"
              id="signup-phone"
              name="phone"
              type="tel"
              placeholder="Optional"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              maxLength={32}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'signup-phone-error' : undefined}
            />
          </div>
          {errors.phone && <span className="auth-field-error" id="signup-phone-error">{errors.phone}</span>}

          <label htmlFor="signup-password">Password <span className="auth-required" aria-hidden="true">*</span></label>
          <div className="password-field auth-input-wrap signup-input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              autoComplete="new-password"
              id="signup-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Choose a password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              maxLength={128}
              required
              aria-invalid={Boolean(errors.password)}
              aria-describedby={`signup-password-strength${errors.password ? ' signup-password-error' : ''}`}
            />
            <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {errors.password && <span className="auth-field-error" id="signup-password-error">{errors.password}</span>}
          <div className="password-strength" id="signup-password-strength" aria-live="polite">
            <span className="strength-track" aria-hidden="true"><span className={`strength-fill strength-${strength}`} /></span>
            <span>Password strength: {strengthLabel}</span>
          </div>
          <p className="password-guidance">Choose your own password. Maximum 72 UTF-8 bytes.</p>

          <label htmlFor="signup-confirm-password">Confirm password <span className="auth-required" aria-hidden="true">*</span></label>
          <div className="password-field auth-input-wrap signup-input-wrap">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              autoComplete="new-password"
              id="signup-confirm-password"
              name="passwordConfirmation"
              type={showConfirmation ? 'text' : 'password'}
              value={form.passwordConfirmation}
              onChange={(event) => updateField('passwordConfirmation', event.target.value)}
              maxLength={128}
              required
              aria-invalid={Boolean(errors.passwordConfirmation)}
              aria-describedby={errors.passwordConfirmation ? 'signup-confirm-error' : undefined}
            />
            <button className="password-toggle" type="button" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} aria-pressed={showConfirmation}>
              {showConfirmation ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {errors.passwordConfirmation && <span className="auth-field-error" id="signup-confirm-error">{errors.passwordConfirmation}</span>}

          <label className="terms-consent">
            <input
              type="checkbox"
              checked={form.termsAccepted}
              onChange={(event) => updateField('termsAccepted', event.target.checked)}
              aria-invalid={Boolean(errors.termsAccepted)}
              aria-describedby={errors.termsAccepted ? 'signup-terms-error' : undefined}
            />
            <span>I agree to the organization’s terms and privacy policy, and understand that new accounts have limited parent access.</span>
          </label>
          {errors.termsAccepted && <span className="auth-field-error" id="signup-terms-error">{errors.termsAccepted}</span>}

          <button className="primary-btn login-submit" type="submit" disabled={submitting}>
            <UserPlus size={16} aria-hidden="true" />
            <span aria-live="polite">{submitting ? 'Submitting request…' : 'Create account'}</span>
          </button>
        </form>

        <p className="auth-links">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </AuthLayout>
  )
}
