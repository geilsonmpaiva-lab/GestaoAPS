import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importTemplates } from "@/lib/import-templates";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

export const runtime = "nodejs";
const MAX_ROWS = 5_000;
const allowedValues: Record<string, Record<string, string[]>> = {
  usuarios: { perfil: ["ADMIN_SISTEMA", "GESTOR_ORGANIZACAO", "GERENTE_UBS", "RESPONSAVEL_DOMINIO", "EXECUTOR", "AUDITOR", "LEITOR"] },
  conhecimento: {
    tipo: ["PROTOCOL", "PROCEDURE", "POLICY", "STANDARD", "MANUAL", "GOOD_PRACTICE", "LESSON_LEARNED", "TEMPLATE", "FLOW", "FAQ", "TECHNICAL_REFERENCE", "EXTERNAL_DOCUMENT"],
    nivel_acesso: ["PUBLIC_INSTITUTIONAL", "INTERNAL", "RESTRICTED"]
  },
  indicadores: { melhor_direcao: ["HIGHER", "LOWER", "RANGE", "EQUAL"] }
};

function cellText(value: ExcelJS.CellValue) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) {
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value ?? "").trim();
}

export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const type = request.nextUrl.searchParams.get("type") ?? "";
  const template = importTemplates[type];
  if (!template) return NextResponse.json({ error: "Tipo de importação inválido." }, { status: 422 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Envie um arquivo XLSX de até 10 MB." }, { status: 422 });
  const organizationId = String(form.get("organizationId") ?? "");
  const rawUnitId = String(form.get("unitId") ?? "");
  if (!isDemoMode() && !z.uuid().safeParse(organizationId).success) return NextResponse.json({ error: "Organização inválida." }, { status: 422 });
  if (rawUnitId && !z.uuid().safeParse(rawUnitId).success) return NextResponse.json({ error: "UBS inválida." }, { status: 422 });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "O arquivo não é um XLSX válido." }, { status: 422 });
  }
  const sheet = workbook.getWorksheet(template.sheetName) ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ error: "A planilha não contém abas." }, { status: 422 });
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cellText);
  const errors: Array<{ row: number; field: string; message: string }> = [];
  const data: Array<Record<string, string>> = [];
  template.columns.forEach((column) => {
    if (!headers.includes(column.label)) errors.push({ row: 1, field: column.label, message: "Coluna ausente." });
  });
  let validRows = 0;
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
    if (values.every((value) => !value)) return;
    if (validRows >= MAX_ROWS) {
      if (!errors.some((error) => error.message.includes("5.000"))) errors.push({ row: number, field: "arquivo", message: "O limite é de 5.000 linhas por importação." });
      return;
    }
    const record: Record<string, string> = {};
    template.columns.forEach((column) => {
      const index = headers.indexOf(column.label);
      if (column.required && (index < 0 || !values[index])) errors.push({ row: number, field: column.label, message: "Campo obrigatório." });
      record[column.key] = index < 0 ? "" : values[index];
      const allowed = allowedValues[type]?.[column.key];
      if (record[column.key] && allowed && !allowed.includes(record[column.key])) errors.push({ row: number, field: column.label, message: `Valor permitido: ${allowed.join(", ")}.` });
    });
    if (type === "usuarios" && record.email && !z.email().safeParse(record.email).success) errors.push({ row: number, field: "E-mail", message: "E-mail inválido." });
    if (type === "protocolos" && record.responsavel_email && !z.email().safeParse(record.responsavel_email).success) errors.push({ row: number, field: "Responsável técnico", message: "E-mail inválido." });
    data.push(record);
    validRows += 1;
  });
  const status = errors.length || validRows === 0 ? "INVALID" : "READY";
  let previewId = crypto.randomUUID();
  if (!isDemoMode()) {
    const client = await createSupabaseServerClient();
    const { data: job, error } = await client.from("import_jobs").insert({
      organization_id: organizationId,
      unit_id: rawUnitId || null,
      template_type: type,
      file_name: file.name,
      status,
      summary: { rows: validRows, data },
      validation_errors: errors.slice(0, 200),
      created_by: actor.id
    }).select("id").single();
    if (error || !job) return NextResponse.json({ error: "Não foi possível registrar a prévia. Verifique sua permissão administrativa.", code: error?.code }, { status: error?.code === "42501" ? 403 : 422 });
    previewId = job.id;
  }
  return NextResponse.json({ previewId, type, fileName: file.name, rows: validRows, status, errors: errors.slice(0, 200), canCommit: status === "READY", mode: isDemoMode() ? "demo" : "live" });
}
