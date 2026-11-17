import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_OPERATING_HOURS } from './operating-hours'
import { simulate } from './simulate'
import { buildScenarioWhyBullets } from './scenario-why'
import type { SimulationInput } from './types'

function baseInput(
  overrides: Partial<SimulationInput> = {},
): SimulationInput {
  return {
    sector: 'varejo',
    headcount: 100,
    currentScale: '6x1',
    averageMonthlySalary: 2200,
    units: 1,
    shiftsPerDay: 1,
    scenarioId: 'fase1_2026_42h',
    operatingHours: DEFAULT_OPERATING_HOURS,
    ...overrides,
  }
}

describe('buildScenarioWhyBullets', () => {
  it('explains status_quo as keeping scale/HC', () => {
    const r = simulate(baseInput({ scenarioId: 'status_quo' }))
    const bullets = buildScenarioWhyBullets(r)
    assert.ok(bullets.length >= 3)
    assert.ok(bullets.some((b) => /Escala:.*mantém/i.test(b)))
    assert.ok(bullets.some((b) => /HC:.*fica em/i.test(b)))
    assert.ok(bullets.every((b) => !/\bdivisor salarial\b/i.test(b)))
  })

  it('explains fase1 scale change + HC up + CLT absorption', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        estrategiaAbsorcao: 'CONTRATACAO_INTEGRAL',
      }),
    )
    const bullets = buildScenarioWhyBullets(r)
    assert.ok(bullets.some((b) => /Escala: de 6x1 para/i.test(b)))
    assert.ok(bullets.some((b) => /HC:.*→/i.test(b)))
    assert.ok(bullets.some((b) => /contratação CLT/i.test(b)))
    assert.ok(bullets.some((b) => /Encargos/i.test(b)))
    assert.ok(bullets.some((b) => /Folha:/i.test(b)))
  })

  it('mentions HE cap path when HORA_EXTRA_MAXIMA', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        headcount: 10,
        estrategiaAbsorcao: 'HORA_EXTRA_MAXIMA',
      }),
    )
    const bullets = buildScenarioWhyBullets(r)
    assert.ok(bullets.some((b) => /Absorção:.*HE/i.test(b)))
  })

  it('mentions hybrid absorption mix', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        headcount: 20,
        estrategiaAbsorcao: 'HIBRIDO_INTERMITENTE',
      }),
    )
    const bullets = buildScenarioWhyBullets(r)
    assert.ok(bullets.some((b) => /Absorção híbrida/i.test(b)))
  })

  it('mentions continuous 7-day turmas when relevant', () => {
    const r = simulate(
      baseInput({
        scenarioId: 'fase1_2026_42h',
        defaultRegimeFuncionamento: 'CONTINUO_7D',
      }),
    )
    const bullets = buildScenarioWhyBullets(r)
    assert.ok(bullets.some((b) => /Turmas:.*contínuo/i.test(b)))
  })
})
