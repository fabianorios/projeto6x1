/**
 * Studio SQL — edit/test modular SqlProfile slots (consultant tool).
 * SQL blocks on factory are read-only; benefit code/amount params are always
 * editable (saving factory auto-duplicates). TIPOS_BENEFICIOS prévia: session
 * overrides for classification + valor (not required for slot amounts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  benefitKey,
  benefitsFromTiposRows,
  mergeBenefitSessionOverride,
  type BenefitClass,
  type BenefitSessionOverrides,
} from '../apdata/classifyBenefit'
import {
  MODO_DIAS_OPTIONS,
  SQL_SLOT_CONTRACT,
  SQL_SLOT_EXAMPLES,
  SQL_SLOT_IDS,
  SQL_SLOT_LABELS,
  defaultBenefitParams,
  normalizeBenefitParams,
  type BenefitParams,
  type SqlDialect,
  type SqlProfile,
  type SqlSlotId,
  type SqlSlotQueries,
} from '../types/sql-profile'
import { BenefitSlotParamsFields } from './BenefitSlotParamsFields'
import {
  DEFAULT_EPHEMERAL_CREDS_FORM,
  EphemeralCredsFields,
  ephemeralFormComplete,
  type EphemeralCredsFormValue,
} from './EphemeralCredsFields'

const CLASS_OPTIONS: { id: BenefitClass; label: string }[] = [
  { id: 'VARIAVEL_DIA', label: 'Variável por Dia (Escala)' },
  { id: 'FIXO_MENSAL', label: 'Fixo Mensal (Por Vida)' },
  { id: 'IGNORAR', label: 'Ignorar' },
]

interface SqlStudioPanelProps {
  open: boolean
  onClose: () => void
  /** `page` = embedded shell route `/studio`; `modal` = overlay (legacy). */
  layout?: 'modal' | 'page'
  benefitSessionOverrides?: BenefitSessionOverrides
  onBenefitSessionOverridesChange?: (next: BenefitSessionOverrides) => void
}

type ConnMode = 'env' | 'ephemeral'

