import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeCsvBuffer } from './csvEncoding'
import {
  detectDelimiterFromText,
  detectPayrollDelimiter,
  parsePayrollTolerant,
} from './parsePayrollTolerant'

const EXTRACTOR_HEADERS = [
  'desc_cargo',
  'cod_cc',
  'qtd_colaboradores',
  'massa_salarial_base',
  'carga_semanal_atual',
  'escala_atual',
  'vr_dia_medio',
  'vt_dia_medio',
  'dias_trabalho_mes_atual',
]

describe('detectPayrollDelimiter', () => {
  it('prefers TAB when present in the header', () => {
    assert.equal(
      detectPayrollDelimiter(EXTRACTOR_HEADERS.join('\t')),
      '\t',
    )
    // TAB wins even if commas also appear (e.g. notes in a quoted cell).
    assert.equal(
      detectPayrollDelimiter('desc_cargo\tcod_cc,"a,b"'),
      '\t',
    )
  })

  it('falls back to ; then ,', () => {
    assert.equal(detectPayrollDelimiter('a;b;c'), ';')
    assert.equal(detectPayrollDelimiter('a,b,c'), ',')
    assert.equal(detectDelimiterFromText('x;y\n1;2'), ';')
  })
})

describe('parsePayrollTolerant TAB .txt', () => {
  it('parses Aptools-style TAB-separated TXT with BR decimals', () => {
    const txt = [
      EXTRACTOR_HEADERS.join('\t'),
      [
        'Operador',
        'CC-01',
        '2',
        '4.400,00',
        '44',
        '6x1',
        '32,50',
        '15,00',
        '26',
      ].join('\t'),
    ].join('\n')

    assert.equal(detectDelimiterFromText(txt), '\t')
    const { rows, issues } = parsePayrollTolerant(txt)
    assert.equal(issues.length, 0, JSON.stringify(issues))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cargo, 'Operador')
    assert.equal(rows[0].centroCusto, 'CC-01')
    assert.equal(rows[0].quantidade, 2)
    assert.equal(rows[0].salario, 2200)
    assert.equal(rows[0].vrValorDia, 32.5)
    assert.equal(rows[0].vtValorDia, 15)
  })

  it('parses Windows-1252 TAB TXT after decode (BR accents + decimals)', () => {
    // "Operação" with á = 0xE1 in windows-1252
    const header = EXTRACTOR_HEADERS.join('\t')
    const cargoBytes = Uint8Array.from([
      ...'Opera'.split('').map((c) => c.charCodeAt(0)),
      0xe7, // ç
      ...'ão'.split('').map((c) => c.charCodeAt(0)),
    ])
    const rowRest = [
      '',
      'CC-02',
      '1',
      '1.234,56',
      '44',
      '6x1',
      '20,00',
      '10,00',
      '26',
    ].join('\t')
    // Build buffer: header\n + cargo (win1252) + rest of row
    const headerAndNl = new TextEncoder().encode(header + '\n')
    const rest = new TextEncoder().encode(rowRest)
    const bytes = new Uint8Array(
      headerAndNl.length + cargoBytes.length + rest.length,
    )
    bytes.set(headerAndNl, 0)
    bytes.set(cargoBytes, headerAndNl.length)
    bytes.set(rest, headerAndNl.length + cargoBytes.length)

    const { text, encoding } = decodeCsvBuffer(bytes.buffer)
    assert.equal(encoding, 'windows-1252')
    assert.ok(text.includes('Operação'), text)

    const { rows, issues } = parsePayrollTolerant(text)
    assert.equal(issues.length, 0, JSON.stringify(issues))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cargo, 'Operação')
    assert.equal(rows[0].salario, 1234.56)
  })
})
