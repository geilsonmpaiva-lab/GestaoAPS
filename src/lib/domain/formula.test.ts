import { describe, expect, it } from "vitest";
import { classifyMeasurement, evaluateFormula, FormulaError, parseFormula, type FormulaNode } from "./formula";

describe("indicator formula engine", () => {
  it("evaluates a version-safe percentage without eval", () => {
    const formula: FormulaNode = { type: "binary", operator: "*", left: { type: "binary", operator: "/", left: { type: "variable", name: "conformes" }, right: { type: "variable", name: "total" } }, right: { type: "literal", value: 100 } };
    expect(evaluateFormula(formula, { conformes: 23, total: 25 })).toBe(92);
  });

  it("rejects missing variables and division by zero", () => {
    expect(() => evaluateFormula({ type: "variable", name: "ausente" }, {})).toThrow(FormulaError);
    expect(() => evaluateFormula({ type: "binary", operator: "/", left: { type: "literal", value: 1 }, right: { type: "literal", value: 0 } }, {})).toThrow("Divisão por zero");
  });

  it("never turns missing data into zero", () => {
    expect(classifyMeasurement(null, { comparison: "GTE", value: 95 })).toBe("SEM_DADO");
    expect(classifyMeasurement(92, { comparison: "GTE", value: 95, attention: 90 })).toBe("ATENCAO");
    expect(classifyMeasurement(70, { comparison: "GTE", value: 95, attention: 90 })).toBe("FORA_META");
  });

  it("rejects unknown operators, undeclared node shapes and excessive trees", () => {
    expect(() => parseFormula({ type: "binary", operator: "**", left: { type: "literal", value: 2 }, right: { type: "literal", value: 8 } })).toThrow(FormulaError);
    expect(() => parseFormula({ type: "literal", value: 1, code: "não permitido" })).toThrow(FormulaError);
    let deep: unknown = { type: "literal", value: 1 };
    for (let index = 0; index < 34; index += 1) deep = { type: "function", name: "round", args: [deep] };
    expect(() => parseFormula(deep)).toThrow("complexidade");
  });
});
