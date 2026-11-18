/**
 * ComandosDML export — tabela Jornadas only (rotina 1215).
 *
 * Target: Aptools «Interfaces - Importações de Dados» (ROT_CdiRotina=1215).
 * One INSERT per unique jornada (`codigo` = JOR-{HHMM}-{HHMM} / JOR-ALM-…).
 * Does NOT write to the ERP; Steps/JornadasItens are out of scope.
 *
 * Layout sources: ESCALA6X1 dictionary (`JOR_*`) + TEMP `apdata_6x1` probe.
 * Assumed minimal INSERT (documented in file header) — no client/PII.
 */

import {
  buildApdataHierarchy,
  type ApdataJornada,
  type SimulationResult,
} from '../engine'

/** Apdata rotina for generic data-import interfaces. */
export const COMANDOS_DML_JORNADAS_ROTINA = 1215 as const

export const COMANDOS_DML_JORNADAS_LAYOUT_VERSION =
  'turnocheck-comandosdml-jornadas-v1' as const

/** SQL Server / Apdata epoch date for time-only `datetime` columns. */
export const APDATA_TIME_EPOCH_DATE = '1899-12-30' as const

/** Default `JOR_CdiTipoApuracaoJornada` — «Pela Entrada» (TEMP domain id 1). */
export const DEFAULT_TIPO_APURACAO_JORNADA = 1 as const

export interface ComandosDmlJornadasExportOptions {
  dataInicio?: string
  includeLunchJornada?: boolean
  selectedHorarioIds?: string[]
  /** Override dialect comment; SQL body is SQL Server–oriented. */
  dialect?: 'sqlserver' | 'oracle'
}

export interface ComandosDmlJornadaRow {
  /** → JOR_CosIdentificadorTabela (dedupe key / natural id). */
  cosIdentificador: string
  /** → JOR_D1sJornada (max 50). */
  d1sJornada: string
  /** → JOR_HrdTotalHorasPrevistasTrab as HH:MM. */
  hrdTotalHhMm: string
  /** → JOR_CdiTipoApuracaoJornada */
  cdiTipoApuracaoJornada: number
  /** → JOR_OplDesativado */
  oplDesativado: 0 | 1
  /** → JOR_OplNoturna */
  oplNoturna: 0 | 1
}

