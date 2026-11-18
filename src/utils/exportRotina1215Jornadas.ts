/**
 * Rotina 1215 — arquivo-texto de inclusão para tabela Jornadas (transação 29752).
 *
 * Formato (Ajuda Apdata → docs/rotina-1215.md):
 *   Inclusão: IdTransacao;IdCampo;(conteudo)IdCampo;(conteudo)…
 *   Datas: AAAAMMDD. Sem espaços entre tokens (exceto dentro de literais).
 *
 * Field IDs = ACP_CdiCampo da tabela 6510 (Jornadas), mesma fonte que
 * `interface-consultar` / Campos.txt no Gestão — não inventar INSERT SQL.
 * PK JOR_CdiJornada (45020) não entra em inclusão (atribuída na efetiva).
 *
 * Não grava no ERP. Steps / JornadasItens (29762) fora deste entregável.
 */

import {
  buildApdataHierarchy,
  type ApdataJornada,
  type SimulationResult,
} from '../engine'

/** Rotina Apdata «Importação de Dados (Interface)». */
export const ROTINA_1215 = 1215 as const

/** Inclusão em Jornadas — objeto 3061 (botão ? no objeto). */
export const TX_INCLUSAO_JORNADAS = 29752 as const

export const ROTINA_1215_JORNADAS_LAYOUT_VERSION =
  'turnocheck-rotina-1215-jornadas-29752-v1' as const

/** Default JOR_CdiTipoApuracaoJornada — domínio «Pela Entrada». */
export const DEFAULT_TIPO_APURACAO_JORNADA = 1 as const

/**
 * Campos emitidos na inclusão 29752.
 * Ids conferidos em `Campos` (ACP_CdiTabela = 6510) — espelho de interface-consultar.
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

/** Outras inclusões da carga de horários — stubs para próximos entregáveis. */
export const TX_INCLUSAO_HORARIOS = 15932 as const
export const TX_INCLUSAO_HORARIOS_JORNADAS = 19762 as const
export const TX_INCLUSAO_JORNADAS_ITENS = 29762 as const

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

/** Infer night flag from steps (end clock earlier than start). */
export function inferOplNoturna(jornada: ApdataJornada): 0 | 1 {
  const steps = jornada.steps
  if (steps.length >= 2) {
    const first = steps[0]!.hora
    const last = steps[steps.length - 1]!.hora
    const toMin = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map((x) => Number(x))
      if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
      return h * 60 + m
    }
    if (toMin(last) < toMin(first)) return 1
  }
  return 0
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

export function buildComandosDmlJornadaRows(
  jornadas: readonly ApdataJornada[],
): Rotina1215JornadaRow[] {
  const byCode = new Map<string, Rotina1215JornadaRow>()
  for (const j of jornadas) {
    const cos = j.codigo.trim()
    if (!cos || byCode.has(cos)) continue
    byCode.set(cos, {
      cosIdentificador: truncate(cos, 30),
      d1sJornada: truncate(j.descricao, 50),
      hrdTotalHhMmSs: horasDiaToHhMmSs(j.horasDia),
      cdiTipoApuracaoJornada: DEFAULT_TIPO_APURACAO_JORNADA,
      oplDesativado: 0,
      oplNoturna: inferOplNoturna(j),
    })
  }
  return [...byCode.values()].sort((a, b) =>
    a.cosIdentificador.localeCompare(b.cosIdentificador),
  )
}

function rowToCampos(row: Rotina1215JornadaRow): Rotina1215CampoValor[] {
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

export function rowToLinha1215(row: Rotina1215JornadaRow): string {
  return buildLinhaInclusao1215(TX_INCLUSAO_JORNADAS, rowToCampos(row))
}

/** Full .txt body — one inclusion line per unique jornada (29752). */
export function buildRotina1215JornadasText(
  jornadas: readonly ApdataJornada[],
  _options: Rotina1215JornadasExportOptions = {},
): string {
  const rows = buildComandosDmlJornadaRows(jornadas)
  if (rows.length === 0) return ''
  return rows.map(rowToLinha1215).join('\n') + '\n'
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
  a.download = `turnocheck-rotina-1215-jornadas-${TX_INCLUSAO_JORNADAS}-${stamp}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

/* ---- Compat aliases (PR #76 names) — same 1215 text, no INSERT ---- */

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
