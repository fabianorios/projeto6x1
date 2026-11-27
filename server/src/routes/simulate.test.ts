import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createApp } from "../app.js";
import type { ServerConfig } from "../config.js";
import {
  DEFAULT_OPERATING_HOURS,
  simulate,
} from "../lib/shared-engine.js";
import { resetSimulateRateLimiter } from "./simulate.js";

/** Synthetic Folha aggregates — no PII / no client names. */
const FIXTURE_ROWS = [
  {
    cargo: "OPERADOR",
    salario: 2500,
    cargaHorariaMensal: 220,
    cargaHorariaSemanal: 44,
    centroCusto: "1001",
    descCc: "Operacoes",
    cnpjCompleto: "00000000000191",
    codHorarioAtual: "H01",
    horarioTrabalhoAtual: "06:00-14:12",
    escalaAtual: "6x1",
    quantidade: 12,
    vrValorDia: 32,
    vtValorDia: 8.5,
    vrDiasMesAtual: 22,
    vtDiasMesAtual: 22,
    nome: "SHOULD_BE_STRIPPED",
  },
  {
    cargo: "SUPERVISOR",
    salario: 4200,
    cargaHorariaMensal: 220,
    cargaHorariaSemanal: 44,
    centroCusto: "1001",
    descCc: "Operacoes",
    cnpjCompleto: "00000000000191",
    codHorarioAtual: "H01",
    horarioTrabalhoAtual: "06:00-14:12",
    escalaAtual: "6x1",
    quantidade: 2,
    vrValorDia: 32,
    vtValorDia: 8.5,
    vrDiasMesAtual: 22,
    vtDiasMesAtual: 22,
    nome: null,
  },
];

