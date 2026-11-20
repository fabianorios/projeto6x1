/**
 * Soft first-paint gate — pixel-exact to media/login-reference-exact.png.
 * Aspect-locked stage uses the reference art for the full scene (mesh, glass
 * widgets, Lumen, brand, painted card chrome). Interactive hits overlay the
 * painted e-mail/senha/Acessar regions + Entrar sem login.
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
      <div className="login-stage-frame">
        <img
          className="login-stage-photo"
          src="/login/stage-reference.png"
          alt=""
          draggable={false}
          width={1024}
          height={572}
        />

        {enterDemo ? (
          <button
            type="button"
            onClick={enterDemo}
            className="login-ghost-hit"
            data-testid="login-explorar-simulador"
          >
            Entrar sem login
          </button>
        ) : null}

        {/* Hits aligned to painted white card (384,156 → 738,422 on 1024×572). */}
        <form className="login-card-hit" onSubmit={handleSubmit}>
          <label htmlFor="login-email" className="login-sr-only">
            E-mail
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
            autoComplete="username"
            className="login-hit-email"
          />

          <label htmlFor="login-password" className="login-sr-only">
            Senha
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="login-hit-password"
          />

          {statusMessage ? (
            <p className="login-hit-status" role="status">
              {statusMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="login-hit-submit"
            data-testid="login-acesso-consultivo"
          >
            Acessar →
          </button>
        </form>
      </div>
    </div>
  )
}
