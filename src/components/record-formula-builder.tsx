"use client";
import { useState } from "react";
import type { FormulaNode } from "@/lib/domain/formula";
import { CommandForm } from "@/components/record-command-form";
import { formulaNodeSchema } from "@/lib/domain/formula";

function NodeEditor({ node, onChange, depth = 0 }: { node: FormulaNode; onChange: (node: FormulaNode) => void; depth?: number }) {
  return <fieldset className="formula-node"><legend>{depth ? "Termo" : "Expressão do indicador"}</legend>
    <label>Tipo de termo<select value={node.type} onChange={event => onChange(event.target.value === "variable" ? { type: "variable", name: "valor" } : event.target.value === "literal" ? { type: "literal", value: 0 } : { type: "binary", operator: "+", left: { type: "variable", name: "valor" }, right: { type: "literal", value: 1 } })}><option value="variable">Variável</option><option value="literal">Número constante</option>{depth < 6 && <option value="binary">Operação aritmética</option>}</select></label>
    {node.type === "variable" && <label>Nome da variável<input required pattern="[a-z][a-z0-9_]{0,63}" value={node.name} onChange={event => onChange({ ...node, name: event.target.value })} /><small>Use letras minúsculas, números e sublinhado.</small></label>}
    {node.type === "literal" && <label>Valor<input type="number" step="any" required value={node.value} onChange={event => onChange({ ...node, value: Number(event.target.value) })} /></label>}
    {node.type === "binary" && <><NodeEditor node={node.left} depth={depth + 1} onChange={left => onChange({ ...node, left })} /><label>Operador<select value={node.operator} onChange={event => onChange({ ...node, operator: event.target.value as "+" | "-" | "*" | "/" })}><option value="+">Somar</option><option value="-">Subtrair</option><option value="*">Multiplicar</option><option value="/">Dividir</option></select></label><NodeEditor node={node.right} depth={depth + 1} onChange={right => onChange({ ...node, right })} /></>}
  </fieldset>;
}
export function FormulaBuilder({ indicatorId, version }: { indicatorId: string; version: number }) {
  const [node, setNode] = useState<FormulaNode>({ type: "variable", name: "valor" });
  function variables(n: FormulaNode): string[] { return n.type === "variable" ? [n.name] : n.type === "binary" ? [...variables(n.left), ...variables(n.right)] : n.type === "function" ? n.args.flatMap(variables) : []; }
  return <CommandForm title="Salvar nova versão da fórmula" endpoint={`/api/v1/indicators/${indicatorId}/formulas`} expectedVersion={version} extraDraft={{value:JSON.stringify(node),restore:value=>{const parsed=formulaNodeSchema.safeParse(JSON.parse(value));if(!parsed.success)throw new Error('Fórmula do rascunho inválida.');setNode(parsed.data);}}} fields={[{ name: "validFrom", label: "Vigente a partir de", type: "date", required: true }]} transform={values => ({ ...values, expression: node, variables: [...new Set(variables(node))] })}><NodeEditor node={node} onChange={setNode} /><p>As medições anteriores mantêm a fórmula usada no cálculo original.</p></CommandForm>;
}
