import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  countReplacements,
  decodeCsvBuffer,
} from './csvEncoding'
import { parsePayrollTolerant } from './parsePayrollTolerant'
import { parseNumberBr } from '../engine'

describe('csvEncoding', () => {
  it('keeps clean UTF-8', () => {
    const text = 'cargo;salário\nOperação;1'
    const buf = new TextEncoder().encode(text).buffer
    const r = decodeCsvBuffer(buf)
    assert.equal(r.encoding, 'utf-8')
    assert.ok(r.text.includes('salário'))
  })

  it('prefers windows-1252 when UTF-8 mojibakes', () => {
    // "salário" in windows-1252 bytes
    const bytes = Uint8Array.from([
      ...'cargo;sal'.split('').map((c) => c.charCodeAt(0)),
      0xe1, // á in windows-1252
      ...'rio\nX;1'.split('').map((c) => c.charCodeAt(0)),
    ])
    const r = decodeCsvBuffer(bytes.buffer)
    assert.equal(r.encoding, 'windows-1252')
    assert.ok(r.text.includes('salário'), r.text)
    assert.equal(countReplacements(r.text), 0)
  })
})

describe('parsePayrollTolerant + BR numbers', () => {
  it('parses comma-separated extractor CSV with BR numbers', () => {
    const csv = [
      'desc_cargo,cod_cc,qtd_colaboradores,massa_salarial_base,carga_semanal_atual,escala_atual,vr_dia_medio,vt_dia_medio,dias_trabalho_mes_atual',
      'Operador,CC-01,2,"4.400,00",44,6x1,"32,50","15,00",26',
    ].join('\n')
    const { rows, issues } = parsePayrollTolerant(csv)
    assert.equal(issues.length, 0, JSON.stringify(issues))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].salario, 2200)
    assert.equal(rows[0].vrValorDia, 32.5)
  })

  it('parseNumberBr handles 1.234,56', () => {
    assert.equal(parseNumberBr('1.234,56'), 1234.56)
    assert.equal(parseNumberBr('32,00'), 32)
    assert.equal(parseNumberBr('2200.00'), 2200)
  })
})
