/**
 * Rotina 1215 — arquivo-texto de inclusão para Jornadas (29752) + JornadasItens (29762).
 *
 * Formato (Ajuda Apdata → docs/rotina-1215.md):
 *   Inclusão: IdTransacao;IdCampo;(conteudo)IdCampo;(conteudo)…
 *   Datas: AAAAMMDD. Sem espaços entre tokens (exceto dentro de literais).
 *
 * Modelo corrigido (PX-180):
 *   - Uma jornada (29752) por composição de períodos — única globalmente
 *     (não por local/CC/cargo; não MANHA/TARDE/ALMOCO como jornadas top-level).
 *   - Steps (29762) = 1 período contínuo ou 2 períodos de trabalho com gap de almoço.
 *   - Horários (15932/19762) fora deste entregável.
 *
 * Field IDs = ACP_CdiCampo (Campos / interface-consultar):
 *   Jornadas 6510 · JornadasItens 6515.
 * Não inventar INSERT SQL. Não grava no ERP.
 */

import {
  buildApdataHierarchy,
  type ApdataJornada,
  type ApdataWorkPeriod,
  type SimulationResult,
} from '../engine'

/** Rotina Apdata «Importação de Dados (Interface)». */
export const ROTINA_1215 = 1215 as const

/** Inclusão em Jornadas — objeto 3061. */
export const TX_INCLUSAO_JORNADAS = 29752 as const

/** Inclusão em JornadasItens — objeto 3061 (não filha por chave). */
export const TX_INCLUSAO_JORNADAS_ITENS = 29762 as const

export const ROTINA_1215_JORNADAS_LAYOUT_VERSION =
  'turnocheck-rotina-1215-jornadas-29752-29762-v2' as const

/** Default JOR_CdiTipoApuracaoJornada — domínio «Pela Entrada». */
export const DEFAULT_TIPO_APURACAO_JORNADA = 1 as const

/** TiposJornadas «Trabalho» (TEMP seed). */
export const TIPO_JORNADA_TRABALHO = 1 as const

/**
 * Campos emitidos na inclusão 29752 (tabela 6510).
 */
export const JORNADAS_1215_CAMPOS = {
  cosIdentificadorTabela: {
    id: 120531,
    tecnico: 'JOR_CosIdentificadorTabela',
    literal: 'Identificador da Tabela',
    obrigatorio: true,
  },
  d1sJornada: {
    id: 45025,
    tecnico: 'JOR_D1sJornada',
    literal: 'Jornada',
    obrigatorio: false,
  },
  hrdTotalHorasPrevistasTrab: {
    id: 116457,
    tecnico: 'JOR_HrdTotalHorasPrevistasTrab',
    literal: 'Total de Horas Previstas de Trabalho',
    obrigatorio: false,
  },
  cdiTipoApuracaoJornada: {
    id: 10808,
    tecnico: 'JOR_CdiTipoApuracaoJornada',
    literal: 'Tipo de Apuração de Jornada',
    obrigatorio: false,
  },
  oplDesativado: {
    id: 126242,
    tecnico: 'JOR_OplDesativado',
    literal: 'Considerar Desativado',
    obrigatorio: false,
  },
  oplNoturna: {
    id: 10847,
    tecnico: 'JOR_OplNoturna',
    literal: 'Considerar Jornada Noturna',
    obrigatorio: false,
  },
} as const

/**
 * Campos emitidos na inclusão 29762 (tabela 6515).
 * JOI_CdiJornadaItem (45050) não emitido — PK na efetiva.
 * JOI_CdiJornada recebe o CosIdentificador da jornada pai (lookup Aptools).
 */
export const JORNADAS_ITENS_1215_CAMPOS = {
  cdiJornada: {
    id: 45055,
    tecnico: 'JOI_CdiJornada',
    literal: 'Jornada',
    obrigatorio: false,
  },
  cdiTipoJornada: {
    id: 45060,
    tecnico: 'JOI_CdiTipoJornada',
    literal: 'Tipo de Jornada',
    obrigatorio: true,
  },
  hrdHoraMinutoInicio: {
    id: 45065,
    tecnico: 'JOI_HrdHoraMinutoInicio',
    literal: 'Hora Minuto Início',
    obrigatorio: false,
  },
  hrdHoraMinutoFim: {
    id: 45070,
    tecnico: 'JOI_HrdHoraMinutoFim',
    literal: 'Hora Minuto Fim',
    obrigatorio: false,
  },
  nuiOrdem: {
    id: 132634,
    tecnico: 'JOI_NuiOrdem',
    literal: 'Ordem',
    obrigatorio: false,
  },
  oplDesativado: {
    id: 126248,
    tecnico: 'JOI_OplDesativado',
    literal: 'Considerar Desativado',
    obrigatorio: false,
  },
} as const

/** Outras inclusões da carga de horários — stubs. */
export const TX_INCLUSAO_HORARIOS = 15932 as const
export const TX_INCLUSAO_HORARIOS_JORNADAS = 19762 as const

