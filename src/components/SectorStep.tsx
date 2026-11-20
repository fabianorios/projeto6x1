import { useEffect, useId, useMemo, useState } from 'react'
import {
  CUSTOM_SECTOR_ID,
  formatCnaeLabel,
  isPersonalizadoGroup,
  operationalGroupFromSector,
  OPERATIONAL_GROUPS,
  REGIME_FUNCIONAMENTO_LABELS,
  resolveSectorPreset,
  searchCnaeCatalog,
  type CnaeEntry,
  type OperationalGroup,
  type OperationalGroupId,
  type RegimeFuncionamento,
} from '../engine'

interface SectorStepProps {
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

function GroupIllustration({
  groupId,
}: {
  groupId: OperationalGroupId
}) {
  const common = {
    width: 56,
    height: 40,
    viewBox: '0 0 56 40',
    fill: 'none',
    'aria-hidden': true as const,
  }
  switch (groupId) {
    case 'saude':
      return (
        <svg {...common}>
          <rect x="8" y="10" width="28" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          <path d="M18 18h8M22 14v8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="42" cy="22" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
          <path d="M42 18v8M38 22h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'construcao':
      return (
        <svg {...common}>
          <path d="M10 30V14l10-6 10 6v16" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          <path d="M16 30V20h8v10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M36 8v22M32 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="40" cy="28" r="5" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
        </svg>
      )
    case 'industria':
      return (
        <svg {...common}>
          <path d="M6 30V16l8 4V16l8 4v10" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          <rect x="30" y="12" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
          <circle cx="39" cy="21" r="5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M39 16v10M34 21h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    case 'comercio':
      return (
        <svg {...common}>
          <path d="M8 16h28l-2 14H10L8 16Z" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          <path d="M12 16V12h8l2 4" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="42" cy="22" r="7" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
          <path d="M42 19v6M42 19l3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'servicos':
      return (
        <svg {...common}>
          <rect x="6" y="18" width="22" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
          <path d="M10 18V14h10l4 4" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="12" cy="30" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="24" cy="30" r="2.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="34" y="12" width="14" height="18" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
          <path d="M38 20h6M38 24h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path
            d="M18 12c4-4 10-2 12 2 2 4-1 8-5 9"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.7"
          />
          <path
            d="M38 28c-4 4-10 2-12-2-2-4 1-8 5-9"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.7"
          />
          <circle cx="20" cy="14" r="3" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="36" cy="26" r="3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
  }
}

export function SectorStep({
  selectedId,
  sectorLabel,
  sectorBufferPct,
  defaultRegime,
  onSelect,
  onSectorMetaChange,
  onNext,
}: SectorStepProps) {
  const cnaeListId = useId()
  const activeGroup = operationalGroupFromSector(selectedId)
  const isCustom = isPersonalizadoGroup(activeGroup)
  const [customName, setCustomName] = useState(sectorLabel)
  const [cnaeQuery, setCnaeQuery] = useState('')
  const [cnaeOpen, setCnaeOpen] = useState(false)

  useEffect(() => {
    if (isCustom) setCustomName(sectorLabel)
  }, [isCustom, sectorLabel])

  const regime =
    defaultRegime ??
    activeGroup.defaultRegime ??
    ('SEG_SEX' as RegimeFuncionamento)

  const cnaeHits = useMemo(
    () => searchCnaeCatalog(cnaeQuery, 8),
    [cnaeQuery],
  )

  const canContinue =
    Boolean(selectedId) && (!isCustom || customName.trim().length > 0)

  function selectGroup(group: OperationalGroup) {
    onSelect(group.sectorId)
    setCnaeOpen(false)
    setCnaeQuery('')
    if (group.id === 'personalizado') {
      // Start blank so Continuar requires CNAE / nome — don't inherit prior group label.
      setCustomName('')
      onSectorMetaChange({
        sectorLabel: '',
        sectorBufferPct: group.defaultBufferPct,
        defaultRegimeFuncionamento: group.defaultRegime,
      })
    } else {
      setCustomName(group.label)
      onSectorMetaChange({
        sectorLabel: group.label,
        sectorBufferPct: group.defaultBufferPct,
        defaultRegimeFuncionamento: group.defaultRegime,
      })
    }
  }

  function applyCnae(entry: CnaeEntry) {
    const label = formatCnaeLabel(entry)
    const nearest = resolveSectorPreset(entry.nearestSectorId)
    setCustomName(label)
    setCnaeQuery(label)
    setCnaeOpen(false)
    onSelect(CUSTOM_SECTOR_ID)
    onSectorMetaChange({
      sectorLabel: label,
      sectorBufferPct: OPERATIONAL_GROUPS.find((g) => g.id === 'personalizado')!
        .defaultBufferPct,
      defaultRegimeFuncionamento: nearest.defaultRegime,
    })
  }

  const lumenBody = isCustom
    ? customName.trim()
      ? `Segmento «${customName.trim()}»: calibre buffer e regime com a folha real.`
      : activeGroup.lumenTip
    : `${activeGroup.label}: ${activeGroup.lumenTip}`

  return (
    <section className="no-print space-y-6" data-testid="sector-step">
      <div>
        <h2
          className="editorial-decision-title text-xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Segmento e contexto
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Escolha um dos seis grupos operacionais ou Personalizado / CNAE.
          Buffer e regime ficam editáveis abaixo.
        </p>
      </div>

      <div className="sector-step-layout">
        <div className="min-w-0 space-y-5">
          <div
            className="sector-group-grid"
            role="radiogroup"
            aria-label="Grupos operacionais"
          >
            {OPERATIONAL_GROUPS.map((group) => {
              const active = activeGroup.id === group.id
              return (
                <button
                  key={group.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`sector-group-${group.id}`}
                  onClick={() => selectGroup(group)}
                  className={[
                    'sector-group-card',
                    active ? 'sector-group-card--active' : '',
                  ].join(' ')}
                >
                  {group.badge && (
                    <span className="sector-group-badge">{group.badge}</span>
                  )}
                  <span className="sector-group-illust text-[var(--color-green)]">
                    <GroupIllustration groupId={group.id} />
                  </span>
                  <span
                    className={[
                      'sector-group-title',
                      active ? 'sector-group-title--active' : '',
                    ].join(' ')}
                  >
                    {group.label}
                  </span>
                  <span className="sector-group-desc">
                    {group.shortDescription}
                  </span>
                  {group.id === 'personalizado' && active && (
                    <div
                      className="sector-cnae-field"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <label className="block text-left text-xs text-[var(--color-muted)]">
                        CNAE fiscal
                        <input
                          type="search"
                          className="mt-1 w-full border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-sm text-[var(--color-ink)]"
                          placeholder="Código ou descrição…"
                          value={cnaeQuery || customName}
                          aria-autocomplete="list"
                          aria-controls={cnaeListId}
                          aria-expanded={cnaeOpen}
                          onFocus={() => setCnaeOpen(true)}
                          onChange={(e) => {
                            const v = e.target.value
                            setCnaeQuery(v)
                            setCustomName(v)
                            setCnaeOpen(true)
                            onSectorMetaChange({ sectorLabel: v })
                          }}
                        />
                      </label>
                      {cnaeOpen && (
                        <ul
                          id={cnaeListId}
                          role="listbox"
                          className="sector-cnae-dropdown"
                        >
                          {cnaeHits.length === 0 && (
                            <li className="px-2.5 py-2 text-xs text-[var(--color-muted)]">
                              Nenhum CNAE na lista — use o texto livre.
                            </li>
                          )}
                          {cnaeHits.map((entry) => (
                            <li key={entry.code}>
                              <button
                                type="button"
                                role="option"
                                className="w-full px-2.5 py-2 text-left text-xs hover:bg-[var(--color-accent-soft)]"
                                onClick={() => applyCnae(entry)}
                              >
                                <span className="block font-medium tabular-nums text-[var(--color-ink)]">
                                  {entry.code}
                                </span>
                                <span className="block text-[var(--color-muted)]">
                                  {entry.description}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="sector-meta-row">
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">
                % Buffer / Absenteísmo
              </span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.5}
                  value={sectorBufferPct}
                  aria-label="Buffer percentual"
                  className="sector-buffer-slider min-w-0 flex-1"
                  onChange={(e) =>
                    onSectorMetaChange({
                      sectorBufferPct: Number(e.target.value) || 0,
                    })
                  }
                />
                <input
                  className="w-16 border border-[var(--color-line)] bg-white px-2 py-1.5 text-center text-sm tabular-nums"
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
              </div>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">
                Regime operacional (padrão)
              </span>
              <select
                className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
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

          {activeGroup && !isCustom && (
            <p className="text-xs text-[var(--color-muted)]">
              {activeGroup.shortDescription}
            </p>
          )}
        </div>

        <aside
          className="lumen-consult-panel"
          data-testid="lumen-consult-panel"
          aria-label="Análise · Dica da Lumen"
        >
          <div className="lumen-consult-orb" aria-hidden>
            <span className="lumen-consult-orb-core" />
          </div>
          <p className="editorial-decision-kicker">Análise · Dica da Lumen</p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]">
            {lumenBody}
          </p>
          <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-muted)]">
            Grupo selecionado:{' '}
            <strong className="font-medium text-[var(--color-ink)]">
              {isCustom && customName.trim()
                ? customName.trim()
                : activeGroup.label}
            </strong>
            {' · '}
            Buffer{' '}
            <span className="tabular-nums">{sectorBufferPct}%</span>
          </p>
        </aside>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onNext}
          className="btn-primary px-5 py-2.5 text-sm font-medium shadow-sm disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </section>
  )
}
