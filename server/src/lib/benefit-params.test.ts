import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bindParamsForExtractor,
  bindParamsForSlot,
  defaultBenefitParams,
  normalizeBenefitParams,
  skippedBenefitNotes,
} from "./benefit-params.js";

describe("benefit-params", () => {
  it("factory defaults keep historical VR=53 / VA=52", () => {
    const p = defaultBenefitParams();
    assert.equal(p.vrTipoBeneficio, 53);
    assert.equal(p.vaTipoBeneficio, 52);
    assert.equal(p.assistenciaMedicaTipo, null);
    assert.equal(p.vaModoValor, "MES");
  });

  it("normalize accepts null tipos and coerces integers", () => {
    const p = normalizeBenefitParams({
      vrTipoBeneficio: 10,
      vaTipoBeneficio: null,
      assistenciaMedicaTipo: "7",
      assistenciaOdontologicaTipo: -1,
      vaModoValor: "DIA",
    });
    assert.equal(p.vrTipoBeneficio, 10);
    assert.equal(p.vaTipoBeneficio, null);
    assert.equal(p.assistenciaMedicaTipo, 7);
    assert.equal(p.assistenciaOdontologicaTipo, null);
    assert.equal(p.vaModoValor, "DIA");
  });

  it("bindParamsForSlot uses parameterized tipo (no string concat)", () => {
    const p = defaultBenefitParams();
    const vr = bindParamsForSlot("REGRA_VR", "mssql", p);
    assert.deepEqual(vr.params, { tipo: 53 });
    assert.equal(vr.missing.length, 0);

    const skip = bindParamsForSlot("REGRA_VR", "mssql", {
      ...p,
      vrTipoBeneficio: null,
    });
    assert.ok(skip.missing.includes("vrTipoBeneficio"));
  });

  it("extractor binds use sentinel -1 when tipo null", () => {
    const binds = bindParamsForExtractor("mssql", {
      ...defaultBenefitParams(),
      assistenciaMedicaTipo: null,
      assistenciaOdontologicaTipo: null,
    });
    assert.equal(binds.tipoVr, 53);
    assert.equal(binds.tipoVa, 52);
    assert.equal(binds.tipoMedica, -1);
    assert.equal(binds.tipoOdonto, -1);
  });

  it("skippedBenefitNotes lists null tipos", () => {
    const notes = skippedBenefitNotes({
      ...defaultBenefitParams(),
      vrTipoBeneficio: null,
      vaTipoBeneficio: null,
    });
    assert.ok(notes.some((n) => n.includes("VR")));
    assert.ok(notes.some((n) => n.includes("VA")));
  });
});
