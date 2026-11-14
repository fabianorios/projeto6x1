/**
 * Server-side SqlProfile contract (mirrors src/types/sql-profile.ts).
 */

import type { BenefitParams } from "./benefit-params.js";

export type { BenefitParams, VaModoValor } from "./benefit-params.js";

export type SqlDialect = "mssql" | "oracle";

export type ModoDias = "ESCALA" | "FIXO_MES" | "CALENDARIO_LOCAL";

export type SqlSlotId =
  | "ESTABELECIMENTOS"
  | "FOLHA_E_ESCALAS"
  | "REGRA_VR"
  | "REGRA_VA"
  | "REGRA_VT"
  | "REGRA_FIXOS"
  | "INDICES_ENCARGOS";

export const SQL_SLOT_IDS: readonly SqlSlotId[] = [
  "ESTABELECIMENTOS",
  "FOLHA_E_ESCALAS",
  "REGRA_VR",
  "REGRA_VA",
  "REGRA_VT",
  "REGRA_FIXOS",
  "INDICES_ENCARGOS",
] as const;

export const SQL_SLOT_CONTRACT: Record<SqlSlotId, readonly string[]> = {
  ESTABELECIMENTOS: [
    "cod_empresa",
    "cod_filial",
    "razao_social",
    "nome_filial",
    "cnpj_completo",
    "qtd_ativos",
  ],
  FOLHA_E_ESCALAS: [
    "cod_empresa",
    "cod_filial",
    "cnpj_completo",
    "cod_cc",
    "cod_cargo",
    "desc_cargo",
    "cod_vinculo",
    "cod_horario_atual",
    "escala_atual",
    "carga_semanal_atual",
    "qtd_colaboradores",
    "massa_salarial_base",
    "dias_trabalho_mes_atual",
  ],
  REGRA_VR: [
    "cod_empresa",
    "cod_filial",
    "cod_cc",
    "valor_dia",
    "modo_dias",
    "dias_base_mes",
  ],
  REGRA_VA: [
    "cod_empresa",
    "cod_filial",
    "cod_cc",
    "valor_dia",
    "modo_dias",
    "dias_base_mes",
  ],
  REGRA_VT: [
    "cod_empresa",
    "cod_filial",
    "cod_cc",
    "valor_dia",
    "modo_dias",
    "dias_base_mes",
  ],
  REGRA_FIXOS: [
    "cod_empresa",
    "cod_filial",
    "cod_cc",
    "valor_mes_medica",
    "valor_mes_odonto",
  ],
  INDICES_ENCARGOS: [
    "cod_empresa",
    "cod_filial",
    "inss_empresa_pct",
    "rat_fap_pct",
    "terceiros_pct",
    "fgts_pct",
  ],
};

export type SqlSlotQueries = {
  mssql: string;
  oracle: string;
};

export type SqlProfile = {
  id: string;
  name: string;
  readonly: boolean;
  createdAt: string;
  updatedAt: string;
  slots: Record<SqlSlotId, SqlSlotQueries>;
  /** Per-client TiposBeneficios codes for parameterized benefit SQL. */
  benefitParams: BenefitParams;
};

export type SqlProfileStoreFile = {
  version: 1;
  activeId: string | null;
  profiles: SqlProfile[];
};

export type SqlProfileInput = {
  name: string;
  slots: Record<SqlSlotId, SqlSlotQueries>;
  benefitParams?: BenefitParams;
};

export function isSqlSlotId(value: string): value is SqlSlotId {
  return (SQL_SLOT_IDS as readonly string[]).includes(value);
}
