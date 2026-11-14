/**
 * Step 4 — benefit mapping: Código + Descrição + Valor Médio with
 * Variável por Dia | Fixo Mensal | Ignorar overrides (live recalc).
 */

import {
  collectUniqueBenefits,
  type BenefitClass,
  type ExtractedBenefit,
} from '../apdata/classifyBenefit'

const CLASS_OPTIONS: { id: BenefitClass; label: string }[] = [
  { id: 'VARIAVEL_DIA', label: 'Variável por Dia (Escala)' },
  { id: 'FIXO_MENSAL', label: 'Fixo Mensal (Por Vida)' },
  { id: 'IGNORAR', label: 'Ignorar' },
]

function benefitKey(b: ExtractedBenefit): string {
  return `${b.codigo}::${b.descricao}`
}

interface BenefitMappingTableProps {
  benefits: ExtractedBenefit[]
  overrides: Record<string, BenefitClass>
  onOverrideChange: (key: string, next: BenefitClass) => void
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
            const value = overrides[key] ?? b.classificacao
            return (
              <tr
                key={key}
                className="border-t border-[var(--color-line)]/60"
              >
                <td className="px-2 py-1.5 font-mono text-xs">{b.codigo}</td>
                <td className="px-2 py-1.5">{b.descricao}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {b.valorMedio.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="w-full min-w-[12rem] border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
                    value={value}
                    onChange={(e) =>
                      onOverrideChange(key, e.target.value as BenefitClass)
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
