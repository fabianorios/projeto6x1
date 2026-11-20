/**
 * Soft first-paint gate — pixel-faithful to media/login-reference-exact.png.
 * Glass widgets, neon topo mesh, Lumen orb, white chrome card.
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

const DAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const

/** Official 6×1 mark (same path as chrome / favicon). */
function BrandMark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
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
      width="14"
      height="14"
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
    </svg>
  )
}

function SparkGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
    </svg>
  )
}

function RingGauge({ percent, glowId }: { percent: number; glowId: string }) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="login-gauge">
      <svg className="login-gauge-svg" viewBox="0 0 72 72" aria-hidden>
        <defs>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="36"
          cy="36"
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="5"
          fill="none"
        />
        <circle
          cx="36"
          cy="36"
          r={radius}
          stroke="#3dff9a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          filter={`url(#${glowId})`}
        />
      </svg>
      <span className="login-gauge-value tabular-nums">{percent}%</span>
    </div>
  )
}

/** Irregular neon topographic wireframe — lower stage. */
function NeonMesh() {
  const rows = [160, 195, 230, 265, 300, 340, 385, 435, 490]
  const cols = [40, 140, 240, 340, 440, 540, 650, 760, 870, 980, 1090, 1200, 1310, 1420]

  function rowY(base: number, x: number) {
    const valley = Math.pow((x - 720) / 520, 2) * 55
    const wave = Math.sin(x / 95) * 10 + Math.cos(x / 140) * 7
    return base + valley + wave
  }

  const rowPaths = rows.map((base) => {
    const pts = cols.map((x) => `${x} ${rowY(base, x).toFixed(1)}`)
    return `M ${pts.join(' L ')}`
  })

  const colPaths = cols.map((x, i) => {
    const pts = rows.map((base) => `${x + (i % 2 === 0 ? 0 : 6)} ${rowY(base, x).toFixed(1)}`)
    return `M ${pts.join(' L ')}`
  })

  const nodes: Array<[number, number]> = []
  rows.forEach((base, ri) => {
    cols.forEach((x, ci) => {
      if ((ri + ci) % 2 === 0) nodes.push([x, rowY(base, x)])
    })
  })

  return (
    <svg
      className="login-neon-mesh"
      viewBox="0 0 1440 560"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="meshFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#69e3b0" stopOpacity="0" />
          <stop offset="18%" stopColor="#69e3b0" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#4af2a1" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#69e3b0" stopOpacity="0.12" />
        </linearGradient>
        <filter id="meshGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g
        fill="none"
        stroke="url(#meshFade)"
        strokeWidth="1.25"
        filter="url(#meshGlow)"
      >
        {rowPaths.map((d, i) => (
          <path key={`r-${i}`} d={d} />
        ))}
        {colPaths.map((d, i) => (
          <path key={`c-${i}`} d={d} />
        ))}
        <path d="M60 250 L200 290 L340 255 L500 320 L660 270 L820 330 L980 275 L1140 315 L1300 260 L1440 290" />
        <path d="M80 320 L230 370 L390 335 L560 410 L730 360 L900 430 L1070 375 L1240 420 L1400 380" />
        <path d="M100 390 L260 450 L430 410 L600 490 L780 440 L960 515 L1130 460 L1310 500" />
      </g>
      <g fill="#9fffd4">
        {nodes.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={i % 5 === 0 ? 2.4 : 1.35}
            opacity={0.35 + (i % 4) * 0.12}
          />
        ))}
      </g>
    </svg>
  )
}