/** Convert decimal hours (e.g. 3.5) to Apdata HH:MM clock duration. */
export function horasDiaToHrdHhMm(horasDia: number): string {
  if (!Number.isFinite(horasDia) || horasDia < 0) {
    return '00:00'
  }
  const totalMinutes = Math.round(horasDia * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function truncateD1s(text: string, max = 50): string {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max)
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Infer night flag from steps (end clock earlier than start, or hour ≥ 22). */
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
 * Map hierarchy jornadas → DML rows.
 * Dedupes by `codigo` (already unique in `tree.jornadas`, re-checked here).
 */
export function buildComandosDmlJornadaRows(
  jornadas: readonly ApdataJornada[],
): ComandosDmlJornadaRow[] {
  const byCode = new Map<string, ComandosDmlJornadaRow>()
  for (const j of jornadas) {
    const cos = j.codigo.trim()
    if (!cos || byCode.has(cos)) continue
    byCode.set(cos, {
      cosIdentificador: truncateD1s(cos, 30),
      d1sJornada: truncateD1s(j.descricao),
      hrdTotalHhMm: horasDiaToHrdHhMm(j.horasDia),
      cdiTipoApuracaoJornada: DEFAULT_TIPO_APURACAO_JORNADA,
      oplDesativado: 0,
      oplNoturna: inferOplNoturna(j),
    })
  }
  return [...byCode.values()].sort((a, b) =>
    a.cosIdentificador.localeCompare(b.cosIdentificador),
  )
}

function buildHeaderComment(
  rowCount: number,
  options: ComandosDmlJornadasExportOptions,
): string {
  const dialect = options.dialect ?? 'sqlserver'
  const lines = [
    `-- Turnocheck · ComandosDML · rotina ${COMANDOS_DML_JORNADAS_ROTINA}`,
    `-- Rotina Apdata: Interfaces - Importações de Dados`,
    `-- Tabela: Jornadas (só cabeçalho; JornadasItens/Steps fora de escopo)`,
    `-- Layout: ${COMANDOS_DML_JORNADAS_LAYOUT_VERSION}`,
    `-- Dialeto: ${dialect}`,
    `-- Linhas: ${rowCount} (1 por JOR_CosIdentificadorTabela / codigo Turnocheck)`,
    `--`,
    `-- Colunas emitidas (mínimo seguro vs dicionário ESCALA6X1 + TEMP):`,
    `--   JOR_CosIdentificadorTabela  = codigo JOR-{HHMM}-{HHMM} (+ ALM)`,
    `--   JOR_D1sJornada              = descricao do bloco (≤50)`,
    `--   JOR_HrdTotalHorasPrevistasTrab = duração HH:MM (epoch ${APDATA_TIME_EPOCH_DATE})`,
    `--   JOR_CdiTipoApuracaoJornada  = ${DEFAULT_TIPO_APURACAO_JORNADA} (Pela Entrada)`,
    `--   JOR_OplDesativado           = 0`,
    `--   JOR_OplNoturna              = 0|1`,
    `-- Assumido: JOR_CdiJornada é atribuído na carga Aptools (não emitido).`,
    `-- Sem PII / sem nomes de pessoa ou cliente.`,
    `-- NÃO executar automaticamente contra produção — arquivo para carga manual.`,
    ``,
  ]
  return lines.join('\n')
}

function rowToInsertSql(row: ComandosDmlJornadaRow): string {
  const hrdLiteral = sqlStringLiteral(
    `${APDATA_TIME_EPOCH_DATE} ${row.hrdTotalHhMm}:00`,
  )
  return [
    `INSERT INTO Jornadas (`,
    `  JOR_CosIdentificadorTabela,`,
    `  JOR_D1sJornada,`,
    `  JOR_HrdTotalHorasPrevistasTrab,`,
    `  JOR_CdiTipoApuracaoJornada,`,
    `  JOR_OplDesativado,`,
    `  JOR_OplNoturna`,
    `) VALUES (`,
    `  ${sqlStringLiteral(row.cosIdentificador)},`,
    `  ${sqlStringLiteral(row.d1sJornada)},`,
    `  ${hrdLiteral},`,
    `  ${row.cdiTipoApuracaoJornada},`,
    `  ${row.oplDesativado},`,
    `  ${row.oplNoturna}`,
    `);`,
  ].join('\n')
}

/** Build full ComandosDML text for the Jornadas table. */
export function buildComandosDmlJornadasText(
  jornadas: readonly ApdataJornada[],
  options: ComandosDmlJornadasExportOptions = {},
): string {
  const rows = buildComandosDmlJornadaRows(jornadas)
  const body =
    rows.length === 0
      ? `-- (nenhuma jornada no catálogo selecionado)\n`
      : rows.map(rowToInsertSql).join('\n\n') + '\n'
  return buildHeaderComment(rows.length, options) + body
}

/** Build from simulation + hierarchy options (deduped catalog). */
export function buildComandosDmlJornadasFromResult(
  result: SimulationResult,
  options: ComandosDmlJornadasExportOptions = {},
): string {
  const tree = buildApdataHierarchy(result, {
    dataInicio: options.dataInicio,
    includeLunchJornada: options.includeLunchJornada,
    selectedHorarioIds: options.selectedHorarioIds,
  })
  return buildComandosDmlJornadasText(tree.jornadas, options)
}

/** Browser download of the `.dml.txt` file (não envia ao ERP). */
export function downloadComandosDmlJornadas(
  result: SimulationResult,
  options: ComandosDmlJornadasExportOptions = {},
): void {
  const text = buildComandosDmlJornadasFromResult(result, options)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.download = `turnocheck-comandosdml-jornadas-r${COMANDOS_DML_JORNADAS_ROTINA}-${stamp}.dml.txt`
  a.click()
  URL.revokeObjectURL(url)
}
