import { useTheme } from '../theme/useTheme'

export function FormField({ id, label, required = false, optional = false, hint, error, children }) {
  const { t } = useTheme()
  const describedBy = [
    hint ? `${id}-hint` : null,
    error ? `${id}-error` : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {t(label)}
        {required && <span className="required-mark" aria-hidden="true"> *</span>}
        {optional && <span className="field-optional">{t('Optional')}</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && <span className="form-field__help" id={`${id}-hint`}>{t(hint)}</span>}
      {error && <span className="form-field__error" id={`${id}-error`} role="alert">{t(error)}</span>}
    </div>
  )
}