function LumenOrb() {
  const particles = [
    { t: '8%', r: '12%', s: 6, o: 0.85 },
    { t: '18%', r: '28%', s: 3, o: 0.7 },
    { t: '2%', r: '38%', s: 4, o: 0.55 },
    { t: '28%', r: '8%', s: 5, o: 0.75 },
    { t: '35%', r: '42%', s: 2.5, o: 0.6 },
    { t: '42%', r: '18%', s: 7, o: 0.45 },
    { t: '52%', r: '32%', s: 3.5, o: 0.7 },
    { t: '12%', r: '55%', s: 4.5, o: 0.5 },
    { t: '60%', r: '5%', s: 3, o: 0.65 },
    { t: '68%', r: '48%', s: 5, o: 0.4 },
    { t: '22%', r: '-5%', s: 2.5, o: 0.8 },
    { t: '-4%', r: '22%', s: 3, o: 0.55 },
    { t: '48%', r: '-8%', s: 4, o: 0.5 },
  ]

  return (
    <div className="login-lumen" aria-hidden>
      <div className="login-lumen-glow" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="login-lumen-particle"
          style={{
            top: p.t,
            right: p.r,
            width: p.s,
            height: p.s,
            opacity: p.o,
            animationDelay: `${i * 0.35}s`,
          }}
        />
      ))}
      <div className="login-lumen-orb">
        <div className="login-lumen-face">
          <span className="login-lumen-eye" />
          <span className="login-lumen-eye" />
          <span className="login-lumen-smile" />
        </div>
      </div>
    </div>
  )
}

