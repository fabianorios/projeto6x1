/**
 * Studio SQL — edit/test modular SqlProfile slots (consultant tool).
 * Factory profile is read-only; duplicate before editing.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  activateSqlProfile,
  createSqlProfile,
  deleteSqlProfile,
  duplicateSqlProfile,
  listSqlProfiles,
  testSqlSlot,
  updateSqlProfile,
  type TestSlotResult,
} from '../api/sql-profiles'
import {
  checkApiHealth,
  getActiveEnvironment,
  type EnvironmentPublic,
} from '../api/environments'
import {
  MODO_DIAS_OPTIONS,
  SQL_SLOT_CONTRACT,
  SQL_SLOT_EXAMPLES,
  SQL_SLOT_IDS,
  SQL_SLOT_LABELS,
  defaultBenefitParams,
  type BenefitParams,
  type SqlDialect,
  type SqlProfile,
  type SqlSlotId,
  type SqlSlotQueries,
} from '../types/sql-profile'
import {
  DEFAULT_EPHEMERAL_CREDS_FORM,
  EphemeralCredsFields,
  ephemeralFormComplete,
  type EphemeralCredsFormValue,
} from './EphemeralCredsFields'

interface SqlStudioPanelProps {
  open: boolean
  onClose: () => void
}

type ConnMode = 'env' | 'ephemeral'

export function SqlStudioPanel({ open, onClose }: SqlStudioPanelProps) {
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const [profiles, setProfiles] = useState<SqlProfile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [factoryId, setFactoryId] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [slot, setSlot] = useState<SqlSlotId>('ESTABELECIMENTOS')
  const [dialect, setDialect] = useState<SqlDialect>('mssql')
  const [draftSql, setDraftSql] = useState('')
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestSlotResult | null>(null)
  const [activeEnv, setActiveEnv] = useState<EnvironmentPublic | null>(null)
  const [connMode, setConnMode] = useState<ConnMode>('env')
  const [ephemeralForm, setEphemeralForm] = useState<EphemeralCredsFormValue>(
    DEFAULT_EPHEMERAL_CREDS_FORM,
  )
  const [draftBenefits, setDraftBenefits] = useState<BenefitParams>(
    defaultBenefitParams(),
  )
  const [copiedSql, setCopiedSql] = useState(false)

  const selected = profiles.find((p) => p.id === selectedId) ?? null
  const readonly = Boolean(selected?.readonly)

  const load = useCallback(async () => {
    setError(null)
    try {
      const healthy = await checkApiHealth()
      setApiOk(healthy)
      if (!healthy) {
        setError('API indisponível.')
        return
      }
      const [list, env] = await Promise.all([
        listSqlProfiles(),
        getActiveEnvironment(),
      ])
      setProfiles(list.profiles)
      setActiveId(list.activeId)
      setFactoryId(list.factoryId)
      setActiveEnv(env.environment)
      const pick =
        list.activeId ??
        list.profiles.find((p) => p.id === list.factoryId)?.id ??
        list.profiles[0]?.id ??
        null
      setSelectedId((prev) => prev ?? pick)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!selected) return
    setDraftName(selected.name)
    setDraftSql(selected.slots[slot]?.[dialect] ?? '')
    setDraftBenefits(selected.benefitParams ?? defaultBenefitParams())
    setTestResult(null)
  }, [selected, slot, dialect])

  if (!open) return null

  async function handleDuplicate() {
    if (!selectedId) return
    setSaving(true)
    setError(null)
    try {
      const { profile } = await duplicateSqlProfile(
        selectedId,
        `${selected?.name ?? 'Perfil'} (cópia)`,
      )
      await load()
      setSelectedId(profile.id)
      setActiveId(profile.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleNew() {
    setSaving(true)
    setError(null)
    try {
      const { profile } = await createSqlProfile({
        name: 'Novo perfil SQL',
      })
      await load()
      setSelectedId(profile.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!selected || readonly) return
    setSaving(true)
    setError(null)
    try {
      const nextSlots: Record<SqlSlotId, SqlSlotQueries> = {
        ...selected.slots,
        [slot]: {
          ...selected.slots[slot],
          [dialect]: draftSql,
        },
      }
      const { profile } = await updateSqlProfile(selected.id, {
        name: draftName.trim() || selected.name,
        slots: nextSlots,
        benefitParams: draftBenefits,
      })
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? profile : p)),
      )
      setDraftBenefits(profile.benefitParams)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function copyDraftSql() {
    try {
      await navigator.clipboard.writeText(draftSql)
      setCopiedSql(true)
      window.setTimeout(() => setCopiedSql(false), 2000)
    } catch {
      setError('Não foi possível copiar o SQL — selecione e use Ctrl+C.')
    }
  }

  function setTipo(
    key:
      | 'vrTipoBeneficio'
      | 'vaTipoBeneficio'
      | 'assistenciaMedicaTipo'
      | 'assistenciaOdontologicaTipo',
    raw: string,
  ) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      setDraftBenefits((b) => ({ ...b, [key]: null }))
      return
    }
    const n = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n < 0) return
    setDraftBenefits((b) => ({ ...b, [key]: n }))
  }

  async function handleActivate() {
    if (!selectedId) return
    setSaving(true)
    try {
      const res = await activateSqlProfile(selectedId)
      setActiveId(res.activeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected || readonly || selected.id === factoryId) return
    if (!window.confirm(`Excluir perfil "${selected.name}"?`)) return
    setSaving(true)
    try {
      await deleteSqlProfile(selected.id)
      setSelectedId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setError(null)
    setTestResult(null)
    try {
      const payload: Parameters<typeof testSqlSlot>[0] = {
        profileId: selectedId ?? undefined,
        slot,
        dialect,
        sql: draftSql,
      }
      if (connMode === 'ephemeral') {
        if (!ephemeralFormComplete(ephemeralForm)) {
          throw new Error('Preencha IP, porta, base, usuário e senha.')
        }
        payload.connection = {
          engine: ephemeralForm.engine,
          host: ephemeralForm.host.trim(),
          port:
            Number.parseInt(ephemeralForm.port, 10) ||
            (ephemeralForm.engine === 'oracle' ? 1521 : 1433),
          database: ephemeralForm.database.trim(),
          user: ephemeralForm.user.trim(),
          password: ephemeralForm.password,
        }
        payload.dialect = ephemeralForm.engine
      } else if (activeEnv) {
        payload.environmentId = activeEnv.id
        payload.dialect = activeEnv.engine
      } else {
        throw new Error('Ative um Ambiente Salvo ou use conexão efêmera.')
      }
      const result = await testSqlSlot(payload)
      setTestResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  const contract = SQL_SLOT_CONTRACT[slot]
  const showModoDias =
    slot === 'REGRA_VR' || slot === 'REGRA_VA' || slot === 'REGRA_VT'
  const skippedNotes = [
    draftBenefits.vrTipoBeneficio == null
      ? 'VR: tipo não cadastrado — benefício ignorado.'
      : null,
    draftBenefits.vaTipoBeneficio == null
      ? 'VA: tipo não cadastrado — benefício ignorado.'
      : null,
    draftBenefits.assistenciaMedicaTipo == null
      ? 'Assistência médica: tipo não cadastrado — ignorada no HC.'
      : null,
    draftBenefits.assistenciaOdontologicaTipo == null
      ? 'Assistência odontológica: tipo não cadastrado — ignorada no HC.'
      : null,
  ].filter(Boolean) as string[]

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/40 px-3 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sql-studio-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-5xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="sql-studio-title"
              className="text-xl font-semibold text-[var(--color-ink)]"
            >
              ⚙️ Studio SQL
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Perfis com blocos SQL independentes (MSSQL / Oracle) e tipos de
              benefício por cliente. O padrão de fábrica é somente leitura —
              duplique para editar.
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

        {apiOk === false && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            API offline — Studio SQL precisa do server/.
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">
              Perfil SQL
            </span>
            <select
              className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.readonly ? ' (fábrica)' : ''}
                  {p.id === activeId ? ' · ativo' : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={saving || !selectedId}
            onClick={() => void handleDuplicate()}
            className="border border-[var(--color-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            Duplicar Perfil
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleNew()}
            className="border border-[var(--color-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
          >
            Novo Perfil
          </button>
          <button
            type="button"
            disabled={saving || !selectedId || selectedId === activeId}
            onClick={() => void handleActivate()}
            className="bg-[var(--color-teal)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Ativar
          </button>
          {!readonly && selected && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleDelete()}
              className="px-3 py-2 text-sm text-red-700 underline disabled:opacity-50"
            >
              Excluir
            </button>
          )}
        </div>

        {selected && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem]">
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--color-muted)]">
                  Nome do perfil
                </span>
                <input
                  className="w-full border border-[var(--color-line)] bg-white px-3 py-2 disabled:bg-white/50"
                  value={draftName}
                  disabled={readonly}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </label>

              <fieldset className="border border-[var(--color-line)] bg-white/70 px-3 py-3">
                <legend className="px-1 text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                  Tipos de benefício (cliente)
                </legend>
                <p className="mb-3 text-xs text-[var(--color-muted)]">
                  Códigos Apdata variam por cliente; usados pelas queries de
                  benefício (@tipo / @tipoMedica / @tipoOdonto). Vazio = benefício
                  ignorado no motor.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['vrTipoBeneficio', 'VR / refeição'],
                      ['vaTipoBeneficio', 'VA / alimentação'],
                      ['assistenciaMedicaTipo', 'Médico titular'],
                      ['assistenciaOdontologicaTipo', 'Odontológica'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block text-sm">
                      <span className="mb-1 block text-[var(--color-muted)]">
                        {label}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="w-full border border-[var(--color-line)] bg-white px-3 py-2 disabled:bg-white/50"
                        value={draftBenefits[key] ?? ''}
                        disabled={readonly}
                        placeholder="—"
                        onChange={(e) => setTipo(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-[var(--color-muted)]">
                    VA — modo do valor
                  </span>
                  <select
                    className="w-full border border-[var(--color-line)] bg-white px-3 py-2 disabled:bg-white/50"
                    value={draftBenefits.vaModoValor}
                    disabled={readonly}
                    onChange={(e) =>
                      setDraftBenefits((b) => ({
                        ...b,
                        vaModoValor: e.target.value === 'DIA' ? 'DIA' : 'MES',
                      }))
                    }
                  >
                    <option value="MES">Mensal (custo fixo × HC)</option>
                    <option value="DIA">Por dia (× dias da escala)</option>
                  </select>
                </label>
                {readonly && (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Perfil de fábrica: defaults históricos (VR=53, VA=52). Duplique
                    para alterar.
                  </p>
                )}
                {skippedNotes.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                    {skippedNotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <div
                className="flex flex-wrap gap-1"
                role="tablist"
                aria-label="Blocos SQL"
              >
                {SQL_SLOT_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={slot === id}
                    onClick={() => setSlot(id)}
                    className={[
                      'border px-2.5 py-1.5 text-xs sm:text-sm',
                      slot === id
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-line)] text-[var(--color-muted)]',
                    ].join(' ')}
                  >
                    {SQL_SLOT_LABELS[id]}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2" role="radiogroup">
                {(['mssql', 'oracle'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={dialect === d}
                    onClick={() => setDialect(d)}
                    className={[
                      'border px-3 py-1.5 text-sm uppercase',
                      dialect === d
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-line)] text-[var(--color-muted)]',
                    ].join(' ')}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyDraftSql()}
                  className="border border-[var(--color-line)] bg-white px-3 py-1.5 text-sm"
                >
                  {copiedSql ? 'Copiado!' : 'Copiar'}
                </button>
                <span className="text-xs text-[var(--color-muted)]">
                  SQL do bloco acima da área de texto
                </span>
              </div>
              <textarea
                className="min-h-[18rem] w-full border border-[var(--color-line)] bg-white p-3 font-mono text-xs leading-relaxed disabled:bg-white/50"
                value={draftSql}
                disabled={readonly}
                spellCheck={false}
                onChange={(e) => setDraftSql(e.target.value)}
                aria-label={`SQL ${SQL_SLOT_LABELS[slot]} ${dialect}`}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || readonly}
                  onClick={() => void handleSave()}
                  className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {readonly ? 'Somente leitura' : saving ? 'Salvando…' : 'Salvar bloco'}
                </button>
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void handleTest()}
                  className="border border-[var(--color-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
                >
                  {testing ? 'Testando…' : 'Testar Bloco ao Vivo'}
                </button>
              </div>

              <div className="border border-[var(--color-line)] bg-white/70 px-3 py-3">
                <p className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  Conexão do teste
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConnMode('env')}
                    className={[
                      'border px-2.5 py-1 text-sm',
                      connMode === 'env'
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-line)]',
                    ].join(' ')}
                  >
                    Ambiente ativo
                    {activeEnv ? ` (${activeEnv.name})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnMode('ephemeral')}
                    className={[
                      'border px-2.5 py-1 text-sm',
                      connMode === 'ephemeral'
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-line)]',
                    ].join(' ')}
                  >
                    Conexão efêmera
                  </button>
                </div>
                {connMode === 'ephemeral' && (
                  <div className="mt-3">
                    <EphemeralCredsFields
                      value={ephemeralForm}
                      onChange={setEphemeralForm}
                      disabled={testing}
                    />
                  </div>
                )}
              </div>

              {testResult && (
                <div className="border border-[var(--color-line)] bg-white px-3 py-3">
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    Prévia ({testResult.rowCount} linha(s) ·{' '}
                    {testResult.latencyMs} ms) — contrato{' '}
                    {testResult.contract.ok ? (
                      <span className="text-[var(--color-success)]">OK</span>
                    ) : (
                      <span className="text-red-700">
                        faltando: {testResult.contract.missing.join(', ')}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 max-h-48 overflow-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr>
                          {testResult.columns.map((col) => (
                            <th
                              key={col}
                              className="border-b border-[var(--color-line)] px-2 py-1 font-medium"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.rows.map((row, i) => (
                          <tr key={i}>
                            {testResult.columns.map((col) => (
                              <td
                                key={col}
                                className="border-b border-[var(--color-line)]/50 px-2 py-1 tabular-nums"
                              >
                                {String(
                                  row[col] ??
                                    row[col.toUpperCase()] ??
                                    '',
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <aside className="border border-[var(--color-line)] bg-white/80 px-3 py-3 text-sm">
              <h3 className="text-xs font-semibold tracking-wide text-[var(--color-accent)] uppercase">
                Contrato de Colunas Esperadas
              </h3>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                {SQL_SLOT_EXAMPLES[slot]}
              </p>
              <ul className="mt-3 space-y-1 font-mono text-xs">
                {contract.map((col) => (
                  <li key={col}>{col}</li>
                ))}
              </ul>
              {showModoDias && (
                <div className="mt-4 border-t border-[var(--color-line)] pt-3">
                  <p className="text-xs font-semibold text-[var(--color-ink)]">
                    modo_dias
                  </p>
                  <ul className="mt-2 space-y-2 text-xs text-[var(--color-muted)]">
                    {MODO_DIAS_OPTIONS.map((m) => (
                      <li key={m}>
                        <code className="text-[var(--color-ink)]">{m}</code>
                        {m === 'ESCALA'
                          ? ' — dias/mês proporcionais à escala-alvo (5×2 / 4×3).'
                          : ' — mantém dias_base_mes fixo; só multiplica valor_dia × HC.'}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Ex.: perfil &quot;Cliente VR Fixo 22d&quot; usa{' '}
                    <code>FIXO_MES</code> com <code>dias_base_mes = 22</code>.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
