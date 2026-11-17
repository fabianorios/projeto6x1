import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createApp } from "../app.js";
import type { ServerConfig } from "../config.js";
import type { ExtractorAggregateRow } from "../lib/extractor-map.js";
import {
  DEFAULT_OPERATING_HOURS,
  mapExtractorAggregatesToPayroll,
  simulate,
} from "../lib/shared-engine.js";
import { resetSimulateFromEphemeralRateLimiter } from "./simulate-from-ephemeral.js";

/** Synthetic Folha aggregates — no PII / no client names. */
const FIXTURE_AGGREGATES: ExtractorAggregateRow[] = [
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
    qtd_colaboradores: 12,
    massa_salarial_base: 30000,
    vr_dia_medio: 32,
    vt_dia_medio: 8.5,
    qtd_passes_dia_medio: 0,
    va_valor_medio: 0,
    assist_medica_mes: 0,
    assist_odonto_mes: 0,
    dias_trabalho_mes_atual: 22,
    beneficios_agg: "",
  },
  {
    cod_empresa: "1",
    cod_filial: "1",
    cnpj_completo: "00000000000191",
    cod_cc: "1001",
    desc_cc: "Operacoes",
    cod_cargo: "20",
    desc_cargo: "SUPERVISOR",
    cod_vinculo: "1",
    cod_horario_atual: "H01",
    horario_trabalho_atual: "06:00-14:12",
    escala_atual: "6x1",
    carga_semanal_atual: 44,
    qtd_colaboradores: 2,
    massa_salarial_base: 8400,
    vr_dia_medio: 32,
    vt_dia_medio: 8.5,
    qtd_passes_dia_medio: 0,
    va_valor_medio: 0,
    assist_medica_mes: 0,
    assist_odonto_mes: 0,
    dias_trabalho_mes_atual: 22,
    beneficios_agg: "",
  },
];

const SIM_META = {
  schemaVersion: 1,
  scenarioId: "fase1_2026_42h",
  sector: "varejo",
  sectorLabel: "Varejo",
  sectorBufferPct: 8,
  currentScale: "6x1",
  averageMonthlySalary: 2500,
  units: 1,
  shiftsPerDay: 2,
  operatingHours: DEFAULT_OPERATING_HOURS,
  defaultRegimeFuncionamento: "SEG_SEX",
  defaultTaxRegime: "LUCRO_PRESUMIDO",
  estrategiaAbsorcao: "CONTRATACAO_INTEGRAL",
  prefs: {
    includeScheduleSuggestions: true,
    includeApdataHierarchySeed: false,
  },
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const BASE_CREDS = {
  engine: "mssql" as const,
  host: "127.0.0.1",
  port: 1433,
  database: "fixture",
  user: "ro_user",
  password: "from-ephemeral-secret-must-not-leak",
};

describe("POST /api/simulate/from-ephemeral", () => {
  const key = Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  );
  let dir: string;
  let app: ReturnType<typeof createApp>["app"];

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "api-from-ephemeral-"));
    const config: ServerConfig = {
      port: 0,
      host: "127.0.0.1",
      encryptionKey: key,
      dataDir: dir,
      sqlTimeoutMs: 5_000,
      sqlMaxRows: 100,
      corsOrigin: "*",
    };
    ({ app } = createApp({
      config,
      fromEphemeralExtractFn: async ({ creds }) => {
        assert.equal(creds.password, BASE_CREDS.password);
        return {
          rows: FIXTURE_AGGREGATES,
          extractMs: 12,
          timeoutMs: 60_000,
          engine: creds.engine,
        };
      },
    }));
    resetSimulateFromEphemeralRateLimiter();
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("extract+map returns payrollRows (Aptools-shaped, no simulate)", async () => {
    const res = await app.request("/api/simulate/from-ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...BASE_CREDS,
        filters: { cnpjs: ["00000000000191"] },
      }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes("from-ephemeral-secret-must-not-leak"));
    const body = JSON.parse(text);
    assert.equal(body.ok, true);
    assert.equal(body.rowCount, 2);
    assert.equal(body.headcount, 14);
    assert.equal(body.centerCount, 1);
    assert.ok(body.latencyMs?.extract >= 0);
    assert.ok(body.latencyMs?.map >= 0);
    assert.equal(body.result, undefined);
    assert.equal(body.payrollRows[0].cargo, "OPERADOR");
    assert.equal(body.payrollRows[0].quantidade, 12);
    assert.equal(body.payrollRows[0].salario, 2500);
    for (const row of body.payrollRows) {
      assert.equal(row.nome, null);
    }
  });

  it("chains simulate and matches local engine KPIs (± centavos)", async () => {
    const mapped = mapExtractorAggregatesToPayroll(FIXTURE_AGGREGATES).map(
      (r) => ({ ...r, nome: null }),
    );
    const local = simulate({
      sector: SIM_META.sector,
      sectorLabel: SIM_META.sectorLabel,
      sectorBufferPct: SIM_META.sectorBufferPct,
      headcount: 14,
      currentScale: SIM_META.currentScale,
      averageMonthlySalary: SIM_META.averageMonthlySalary,
      units: SIM_META.units,
      shiftsPerDay: SIM_META.shiftsPerDay,
      operatingHours: SIM_META.operatingHours,
      scenarioId: SIM_META.scenarioId as "fase1_2026_42h",
      payrollRows: mapped,
      estrategiaAbsorcao: "CONTRATACAO_INTEGRAL",
      defaultTaxRegime: "LUCRO_PRESUMIDO",
      defaultRegimeFuncionamento: "SEG_SEX",
    });

    const res = await app.request("/api/simulate/from-ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...BASE_CREDS,
        simulate: true,
        meta: SIM_META,
      }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes("from-ephemeral-secret-must-not-leak"));
    const body = JSON.parse(text);
    assert.equal(body.ok, true);
    assert.ok(body.result?.cost);
    assert.ok(body.latencyMs?.simulate >= 0);
    assert.equal(
      body.result.coverage.currentHeadcount,
      local.coverage.currentHeadcount,
    );
    assert.equal(
      roundMoney(body.result.cost.monthlyDelta),
      roundMoney(local.cost.monthlyDelta),
    );
    for (const row of body.result.input.payrollRows ?? []) {
      assert.equal(row.nome, null);
    }
  });

  it("rejects simulate without scenario meta", async () => {
    const res = await app.request("/api/simulate/from-ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...BASE_CREDS,
        simulate: true,
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /meta|scenario/i);
  });

  it("rejects incomplete body", async () => {
    const res = await app.request("/api/simulate/from-ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine: "mssql", host: "x" }),
    });
    assert.equal(res.status, 400);
  });

  it("live extract path never echoes password on connection failure", async () => {
    const config: ServerConfig = {
      port: 0,
      host: "127.0.0.1",
      encryptionKey: key,
      dataDir: dir,
      sqlTimeoutMs: 5_000,
      sqlMaxRows: 100,
      corsOrigin: "*",
    };
    const { app: liveApp } = createApp({ config });
    const res = await liveApp.request("/api/simulate/from-ephemeral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "mssql",
        host: "127.0.0.1",
        port: 1,
        database: "nope",
        user: "ro",
        password: "live-ephemeral-secret-should-not-leak",
      }),
    });
    assert.equal(res.status, 422);
    const text = await res.text();
    assert.ok(!text.includes("live-ephemeral-secret-should-not-leak"));
    const body = JSON.parse(text);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Falha de conexão|timeout|firewall/i);
  });
});
