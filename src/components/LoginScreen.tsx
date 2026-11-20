/**
 * Soft first-paint gate — immersive navy / emerald (executive).
 * Glass widgets, perspective mesh, Lumen orb, white central card.
 * Soft gate only — no IdP; does not touch the simulate engine.
 */
import { useState, type FormEvent } from 'react'

export interface LoginScreenProps {
  onLoginSuccess?: (email?: string) => void
  /** Demo without login (preferred). */
  onEnterDemo?: () => void
  /** Alias for onEnterDemo — existing App soft-gate wiring. */
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

function MailGlyph({ className }: { className?: string }) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

function LockGlyph({ className }: { className?: string }) {
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
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

function CheckGlyph({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
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

function RingGauge({
  percent,
  label,
  sublabel,
}: {
  percent: number
  label: string
  sublabel: string
}) {
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 60 60">
          <circle
            cx="30"
            cy="30"
            r={radius}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="5"
            fill="none"
          />
          <circle
            cx="30"
            cy="30"
            r={radius}
            stroke="#34d399"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            fill="none"
          />
        </svg>
        <span className="absolute text-xs font-bold text-white tabular-nums">
          {percent}%
        </span>
      </div>
      <span className="text-[11px] font-semibold text-emerald-200">{label}</span>
      <span className="text-[10px] text-slate-300/75">{sublabel}</span>
    </div>
  )
}

function MiniSparkline() {
  return (
    <svg viewBox="0 0 220 72" className="h-16 w-full overflow-visible">
      <defs>
        <linearGradient id="lumenSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d="M 0 54 L 36 42 L 72 48 L 108 26 L 146 33 L 184 14 L 220 22 L 220 72 L 0 72 Z"
        fill="url(#lumenSparkFill)"
      />
      <path
        d="M 0 54 L 36 42 L 72 48 L 108 26 L 146 33 L 184 14 L 220 22"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="184" cy="14" r="4" fill="#a7f3d0" />
    </svg>
  )
}

export function LoginScreen({
  onLoginSuccess,
  onEnterDemo,
  onContinueWithoutLogin,
}: LoginScreenProps) {
  const enterDemo = onEnterDemo ?? onContinueWithoutLogin
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatusMessage(null)

    if (!email.trim()) {
      setStatusMessage('Informe seu e-mail para acessar o Turnocheck.')
      return
    }

    setIsSubmitting(true)
    window.setTimeout(() => {
      setIsSubmitting(false)
      if (onLoginSuccess) {
        onLoginSuccess(email.trim())
      } else if (enterDemo) {
        enterDemo()
      } else {
        setStatusMessage(
          'Ambiente preparado. Conecte seu provedor de autenticação para validar o acesso.',
        )
      }
    }, 350)
  }

  return (
    <div
      className="login-immersive relative flex min-h-screen w-full flex-col justify-between overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(circle at 15% 22%, rgba(16, 185, 129, 0.24), transparent 38%), radial-gradient(circle at 82% 76%, rgba(5, 150, 105, 0.22), transparent 45%), linear-gradient(145deg, #051122 0%, #0B2545 50%, #07332a 100%)',
      }}
    >
      <div
        aria-hidden
        className="login-perspective-mesh pointer-events-none absolute inset-x-0 bottom-0 h-72 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(110, 231, 183, 0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(110, 231, 183, 0.14) 1px, transparent 1px)',
          backgroundSize: '48px 36px',
          transform: 'perspective(650px) rotateX(58deg)',
          transformOrigin: 'bottom',
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 pt-6 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/15 text-emerald-300 shadow-lg">
            <BrandMark />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="login-brand text-base font-bold tracking-tight text-white">
                Turnocheck
              </span>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                AHR Brasil
              </span>
            </div>
            <p className="text-xs text-slate-300/80">
              Simulador de escalas, turnos e impacto operacional
            </p>
          </div>
        </div>

        {enterDemo ? (
          <button
            type="button"
            onClick={enterDemo}
            className="cursor-pointer rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-emerald-200 backdrop-blur-md transition hover:bg-white/15"
            data-testid="login-explorar-simulador"
          >
            Explorar Simulador
          </button>
        ) : null}
      </header>

      <main className="relative z-10 mx-auto my-auto grid w-full max-w-7xl grid-cols-1 items-center gap-8 px-6 py-8 sm:px-10 lg:grid-cols-12">
        {/* Left glass widgets */}
        <div className="hidden flex-col gap-4 lg:col-span-4 lg:flex">
          <div className="space-y-3 rounded-2xl border border-emerald-300/20 bg-[#091d36]/75 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-200">
                <CalendarGlyph className="text-emerald-300" />
                Ritmo · Ciclos
              </span>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 font-semibold text-emerald-200">
                6×1 → 5×2
              </span>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Seg–Sex', bars: [75, 85, 65, 90, 70, 35, 30] },
                { label: 'Turnos', bars: [60, 70, 80, 65, 75, 50, 45] },
              ].map((row, rIdx) => (
                <div
                  key={row.label}
                  className="grid h-12 grid-cols-7 items-end gap-1.5"
                >
                  {row.bars.map((h, idx) => (
                    <div
                      key={`${rIdx}-${idx}`}
                      className="flex h-full w-full items-end overflow-hidden rounded-md bg-white/10 p-0.5"
                    >
                      <div
                        className={`w-full rounded-xs ${
                          idx >= 5 ? 'bg-teal-300/75' : 'bg-emerald-400'
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>
              ))}
              <div className="grid grid-cols-7 gap-1.5 pt-0.5 text-center text-[10px] font-semibold text-slate-300/80">
                {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
                  <span key={`${d}-${i}`}>{d}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/12 bg-[#091d36]/75 p-4 shadow-xl backdrop-blur-xl">
            <div>
              <p className="text-xs font-semibold text-white">Simulação viva</p>
              <p className="mt-0.5 text-[11px] text-slate-300/80">
                Turnos, folgas e impacto em um só olhar.
              </p>
            </div>
            <span className="rounded-lg border border-emerald-300/20 bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-300 tabular-nums">
              12×36 · 5×2
            </span>
          </div>
        </div>

        {/* Central white card */}
        <div className="flex justify-center lg:col-span-4">
          <div className="login-card w-full max-w-md space-y-5 rounded-3xl border border-white/80 bg-white p-7 text-slate-900 shadow-[0_28px_80px_rgba(0,0,0,0.55)] sm:p-8">
            <div className="space-y-1 text-center">
              <div className="mb-1 inline-flex items-center gap-2 rounded-lg bg-[#0B2545] px-3 py-1 text-xs font-bold tracking-wide text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                TURNOCHECK
                <span className="font-normal text-emerald-300">by AHR Brasil</span>
              </div>
              <h1 className="login-brand text-2xl font-bold tracking-tight text-[#0B2545]">
                Bem-vindo ao Turnocheck
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                Planeje escalas e veja o impacto com mais clareza.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  E-mail
                </label>
                <div className="relative">
                  <MailGlyph className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com.br"
                    autoComplete="username"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pr-3.5 pl-10 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-semibold text-slate-700"
                >
                  Senha
                </label>
                <div className="relative">
                  <LockGlyph className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pr-3.5 pl-10 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/30 focus:outline-none"
                  />
                </div>
              </div>

              {statusMessage ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <CheckGlyph className="mt-0.5 shrink-0 text-emerald-600" />
                  <span>{statusMessage}</span>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0B2545] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-60"
                data-testid="login-acesso-consultivo"
              >
                <span>
                  {isSubmitting ? 'Entrando...' : 'Acesso Consultivo'}
                </span>
                <ArrowGlyph />
              </button>
            </form>

            {enterDemo ? (
              <div className="pt-0.5 text-center">
                <button
                  type="button"
                  onClick={enterDemo}
                  className="cursor-pointer text-xs font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800"
                >
                  Explorar Simulador sem login
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right glass widgets + Lumen */}
        <div className="hidden flex-col gap-4 lg:col-span-4 lg:flex">
          <div className="space-y-3 rounded-2xl border border-emerald-300/20 bg-[#091d36]/75 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Cobertura de turno</span>
              <span className="font-semibold text-emerald-300 tabular-nums">
                Custo: R$ 1.250/mês
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <RingGauge label="Cobertura" percent={95} sublabel="Meta turno" />
              <RingGauge label="Transição" percent={50} sublabel="Fase piloto" />
            </div>
          </div>

          <div className="space-y-1 rounded-2xl border border-white/12 bg-[#091d36]/75 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Projeção de carga</span>
              <span className="font-semibold text-emerald-300 tabular-nums">
                +18% eficiência
              </span>
            </div>
            <MiniSparkline />
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <div className="text-right text-xs">
              <p className="font-bold text-emerald-200">Lumen</p>
              <p className="text-[11px] text-slate-300/80">
                Assistente de escala AHR
              </p>
            </div>
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 via-emerald-500 to-teal-700 shadow-[0_0_35px_rgba(52,211,153,0.55)]">
              <div className="flex h-9 w-9 flex-col items-center justify-center gap-1 rounded-full border border-emerald-200/30 bg-[#06182e]">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                </div>
                <span className="h-1 w-3 rounded-full bg-emerald-300/90" />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-5 text-center text-xs text-slate-300/75 sm:px-10">
        AHR Brasil · Simulador de escalas e turnos · Proteção LGPD
      </footer>
    </div>
  )
}
