/**
 * Passo 5 — Apdata cadastral tree review (Jornada → Horário → Ciclo → Grade).
 * LGPD: CC codes, schedule codes, turmas — no names/CPF.
 */

import { useMemo, useState } from 'react'
import {
  REGIME_FUNCIONAMENTO_LABELS,
  buildApdataHierarchy,
  defaultApdataDataInicio,
  type ApdataHierarchyNode,
  type SimulationResult,
} from '../engine'

interface ApdataHierarchyViewProps {
  result: SimulationResult
  /** Controlled Data Início (YYYY-MM-DD). */
  dataInicio?: string
  onDataInicioChange?: (isoDate: string) => void
}

const STEP_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  INTERVALO_INICIO: 'Início intervalo',
  INTERVALO_FIM: 'Fim intervalo',
  SAIDA: 'Saída',
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
        <p className="text-sm font-semibold text-[var(--color-ink)]">
          {grade?.turma ?? '—'} · {node.jornada.codigo}
        </p>
        <p className="text-xs tabular-nums text-[var(--color-muted)]">
          HC {grade?.headcountProposto ?? 0} · {grade?.tipoGrade ?? 'VAGAS'}
        </p>
      </div>

      <ol className="mt-2 space-y-1.5 border-l-2 border-[var(--color-accent)] pl-3 text-xs text-[var(--color-ink)]">
        <li>
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Jornada
          </span>{' '}
          <span className="font-medium">{node.jornada.codigo}</span>
          <span className="text-[var(--color-muted)]">
            {' '}
            · {node.jornada.horasDia}h · {node.jornada.descricao}
          </span>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {node.jornada.steps.map((s) => (
              <li
                key={`${node.jornada.codigo}-${s.ordem}`}
                className="border border-[var(--color-line)] bg-white px-1.5 py-0.5 tabular-nums"
              >
                {s.ordem}. {STEP_LABEL[s.tipo] ?? s.tipo} {s.hora}
              </li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Horário
          </span>{' '}
          <span className="font-medium">{node.horario.codigo}</span>
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
          <span className="font-medium">{grade?.turma}</span>
          <span className="text-[var(--color-muted)]">
            {' '}
            · CC {grade?.centroCustoCodigo} · {grade?.label}
          </span>
        </li>
      </ol>
    </li>
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

  const tree = useMemo(
    () => buildApdataHierarchy(result, { dataInicio }),
    [result, dataInicio],
  )

  function setInicio(next: string) {
    if (onDataInicioChange) onDataInicioChange(next)
    else setLocalInicio(next)
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
            Hierarquia Apdata (Jornada → Grade)
          </h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Fiel da balança para parametrização/carga no ERP · Quadro Proposto
            T1…T7 · sem PII
          </p>
        </div>
        <label className="block text-xs text-[var(--color-ink)]">
          <span className="font-semibold tracking-wide uppercase">
            Data Início (obrigatória)
          </span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setInicio(e.target.value)}
            className="mt-1 block min-h-11 border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-[var(--color-muted)]">
        {REGIME_FUNCIONAMENTO_LABELS[tree.regimeFuncionamento]} ·{' '}
        {tree.grades.length} turma(s) · {tree.jornadas.length} jornada(s) ·{' '}
        {tree.ciclos.length} ciclo(s) · vigência {tree.dataInicio}
      </p>

      <div className="mt-4 space-y-5">
        {tree.centers.map((center) => (
          <section key={center.centroCustoCodigo}>
            <h4 className="text-xs font-semibold tracking-wide text-[var(--color-ink)] uppercase">
              CC {center.centroCustoCodigo}
            </h4>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {REGIME_FUNCIONAMENTO_LABELS[center.regime]} · HC{' '}
              {center.currentHeadcount} → {center.requiredHeadcount} · cobertura
              diária {center.dailyCoverageNeed}
            </p>
            <ul className="mt-2 space-y-2">
              {center.nodes.map((node) => (
                <NodeBlock
                  key={`${center.centroCustoCodigo}-${node.ciclo.codigo}-${node.grades[0]?.turma}`}
                  node={node}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-4 border-l-2 border-[var(--color-accent)] pl-3 text-[11px] text-[var(--color-muted)]">
        {tree.disclaimer}
      </p>
    </div>
  )
}
