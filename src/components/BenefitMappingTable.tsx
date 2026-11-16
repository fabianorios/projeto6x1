/**
 * Step 4 — benefit mapping: Código + Descrição + Valor Médio with
 * Variável por Dia | Fixo Mensal | Ignorar overrides (live recalc).
 * Values are session-local (editable before simulate).
 */

import {
  benefitKey,
  collectUniqueBenefits,
  type BenefitClass,
  type BenefitSessionOverride,
  type BenefitSessionOverrides,
  type ExtractedBenefit,
} from '../apdata/classifyBenefit'

const CLASS_OPTIONS: { id: BenefitClass; label: string }[] = [
  { id: 'VARIAVEL_DIA', label: 'Variável por Dia (Escala)' },
  { id: 'FIXO_MENSAL', label: 'Fixo Mensal (Por Vida)' },
  { id: 'IGNORAR', label: 'Ignorar' },
]

interface BenefitMappingTableProps {
  benefits: ExtractedBenefit[]
  overrides: BenefitSessionOverrides
  onOverrideChange: (key: string, patch: BenefitSessionOverride) => void
}

export function BenefitMappingTable({
  benefits,
  overrides,
  onOverrideChange,
}: BenefitMappingTableProps) {
  const list = collectUniqueBenefits([{ benefits }])

  if (list.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Nenhum benefício dinâmico na carga. Use Aptools com a query oficial
        (coluna <code>beneficios_agg</code>) ou conexão direta.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto border border-[var(--color-line)] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--color-accent-soft)]/70 text-xs">
          <tr>
            <th className="px-2 py-2 font-medium">Código</th>
            <th className="px-2 py-2 font-medium">Descrição</th>
            <th className="px-2 py-2 font-medium">Valor médio</th>
            <th className="px-2 py-2 font-medium">Classificação</th>
          </tr>
        </thead>
        <tbody>
          {list.map((b) => {
            const key = benefitKey(b)
            const over = overrides[key]
            const classValue = over?.classificacao ?? b.classificacao
            const valorValue =
              over?.valorMedio != null && Number.isFinite(over.valorMedio)
                ? over.valorMedio
                : b.valorMedio
            return (
              <tr
                key={key}
                className="border-t border-[var(--color-line)]/60"
              >
                <td className="px-2 py-1.5 font-mono text-xs">{b.codigo}</td>
                <td className="px-2 py-1.5">{b.descricao}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full min-w-[6.5rem] border border-[var(--color-line)] bg-white px-2 py-1 text-xs tabular-nums"
                    value={Number.isFinite(valorValue) ? valorValue : ''}
                    aria-label={`Valor médio ${b.descricao}`}
                    onChange={(e) => {
                      const raw = e.target.value.trim()
                      if (raw === '') return
                      const n = Number(raw.replace(',', '.'))
                      if (!Number.isFinite(n) || n < 0) return
                      onOverrideChange(key, { valorMedio: n })
                    }}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="w-full min-w-[12rem] border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
                    value={classValue}
                    onChange={(e) =>
                      onOverrideChange(key, {
                        classificacao: e.target.value as BenefitClass,
                      })
                    }
                  >
                    {CLASS_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