export interface Rotina1215JornadasExportOptions {
  dataInicio?: string
  includeLunchJornada?: boolean
  selectedHorarioIds?: string[]
}

export interface Rotina1215CampoValor {
  id: number
  valor: string
}

export interface Rotina1215JornadaRow {
  cosIdentificador: string
  d1sJornada: string
  /** Duração HH:MM:SS (conteúdo do campo Hrd). */
  hrdTotalHhMmSs: string
  cdiTipoApuracaoJornada: number
  oplDesativado: 0 | 1
  oplNoturna: 0 | 1
  workPeriods: readonly ApdataWorkPeriod[]
}

export interface Rotina1215JornadaItemRow {
  /** CosIdentificador da jornada pai (lookup em JOI_CdiJornada). */
  jornadaCos: string
  cdiTipoJornada: number
  hrdInicioHhMmSs: string
  hrdFimHhMmSs: string
  nuiOrdem: number
  oplDesativado: 0 | 1
}

/** Decimal hours → HH:MM:SS for Hrd fields. */
export function horasDiaToHhMmSs(horasDia: number): string {
  if (!Number.isFinite(horasDia) || horasDia < 0) {
    return '00:00:00'
  }
  const totalSeconds = Math.round(horasDia * 3600)
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Clock `HH:MM` or `HH:MM:SS` → HH:MM:SS. */
export function clockToHhMmSs(raw: string): string {
  const s = raw.trim()
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (!m) return sanitizeLiteral(s)
  const hh = String(Number(m[1])).padStart(2, '0')
  const mm = m[2]!
  const ss = m[3] ?? '00'
  return `${hh}:${mm}:${ss}`
}

/** ISO `YYYY-MM-DD` or `DD/MM/YYYY` → AAAAMMDD (Ajuda 1215). */
export function toAaaammdd(raw: string): string {
  const s = raw.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (br) return `${br[3]}${br[2]}${br[1]}`
  if (/^\d{8}$/.test(s)) return s
  return s
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max)
}

/** Reject parentheses inside literals (Ajuda 1215). */
function sanitizeLiteral(value: string): string {
  return value.replace(/[()]/g, '').trim()
}

/** Infer night flag from outer work window (end clock earlier than start). */
export function inferOplNoturna(jornada: ApdataJornada): 0 | 1 {
  const periods = jornada.workPeriods
  if (periods.length === 0 && jornada.steps.length >= 2) {
    const first = jornada.steps[0]!.hora
    const last = jornada.steps[jornada.steps.length - 1]!.hora
    return clockToMinutes(last) < clockToMinutes(first) ? 1 : 0
  }
  if (periods.length === 0) return 0
  const first = periods[0]!
  const last = periods[periods.length - 1]!
  return clockToMinutes(last.fim) < clockToMinutes(first.inicio) ? 1 : 0
}

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

/**
 * Monta uma linha de inclusão 1215 (Gestão `interface-gerar` / Ajuda).
 * Sem colchetes — inclusão (tipo 2) não usa chave [].
 */
export function buildLinhaInclusao1215(
  idTransacao: number,
  campos: readonly Rotina1215CampoValor[],
): string {
  const corpo = campos
    .filter((c) => c.valor !== '')
    .map((c) => `${c.id};(${sanitizeLiteral(c.valor)})`)
    .join('')
  return `${idTransacao};${corpo}`
}

/**
 * Map hierarchy jornadas → 29752 rows.
 * Dedupes by `codigo` (already unique in catalog; re-checked here).
 */
export function buildRotina1215JornadaRows(
  jornadas: readonly ApdataJornada[],
): Rotina1215JornadaRow[] {
  const byCode = new Map<string, Rotina1215JornadaRow>()
  for (const j of jornadas) {
    const cos = j.codigo.trim()
    if (!cos || byCode.has(cos)) continue
    const periods =
      j.workPeriods.length > 0
        ? j.workPeriods
        : periodsFromLegacySteps(j)
    byCode.set(cos, {
      cosIdentificador: truncate(cos, 30),
      d1sJornada: truncate(j.descricao, 50),
      hrdTotalHhMmSs: horasDiaToHhMmSs(j.horasDia),
      cdiTipoApuracaoJornada: DEFAULT_TIPO_APURACAO_JORNADA,
      oplDesativado: 0,
      oplNoturna: inferOplNoturna({ ...j, workPeriods: [...periods] }),
      workPeriods: periods,
    })
  }
  return [...byCode.values()].sort((a, b) =>
    a.cosIdentificador.localeCompare(b.cosIdentificador),
  )
}

/** @deprecated Prefer buildRotina1215JornadaRows */
export const buildComandosDmlJornadaRows = buildRotina1215JornadaRows

function periodsFromLegacySteps(j: ApdataJornada): ApdataWorkPeriod[] {
  const entrada = j.steps.find((s) => s.tipo === 'ENTRADA')
  const saida = [...j.steps].reverse().find((s) => s.tipo === 'SAIDA')
  if (!entrada || !saida) return []
  return [
    {
      ordem: 1,
      startHour: 0,
      endHour: 0,
      inicio: entrada.hora,
      fim: saida.hora,
    },
  ]
}

