/**
 * Soft first-paint gate — AHR Brasil Premium Editorial.
 * Immersive navy + emerald mesh; demo without IdP.
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
      width="20"
      height="20"
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
      strokeWidth="1.75"
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
      strokeWidth="1.75"
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
    <div className="login-immersive relative flex min-h-screen flex-col justify-between overflow-hidden px-5 py-7 text-white sm:px-10">
      <div className="login-immersive-mesh pointer-events-none absolute inset-0" aria-hidden />

      {/* Scale hint — left glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-8 hidden w-72 -translate-y-1/2 flex-col gap-3 select-none lg:flex"
      >
        <div className="login-glass scale-[0.98] p-4 opacity-90 transition-transform duration-700">
          <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-white/95">
            <span className="flex items-center gap-1.5">
              <CalendarGlyph className="text-emerald-300" />
              Ritmo de Escala
            </span>
            <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] tracking-wide text-emerald-200">
              6×1 → 5×2
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold">
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, idx) => (
              <div
                key={`${d}-${idx}`}
                className={
                  idx >= 5
                    ? 'rounded-md bg-emerald-400/25 py-1.5 text-emerald-100'
                    : 'rounded-md bg-white/10 py-1.5 text-white/85'
                }
              >
                {d}
              </div>
            ))}
          </div>
        </div>

        <div className="login-glass flex items-center gap-3 p-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/35 bg-emerald-500/20">
            <SparklesGlyph className="text-emerald-200" />
          </div>
          <div className="text-xs leading-snug">
            <p className="font-semibold text-white">Lumen</p>
            <p className="mt-0.5 text-white/65">
              Turnos, folgas e impacto em um só olhar.
            </p>
          </div>
        </div>
      </div>

      {/* Scale hint — right glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[42%] right-8 hidden w-64 translate-y-2 flex-col gap-3 select-none xl:flex"
      >
        <div className="login-glass scale-[0.96] p-4 opacity-80">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-emerald-200/90 uppercase">
            Preview consultivo
          </p>
          <p className="mt-2 text-sm font-medium text-white">
            HC · Folha · Benefícios
          </p>
          <p className="mt-1 text-[11px] text-white/60">
            Dossiê pronto para a reunião — sem PII no export padrão.
          </p>
        </div>
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-green)] text-white shadow-sm">
            <BrandMark />
          </div>
          <div>
            <span className="login-brand block text-base font-semibold tracking-tight text-white">
              Turnocheck
            </span>
            <span className="block text-[11px] text-white/55">
              AHR Brasil · Projeto 6×1
            </span>
          </div>
        </div>

        {onContinueWithoutLogin ? (
          <button
            type="button"
            onClick={onContinueWithoutLogin}
            className="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/95 backdrop-blur-sm transition hover:border-emerald-300/50 hover:bg-white/15"
            data-testid="login-explorar-simulador"
          >
            Explorar Simulador
          </button>
        ) : null}
      </header>

      <main className="relative z-10 my-auto flex justify-center py-10">
        <div className="login-card w-full max-w-sm space-y-5 p-7 sm:p-8">
          <div className="space-y-1.5 text-center">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-green)] uppercase">
              Acesso Consultivo
            </p>
            <h1 className="login-brand text-xl font-semibold text-[var(--color-ink)] sm:text-2xl">
              Bem-vindo ao Turnocheck
            </h1>
            <p className="text-xs leading-relaxed text-[var(--color-muted)]">
              Planeje escalas e veja o impacto com clareza editorial.
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
                className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] transition focus:border-[var(--color-green)] focus:bg-white focus:ring-2 focus:ring-[var(--color-green)]/25 focus:outline-none"
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
                className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-2.5 text-sm text-[var(--color-ink)] transition focus:border-[var(--color-green)] focus:bg-white focus:ring-2 focus:ring-[var(--color-green)]/25 focus:outline-none"
              />
            </div>

            {message ? (
              <p className="rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-ink)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-green)]"
              data-testid="login-acesso-consultivo"
            >
              <span>Acesso Consultivo</span>
              <ArrowGlyph />
            </button>
          </form>

          {onContinueWithoutLogin ? (
            <div className="border-t border-[var(--color-line)] pt-4 text-center">
              <button
                type="button"
                onClick={onContinueWithoutLogin}
                className="text-xs font-medium text-[var(--color-muted)] underline-offset-2 transition hover:text-[var(--color-green)] hover:underline"
              >
                Explorar Simulador sem login
              </button>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl text-center text-[11px] text-white/45">
        AHR Brasil · Simulador consultivo de escalas e turnos · Proteção LGPD
      </footer>
    </div>
  )
}
