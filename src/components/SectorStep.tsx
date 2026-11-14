import { useState } from 'react'
import {
  CUSTOM_SECTOR_ID,
  resolveSectorPreset,
  type SectorPreset,
} from '../engine/sectors'
import type { SectorTemplate } from '../templates'

interface SectorStepProps {
  templates: SectorTemplate[]
  selectedId: string | null
  sectorLabel: string
  sectorBufferPct: number
  onSelect: (id: string) => void
  onSectorMetaChange: (meta: {
    sectorLabel?: string
    sectorBufferPct?: number
  }) => void
  onNext: () => void
}

export function SectorStep({
  templates,
  selectedId,
  sectorLabel,
  sectorBufferPct,
  onSelect,
  onSectorMetaChange,
  onNext,
}: SectorStepProps) {
  const [customName, setCustomName] = useState(sectorLabel)
  const isCustom = selectedId === CUSTOM_SECTOR_ID
  const canContinue =
    Boolean(selectedId) &&
    (!isCustom || customName.trim().length > 0)

  function selectPreset(t: SectorTemplate) {
    const preset = resolveSectorPreset(t.id) as SectorPreset
    onSelect(t.id)
    if (t.id === CUSTOM_SECTOR_ID) {
      onSectorMetaChange({
        sectorLabel: customName.trim() || '',
        sectorBufferPct: preset.defaultBufferPct,
      })
    } else {
      onSectorMetaChange({
        sectorLabel: t.label,
        sectorBufferPct: preset.defaultBufferPct,
      })
    }
  }

  return (
    <section className="no-print space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Escolha o segmento</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          10 presets de mercado + Outro/Personalizado. No fluxo Apdata, o nome
          do ramo vem de <code>RamosAtividadesEmpresas</code> (texto real do
          banco).
        </p>
      </div>

      <ul className="space-y-3">
        {templates.map((t) => {
          const selected = t.id === selectedId
          const preset = resolveSectorPreset(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => selectPreset(t)}
                className={[
                  'w-full border px-4 py-4 text-left transition',
                  selected
                    ? 'border-[var(--color-teal)] bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-teal)]/40'
                    : 'border-[var(--color-line)] bg-white/80 hover:border-[var(--color-teal)]',
                ].join(' ')}
              >
                <span className="block text-lg font-medium text-[var(--color-ink)]">
                  {t.label}
                </span>
                <span className="mt-1 block text-sm text-[var(--color-muted)]">
                  {t.shortDescription}
                </span>
                <span className="mt-1 block text-xs text-[var(--color-muted)]">
                  Buffer sugerido {preset.defaultBufferPct}% · regime{' '}
                  {preset.defaultRegime}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {isCustom ? (
        <div className="space-y-3 border border-[var(--color-line)] bg-white/80 px-4 py-4">
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
        </div>
      ) : selectedId ? (
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">
            % Buffer / Absenteísmo (calibrável)
          </span>
          <input
            className="mt-1 w-full max-w-xs border border-[var(--color-line)] bg-white px-3 py-2"
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
      ) : null}

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
