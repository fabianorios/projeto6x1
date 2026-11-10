import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  activateEnvironment,
  checkApiHealth,
  createEnvironment,
  deleteEnvironment,
  listEnvironments,
  testEnvironment,
  updateEnvironment,
  type DbEngine,
  type EnvironmentInput,
  type EnvironmentPublic,
} from '../api/environments'

type FormState = {
  name: string
  engine: DbEngine
  host: string
  port: string
  database: string
  user: string
  password: string
  encrypt: boolean
  trustServerCertificate: boolean
}

const emptyForm = (): FormState => ({
  name: '',
  engine: 'mssql',
  host: '',
  port: '1433',
  database: '',
  user: '',
  password: '',
  encrypt: true,
  trustServerCertificate: false,
})

function formFromEnv(env: EnvironmentPublic): FormState {
  return {
    name: env.name,
    engine: env.engine,
    host: env.host,
    port: String(env.port),
    database: env.database,
    user: env.user,
    // Never prefill the real password — leave blank to keep existing.
    password: '',
    encrypt: env.encrypt,
    trustServerCertificate: env.trustServerCertificate,
  }
}

function toInput(form: FormState, isEdit: boolean): EnvironmentInput {
  const port = Number.parseInt(form.port, 10)
  const input: EnvironmentInput = {
    name: form.name.trim(),
    engine: form.engine,
    host: form.host.trim(),
    port: Number.isFinite(port) ? port : undefined,
    database: form.database.trim(),
    user: form.user.trim(),
    encrypt: form.encrypt,
    trustServerCertificate: form.trustServerCertificate,
  }
  if (form.password.trim()) {
    input.password = form.password
  } else if (!isEdit) {
    input.password = ''
  }
  return input
}

interface AmbientesPanelProps {
  open: boolean
  onClose: () => void
}

