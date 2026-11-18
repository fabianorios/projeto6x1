/**
 * Compact LGPD switch: collaborator names masked by default.
 * Managerial view may unmask for on-screen display only.
 */

import {
  DEFAULT_MASK_COLLABORATOR_NAMES,
  resolveCollaboratorDisplayName,
} from '../apdata/lgpdNameMask'

export type LgpdNameMaskToggleProps = {
  /** true = mask on (default / LGPD). */
  maskOn: boolean
  onChange: (maskOn: boolean) => void
  /** Optional sample names to preview under current policy. */
  sampleNames?: Array<string | null | undefined>
  className?: string
}

export function LgpdNameMaskToggle({
  maskOn,
  onChange,
  sampleNames = [],
  className = '',
}: LgpdNameMaskToggleProps) {
  const samples = sampleNames
    .map((n) => resolveCollaboratorDisplayName(n, { mask: maskOn }))
    .filter((n): n is string => Boolean(n))
    .slice(0, 5)

  return (
    <div
      className={`rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm ${className}`}
      data-testid="lgpd-name-mask-toggle"
    >
      <label className="flex cursor-pointer items-center gap-2 text-[var(--color-ink)]">
        <input
          type="checkbox"
          checked={maskOn}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-[var(--color-ink)]"
          aria-describedby="lgpd-name-mask-hint"
        />
        <span className="font-medium">Mascarar nomes (LGPD)</span>
      </label>
      <p
        id="lgpd-name-mask-hint"
        className="mt-1 text-xs text-[var(--color-muted)]"
      >
        Padrão ligado. Desligue só na visão gerencial interna; handoff JSON não
        exporta nomes sem máscara.
      </p>
      {samples.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--color-ink)]">
          {samples.map((label, i) => (
            <li key={`${label}-${i}`}>
              <span className="text-[var(--color-muted)]">Colaborador:</span>{' '}
              {label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Sem nomes na folha agregada — o switch vale quando houver
          identificação (ex. planilha com coluna nome).
        </p>
      )}
    </div>
  )
}

/** Hook-free default for first mount. */
export function initialLgpdNameMask(): boolean {
  return DEFAULT_MASK_COLLABORATOR_NAMES
}