export function SqlStudioPanel({
  open,
  onClose,
  layout = 'modal',
  benefitSessionOverrides,
  onBenefitSessionOverridesChange,
}: SqlStudioPanelProps) {
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
  const [localOverrides, setLocalOverrides] = useState<BenefitSessionOverrides>(
    {},
  )
  const sessionOverrides = benefitSessionOverrides ?? localOverrides
  const setSessionOverrides = (
    next:
      | BenefitSessionOverrides
      | ((prev: BenefitSessionOverrides) => BenefitSessionOverrides),
  ) => {
    // Always resolve against the latest map so rapid cell edits don't clobber.
    if (onBenefitSessionOverridesChange) {
      const resolved =
        typeof next === 'function' ? next(sessionOverrides) : next
      onBenefitSessionOverridesChange(resolved)
      return
    }
    setLocalOverrides((prev) =>
      typeof next === 'function' ? next(prev) : next,
    )
  }

  const selected = profiles.find((p) => p.id === selectedId) ?? null
  const readonly = Boolean(selected?.readonly)

  const tiposBenefits = useMemo(() => {
    if (slot !== 'TIPOS_BENEFICIOS' || !testResult) return []
    return benefitsFromTiposRows(testResult.rows)
  }, [slot, testResult])

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

  // Sync name + benefit params when profile list / selection changes
  // (not when only slot/dialect changes — that wiped unsaved code edits).
  useEffect(() => {
    if (!selectedId) return
    const sel = profiles.find((p) => p.id === selectedId)
    if (!sel) return
    setDraftName(sel.name)
    setDraftBenefits(normalizeBenefitParams(sel.benefitParams))
  }, [selectedId, profiles])

  useEffect(() => {
    if (!selectedId) return
    const sel = profiles.find((p) => p.id === selectedId)
    if (!sel) return
    setDraftSql(sel.slots[slot]?.[dialect] ?? '')
  }, [selectedId, slot, dialect, profiles])

  // Clear prévia only when the user switches profile / slot / dialect —
  // not when `profiles` identity refreshes after load/save (that was wiping
  // the TIPOS_BENEFICIOS edit grid mid-edit).
  useEffect(() => {
    setTestResult(null)
  }, [selectedId, slot, dialect])

  if (!open) return null

  const isPage = layout === 'page'

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
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      let targetId = selected.id
      let targetSlots = selected.slots
      let targetName = draftName.trim() || selected.name

      // Factory SQL is immutable — duplicate so codes/amounts/SQL can persist.
      if (readonly) {
        const { profile: copy } = await duplicateSqlProfile(
          selected.id,
          `${selected.name} (cópia)`,
        )
        targetId = copy.id
        targetSlots = copy.slots
        targetName = copy.name
        setSelectedId(copy.id)
        setActiveId(copy.id)
      }

      const nextSlots: Record<SqlSlotId, SqlSlotQueries> = {
        ...targetSlots,
        [slot]: {
          ...targetSlots[slot],
          [dialect]: draftSql,
        },
      }
      const { profile } = await updateSqlProfile(targetId, {
        name: targetName,
        slots: nextSlots,
        benefitParams: draftBenefits,
      })
      await load()
      setSelectedId(profile.id)
      setDraftBenefits(normalizeBenefitParams(profile.benefitParams))
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
        benefitParams: draftBenefits,
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
  const showBenefitEditGrid =
    slot === 'TIPOS_BENEFICIOS' && tiposBenefits.length > 0
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

  const panel = (
      <div
        className={
          isPage
            ? 'w-full border border-[var(--color-line)] bg-[var(--color-paper)] p-4 sm:p-6'
            : 'w-full max-w-5xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 shadow-lg sm:p-6'
        }
      >
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
              duplique para editar. Overrides de Benefícios são de sessão e
              alimentam o Wizard / simulação.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            {isPage ? 'Voltar ao Wizard' : 'Fechar'}
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
                  Códigos e valores (VR / VA / Médico / Odonto)
                </legend>
                <p className="mb-3 text-xs text-[var(--color-muted)]">
                  Mapeie códigos Apdata → slot e edite os valores padrão. Não
                  precisa rodar TIPOS_BENEFICIOS. O 1º código de cada slot alimenta
                  @tipo / @tipoMedica / @tipoOdonto. Salvar no perfil de fábrica
                  cria uma cópia editável.
                </p>
                <BenefitSlotParamsFields
                  benefitParams={draftBenefits}
                  onBenefitParamsChange={setDraftBenefits}
                  persistAmountsOnProfile
                />
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-[var(--color-muted)]">
                    VA — modo do valor
                  </span>
                  <select
                    className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
                    value={draftBenefits.vaModoValor}
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
                    Perfil de fábrica: SQL permanece somente leitura; ao salvar
                    códigos/valores, o Studio duplica o perfil automaticamente.
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
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving
                    ? 'Salvando…'
                    : readonly
                      ? 'Duplicar e salvar'
                      : 'Salvar bloco'}
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
                  {showBenefitEditGrid ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-[var(--color-muted)]">
                        Override de sessão (classificação + valor) — alimenta o
                        motor no Wizard / Passo 4. Não grava no perfil SQL.
                      </p>
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr>
                              <th className="border-b border-[var(--color-line)] px-2 py-1 font-medium">
                                Código
                              </th>
                              <th className="border-b border-[var(--color-line)] px-2 py-1 font-medium">
                                Descrição
                              </th>
                              <th className="border-b border-[var(--color-line)] px-2 py-1 font-medium">
                                Valor médio
                              </th>
                              <th className="border-b border-[var(--color-line)] px-2 py-1 font-medium">
                                Classificação
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tiposBenefits.map((b) => {
                              const key = benefitKey(b)
                              const over = sessionOverrides[key]
                              const classValue =
                                over?.classificacao ?? b.classificacao
                              const valorValue =
                                over?.valorMedio != null &&
                                Number.isFinite(over.valorMedio)
                                  ? over.valorMedio
                                  : b.valorMedio
                              return (
                                <tr key={key}>
                                  <td className="border-b border-[var(--color-line)]/50 px-2 py-1 font-mono">
                                    {b.codigo}
                                  </td>
                                  <td className="border-b border-[var(--color-line)]/50 px-2 py-1">
                                    {b.descricao}
                                  </td>
                                  <td className="border-b border-[var(--color-line)]/50 px-2 py-1">
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      className="w-full min-w-[5.5rem] border border-[var(--color-line)] bg-white px-1.5 py-1 tabular-nums"
                                      value={
                                        Number.isFinite(valorValue)
                                          ? valorValue
                                          : ''
                                      }
                                      aria-label={`Valor médio ${b.descricao}`}
                                      onChange={(e) => {
                                        const raw = e.target.value.trim()
                                        if (raw === '') return
                                        const n = Number(raw.replace(',', '.'))
                                        if (!Number.isFinite(n) || n < 0) return
                                        setSessionOverrides((prev) =>
                                          mergeBenefitSessionOverride(
                                            prev,
                                            key,
                                            { valorMedio: n },
                                          ),
                                        )
                                      }}
                                    />
                                  </td>
                                  <td className="border-b border-[var(--color-line)]/50 px-2 py-1">
                                    <select
                                      className="w-full min-w-[11rem] border border-[var(--color-line)] bg-white px-1.5 py-1"
                                      value={classValue}
                                      aria-label={`Classificação ${b.descricao}`}
                                      onChange={(e) =>
                                        setSessionOverrides((prev) =>
                                          mergeBenefitSessionOverride(
                                            prev,
                                            key,
                                            {
                                              classificacao: e.target
                                                .value as BenefitClass,
                                            },
                                          ),
                                        )
                                      }
                                    >
                                      {CLASS_OPTIONS.map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {Object.keys(sessionOverrides).length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-[var(--color-muted)] underline"
                          onClick={() => setSessionOverrides({})}
                        >
                          Limpar overrides de sessão
                        </button>
                      )}
                    </div>
                  ) : (
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
                  )}
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
  )

  if (isPage) {
    return (
      <div role="region" aria-labelledby="sql-studio-title">
        {panel}
      </div>
    )
  }

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
      {panel}
    </div>
  )
}
