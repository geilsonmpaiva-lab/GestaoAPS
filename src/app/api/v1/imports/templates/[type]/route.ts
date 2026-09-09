import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { importTemplates } from "@/lib/import-templates";
import { requireActor } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ type: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { type } = await context.params;
  const template = importTemplates[type];
  if (!template) return NextResponse.json({ error: "Template desconhecido." }, { status: 404 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SGC UBS";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(template.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = template.columns.map((column) => ({ header: column.label, key: column.key, width: Math.max(18, column.label.length + 4) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF175F4C" } };
  sheet.addRow(Object.fromEntries(template.columns.map((column) => [column.key, column.example])));
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + template.columns.length)}1` };

  const instructions = workbook.addWorksheet("Instruções");
  instructions.columns = [{ key: "field", width: 28 }, { key: "rule", width: 68 }];
  instructions.addRow(["Template", template.label]);
  instructions.addRow(["Regra", "Não altere os títulos das colunas. Remova a linha de exemplo antes de importar dados reais."]);
  template.columns.forEach((column) => instructions.addRow([column.label, column.required ? "Obrigatório" : "Opcional"]));

  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="sgc-ubs-${type}.xlsx"`,
      "cache-control": "private, no-store"
    }
  });
}