function ScheduleWidget() {
  const bars = [
    { h: 28, float: false },
    { h: 42, float: false },
    { h: 38, float: true, top: 18 },
    { h: 48, float: true, top: 36 },
    { h: 55, float: false },
    { h: 32, float: false },
    { h: 22, float: false },
  ]

  return (
    <div className="login-glass login-w-schedule">
      <div className="login-glass-title">
        <CalendarGlyph />
        <span>Schedule</span>
      </div>
      <div className="login-schedule-bars">
        {bars.map((b, i) => (
          <div key={i} className="login-schedule-col">
            <div className="login-schedule-track">
              <span
                className="login-schedule-fill"
                style={
                  b.float
                    ? { height: `${b.h}%`, top: `${b.top}%`, bottom: 'auto' }
                    : { height: `${b.h}%` }
                }
              />
            </div>
            <span className="login-day-label">{DAYS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RitmoWidget() {
  return (
    <div className="login-glass login-w-ritmo">
      <div className="login-glass-title row">
        <span className="inline-flex items-center gap-1.5">
          <CalendarGlyph className="text-emerald-300" />
          Ritmo de Escala
        </span>
        <span className="login-pill">6x1 - 5x2</span>
      </div>
      <div className="login-ritmo-days">
        {DAYS.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className={`login-ritmo-day${i === 3 ? ' is-active' : ''}`}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

function SimulacaoWidget() {
  return (
    <div className="login-glass login-w-simulacao">
      <div className="flex items-start gap-2.5">
        <span className="login-simulacao-icon">
          <SparkGlyph />
        </span>
        <div>
          <p className="text-[12px] font-semibold text-white">Simulação viva</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/65">
            Turnos, folgas e impacto em um só olhar.
          </p>
        </div>
      </div>
    </div>
  )
}

function ShiftCoverageWidget() {
  return (
    <div className="login-glass login-w-shift">
      <p className="login-glass-title">Shift coverage</p>
      <div className="login-shift-gauges">
        <div className="login-shift-gauge-card">
          <RingGauge percent={95} glowId="loginGaugeGlow95" />
          <span className="login-shift-gauge-label">Scheduled coverage</span>
        </div>
        <div className="login-shift-gauge-card">
          <RingGauge percent={50} glowId="loginGaugeGlow50" />
          <span className="login-shift-gauge-label">Coverage</span>
        </div>
      </div>
      <div className="login-shift-stats">
        <span>
          Shift Coverage <strong className="tabular-nums">0</strong>
        </span>
        <span>
          Shift Cost <strong className="tabular-nums">1.250</strong>
        </span>
      </div>
    </div>
  )
}

function LightDataWidget({
  variant,
}: {
  variant: 'right' | 'depth'
}) {
  return (
    <div
      className={`login-glass login-w-light${variant === 'depth' ? ' is-depth' : ''}`}
    >
      <p className="login-glass-title">Light data</p>
      <svg viewBox="0 0 180 88" className="login-light-svg" aria-hidden>
        <defs>
          <linearGradient id={`lightFill-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3dff9a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3dff9a" stopOpacity="0" />
          </linearGradient>
          <filter
            id={`lightGlow-${variant}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[20, 40, 60, 80].map((y) => (
          <line
            key={y}
            x1="18"
            x2="172"
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}
        <path
          d="M18 70 C40 62 55 48 72 52 C90 56 102 28 120 34 C138 40 152 22 172 28"
          fill="none"
          stroke="#5eead4"
          strokeWidth="1.4"
          opacity="0.55"
        />
        <path
          d="M18 58 C38 50 52 66 70 44 C88 22 104 38 122 30 C140 22 156 40 172 18 L172 88 L18 88 Z"
          fill={`url(#lightFill-${variant})`}
        />
        <path
          d="M18 58 C38 50 52 66 70 44 C88 22 104 38 122 30 C140 22 156 40 172 18"
          fill="none"
          stroke="#3dff9a"
          strokeWidth="2"
          strokeLinecap="round"
          filter={`url(#lightGlow-${variant})`}
        />
      </svg>
    </div>
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatusMessage(null)

    if (!email.trim()) {
      setStatusMessage('Informe seu e-mail para acessar o Turnocheck.')
      return
    }

    if (onLoginSuccess) {
      onLoginSuccess(email.trim())
    } else if (enterDemo) {
      enterDemo()
    } else {
      setStatusMessage(
        'Ambiente preparado. Conecte seu provedor de autenticação para validar o acesso.',
      )
    }
  }

  return (
    <div className="login-exact">
      <div className="login-exact-atmosphere" aria-hidden />
      <NeonMesh />

      {/* Floating glass stage */}
      <div className="login-stage" aria-hidden>
        <ScheduleWidget />
        <RitmoWidget />
        <SimulacaoWidget />
        <ShiftCoverageWidget />
        <LightDataWidget variant="right" />
        <LightDataWidget variant="depth" />
        <LumenOrb />
      </div>

      <header className="login-exact-header">
        <div className="login-exact-brand">
          <div className="login-mark">
            <BrandMark size={18} />
          </div>
          <div>
            <p className="login-exact-brand-name">Turnocheck</p>
            <p className="login-exact-brand-by">by AHR Brasil</p>
          </div>
        </div>

        {enterDemo ? (
          <button
            type="button"
            onClick={enterDemo}
            className="login-ghost-btn"
            data-testid="login-explorar-simulador"
          >
            Entrar sem login
          </button>
        ) : null}
      </header>

      <main className="login-exact-main">
        <div className="login-card-chrome">
          <div className="login-card-inner">
            <div className="login-card-brand">
              <div className="login-mark login-mark-lg">
                <BrandMark size={22} />
              </div>
              <div>
                <p className="login-card-wordmark">TURNOCHECK</p>
                <p className="login-card-byline">by AHR Brasil</p>
              </div>
            </div>

            <h1 className="login-card-title">Bem-vindo ao Turnocheck</h1>
            <p className="login-card-sub">
              Planeje escalas e veja o impacto com mais clareza.
            </p>

            <form onSubmit={handleSubmit} className="login-card-form">
              <div>
                <label htmlFor="login-email" className="login-field-label">
                  E-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  autoComplete="username"
                  className="login-field"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="login-field-label">
                  Senha
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="login-field"
                />
              </div>

              {statusMessage ? (
                <p className="login-status">{statusMessage}</p>
              ) : null}

              <button
                type="submit"
                className="login-submit"
                data-testid="login-acesso-consultivo"
              >
                Acessar →
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="login-exact-footer">
        AHR Brasil - Simulador de escalas e turnos
      </footer>
    </div>
  )
}
