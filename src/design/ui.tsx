import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import s from './ui.module.css'

export { s as ui }

type Variant = 'default' | 'primary' | 'danger' | 'ghost'

export function Button({
  variant = 'default',
  small,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  const classes = [s.button, variant !== 'default' && s[variant], small && s.small, className].filter(Boolean).join(' ')
  return <button type="button" className={classes} {...rest} />
}

/** A button that asks "Sure?" in place instead of a browser dialog. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  variant = 'danger',
  small,
  disabled,
}: {
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  variant?: Variant
  small?: boolean
  disabled?: boolean
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant={variant === 'danger' ? 'default' : variant} small={small} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </Button>
    )
  }
  return (
    <span className={s.actions}>
      <Button
        variant={variant}
        small={small}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" small={small} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  )
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.card}>
      {(title || actions) && (
        <div className={s.cardHeader}>
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={s.pageHeader}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </header>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export type Tone = 'neutral' | 'info' | 'warn' | 'danger' | 'ok'

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={[s.badge, tone !== 'neutral' && s[`badge_${tone}`]].filter(Boolean).join(' ')} title={title}>
      {children}
    </span>
  )
}

export function Notice({ tone = 'neutral', children }: { tone?: Exclude<Tone, 'info'>; children: ReactNode }) {
  return (
    <div className={[s.notice, tone !== 'neutral' && s[`notice_${tone}`]].filter(Boolean).join(' ')} role={tone === 'danger' ? 'alert' : undefined}>
      {children}
    </div>
  )
}
