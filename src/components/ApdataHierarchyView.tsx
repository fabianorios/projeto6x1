/**
 * Passo 5 — Guided Apdata structure: Jornadas→Steps, then selectable Horários.
 * Does not “send” to ERP; optional advanced JSON export only.
 * LGPD: CC codes, schedule codes, turmas — no names/CPF.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  REGIME_FUNCIONAMENTO_LABELS,
  buildApdataHierarchy,
  defaultApdataDataInicio,
  deriveApdataCandidates,
  type ApdataHierarchyNode,
  type ApdataHorarioCandidate,
  type ApdataJornadaCandidate,
  type SimulationResult,
} from '../engine'
import { downloadAhrHandoff } from '../utils/exportHandoff'

interface ApdataHierarchyViewProps {
  result: SimulationResult
  /** Controlled Data Início (YYYY-MM-DD). */
  dataInicio?: string
  onDataInicioChange?: (isoDate: string) => void
}

type WizardStep = 1 | 2 | 3

const STEP_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  INTERVALO_INICIO: 'Início intervalo',
  INTERVALO_FIM: 'Fim intervalo',
  SAIDA: 'Saída',
}

const KIND_LABEL: Record<string, string> = {
  MANHA: 'A · Entrada → saída almoço',
  ALMOCO: 'Jornada de almoço',
  TARDE: 'B · Retorno almoço → saída',
  INTEGRAL: 'Jornada integral',
}

function CycleStrip({ node }: { node: ApdataHierarchyNode }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1" role="list" aria-label="Ciclo Trabalho/Folga">
      {node.ciclo.dias.map((d) => (
        <span
          key={`${node.ciclo.codigo}-${d.ordem}`}
          role="listitem"
          title={`${d.weekdayLabel}: ${d.marca === 'T' ? 'Trabalho' : 'Folga'}`}
          className={
            d.marca === 'T'
              ? 'inline-flex min-w-9 flex-col items-center border border-emerald-800/30 bg-emerald-50 px-1.5 py-1 text-[10px] text-emerald-950'
              : 'inline-flex min-w-9 flex-col items-center border border-[var(--color-line)] bg-neutral-100 px-1.5 py-1 text-[10px] text-neutral-600'
          }
        >
          <span className="font-semibold tracking-wide">{d.weekdayLabel}</span>
          <span className="tabular-nums">{d.marca}</span>
        </span>
      ))}
    </div>
  )
}