const FIXTURE_BODY = {
  schemaVersion: 1,
  scenarioId: "fase1_2026_42h" as const,
  sector: "varejo",
  sectorLabel: "Varejo",
  sectorBufferPct: 8,
  currentScale: "6x1",
  headcount: 14,
  averageMonthlySalary: 2500,
  units: 1,
  shiftsPerDay: 2,
  operatingHours: DEFAULT_OPERATING_HOURS,
  defaultRegimeFuncionamento: "SEG_SEX",
  defaultTaxRegime: "LUCRO_PRESUMIDO",
  estrategiaAbsorcao: "CONTRATACAO_INTEGRAL",
  payrollRows: FIXTURE_ROWS,
  prefs: {
    includeScheduleSuggestions: true,
    includeApdataHierarchySeed: false,
  },
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("POST /api/simulate", () => {
  const key = Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  );
  let dir: string;
  let app: ReturnType<typeof createApp>["app"];

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "api-simulate-"));
    const config: ServerConfig = {
      port: 0,
      host: "127.0.0.1",
      encryptionKey: key,
      dataDir: dir,
      sqlTimeoutMs: 5_000,
      sqlMaxRows: 100,
      corsOrigin: "*",
    };
    ({ app } = createApp({ config }));
    resetSimulateRateLimiter();
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns Results DTO with latency metadata", async () => {
    const res = await app.request("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(FIXTURE_BODY),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.schemaVersion, 1);
    assert.ok(body.latencyMs?.total >= 0);
    assert.ok(body.result?.cost);
    assert.ok(body.result?.coverage);
    assert.ok(Array.isArray(body.result?.byCostCenter));
    assert.ok(Array.isArray(body.result?.scheduleSuggestions));
    // LGPD: echoed rows must not keep client-supplied nome
    for (const row of body.result.input.payrollRows ?? []) {
      assert.equal(row.nome, null);
    }
  });

  it("matches local simulate KPIs (fixture parity)", async () => {
    const local = simulate({
      sector: FIXTURE_BODY.sector,
      sectorLabel: FIXTURE_BODY.sectorLabel,
      sectorBufferPct: FIXTURE_BODY.sectorBufferPct,
      headcount: FIXTURE_BODY.headcount,
      currentScale: FIXTURE_BODY.currentScale,
      averageMonthlySalary: FIXTURE_BODY.averageMonthlySalary,
      units: FIXTURE_BODY.units,
      shiftsPerDay: FIXTURE_BODY.shiftsPerDay,
      operatingHours: FIXTURE_BODY.operatingHours,
      scenarioId: FIXTURE_BODY.scenarioId,
      payrollRows: FIXTURE_ROWS.map((r) => ({
        ...r,
        nome: null,
        cargaHorariaMensal: r.cargaHorariaMensal,
        cargaHorariaSemanal: r.cargaHorariaSemanal,
        vrValorDia: r.vrValorDia,
        vtValorDia: r.vtValorDia,
        vrDiasMesAtual: r.vrDiasMesAtual,
        vtDiasMesAtual: r.vtDiasMesAtual,
        sourceLine: 2,
        codEmpresa: null,
        codFilial: null,
        razaoSocial: null,
        nomeFilial: null,
        cnpjCompleto: r.cnpjCompleto,
        codCc: r.centroCusto,
        descCc: r.descCc,
        codCargo: null,
        descCargo: r.cargo,
        codVinculo: null,
        codHorarioAtual: r.codHorarioAtual,
        horarioTrabalhoAtual: r.horarioTrabalhoAtual,
        heMediaMensalHoras: 0,
        regimeFuncionamento: null,
        massaSalarialBase: null,
        modoDiasVr: null,
        modoDiasVt: null,
        diasBaseMesVr: null,
        diasBaseMesVt: null,
        vaValorDia: null,
        vaValorMes: null,
        vaModoValor: null,
        assistMedicaMes: null,
        assistOdontoMes: null,
        benefits: [],
      })),
      estrategiaAbsorcao: "CONTRATACAO_INTEGRAL",
      defaultTaxRegime: "LUCRO_PRESUMIDO",
      defaultRegimeFuncionamento: "SEG_SEX",
    });

    const res = await app.request("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(FIXTURE_BODY),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const remote = body.result;

    assert.equal(
      remote.coverage.currentHeadcount,
      local.coverage.currentHeadcount,
    );
    assert.equal(
      remote.coverage.requiredHeadcount,
      local.coverage.requiredHeadcount,
    );
    assert.equal(
      remote.coverage.additionalHeadcount,
      local.coverage.additionalHeadcount,
    );
    assert.equal(
      roundMoney(remote.cost.baselineMonthlyPayroll),
      roundMoney(local.cost.baselineMonthlyPayroll),
    );
    assert.equal(
      roundMoney(remote.cost.projectedMonthlyPayroll),
      roundMoney(local.cost.projectedMonthlyPayroll),
    );
    assert.equal(
      roundMoney(remote.cost.monthlyDelta),
      roundMoney(local.cost.monthlyDelta),
    );
    assert.equal(remote.byCostCenter.length, local.byCostCenter.length);
    assert.equal(
      remote.scheduleSuggestions.length,
      local.scheduleSuggestions.length,
    );
    // Documented tolerance: money compared at 2 decimal places (centavos).
  });

  it("maps aggregates when payrollRows omitted", async () => {
    const res = await app.request("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        scenarioId: "fase1_2026_42h",
        sector: "varejo",
        currentScale: "6x1",
        operatingHours: DEFAULT_OPERATING_HOURS,
        aggregates: [
          {
            cod_empresa: "1",
            cod_filial: "1",
            cnpj_completo: "00000000000191",
            cod_cc: "1001",
            desc_cc: "Operacoes",
            cod_cargo: "10",
            desc_cargo: "OPERADOR",
            cod_vinculo: "1",
            cod_horario_atual: "H01",
            horario_trabalho_atual: "06:00-14:12",
            escala_atual: "6x1",
            carga_semanal_atual: 44,
            qtd_colaboradores: 10,
            massa_salarial_base: 25000,
            vr_dia_medio: 32,
            vt_dia_medio: 8.5,
            dias_trabalho_mes_atual: 22,
            beneficios_agg: "",
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.result.coverage.currentHeadcount, 10);
  });

  it("rejects empty payload", async () => {
    const res = await app.request("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "fase1_2026_42h",
        sector: "varejo",
        currentScale: "6x1",
      }),
    });
    assert.equal(res.status, 400);
  });
});
