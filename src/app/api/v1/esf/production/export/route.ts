import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireActor, isDemoMode } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadEsfProduction, productionFiltersSchema } from '@/lib/server/esf';
import { productionProcedures } from '@/lib/esf/catalog';
import { annualProductionRows, monthNames, monthlyStatusLabels } from '@/lib/esf/production';
import { safeSpreadsheetValue } from '@/lib/server/export';

export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (isDemoMode()) return NextResponse.json({ error: 'Exportação de registros persistidos disponível apenas em homologação.' }, { status: 409 });
  const filters = productionFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  try {
    const data = await loadEsfProduction(workspace, filters.data);
    if (!data.canExport) return NextResponse.json({ error: 'Exportação não autorizada.' }, { status: 403 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Produção mensal');
    const status = data.monthly?.status ?? 'OPEN';
    sheet.addRow(['SGC-UBS — Produção consolidada']);
    sheet.addRow(['Organização', safeSpreadsheetValue(workspace.organizationName)]);
    sheet.addRow(['UBS', safeSpreadsheetValue(workspace.unitName)]);
    sheet.addRow(['Equipe', safeSpreadsheetValue(data.teams.find(t => t.id === (filters.data.team ?? data.teams[0]?.id))?.name)]);
    sheet.addRow(['Competência', filters.data.month, 'Revisão', data.monthly?.revision ?? 1]);
    sheet.addRow(['Situação', monthlyStatusLabels[status], status === 'CLOSED' ? 'Snapshot fechado' : 'PRÉVIA — NÃO DEFINITIVO']);
    sheet.addRow(['Fechado em', data.monthly?.closed_at ?? '', 'Responsável (ID)', data.monthly?.closed_by ?? '']);
    sheet.addRow([]); sheet.addRow(['Código de referência', 'Procedimento', 'Quantidade']);
    const summary = status === 'CLOSED' ? data.monthly?.snapshot ?? [] : data.summary;
    for (const p of productionProcedures) sheet.addRow([p.code, p.label, summary.find(s => s.procedureId === p.id)?.quantity ?? 'Não informado']);
    sheet.getColumn(1).width = 24; sheet.getColumn(2).width = 62; sheet.getColumn(3).width = 22;
    sheet.getRow(9).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 9 }];
    const annual = workbook.addWorksheet('Consolidação anual');
    annual.addRow(['Produção anual', filters.data.month.slice(0, 4), 'Consolidação dos lançamentos; fechamentos são mensais.']);
    annual.addRow(['Código', 'Procedimento', ...monthNames, 'TOTAL', 'Cobertura']);
    for (const p of annualProductionRows(data.annual, filters.data.month.slice(0, 4))) annual.addRow([p.code, p.label, ...p.months.map(v => v ?? 'Não informado'), p.total ?? 'Não informado', p.partial ? 'Parcial' : '12 meses informados']);
    annual.getColumn(1).width = 18; annual.getColumn(2).width = 56;
    for (let i = 3; i <= 16; i++) annual.getColumn(i).width = 18;
    annual.getRow(2).font = { bold: true }; annual.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="producao-${filters.data.month}.xlsx"`, 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Não foi possível exportar o mapa autorizado. Tente novamente.' }, { status: 503 }); }
}
