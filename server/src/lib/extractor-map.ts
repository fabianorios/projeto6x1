/**
 * Map extractor SQL rows → LGPD-safe payroll aggregates (no nome/CPF/PIS).
 */

export type ExtractorAggregateRow = {
  cod_empresa: string;
  cod_filial: string;
  cnpj_completo: string;
  cod_cc: string;
  cod_cargo: string;
  desc_cargo: string;
  cod_vinculo: string;
  cod_horario_atual: string;
  escala_atual: string;
  carga_semanal_atual: number;
  qtd_colaboradores: number;
  massa_salarial_base: number;
  vr_dia_medio: number;
  vt_dia_medio: number;
  dias_trabalho_mes_atual: number;
};

function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v).trim();
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize driver row keys (Oracle may uppercase aliases). */
function pick(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const upper = key.toUpperCase();
  if (upper in row) return row[upper];
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function mapExtractorRows(
  rows: Record<string, unknown>[],
): ExtractorAggregateRow[] {
  return rows.map((row) => ({
    cod_empresa: str(pick(row, "cod_empresa")),
    cod_filial: str(pick(row, "cod_filial")),
    cnpj_completo: str(pick(row, "cnpj_completo")),
    cod_cc: str(pick(row, "cod_cc"), "SEM_CC"),
    cod_cargo: str(pick(row, "cod_cargo")),
    desc_cargo: str(pick(row, "desc_cargo"), "NAO_INFORMADO"),
    cod_vinculo: str(pick(row, "cod_vinculo")),
    cod_horario_atual: str(pick(row, "cod_horario_atual")),
    escala_atual: str(pick(row, "escala_atual"), "other"),
    carga_semanal_atual: num(pick(row, "carga_semanal_atual"), 44),
    qtd_colaboradores: num(pick(row, "qtd_colaboradores"), 0),
    massa_salarial_base: num(pick(row, "massa_salarial_base"), 0),
    vr_dia_medio: num(pick(row, "vr_dia_medio"), 0),
    vt_dia_medio: num(pick(row, "vt_dia_medio"), 0),
    dias_trabalho_mes_atual: num(pick(row, "dias_trabalho_mes_atual"), 22),
  }));
}

/** Forbidden PII column names — reject if present in result set. */
const PII_COLUMNS = [
  "nome",
  "cpf",
  "pis",
  "matricula",
  "con_dssnome",
  "telefone",
  "email",
  "endereco",
];

export function assertNoPiiColumns(columns: string[]): void {
  const lower = columns.map((c) => c.toLowerCase());
  for (const bad of PII_COLUMNS) {
    if (lower.includes(bad)) {
      throw new Error(`PII column blocked in extractor result: ${bad}`);
    }
  }
}
