/**
 * Server-side bridge to the SPA engine (`src/engine`).
 * Same `simulate()` implementation as the browser — parity by shared source.
 *
 * Built into the API bundle via esbuild (extensionless TS imports resolved at
 * bundle time). Do not persist Folha; callers strip `nome` before simulate.
 */

export { simulate } from "../../../src/engine/simulate";
export {
  DEFAULT_OPERATING_HOURS,
  prepareOHScopeRulesForInput,
} from "../../../src/engine/operating-hours";
export {
  emptyPayrollExtras,
  parsePayrollCsv,
} from "../../../src/engine/payroll";
export { buildApdataHierarchy } from "../../../src/engine/apdata-hierarchy";
export { mapExtractorAggregatesToPayroll } from "../../../src/apdata/mapExtractorRows";
export {
  DEFAULT_ESTRATEGIA_ABSORCAO,
  DEFAULT_REGIME_FUNCIONAMENTO,
  DEFAULT_TAX_REGIME,
  isEstrategiaAbsorcao,
  isRegimeFuncionamento,
  isTaxRegime,
} from "../../../src/types/index";

export type {
  SimulationInput,
  SimulationResult,
  ScenarioId,
} from "../../../src/engine/types";
export type {
  PayrollParseIssue,
  PayrollParseResult,
  PayrollRow,
} from "../../../src/engine/payroll";
export type {
  OperatingHours,
  OHScopeRule,
  OHScopeType,
  OHScopeWindow,
} from "../../../src/engine/operating-hours";
export type { ExtractorAggregate } from "../../../src/apdata/mapExtractorRows";
export type {
  EstrategiaAbsorcao,
  RegimeFuncionamento,
  TaxRegime,
} from "../../../src/types/index";
