import { z } from "zod";

export type FormulaNode =
  | { type: "literal"; value: number }
  | { type: "variable"; name: string }
  | { type: "binary"; operator: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode }
  | { type: "function"; name: "min" | "max" | "round"; args: FormulaNode[] };

export class FormulaError extends Error {}

export const formulaNodeSchema: z.ZodType<FormulaNode> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("literal"), value: z.number().finite() }).strict(),
  z.object({ type: z.literal("variable"), name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) }).strict(),
  z.object({ type: z.literal("binary"), operator: z.enum(["+", "-", "*", "/"]), left: formulaNodeSchema, right: formulaNodeSchema }).strict(),
  z.object({ type: z.literal("function"), name: z.enum(["min", "max", "round"]), args: z.array(formulaNodeSchema).min(1).max(32) }).strict()
]));

export function parseFormula(input: unknown): FormulaNode {
  const parsed = formulaNodeSchema.safeParse(input);
  if (!parsed.success) throw new FormulaError("A estrutura da fórmula é inválida.");
  let nodes = 0;
  const visit = (node: FormulaNode, depth: number) => {
    nodes += 1;
    if (nodes > 256 || depth > 32) throw new FormulaError("A fórmula excede o limite de complexidade.");
    if (node.type === "binary") { visit(node.left, depth + 1); visit(node.right, depth + 1); }
    if (node.type === "function") node.args.forEach((item) => visit(item, depth + 1));
  };
  visit(parsed.data, 0);
  return parsed.data;
}

export function evaluateFormula(node: FormulaNode, variables: Record<string, number>, depth = 0): number {
  if (depth > 32) throw new FormulaError("A fórmula excede a profundidade permitida.");

  if (node.type === "literal") return assertFinite(node.value);
  if (node.type === "variable") {
    if (!(node.name in variables)) throw new FormulaError(`Variável ausente: ${node.name}`);
    return assertFinite(variables[node.name]);
  }
  if (node.type === "binary") {
    const left = evaluateFormula(node.left, variables, depth + 1);
    const right = evaluateFormula(node.right, variables, depth + 1);
    if (node.operator === "+") return assertFinite(left + right);
    if (node.operator === "-") return assertFinite(left - right);
    if (node.operator === "*") return assertFinite(left * right);
    if (right === 0) throw new FormulaError("Divisão por zero.");
    return assertFinite(left / right);
  }

  const args = node.args.map((arg) => evaluateFormula(arg, variables, depth + 1));
  if (args.length === 0) throw new FormulaError(`A função ${node.name} exige argumentos.`);
  if (node.name === "min") return Math.min(...args);
  if (node.name === "max") return Math.max(...args);
  if (args.length !== 1) throw new FormulaError("A função round aceita um argumento.");
  return Math.round(args[0]);
}

function assertFinite(value: number): number {
  if (!Number.isFinite(value)) throw new FormulaError("Resultado numérico inválido.");
  return value;
}

export type TargetRule =
  | { comparison: "GTE"; value: number; attention?: number }
  | { comparison: "LTE"; value: number; attention?: number }
  | { comparison: "EQ"; value: number }
  | { comparison: "BETWEEN"; min: number; max: number; attentionMin?: number; attentionMax?: number };

export function classifyMeasurement(value: number | null, target: TargetRule | null): "SEM_DADO" | "DENTRO_META" | "ATENCAO" | "FORA_META" {
  if (value === null) return "SEM_DADO";
  if (!target) return "SEM_DADO";
  if (target.comparison === "GTE") {
    if (value >= target.value) return "DENTRO_META";
    if (target.attention !== undefined && value >= target.attention) return "ATENCAO";
    return "FORA_META";
  }
  if (target.comparison === "LTE") {
    if (value <= target.value) return "DENTRO_META";
    if (target.attention !== undefined && value <= target.attention) return "ATENCAO";
    return "FORA_META";
  }
  if (target.comparison === "EQ") return value === target.value ? "DENTRO_META" : "FORA_META";
  if (value >= target.min && value <= target.max) return "DENTRO_META";
  if (target.attentionMin !== undefined && target.attentionMax !== undefined && value >= target.attentionMin && value <= target.attentionMax) return "ATENCAO";
  return "FORA_META";
}
