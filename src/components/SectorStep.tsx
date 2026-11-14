import type { SectorTemplate } from '../templates'

interface SectorStepProps {
  templates: SectorTemplate[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNext: () => void
}

export function SectorStep({
  templates,
  selectedId,
  onSelect,
  onNext,
}: SectorStepProps) {
  return (
    <section className="no-print space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Escolha o segmento</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Segmentos: varejo, hospital, construção e locação. No fluxo Apdata,
          ramos vêm de <code>RamosAtividadesEmpresas</code>.
        </p>
      </div>

      <ul className="space-y-3">
        {templates.map((t) => {
          const selected = t.id === selectedId
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
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
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!selectedId}
          onClick={onNext}
          className="bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </section>
  )
}
