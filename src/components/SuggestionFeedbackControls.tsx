import { useState } from 'react'
import {
  formatShiftRange,
  type EditedShiftFields,
  type FeedbackAction,
  type ScheduleSuggestion,
} from '../engine'

interface SuggestionFeedbackControlsProps {
  suggestion: ScheduleSuggestion
  /** True when this suggestion already has feedback recorded this session. */
  recordedAction: FeedbackAction | null
  onAccept: () => void
  onReject: () => void
  onEditSave: (shifts: EditedShiftFields[]) => void
}

function draftFromSuggestion(s: ScheduleSuggestion): EditedShiftFields[] {
  return s.shifts.map((w) => ({
    label: w.label,
    startHour: w.startHour,
    endHour: w.endHour,
    hours: w.hours,
    headcount: w.headcount,
  }))
}

export function SuggestionFeedbackControls({
  suggestion,
  recordedAction,
  onAccept,
  onReject,
  onEditSave,
}: SuggestionFeedbackControlsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditedShiftFields[]>(() =>
    draftFromSuggestion(suggestion),
  )

  if (recordedAction) {
    const label =
      recordedAction === 'accepted'
        ? 'Aceita'
        : recordedAction === 'edited'
          ? 'Editada e salva'
          : 'Rejeitada'
    return (
      <p className="mt-2 text-xs font-medium text-[var(--color-accent)]">
        Feedback: {label} (salvo localmente)
      </p>
    )
  }

  if (editing) {
    return (
      <div className="mt-3 space-y-3 border border-[var(--color-line)] bg-[var(--color-accent-soft)]/40 p-3">
        <p className="text-xs font-medium">
          Editar HC ou horas — {suggestion.label}
        </p>
        <ul className="space-y-2">
          {draft.map((row, i) => (
            <li
              key={`${row.label}-${i}`}
              className="flex flex-wrap items-end gap-3 text-xs"
            >
              <span className="min-w-[7rem] font-medium">
                {row.label}{' '}
                <span className="font-normal text-[var(--color-muted)]">
                  ({formatShiftRange(row)})
                </span>
              </span>
              <label className="flex flex-col gap-0.5">
                <span className="text-[var(--color-muted)]">Horas</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={row.hours}
                  onChange={(e) => {
                    const hours = Number(e.target.value)
                    setDraft((prev) =>
                      prev.map((p, j) =>
                        j === i
                          ? {
                              ...p,
                              hours: Number.isFinite(hours) ? hours : p.hours,
                            }
                          : p,
                      ),
                    )
                  }}
                  className="min-h-11 w-20 border border-[var(--color-line)] bg-white px-2 py-2"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[var(--color-muted)]">HC</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={row.headcount}
                  onChange={(e) => {
                    const headcount = Number(e.target.value)
                    setDraft((prev) =>
                      prev.map((p, j) =>
                        j === i
                          ? {
                              ...p,
                              headcount: Number.isFinite(headcount)
                                ? Math.max(1, Math.round(headcount))
                                : p.headcount,
                            }
                          : p,
                      ),
                    )
                  }}
                  className="min-h-11 w-20 border border-[var(--color-line)] bg-white px-2 py-2"
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => {
              onEditSave(draft)
              setEditing(false)
            }}
            className="min-h-11 w-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white sm:w-auto"
          >
            Salvar edição
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(draftFromSuggestion(suggestion))
              setEditing(false)
            }}
            className="min-h-11 w-full border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm sm:w-auto"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        onClick={onAccept}
        className="min-h-11 w-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white sm:w-auto sm:min-w-[8rem]"
      >
        Aceitar
      </button>
      <button
        type="button"
        onClick={() => {
          setDraft(draftFromSuggestion(suggestion))
          setEditing(true)
        }}
        className="min-h-11 w-full border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm sm:w-auto sm:min-w-[8rem]"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={onReject}
        className="min-h-11 w-full border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm text-[var(--color-muted)] sm:w-auto sm:min-w-[8rem]"
      >
        Rejeitar
      </button>
    </div>
  )
}
