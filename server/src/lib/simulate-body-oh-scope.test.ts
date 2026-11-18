import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  prepareSimulateInput,
  simulateBodySchema,
} from "./simulate-body.js";

describe("simulate-body ohScopeRules (Etapa 1)", () => {
  const base = {
    scenarioId: "fase1_2026_42h" as const,
    sector: "varejo",
    currentScale: "6x1",
    headcount: 10,
    operatingHours: { default: { openHour: 9, closeHour: 21 } },
  };

  it("omits ohScopeRules when client sends none (backward compatible)", () => {
    const body = simulateBodySchema.parse(base);
    const prepared = prepareSimulateInput(body);
    assert.equal(prepared.input.ohScopeRules, undefined);
    assert.deepEqual(prepared.input.operatingHours.default, {
      openHour: 9,
      closeHour: 21,
    });
  });

  it("carries scope rules and synthesizes missing global from operatingHours", () => {
    const body = simulateBodySchema.parse({
      ...base,
      ohScopeRules: [
        {
          scope_type: "cargo",
          target_value: "Administrativo",
          operating_hours: {
            abertura: "08:00",
            fechamento: "17:00",
            dias_semana: [1, 2, 3, 4, 5],
          },
        },
      ],
    });
    const prepared = prepareSimulateInput(body);
    assert.ok(prepared.input.ohScopeRules);
    assert.equal(prepared.input.ohScopeRules![0].scope_type, "global");
    assert.equal(
      prepared.input.ohScopeRules![0].operating_hours.abertura,
      "09:00",
    );
    assert.equal(prepared.input.ohScopeRules![1].scope_type, "cargo");
    assert.equal(
      prepared.input.ohScopeRules![1].target_value,
      "Administrativo",
    );
  });
});
