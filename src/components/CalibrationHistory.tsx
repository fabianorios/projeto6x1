import {
  downloadCalibrationJson,
  feedbackActionLabel,
  type CalibrationFeedbackEntry,
} from '../engine'

interface CalibrationHistoryProps {
  entries: CalibrationFeedbackEntry[]
  onClear: () => void
}

function brl(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function CalibrationHistory({
  entries,
  onClear,
}: CalibrationHistoryProps) {
  return (
    <div className="border border-[var(--color-line)] bg-white/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-[var(--color-ink)] uppercase">
          Histórico de calibração
        </h3>
        <div className="flex flex-wrap gap-2">
          {entries.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => downloadCalibrationJson(entries)}
                className="border border-[var(--color-line)] bg-white px-3 py-1 text-xs"
              >
                Baixar JSON
              </button>
              <button
                type="button"
                onClick={onClear}
                className="px-2 py-1 text-xs text-[var(--color-muted)] underline"
              >
                Limpar
              </button>
            </>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Só neste navegador (localStorage). Aceitar / editar / rejeitar
        candidatas alimenta o dataset da Fase A.
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Nenhum feedback ainda. Use Aceitar, Editar ou Rejeitar nas escalas
          sugeridas.
        </p>
      ) : (
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
          {entries.map((e) => (
            <li
              key={e.id}
              className="border-t border-[var(--color-line)] pt-2 first:border-t-0 first:pt-0"
            >
              <p className="font-medium">
                {feedbackActionLabel(e.action)} · {e.suggestion.label} (
                {e.suggestion.centroCusto})
              </p>
              <p className="mt-0.5 text-[var(--color-muted)]">
                {formatWhen(e.timestamp)} · {e.sector} · {e.scenarioId} · Δ
                sugestão{' '}
                {brl(e.payrollDeltas.suggestionMonthlyDeltaVsCurrent)}/mês
                {e.action === 'edited' && e.suggestion.edited
                  ? ` · HC editado ${e.suggestion.edited.totalHeadcount}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
