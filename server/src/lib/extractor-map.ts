/**
 * Map extractor SQL rows → LGPD-safe payroll aggregates (no nome/CPF/PIS).
 */

export type ExtractorAggregateRow = {
  cod_empresa: string;
  cod_filial: string;
  /** Empresas.EMP_DssEmpresa */
  razao_social: string;
  /** Locais.LOC_D1sLocal */
  nome_filial: string;
  cnpj_completo: string;
  cod_cc: string;
  desc_cc: string;
  cod_cargo: string;
  desc_cargo: string;
  cod_vinculo: string;
  cod_horario_atual: string;
  /** Outer work window HH:MM-HH:MM from JornadasItens (optional). */
  horario_trabalho_atual: string;
  escala_atual: string;
  carga_semanal_atual: number;
  /** QuantidadesHorasMes.HMV_QtnQuantidadeHoraMes (Horas Base). */
  carga_horaria_mensal: number;
  /** Sindicatos via CON_CdiSindicato. */
  cod_sindicato: string;
  nome_sindicato: string;
  cnpj_sindicato: string;
  qtd_colaboradores: number;
  massa_salarial_base: number;
  /** Legacy scalar; extractor emits 0 — prefer beneficios_agg. */
  vr_dia_medio: number;
  vt_dia_medio: number;
  /** Debug / Aptools: average passes/day from ConATransportes (optional). */
  qtd_passes_dia_medio: number;
  /** Legacy VA scalar (optional; prefer beneficios_agg). */
  va_valor_medio: number;
  assist_medica_mes: number;
  assist_odonto_mes: number;
  dias_trabalho_mes_atual: number;
  /** Dynamic TiposBeneficios: codigo|descricao|valor;… */
  beneficios_agg: string;
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
  return rows.map((row) => {
    const cargaSemanal = num(pick(row, "carga_semanal_atual"), 44);
    const cargaMensalRaw = num(pick(row, "carga_horaria_mensal"), 0);
    return {
      cod_empresa: str(pick(row, "cod_empresa")),
      cod_filial: str(pick(row, "cod_filial")),
      razao_social: str(pick(row, "razao_social")),
      nome_filial: str(pick(row, "nome_filial")),
      cnpj_completo: str(pick(row, "cnpj_completo")),
      cod_cc: str(pick(row, "cod_cc"), "SEM_CC"),
      desc_cc: str(pick(row, "desc_cc")),
      cod_cargo: str(pick(row, "cod_cargo")),
      desc_cargo: str(pick(row, "desc_cargo"), "NAO_INFORMADO"),
      cod_vinculo: str(pick(row, "cod_vinculo")),
      cod_horario_atual: str(pick(row, "cod_horario_atual")),
      horario_trabalho_atual: str(pick(row, "horario_trabalho_atual")),
      escala_atual: str(pick(row, "escala_atual"), "other"),
      carga_semanal_atual: cargaSemanal,
      carga_horaria_mensal:
        cargaMensalRaw > 0
          ? cargaMensalRaw
          : Math.round(cargaSemanal * 5 * 100) / 100,
      cod_sindicato: str(pick(row, "cod_sindicato")),
      nome_sindicato: str(pick(row, "nome_sindicato")),
      cnpj_sindicato: str(pick(row, "cnpj_sindicato")),
      qtd_colaboradores: num(pick(row, "qtd_colaboradores"), 0),
      massa_salarial_base: num(pick(row, "massa_salarial_base"), 0),
      vr_dia_medio: num(pick(row, "vr_dia_medio"), 0),
      vt_dia_medio: num(pick(row, "vt_dia_medio"), 0),
      qtd_passes_dia_medio: num(pick(row, "qtd_passes_dia_medio"), 0),
      va_valor_medio: num(pick(row, "va_valor_medio"), 0),
      assist_medica_mes: num(pick(row, "assist_medica_mes"), 0),
      assist_odonto_mes: num(pick(row, "assist_odonto_mes"), 0),
      dias_trabalho_mes_atual: num(pick(row, "dias_trabalho_mes_atual"), 22),
      beneficios_agg: str(pick(row, "beneficios_agg")),
    };
  });
}

/** Forbidden PII column names — reject if present in result set. */
const PII_COLUMNS = [
  "fun_nosfuncionario",
  "fun_nuscpf",
  "fun_nuspis",
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

/**
 * Join Folha + Regra VR/VT by empresa/filial/cc.
 * Used when modular SqlProfile slots are extracted separately.
 */
export type RegraBeneficioRow = {
  cod_empresa: string;
  cod_filial: string;
  cod_cc: string;
  valor_dia: number;
  modo_dias: "ESCALA" | "FIXO_MES" | "CALENDARIO_LOCAL";
  dias_base_mes: number;
};

export type FolhaEscalaRow = ExtractorAggregateRow & {
  modo_dias_vr?: RegraBeneficioRow["modo_dias"];
  modo_dias_vt?: RegraBeneficioRow["modo_dias"];
  vr_dias_base_mes?: number;
  vt_dias_base_mes?: number;
};

function joinKey(empresa: string, filial: string, cc: string): string {
  return `${empresa}||${filial}||${cc}`;
}

export function joinFolhaComRegras(
  folha: ExtractorAggregateRow[],
  regrasVr: RegraBeneficioRow[],
  regrasVt: RegraBeneficioRow[],
): FolhaEscalaRow[] {
  const vrMap = new Map(
    regrasVr.map((r) => [joinKey(r.cod_empresa, r.cod_filial, r.cod_cc), r]),
  );
  const vtMap = new Map(
    regrasVt.map((r) => [joinKey(r.cod_empresa, r.cod_filial, r.cod_cc), r]),
  );

  return folha.map((row) => {
    const key = joinKey(row.cod_empresa, row.cod_filial, row.cod_cc);
    const vr = vrMap.get(key);
    const vt = vtMap.get(key);
    return {
      ...row,
      vr_dia_medio: vr?.valor_dia ?? row.vr_dia_medio,
      vt_dia_medio: vt?.valor_dia ?? row.vt_dia_medio,
      modo_dias_vr: vr?.modo_dias,
      modo_dias_vt: vt?.modo_dias,
      vr_dias_base_mes: vr?.dias_base_mes,
      vt_dias_base_mes: vt?.dias_base_mes,
      dias_trabalho_mes_atual:
        vr?.dias_base_mes ??
        vt?.dias_base_mes ??
        row.dias_trabalho_mes_atual,
    };
  });
}