function NodeBlock({ node }: { node: ApdataHierarchyNode }) {
  const grade = node.grades[0]
  return (
    <li className="border border-[var(--color-line)] bg-white/90 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tabular-nums text-[var(--color-ink)]">
          {grade?.label ??
            `${grade?.turma ?? '—'} · ${node.horario.descricao}`}
        </p>
        <p className="text-xs tabular-nums text-[var(--color-muted)]">
          HC {grade?.headcountProposto ?? 0} · {grade?.tipoGrade ?? 'VAGAS'}
        </p>
      </div>

      <ol className="mt-2 space-y-1.5 border-l-2 border-[var(--color-accent)] pl-3 text-xs text-[var(--color-ink)]">
        <li>
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Jornadas
          </span>
          <ul className="mt-1 space-y-1">
            {node.jornadas.map((j) => (
              <li key={j.codigo}>
                <span className="font-medium">{j.descricao}</span>
                <span className="text-[var(--color-muted)]">
                  {' '}
                  · {j.codigo} · {j.horasDia}h
                </span>
                <ul className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                  {j.steps.map((s) => (
                    <li
                      key={`${j.codigo}-${s.ordem}`}
                      className="border border-[var(--color-line)] bg-white px-1.5 py-0.5 tabular-nums"
                    >
                      {s.ordem}. {STEP_LABEL[s.tipo] ?? s.tipo} {s.hora}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Horário
          </span>{' '}
          <span className="font-medium">{node.horario.descricao}</span>
          <span className="text-[var(--color-muted)]">
            {' '}
            · {node.horario.codigo}
          </span>
          {node.horario.codHorarioAtualRef ? (
            <span className="text-[var(--color-muted)]">
              {' '}
              · ref. atual {node.horario.codHorarioAtualRef}
            </span>
          ) : null}
          {node.horario.cargaSemanalHoras != null ? (
            <span className="text-[var(--color-muted)]">
              {' '}
              · {node.horario.cargaSemanalHoras}h/sem
            </span>
          ) : null}
        </li>
        <li>
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Ciclo
          </span>{' '}
          <span className="font-medium">{node.ciclo.codigo}</span>
          <span className="text-[var(--color-muted)]">
            {' '}
            · {node.ciclo.escala} ({node.ciclo.workDays}×{node.ciclo.offDays}) ·
            Data Início <strong className="text-[var(--color-ink)]">{node.ciclo.dataInicio}</strong>
          </span>
          <CycleStrip node={node} />
        </li>
        <li>
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Grade
          </span>{' '}
          <span className="font-medium tabular-nums">{grade?.label ?? grade?.turma}</span>
          <span className="text-[var(--color-muted)]">
            {' '}
            · {node.horario.descricao}
          </span>
        </li>
      </ol>
    </li>
  )
}

function JornadaPreviewCard({ jornada }: { jornada: ApdataJornadaCandidate }) {
  return (
    <li className="border border-[var(--color-line)] bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
        {KIND_LABEL[jornada.kind] ?? jornada.kind}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--color-ink)]">
        {jornada.descricao}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">
        {jornada.codigo} · {jornada.horasDia}h
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
        {jornada.steps.map((s) => (
          <li
            key={`${jornada.codigo}-${s.ordem}`}
            className="border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 tabular-nums"
          >
            {s.ordem}. {STEP_LABEL[s.tipo] ?? s.tipo} {s.hora}
          </li>
        ))}
      </ul>
    </li>
  )
}

function HorarioSelectRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: ApdataHorarioCandidate
  checked: boolean
  onToggle: () => void
}) {
  const turmas = candidate.turmaIndexes.map((i) => `T${i}`).join(', ')
  return (
    <li className="border border-[var(--color-line)] bg-white">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold tabular-nums text-[var(--color-ink)]">
            {candidate.descricao}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] text-[var(--color-muted)]">
            {candidate.codigo}
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
            CC {candidate.centroCustoCodigo} · escala {candidate.escala} ·{' '}
            {turmas} · liga {candidate.jornadaCodigos.length} jornada(s)
          </span>
        </span>
      </label>
    </li>
  )
}

function WizardChrome({
  step,
  labels,
}: {
  step: WizardStep
  labels: [string, string, string]
}) {
  return (
    <ol className="mt-3 flex flex-wrap gap-2" aria-label="Passos da estrutura Apdata">
      {labels.map((label, i) => {
        const n = (i + 1) as WizardStep
        const active = step === n
        const done = step > n
        return (
          <li
            key={label}
            className={
              active
                ? 'border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-ink)]'
                : done
                  ? 'border border-[var(--color-line)] bg-white px-2.5 py-1 text-xs text-[var(--color-ink)]'
                  : 'border border-[var(--color-line)] bg-neutral-50 px-2.5 py-1 text-xs text-[var(--color-muted)]'
            }
            aria-current={active ? 'step' : undefined}
          >
            {n}. {label}
          </li>
        )
      })}
    </ol>
  )
}

export function ApdataHierarchyView({
  result,
  dataInicio: dataInicioProp,
  onDataInicioChange,
}: ApdataHierarchyViewProps) {
  const defaultInicio = defaultApdataDataInicio(
    result.ruleVersion.params.scenarioId,
  )
  const [localInicio, setLocalInicio] = useState(defaultInicio)
  const dataInicio = dataInicioProp ?? localInicio

  const baseCandidates = useMemo(
    () => deriveApdataCandidates(result),
    [result],
  )

  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [includeLunch, setIncludeLunch] = useState(
    baseCandidates.includeLunchDefault,
  )
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    baseCandidates.horarios.map((h) => h.id),
  )
  const [generated, setGenerated] = useState(false)

  // Reset selection when Quadro / scenario result identity changes.
  useEffect(() => {
    const next = deriveApdataCandidates(result)
    setIncludeLunch(next.includeLunchDefault)
    setSelectedIds(next.horarios.map((h) => h.id))
    setWizardStep(1)
    setGenerated(false)
  }, [result])

  const candidates = useMemo(
    () =>
      deriveApdataCandidates(result, { includeLunchJornada: includeLunch }),
    [result, includeLunch],
  )

  // Keep selection intersection when lunch toggle changes jornada codes on candidates.
  useEffect(() => {
    const valid = new Set(candidates.horarios.map((h) => h.id))
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => valid.has(id))
      if (kept.length > 0) return kept
      return candidates.horarios.map((h) => h.id)
    })
  }, [candidates])

  const selectedHorarios = useMemo(
    () => candidates.horarios.filter((h) => selectedIds.includes(h.id)),
    [candidates.horarios, selectedIds],
  )

  const tree = useMemo(() => {
    if (!generated) return null
    return buildApdataHierarchy(result, {
      dataInicio,
      includeLunchJornada: includeLunch,
      selectedHorarioIds: selectedIds,
    })
  }, [generated, result, dataInicio, includeLunch, selectedIds])

  function setInicio(next: string) {
    if (onDataInicioChange) onDataInicioChange(next)
    else setLocalInicio(next)
  }

  function toggleHorario(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
    setGenerated(false)
  }

  function selectAllHorarios() {
    setSelectedIds(candidates.horarios.map((h) => h.id))
    setGenerated(false)
  }

  function clearHorarios() {
    setSelectedIds([])
    setGenerated(false)
  }

  function handleGerar() {
    if (selectedIds.length === 0) return
    setGenerated(true)
    setWizardStep(3)
  }

  return (
    <div
      id="hierarquia-apdata"
      tabIndex={-1}
      className="border border-[var(--color-line)] bg-white/80 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">
            Estrutura Apdata — Jornadas → Horários
          </h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Monte a estrutura cadastral a partir do Quadro Proposto. Isto{' '}
            <strong className="font-semibold text-[var(--color-ink)]">não envia</strong>{' '}
            dados ao ERP — só prepara nomes e vínculos para carga manual.
          </p>
        </div>
        <label className="block text-xs text-[var(--color-ink)]">
          <span className="font-semibold tracking-wide uppercase">
            Data Início (obrigatória)
          </span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => {
              setInicio(e.target.value)
              setGenerated(false)
            }}
            className="mt-1 block min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <WizardChrome
        step={wizardStep}
        labels={['Jornadas + Steps', 'Horários (escolha)', 'Estrutura']}
      />

      {wizardStep === 1 ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[var(--color-muted)]">
            Jornadas nomeadas com início/fim do bloco. Steps:{' '}
            <strong className="text-[var(--color-ink)]">A</strong> entrada do
            expediente → saída do almoço;{' '}
            <strong className="text-[var(--color-ink)]">B</strong> retorno do
            almoço → saída do expediente.
          </p>
          {candidates.meal ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={includeLunch}
                onChange={(e) => {
                  setIncludeLunch(e.target.checked)
                  setGenerated(false)
                }}
                className="size-4 accent-[var(--color-accent)]"
              />
              Criar jornada de almoço
              {includeLunch
                ? ` (${candidates.jornadas.find((j) => j.kind === 'ALMOCO')?.descricao ?? 'Almoço'})`
                : ''}
            </label>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Turno &lt; 6h — jornada integral (sem intervalo de almoço).
            </p>
          )}
          <ul className="grid gap-2 sm:grid-cols-2">
            {candidates.jornadas.map((j) => (
              <JornadaPreviewCard key={j.codigo} jornada={j} />
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setWizardStep(2)}
              className="min-h-11 bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white"
            >
              Continuar para Horários
            </button>
          </div>
        </div>
      ) : null}

      {wizardStep === 2 ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[var(--color-muted)]">
            Horários rotulados com dias abreviados + entrada/saída. Cada horário
            liga as jornadas acima ao ciclo da escala. Escolha quais criar.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={selectAllHorarios}
              className="min-h-9 border border-[var(--color-line)] bg-white px-3 py-1.5"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={clearHorarios}
              className="min-h-9 border border-[var(--color-line)] bg-white px-3 py-1.5"
            >
              Limpar
            </button>
            <span className="self-center text-[var(--color-muted)]">
              {selectedHorarios.length} de {candidates.horarios.length}{' '}
              selecionado(s)
            </span>
          </div>

          <div className="border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Prévia dos nomes
            </p>
            {selectedHorarios.length === 0 ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Nenhum horário selecionado.
              </p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-[var(--color-ink)]">
                {selectedHorarios.map((h) => (
                  <li key={h.id} className="tabular-nums">
                    <span className="font-medium">{h.descricao}</span>
                    <span className="text-[var(--color-muted)]">
                      {' '}
                      → {h.codigo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-[var(--color-muted)]">
              Jornadas vinculadas:{' '}
              {candidates.jornadas.map((j) => j.descricao).join(' · ')}
            </p>
          </div>

          <ul className="space-y-2">
            {candidates.horarios.map((h) => (
              <HorarioSelectRow
                key={h.id}
                candidate={h}
                checked={selectedIds.includes(h.id)}
                onToggle={() => toggleHorario(h.id)}
              />
            ))}
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className="min-h-11 border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleGerar}
              className="min-h-11 bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Gerar estrutura
            </button>
          </div>
        </div>
      ) : null}

      {wizardStep === 3 && tree ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-muted)]">
              {REGIME_FUNCIONAMENTO_LABELS[tree.regimeFuncionamento]} ·{' '}
              {tree.grades.length} turma(s) · {tree.jornadas.length} jornada(s) ·{' '}
              {tree.horarios.length} horário(s) · {tree.ciclos.length} ciclo(s) ·
              vigência {tree.dataInicio}
              {tree.includeLunchJornada ? ' · com jornada de almoço' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWizardStep(2)}
                className="min-h-11 border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
              >
                Ajustar seleção
              </button>
              <details className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm text-[var(--color-muted)]">
                  Exportação avançada
                </summary>
                <div className="absolute right-0 z-10 mt-1 w-64 border border-[var(--color-line)] bg-white p-3 shadow-sm">
                  <p className="text-[11px] text-[var(--color-muted)]">
                    Baixa JSON de handoff (não envia ao ERP). Use só se o Gerador
                    AHR / carga offline precisar do arquivo.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      downloadAhrHandoff(result, {
                        dataInicio,
                        includeLunchJornada: includeLunch,
                        selectedHorarioIds: selectedIds,
                      })
                    }
                    className="mt-2 min-h-11 w-full border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
                  >
                    Baixar JSON (avançado)
                  </button>
                </div>
              </details>
            </div>
          </div>

          <div className="border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Nomes gerados
            </p>
            <ul className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
              <li>
                <span className="text-[var(--color-muted)]">Jornadas: </span>
                {tree.jornadas.map((j) => j.descricao).join(' · ')}
              </li>
              <li>
                <span className="text-[var(--color-muted)]">Horários: </span>
                {tree.horarios.map((h) => h.descricao).join(' · ')}
              </li>
            </ul>
          </div>

          <div className="space-y-5">
            {tree.centers.map((center) => (
              <section key={center.centroCustoCodigo}>
                <h4 className="text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase">
                  CC {center.centroCustoCodigo}
                </h4>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                  {REGIME_FUNCIONAMENTO_LABELS[center.regime]} · HC{' '}
                  {center.currentHeadcount} → {center.requiredHeadcount} ·
                  cobertura diária {center.dailyCoverageNeed}
                </p>
                {center.nodes.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Nenhum horário selecionado para este CC.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {center.nodes.map((node) => (
                      <NodeBlock
                        key={`${center.centroCustoCodigo}-${node.ciclo.codigo}-${node.grades[0]?.turma}`}
                        node={node}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <p className="border-l-2 border-[var(--color-accent)] pl-3 text-[11px] text-[var(--color-muted)]">
            {tree.disclaimer}
          </p>
        </div>
      ) : null}

      {wizardStep === 3 && !tree ? (
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Selecione horários e clique em Gerar estrutura.
        </p>
      ) : null}
    </div>
  )
}