export function buildRotina1215JornadaItemRows(
  jornadas: readonly Rotina1215JornadaRow[],
): Rotina1215JornadaItemRow[] {
  const items: Rotina1215JornadaItemRow[] = []
  for (const j of jornadas) {
    for (const p of j.workPeriods) {
      items.push({
        jornadaCos: j.cosIdentificador,
        cdiTipoJornada: TIPO_JORNADA_TRABALHO,
        hrdInicioHhMmSs: clockToHhMmSs(p.inicio),
        hrdFimHhMmSs: clockToHhMmSs(p.fim),
        nuiOrdem: p.ordem,
        oplDesativado: 0,
      })
    }
  }
  return items
}

function jornadaRowToCampos(row: Rotina1215JornadaRow): Rotina1215CampoValor[] {
  const C = JORNADAS_1215_CAMPOS
  return [
    { id: C.cosIdentificadorTabela.id, valor: row.cosIdentificador },
    { id: C.d1sJornada.id, valor: row.d1sJornada },
    { id: C.hrdTotalHorasPrevistasTrab.id, valor: row.hrdTotalHhMmSs },
    {
      id: C.cdiTipoApuracaoJornada.id,
      valor: String(row.cdiTipoApuracaoJornada),
    },
    { id: C.oplDesativado.id, valor: String(row.oplDesativado) },
    { id: C.oplNoturna.id, valor: String(row.oplNoturna) },
  ]
}

function itemRowToCampos(row: Rotina1215JornadaItemRow): Rotina1215CampoValor[] {
  const C = JORNADAS_ITENS_1215_CAMPOS
  return [
    { id: C.cdiJornada.id, valor: row.jornadaCos },
    { id: C.cdiTipoJornada.id, valor: String(row.cdiTipoJornada) },
    { id: C.hrdHoraMinutoInicio.id, valor: row.hrdInicioHhMmSs },
    { id: C.hrdHoraMinutoFim.id, valor: row.hrdFimHhMmSs },
    { id: C.nuiOrdem.id, valor: String(row.nuiOrdem) },
    { id: C.oplDesativado.id, valor: String(row.oplDesativado) },
  ]
}

export function rowToLinha1215(row: Rotina1215JornadaRow): string {
  return buildLinhaInclusao1215(TX_INCLUSAO_JORNADAS, jornadaRowToCampos(row))
}

export function itemRowToLinha1215(row: Rotina1215JornadaItemRow): string {
  return buildLinhaInclusao1215(
    TX_INCLUSAO_JORNADAS_ITENS,
    itemRowToCampos(row),
  )
}

/**
 * Full .txt body — 29752 lines then 29762 lines (deduped catalog).
 * Order: all jornadas first (import seq), then items linked by Cos.
 */
export function buildRotina1215JornadasText(
  jornadas: readonly ApdataJornada[],
  _options: Rotina1215JornadasExportOptions = {},
): string {
  const rows = buildRotina1215JornadaRows(jornadas)
  if (rows.length === 0) return ''
  const items = buildRotina1215JornadaItemRows(rows)
  const lines = [
    ...rows.map(rowToLinha1215),
    ...items.map(itemRowToLinha1215),
  ]
  return lines.join('\n') + '\n'
}

export function buildRotina1215JornadasFromResult(
  result: SimulationResult,
  options: Rotina1215JornadasExportOptions = {},
): string {
  const tree = buildApdataHierarchy(result, {
    dataInicio: options.dataInicio,
    includeLunchJornada: options.includeLunchJornada,
    selectedHorarioIds: options.selectedHorarioIds,
  })
  return buildRotina1215JornadasText(tree.jornadas, options)
}

/** Browser download — não envia ao ERP. */
export function downloadRotina1215Jornadas(
  result: SimulationResult,
  options: Rotina1215JornadasExportOptions = {},
): void {
  const text = buildRotina1215JornadasFromResult(result, options)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.download = `turnocheck-rotina-1215-jornadas-${TX_INCLUSAO_JORNADAS}-${TX_INCLUSAO_JORNADAS_ITENS}-${stamp}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

/* ---- Compat aliases (PR #76/#77 names) — same 1215 text, no INSERT ---- */

/** @deprecated Use ROTINA_1215 */
export const COMANDOS_DML_JORNADAS_ROTINA = ROTINA_1215
/** @deprecated Use ROTINA_1215_JORNADAS_LAYOUT_VERSION */
export const COMANDOS_DML_JORNADAS_LAYOUT_VERSION =
  ROTINA_1215_JORNADAS_LAYOUT_VERSION

export const buildComandosDmlJornadasText = buildRotina1215JornadasText
export const buildComandosDmlJornadasFromResult =
  buildRotina1215JornadasFromResult
export const downloadComandosDmlJornadas = downloadRotina1215Jornadas
/** @deprecated Prefer horasDiaToHhMmSs */
export const horasDiaToHrdHhMm = (horasDia: number): string =>
  horasDiaToHhMmSs(horasDia).slice(0, 5)
