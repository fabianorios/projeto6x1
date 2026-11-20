/**
 * Soft first-paint gate — Quiet Chrome / AHR palette.
 * No real IdP: email opens an ephemeral client session; password is UI-only.
 */
import { useState, type FormEvent } from 'react'

export interface LoginScreenProps {
  onLoginSuccess?: (email?: string) => void
  onContinueWithoutLogin?: () => void
}

/** Official 6×1 mark (same path as chrome / favicon). */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M8 22V10h2.4v9.2H16V22H8zm9.2 0V10H19.6v9.2H26V22h-8.8z"
      />
    </svg>
  )
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </svg>
  )
}

function SparklesGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13z" />
    </svg>
  )
}

function ArrowGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function LoginScreen({
  onLoginSuccess,
  onContinueWithoutLogin,
}: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setMessage('Informe seu e-mail para prosseguir.')
      return
    }
    if (onLoginSuccess) {
      onLoginSuccess(email.trim())
    } else {
      setMessage('Acesso pronto para integração com o provedor da AHR Brasil.')
    }
  }

  return (
    <div
      className="relative flex min-h-screen flex-col justify-between overflow-hidden px-5 py-7 sm:px-10"
      style={{
        color: 'var(--color-ink)',
        background:
          'radial-gradient(circle at 12% 18%, rgba(31, 107, 74, 0.12), transparent 42%), radial-gradient(circle at 88% 82%, rgba(11, 37, 69, 0.12), transparent 45%), linear-gradient(180deg, #f4f8fb 0%, #eaf2f8 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-10 hidden w-72 -translate-y-1/2 flex-col gap-3 opacity-85 select-none lg:flex"
      >
        <div className="rounded-2xl border border-[var(--color-line)] bg-white/80 p-4 shadow-xs backdrop-blur-md">
          <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-[var(--color-ink)]">
            <span className="flex items-center gap-1.5">
              <CalendarGlyph className="text-[var(--color-green)]" />
              Ritmo de Escala
            </span>
            <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[var(--color-green)]">
              6×1 → 5×2
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold">
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, idx) => (
              <div
                key={`${d}-${idx}`}
                className={
                  idx >= 5
                    ? 'rounded-lg bg-[var(--color-accent-soft)] py-1.5 text-[var(--color-green)]'
                    : 'rounded-lg bg-[var(--color-ink)]/8 py-1.5 text-[var(--color-ink)]'
                }
              >
                {d}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-ink)] p-3.5 text-white shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/20">
            <SparklesGlyph className="text-emerald-300" />
          </div>
          <div className="text-xs leading-snug">
            <p className="font-semibold text-white">Simulação viva</p>
            <p className="mt-0.5 text-slate-300">
              Turnos, folgas e impacto em um só olhar.
            </p>
          </div>
        </div>
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="app-chrome-mark flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-xs">
            <BrandMark />
          </div>
          <div>
            <span className="block text-sm font-bold tracking-tight text-[var(--color-ink)]">
              Turnocheck
            </span>
            <span className="block text-[11px] text-[var(--color-muted)]">
              AHR Brasil
            </span>
          </div>
        </div>

        {onContinueWithoutLogin ? (
          <button
            type="button"
            onClick={onContinueWithoutLogin}
            className="cursor-pointer rounded-full border border-[var(--color-line)] bg-white/80 px-3.5 py-2 text-xs font-semibold text-[var(--color-ink)] transition hover:bg-white hover:text-[var(--color-green)]"
          >
            Entrar sem login
          </button>
        ) : null}
      </header>

      <main className="relative z-10 my-auto flex justify-center py-8">
        <div className="w-full max-w-sm space-y-5 rounded-3xl border border-[var(--color-line)] bg-white/95 p-7 shadow-md backdrop-blur-sm">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-bold text-[var(--color-ink)]">
              Bem-vindo ao Turnocheck
            </h1>
            <p className="text-xs text-[var(--color-muted)]">
              Planeje escalas e veja o impacto com mais clareza.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
                autoComplete="username"
                className="w-full rounded-xl border border-[var(--color-line)] bg-slate-50/60 px-3.5 py-2.5 text-sm transition focus:border-[var(--color-green)] focus:bg-white focus:ring-2 focus:ring-[var(--color-green)]/30 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-[var(--color-line)] bg-slate-50/60 px-3.5 py-2.5 text-sm transition focus:border-[var(--color-green)] focus:bg-white focus:ring-2 focus:ring-[var(--color-green)]/30 focus:outline-none"
              />
            </div>

            {message ? (
              <p className="rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--color-ink)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-green)]"
            >
              <span>Acessar</span>
              <ArrowGlyph />
            </button>
          </form>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl text-center text-[11px] text-[var(--color-muted)]">
        AHR Brasil · Simulador de escalas e turnos
      </footer>
    </div>
  )
}
