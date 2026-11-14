import { useMemo, useState } from 'react'
import {
  CUSTOM_SECTOR_ID,
  REGIME_FUNCIONAMENTO_LABELS,
  resolveSectorPreset,
  type RegimeFuncionamento,
  type SectorPreset,
} from '../engine'
import type { SectorTemplate } from '../templates'

interface SectorStepProps {
  templates: SectorTemplate[]
  selectedId: string | null
  sectorLabel: string
  sectorBufferPct: number
  defaultRegime?: RegimeFuncionamento
  onSelect: (id: string) => void
  onSectorMetaChange: (meta: {
    sectorLabel?: string
    sectorBufferPct?: number
    defaultRegimeFuncionamento?: RegimeFuncionamento
  }) => void
  onNext: () => void
}

export function SectorStep({
  templates,
  selectedId,
  sectorLabel,
  sectorBufferPct,
  defaultRegime,
  onSelect,
  onSectorMetaChange,
  onNext,
}: SectorStepProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [customName, setCustomName] = useState(sectorLabel)
  const isCustom = selectedId === CUSTOM_SECTOR_ID
  const selected = selectedId
    ? templates.find((t) => t.id === selectedId)
    : null
  const preset = selectedId ? resolveSectorPreset(selectedId) : null
  const regime =
    defaultRegime ?? preset?.defaultRegime ?? ('SEG_SEX' as RegimeFuncionamento)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.shortDescription.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
  }, [templates, query])

  const canContinue =
    Boolean(selectedId) && (!isCustom || customName.trim().length > 0)

  function selectPreset(t: SectorTemplate) {
    const p = resolveSectorPreset(t.id) as SectorPreset
    onSelect(t.id)
    setOpen(false)
    setQuery('')
    if (t.id === CUSTOM_SECTOR_ID) {
      onSectorMetaChange({
        sectorLabel: customName.trim() || '',
        sectorBufferPct: p.defaultBufferPct,
        defaultRegimeFuncionamento: p.defaultRegime,
      })
    } else {
      onSectorMetaChange({
        sectorLabel: t.label,
        sectorBufferPct: p.defaultBufferPct,
        defaultRegimeFuncionamento: p.defaultRegime,
      })
    }
  }

  return (
    <section className="no-print space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Segmento e contexto</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Escolha um preset de mercado ou Outro / Personalizado. Buffer e
          regime são editáveis. Se a origem Apdata trouxer{' '}
          <code>RamosAtividadesEmpresas</code>, o nome do segmento atualiza
          automaticamente.
        </p>
      </div>

      <div className="relative space-y-2">
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">Segmento</span>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between border border-[var(--color-line)] bg-white px-3 py-2.5 text-left text-sm"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={selected ? 'text-[var(--color-ink)]' : 'text-[var(--color-muted)]'}>
              {selected?.label ?? 'Buscar ou selecionar segmento…'}
            </span>
            <span aria-hidden className="text-[var(--color-muted)]">
              ▾
            </span>
          </button>
        </label>

        {open && (
          <div className="absolute z-20 mt-1 w-full border border-[var(--color-line)] bg-white shadow-md">
            <input
              autoFocus
              type="search"
              className="w-full border-b border-[var(--color-line)] px-3 py-2 text-sm"
              placeholder="Filtrar presets…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar segmento"
            />
            <ul
              role="listbox"
              className="max-h-64 overflow-y-auto"
            >
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-[var(--color-muted)]">
                  Nenhum preset encontrado
                </li>
              )}
              {filtered.map((t) => {
                const p = resolveSectorPreset(t.id)
                const active = t.id === selectedId
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => selectPreset(t)}
                      className={[
                        'w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--color-accent-soft)]/60',
                        active ? 'bg-[var(--color-accent-soft)]' : '',
                      ].join(' ')}
                    >
                      <span className="block font-medium text-[var(--color-ink)]">
                        {t.label}
                      </span>
                      <span className="block text-xs text-[var(--color-muted)]">
                        Buffer {p.defaultBufferPct}% ·{' '}
                        {REGIME_FUNCIONAMENTO_LABELS[p.defaultRegime]}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {selectedId && (
        <div className="space-y-3 border border-[var(--color-line)] bg-white/80 px-4 py-4">
          {isCustom && (
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">
                Nome do segmento
              </span>
              <input
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2"
                value={customName}
                onChange={(e) => {
                  const v = e.target.value
                  setCustomName(v)
                  onSectorMetaChange({ sectorLabel: v })
                }}
                placeholder="Ex.: Serviços educacionais"
              />
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">
                % Buffer / Absenteísmo
              </span>
              <input
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2"
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={sectorBufferPct}
                onChange={(e) =>
                  onSectorMetaChange({
                    sectorBufferPct: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">
                Regime operacional (padrão)
              </span>
              <select
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2"
                value={regime}
                onChange={(e) =>
                  onSectorMetaChange({
                    defaultRegimeFuncionamento: e.target
                      .value as RegimeFuncionamento,
                  })
                }
              >
                {(
                  Object.keys(
                    REGIME_FUNCIONAMENTO_LABELS,
                  ) as RegimeFuncionamento[]
                ).map((id) => (
                  <option key={id} value={id}>
                    {REGIME_FUNCIONAMENTO_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected && (
            <p className="text-xs text-[var(--color-muted)]">
              {selected.shortDescription}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onNext}
          className="bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </section>
  )
}
