import { NextResponse } from "next/server";
import { z } from "zod";
import { parseFormula, FormulaError } from "@/lib/domain/formula";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({
  operationId: z.uuid(), expectedVersion: z.number().int().positive(),
  variables: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).min(1).max(64).refine((items) => new Set(items).size === items.length, "Variáveis duplicadas."),
  expression: z.unknown(), validFrom: z.iso.date()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Definição da fórmula inválida.", issues: body.success ? undefined : body.error.issues }, { status: 422 });
  let expression;
  try { expression = parseFormula(body.data.expression); } catch (error) { return NextResponse.json({ error: error instanceof FormulaError ? error.message : "Fórmula inválida." }, { status: 422 }); }
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), indicatorId: id, version: 1, validFrom: body.data.validFrom, mode: "demo" }, { status: 201 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("create_indicator_formula_version", { p_indicator_id: id, p_expected_version: body.data.expectedVersion, p_operation_id: body.data.operationId, p_variables: body.data.variables, p_expression_ast: expression, p_valid_from: body.data.validFrom });
  return error ? commandError(error) : NextResponse.json(data, { status: 201 });
}
