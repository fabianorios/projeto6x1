/**
 * Colloquial PT-BR “why” bullets for Passo 5 — baseline × proposto.
 * Tone: consultor em reunião; short; no jargon dump.
 */

import { REGIME_FUNCIONAMENTO_LABELS } from '../types'
import type { SimulationResult } from './types'

const MONEY_TOL = 1
const HOURS_TOL = 0.5

function brl(n: number): string {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function signedBrl(n: number): string {
  const abs = brl(Math.abs(n))
  if (n > 0) return `+${abs}`
  if (n < 0) return `−${abs}`
  return abs
}

function taxRegimeLabel(
  regime: SimulationResult['charges']['taxRegime'],
): string {
  switch (regime) {
    case 'SIMPLES':
      return 'Simples'
    case 'LUCRO_PRESUMIDO':
      return 'Lucro Presumido'
    case 'LUCRO_REAL':
      return 'Lucro Real'
    default:
      return regime
  }
}

function normalizeScale(label: string): string {
  return label.trim().toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '')
}

/**
 * Build short meeting-style bullets explaining why HC / scale / benefits /
 * charges moved (or stayed) vs baseline for this scenario projection.
 */
export function buildScenarioWhyBullets(
  result: SimulationResult,
): string[] {
  const {
    input,
    ruleVersion,
    coverage,
    cost,
    vr,
    vt,
    absorption,
    heCascade,
    charges,
    distribuicaoTurmas,
  } = result
  const params = ruleVersion.params
  const currentScale = input.currentScale.trim() || '—'
  const proposedScale = params.preserveCurrentScale
    ? currentScale
    : params.targetScale.label
  const scaleChanged =
    !params.preserveCurrentScale &&
    normalizeScale(currentScale) !== normalizeScale(proposedScale)

  const bullets: string[] = []

  // Escala
  if (!scaleChanged) {
    bullets.push(
      `Escala: mantém ${currentScale}. Neste cenário a gente não mexe no ciclo — o quadro atual é a referência.`,
    )
  } else if (coverage.additionalHeadcount <= 0) {
    bullets.push(
      `Escala: de ${currentScale} para ${proposedScale}. Com folga fixa no mesmo horário de operação, o ciclo muda sem pedir gente a mais.`,
    )
  } else {
    bullets.push(
      `Escala: de ${currentScale} para ${proposedScale}. Cada pessoa trabalha menos dias no ciclo; para manter o posto coberto, o HC sobe.`,
    )
  }

  // HC + cobertura mínima
  if (coverage.additionalHeadcount <= 0) {
    bullets.push(
      scaleChanged
        ? `HC: fica em ${coverage.currentHeadcount}. Mesmo horário e folga fixa já cobrem os dias de funcionamento — não precisa de segunda pessoa só por causa do fator 6×1→5×2.`
        : `HC: fica em ${coverage.currentHeadcount}. Não há vaga adicional neste recorte — cobertura mínima já está ok com o quadro atual.`,
    )
  } else {
    bullets.push(
      `HC: ${coverage.currentHeadcount} → ${coverage.requiredHeadcount} (+${coverage.additionalHeadcount}). É o quadro mínimo estimado para manter a mesma cobertura diária.`,
    )
  }

  // Absorção CLT / HE / híbrido (só quando há gap)
  if (absorption.gapHeadcount > 0) {
    switch (absorption.estrategia) {
      case 'CONTRATACAO_INTEGRAL':
        bullets.push(
          `Absorção: contratação CLT integral — o buraco de ${absorption.gapHeadcount} vaga(s) vira gente nova na folha, sem contar com HE para fechar.`,
        )
        break
      case 'HORA_EXTRA_MAXIMA':
        bullets.push(
          absorption.heCapReached
            ? `Absorção: prioriza HE até o teto (${absorption.heHoursUsed.toFixed(0)}/${absorption.heCapHours.toFixed(0)} h/mês). O teto bateu — o que sobrou ainda pede contratação (${absorption.hiresHeadcount}).`
            : `Absorção: prioriza HE (${absorption.heHoursUsed.toFixed(0)}/${absorption.heCapHours.toFixed(0)} h/mês) para segurar o gap sem contratar tudo de uma vez.`,
        )
        break
      case 'HIBRIDO_INTERMITENTE':
        bullets.push(
          `Absorção híbrida: ${absorption.heHoursUsed.toFixed(0)} h de HE` +
            (absorption.hiresHeadcount > 0
              ? ` + ${absorption.hiresHeadcount} contratação(ões)`
              : '') +
            (absorption.intermittentHeadcount > 0
              ? ` + ${absorption.intermittentHeadcount} intermitente`
              : '') +
            ' — mistura para não estourar o quadro nem o teto de HE.',
        )
        break
    }
  } else if (absorption.estrategia !== 'CONTRATACAO_INTEGRAL') {
    bullets.push(
      `Absorção (${absorption.estrategia === 'HORA_EXTRA_MAXIMA' ? 'HE máxima' : 'híbrida'}): sem gap neste cenário — a estratégia fica no banco, sem mexer no custo.`,
    )
  }

  // Gap residual se não completar quadro
  if (coverage.uncoveredShiftHoursPerWeek > HOURS_TOL) {
    bullets.push(
      `Cobertura: se não completar o quadro, sobram ~${coverage.uncoveredShiftHoursPerWeek.toFixed(0)} h/sem descobertas — é o risco operacional do “não contratar”.`,
    )
  }

  // Benefícios
  if (vr) {
    if (Math.abs(vr.monthlyDelta) < MONEY_TOL) {
      bullets.push(
        'VR: praticamente igual — dias/mês e quadro não mexeram o suficiente neste cenário.',
      )
    } else if (vr.monthlyDelta > 0) {
      bullets.push(
        coverage.additionalHeadcount > 0
          ? `VR sobe (${signedBrl(vr.monthlyDelta)}/mês) — mais gente no quadro e/ou ~${vr.proposedDaysPerMonth} dias/mês na escala-alvo.`
          : `VR sobe (${signedBrl(vr.monthlyDelta)}/mês) com HC igual — os dias/mês atuais na folha (~menor que ~${vr.proposedDaysPerMonth} do alvo) estão abaixo da estimativa 5×2; vale checar a apuração da jornada (modo_dias / ciclo).`,
      )
    } else {
      bullets.push(
        coverage.additionalHeadcount <= 0
          ? `VR cai (${signedBrl(vr.monthlyDelta)}/mês) — com HC igual, a escala-alvo tem menos dias pagos (~${vr.proposedDaysPerMonth}/mês) que o atual.`
          : `VR cai (${signedBrl(vr.monthlyDelta)}/mês) — menos dias/mês na escala-alvo ou quadro menor neste recorte.`,
      )
    }
  }

  if (vt) {
    if (Math.abs(vt.monthlyDelta) < MONEY_TOL) {
      bullets.push(
        'VT: praticamente igual — mesma lógica do VR (dias × gente).',
      )
    } else if (vt.monthlyDelta > 0) {
      bullets.push(
        coverage.additionalHeadcount > 0
          ? `VT sobe (${signedBrl(vt.monthlyDelta)}/mês) — acompanha HC/dias na escala-alvo (~${vt.proposedDaysPerMonth} dias/mês).`
          : `VT sobe (${signedBrl(vt.monthlyDelta)}/mês) com HC igual — dias atuais na folha abaixo de ~${vt.proposedDaysPerMonth} do alvo (mesma checagem de apuração do VR).`,
      )
    } else {
      bullets.push(
        coverage.additionalHeadcount <= 0
          ? `VT cai (${signedBrl(vt.monthlyDelta)}/mês) — HC igual e menos dias/mês na escala-alvo (~${vt.proposedDaysPerMonth}).`
          : `VT cai (${signedBrl(vt.monthlyDelta)}/mês) — menos dias/mês ou menos gente no proposto.`,
      )
    }
  }

  // Encargos + divisor HE
  const chargePct = Math.round(charges.employerChargeRate * 100)
  const heOnlyDelta =
    coverage.additionalHeadcount <= 0 &&
    heCascade.heCostDelta > MONEY_TOL &&
    Math.abs(cost.monthlyDelta - heCascade.heCostDelta) < MONEY_TOL

  if (Math.abs(cost.monthlyDelta) < MONEY_TOL) {
    bullets.push(
      `Encargos (${taxRegimeLabel(charges.taxRegime)}, ~${chargePct}%): acompanham a massa — e a folha ficou estável neste cenário.`,
    )
  } else if (heOnlyDelta) {
    bullets.push(
      `Encargos (${taxRegimeLabel(charges.taxRegime)}, ~${chargePct}%): massa salarial igual (HC parado) — o Δ folha vem da HE reprecificada no divisor, não de gente nova.`,
    )
  } else {
    bullets.push(
      `Encargos (${taxRegimeLabel(charges.taxRegime)}, ~${chargePct}%): sobem/descem com a massa salarial projetada` +
        (coverage.additionalHeadcount > 0
          ? ' e com o onboarding das novas vagas.'
          : '.'),
    )
  }

  if (heCascade.heCostDelta > MONEY_TOL && heCascade.heHoursExisting > 0) {
    bullets.push(
      `HE já existente fica mais cara: divisor ${heCascade.baselineDivisor}→${heCascade.scenarioDivisor} sobe o valor/hora (mesmo volume de horas).`,
    )
  }

  // Turmas / regime
  const regimeLabel = REGIME_FUNCIONAMENTO_LABELS[distribuicaoTurmas.regime]
  if (distribuicaoTurmas.regime === 'CONTINUO_7D') {
    bullets.push(
      `Turmas: operação ${regimeLabel.toLowerCase()} → ${distribuicaoTurmas.crewCount} turmas 5×2 rodando, para ter gente no posto todo dia (cobertura diária ${distribuicaoTurmas.dailyCoverageNeed}).`,
    )
  } else if (distribuicaoTurmas.crewCount > 0) {
    bullets.push(
      `Turmas: ${regimeLabel} com ${distribuicaoTurmas.crewCount} turma(s) · cobertura diária ${distribuicaoTurmas.dailyCoverageNeed} · HC alocado ${distribuicaoTurmas.totalHeadcount}.`,
    )
  }

  // Folha one-liner (only if not already obvious from flat case)
  if (Math.abs(cost.monthlyDelta) >= MONEY_TOL) {
    bullets.push(
      cost.monthlyDelta > 0
        ? `Folha: sobe ${signedBrl(cost.monthlyDelta)}/mês — mistura de HC, benefícios, divisor/HE e encargos.`
        : `Folha: cai ${signedBrl(cost.monthlyDelta)}/mês neste recorte.`,
    )
  }

  return bullets
}