export function AmbientesPanel({ open, onClose }: AmbientesPanelProps) {
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [items, setItems] = useState<EnvironmentPublic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const healthy = await checkApiHealth()
      setApiOk(healthy)
      if (!healthy) {
        setItems([])
        setError(
          'API indisponível. Suba o server/ (porta 8787) ou o proxy /api na VPS.',
        )
        return
      }
      const { environments } = await listEnvironments()
      setItems(environments)
    } catch (err) {
      setApiOk(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (!open) return null

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setShowForm(true)
    setStatus(null)
    setError(null)
  }

  function startEdit(env: EnvironmentPublic) {
    setEditingId(env.id)
    setForm(formFromEnv(env))
    setShowForm(true)
    setStatus(null)
    setError(null)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus(null)
    const isEdit = Boolean(editingId)
    const input = toInput(form, isEdit)
    if (!input.name || !input.host || !input.database || !input.user) {
      setError('Preencha nome, host, base e usuário.')
      return
    }
    if (!isEdit && !input.password) {
      setError('Senha é obrigatória ao adicionar.')
      return
    }
    try {
      if (isEdit && editingId) {
        await updateEnvironment(editingId, input)
        setStatus('Ambiente atualizado. Senha mantida se o campo ficou em branco.')
      } else {
        await createEnvironment(input as EnvironmentInput & { password: string })
        setStatus('Ambiente adicionado.')
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleTest(id: string) {
    setBusyId(id)
    setStatus(null)
    setError(null)
    try {
      const result = await testEnvironment(id)
      if (result.ok) {
        setStatus(`Conexão OK (${result.driver}, ${result.latencyMs} ms).`)
      } else {
        setError(`Falha no teste (${result.driver}): ${result.error}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleActivate(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await activateEnvironment(id)
      setStatus('Ambiente ativo selecionado.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remover este ambiente? Credenciais serão apagadas.')) {
      return
    }
    setBusyId(id)
    setError(null)
    try {
      await deleteEnvironment(id)
      setStatus('Ambiente removido.')
      if (editingId === id) {
        setShowForm(false)
        setEditingId(null)
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ambientes-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="ambientes-title"
              className="text-xl font-semibold text-[var(--color-ink)]"
            >
              Ambientes
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Conecte o Turnocheck a uma ou mais bases Apdata (somente leitura).
              Senhas ficam criptografadas no servidor e nunca são exibidas após
              salvar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={startCreate}
            disabled={apiOk === false}
            className="bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Adicionar ambiente
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="border border-[var(--color-line)] bg-white/70 px-3 py-1.5 text-sm"
          >
            Atualizar
          </button>
          {apiOk === true && (
            <span className="text-xs text-[var(--color-accent)]">API online</span>
          )}
          {apiOk === false && (
            <span className="text-xs text-red-700">API offline</span>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="mt-3 text-sm text-[var(--color-accent)]" role="status">
            {status}
          </p>
        )}

        {showForm && (
          <form
            onSubmit={(e) => void handleSave(e)}
            className="mt-5 space-y-3 border border-[var(--color-line)] bg-white/60 p-4"
          >
            <h3 className="text-sm font-semibold">
              {editingId ? 'Editar ambiente' : 'Novo ambiente'}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-[var(--color-muted)]">Nome</span>
                <input
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Ex.: Ambiente piloto A"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--color-muted)]">Engine</span>
                <select
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.engine}
                  onChange={(e) => {
                    const engine = e.target.value as DbEngine
                    setForm((f) => ({
                      ...f,
                      engine,
                      port:
                        f.port === '1433' || f.port === '1521'
                          ? engine === 'oracle'
                            ? '1521'
                            : '1433'
                          : f.port,
                    }))
                  }}
                >
                  <option value="mssql">MSSQL</option>
                  <option value="oracle">Oracle</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--color-muted)]">Porta</span>
                <input
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.port}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, port: e.target.value }))
                  }
                  inputMode="numeric"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-[var(--color-muted)]">Host</span>
                <input
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.host}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, host: e.target.value }))
                  }
                  placeholder="db.interno.local"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--color-muted)]">
                  {form.engine === 'oracle' ? 'Service name' : 'Database'}
                </span>
                <input
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.database}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, database: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--color-muted)]">Usuário</span>
                <input
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.user}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, user: e.target.value }))
                  }
                  autoComplete="username"
                  required
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-[var(--color-muted)]">
                  Senha
                  {editingId
                    ? ' (deixe em branco para manter; valor salvo nunca é exibido)'
                    : ''}
                </span>
                <input
                  type="password"
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-2 py-1.5"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder={editingId ? '••••••••' : ''}
                  autoComplete="new-password"
                  required={!editingId}
                />
              </label>
              {form.engine === 'mssql' && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.encrypt}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, encrypt: e.target.checked }))
                      }
                    />
                    Encrypt (TLS)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.trustServerCertificate}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          trustServerCertificate: e.target.checked,
                        }))
                      }
                    />
                    Trust server certificate
                  </label>
                </>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                }}
                className="border border-[var(--color-line)] px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <ul className="mt-5 space-y-3">
          {loading && items.length === 0 && (
            <li className="text-sm text-[var(--color-muted)]">Carregando…</li>
          )}
          {!loading && items.length === 0 && apiOk !== false && (
            <li className="text-sm text-[var(--color-muted)]">
              Nenhum ambiente cadastrado. Adicione o primeiro para conectar.
            </li>
          )}
          {items.map((env) => (
            <li
              key={env.id}
              className={[
                'border px-4 py-3',
                env.active
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                  : 'border-[var(--color-line)] bg-white/70',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--color-ink)]">
                    {env.name}
                    {env.active && (
                      <span className="ml-2 text-xs font-normal text-[var(--color-accent)]">
                        ativo
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {env.engine.toUpperCase()} · {env.user}@{env.host}:
                    {env.port}/{env.database} · senha {env.passwordMasked || '—'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === env.id || env.active}
                  onClick={() => void handleActivate(env.id)}
                  className="border border-[var(--color-line)] bg-white px-2.5 py-1 text-xs disabled:opacity-50"
                >
                  Selecionar ativo
                </button>
                <button
                  type="button"
                  disabled={busyId === env.id}
                  onClick={() => void handleTest(env.id)}
                  className="border border-[var(--color-line)] bg-white px-2.5 py-1 text-xs disabled:opacity-50"
                >
                  Testar conexão
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(env)}
                  className="border border-[var(--color-line)] bg-white px-2.5 py-1 text-xs"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={busyId === env.id}
                  onClick={() => void handleDelete(env.id)}
                  className="border border-[var(--color-line)] bg-white px-2.5 py-1 text-xs text-red-800 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
