import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  hourToTimeInputValue,
  timeInputToHour,
  type DayOperatingHours,
  type OperatingHours,
  type WeekdayKey,
} from '../engine'

interface OperatingHoursFieldsProps {
  value: OperatingHours
  onChange: (next: OperatingHours) => void
}

function patchDefault(
  value: OperatingHours,
  patch: Partial<DayOperatingHours>,
): OperatingHours {
  return {
    ...value,
    default: { ...value.default, ...patch },
  }
}

export function OperatingHoursFields({
  value,
  onChange,
}: OperatingHoursFieldsProps) {
  const hasWeekday =
    !!value.byWeekday && Object.keys(value.byWeekday).length > 0
  const is24h =
    !value.default.closed &&
    value.default.openHour === value.default.closeHour

  function setWeekdayEnabled(enabled: boolean) {
    if (!enabled) {
      const { byWeekday: _drop, ...rest } = value
      onChange(rest)
      return
    }
    const byWeekday = {} as NonNullable<OperatingHours['byWeekday']>
    for (const key of WEEKDAY_ORDER) {
      byWeekday[key] = { ...value.default }
    }
    onChange({ ...value, byWeekday })
  }

  function patchWeekday(key: WeekdayKey, patch: Partial<DayOperatingHours>) {
    const prev = value.byWeekday?.[key] ?? { ...value.default }
    onChange({
      ...value,
      byWeekday: {
        ...value.byWeekday,
        [key]: { ...prev, ...patch },
      },
    })
  }

  return (
    <fieldset className="sm:col-span-2 space-y-3 border border-[var(--color-line)] bg-white/70 p-4">
      <legend className="px-1 text-sm font-medium text-[var(--color-ink)]">
        Horário de funcionamento do estabelecimento
      </legend>
      <p className="text-xs text-[var(--color-muted)]">
        Abertura e fechamento definem a janela de cobertura. As sugestões de
        turno (início/fim) são derivadas daqui — sem horários inventados.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={is24h}
            onChange={(e) => {
              if (e.target.checked) {
                onChange(patchDefault(value, { openHour: 0, closeHour: 0 }))
              } else {
                onChange(patchDefault(value, { openHour: 9, closeHour: 21 }))
              }
            }}
          />
          Operação 24h
        </label>
      </div>

      {!is24h ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">
              Abertura
            </span>
            <input
              type="time"
              required
              value={hourToTimeInputValue(value.default.openHour)}
              onChange={(e) =>
                onChange(
                  patchDefault(value, {
                    openHour: timeInputToHour(e.target.value),
                  }),
                )
              }
              className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">
              Fechamento
            </span>
            <input
              type="time"
              required
              value={hourToTimeInputValue(
                value.default.closeHour === 24 ? 0 : value.default.closeHour,
              )}
              onChange={(e) => {
                const h = timeInputToHour(e.target.value)
                // Midnight close on same-day window → 24 sentinel when open is morning.
                const closeHour =
                  h === 0 && value.default.openHour > 0 ? 24 : h
                onChange(patchDefault(value, { closeHour }))
              }}
              className="w-full border border-[var(--color-line)] bg-white px-3 py-2"
            />
          </label>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">
          Cobertura contínua (00:00–24:00). Turnos serão fatiados em blocos ≤
          10h / 8h conforme a escala candidata.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hasWeekday}
          onChange={(e) => setWeekdayEnabled(e.target.checked)}
        />
        Variar por dia da semana (opcional)
      </label>

      {hasWeekday && value.byWeekday ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[var(--color-muted)]">
                <th className="py-1 pr-2 font-normal">Dia</th>
                <th className="py-1 pr-2 font-normal">Fechado</th>
                <th className="py-1 pr-2 font-normal">Abre</th>
                <th className="py-1 font-normal">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAY_ORDER.map((key) => {
                const d = value.byWeekday![key] ?? { ...value.default }
                return (
                  <tr
                    key={key}
                    className="border-b border-[var(--color-line)]"
                  >
                    <td className="py-1.5 pr-2 font-medium">
                      {WEEKDAY_LABELS[key]}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={!!d.closed}
                        onChange={(e) =>
                          patchWeekday(key, { closed: e.target.checked })
                        }
                        aria-label={`${WEEKDAY_LABELS[key]} fechado`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="time"
                        disabled={!!d.closed}
                        value={hourToTimeInputValue(d.openHour)}
                        onChange={(e) =>
                          patchWeekday(key, {
                            openHour: timeInputToHour(e.target.value),
                          })
                        }
                        className="border border-[var(--color-line)] bg-white px-2 py-1 disabled:opacity-40"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="time"
                        disabled={!!d.closed}
                        value={hourToTimeInputValue(
                          d.closeHour === 24 ? 0 : d.closeHour,
                        )}
                        onChange={(e) => {
                          const h = timeInputToHour(e.target.value)
                          const closeHour =
                            h === 0 && d.openHour > 0 ? 24 : h
                          patchWeekday(key, { closeHour })
                        }}
                        className="border border-[var(--color-line)] bg-white px-2 py-1 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </fieldset>
  )
}
