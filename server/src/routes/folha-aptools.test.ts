import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createApp } from "../app.js";
import type { ServerConfig } from "../config.js";
import {
  DEFAULT_OPERATING_HOURS,
  parsePayrollCsv,
  simulate,
} from "../lib/shared-engine.js";
import { resetFolhaAptoolsRateLimiter } from "./folha-aptools.js";

const EXTRACTOR_HEADERS = [
  "desc_cargo",
  "cod_cc",
  "qtd_colaboradores",
  "massa_salarial_base",
  "carga_semanal_atual",
  "escala_atual",
  "vr_dia_medio",
  "vt_dia_medio",
  "dias_trabalho_mes_atual",
];

/** Synthetic Aptools TAB — no PII / no client names. */
const FIXTURE_TAB = [
  EXTRACTOR_HEADERS.join("\t"),
  [
    "OPERADOR",
    "1001",
    "12",
    "30.000,00",
    "44",
    "6x1",
    "32,00",
    "8,50",
    "22",
  ].join("\t"),
  [
    "SUPERVISOR",
    "1001",
    "2",
    "8.400,00",
    "44",
    "6x1",
    "32,00",
    "8,50",
    "22",
  ].join("\t"),
].join("\n");

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

describe("POST /api/folha/aptools", () => {
  const key = Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  );
  let dir: string;
  let app: ReturnType<typeof createApp>["app"];

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "api-folha-aptools-"));
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
    resetFolhaAptoolsRateLimiter();
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses text/plain TAB and returns payrollRows (no persist)", async () => {
    const res = await app.request("/api/folha/aptools", {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: FIXTURE_TAB,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.rowCount, 2);
    assert.equal(body.headcount, 14);
    assert.ok(body.latencyMs?.parse >= 0);
    assert.ok(Array.isArray(body.payrollRows));
    assert.equal(body.payrollRows.length, 2);
    assert.equal(body.payrollRows[0].cargo, "OPERADOR");
    assert.equal(body.payrollRows[0].quantidade, 12);
    assert.equal(body.payrollRows[0].salario, 2500);
    for (const row of body.payrollRows) {
      assert.equal(row.nome, null);
    }
    assert.equal(body.result, undefined);
  });

  it("parses multipart file upload", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([FIXTURE_TAB], "folha.txt", { type: "text/plain" }),
    );
    const res = await app.request("/api/folha/aptools", {
      method: "POST",
      body: form,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.rowCount, 2);
    assert.equal(body.headcount, 14);
  });

  it("chains simulate when meta + simulate flag present", async () => {
    const localParse = parsePayrollCsv(FIXTURE_TAB);
    assert.equal(localParse.rows.length, 2);
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
      payrollRows: localParse.rows.map((r) => ({ ...r, nome: null })),
      estrategiaAbsorcao: "CONTRATACAO_INTEGRAL",
      defaultTaxRegime: "LUCRO_PRESUMIDO",
      defaultRegimeFuncionamento: "SEG_SEX",
    });

    const form = new FormData();
    form.append(
      "file",
      new File([FIXTURE_TAB], "folha.txt", { type: "text/plain" }),
    );
    form.append("simulate", "1");
    form.append("meta", JSON.stringify(SIM_META));

    const res = await app.request("/api/folha/aptools", {
      method: "POST",
      body: form,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
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

  it("JSON text body works for tests / paste path", async () => {
    const res = await app.request("/api/folha/aptools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: FIXTURE_TAB }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.rowCount, 2);
  });

  it("rejects empty / invalid folha", async () => {
    const res = await app.request("/api/folha/aptools", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not-a-folha\n",
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.rowCount, 0);
  });

  it("rejects simulate without scenario meta", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([FIXTURE_TAB], "folha.txt", { type: "text/plain" }),
    );
    form.append("simulate", "true");
    const res = await app.request("/api/folha/aptools", {
      method: "POST",
      body: form,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /meta|scenario/i);
  });
});
