import ExcelJS from 'exceljs';
import { longReportFilters, longitudinalFields, longitudinalHeaders, longitudinalDoubts, type LongReport, type LongArea } from '@/lib/epidemiology-longitudinal';
import { longitudinalEnabled, longitudinalRpc } from '@/lib/server/epidemiology-longitudinal';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { safeSpreadsheetValue } from '@/lib/server/export';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return Response.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!longitudinalEnabled(workspace)) return Response.json({ error: 'Área não habilitada.' }, { status: 403, headers });
  const filters = longReportFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return Response.json({ error: 'Recorte inválido.' }, { status: 422, headers });
  const result = await longitudinalRpc(workspace, { ...filters.data, action: 'report' });
  if (result.error) return Response.json({ error: 'Exportação não autorizada ou indisponível.' }, { status: result.error.code === '42501' ? 403 : 503, headers });
  const report = result.data as LongReport, workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Consolidado');
  sheet.addRow(['SGC-UBS · Homologação sintética', report.area, report.month, report.definitive ? 'Revisões fechadas' : 'Provisório']);
  sheet.addRow(['UBS', 'Equipe', 'Registros', 'Sem validação', 'Situação', 'Revisão', 'Responsável (ID)', 'Fechado em']);
  for (const t of report.teams) sheet.addRow([safeSpreadsheetValue(t.unitName), safeSpreadsheetValue(t.teamName), t.total, t.pending, t.status, t.revision, t.closedBy ?? '', t.closedAt ?? '']);
  if (report.nominal) {
    const fields = longitudinalFields(report.area as LongArea), headFields = longitudinalHeaders(report.area as LongArea), nominal = workbook.addWorksheet('Acompanhamentos restritos');
    nominal.addRow(['Identificador do acompanhamento', 'Versão', 'Situação', 'Identificador permanente do caso', 'Origem', ...fields.map(f => f.label), ...headFields.map(f => f.label), 'Campos adicionais preservados']);
    for (const t of report.teams) for (const r of t.records ?? []) {
      const extra = Object.fromEntries(Object.entries(r.payload).filter(([key]) => !fields.some(f => f.key === key)));
      const recordHeaders = (r as typeof r & { headers?: Record<string, string> }).headers ?? t.headers ?? {};
      const detail = r as typeof r & { caseId?: string; origin?: string };
      nominal.addRow([r.id, r.version, r.status, detail.caseId ?? r.id, detail.origin ?? 'Registro anterior', ...fields.map(f => { const value = r.payload[f.key] ?? (f.key === 'notificationDate' ? r.payload.date : undefined); return typeof value === 'number' ? value : safeSpreadsheetValue(String(value ?? 'Não informado')); }), ...headFields.map(f => safeSpreadsheetValue(recordHeaders[f.key] ?? 'Não informado')), safeSpreadsheetValue(JSON.stringify(extra))]);
    }
  }
  const notes = workbook.addWorksheet('Interpretações pendentes'); longitudinalDoubts.forEach(s => notes.addRow([s]));
  workbook.worksheets.forEach(s => { s.getRow(1).font = { bold: true }; s.columns.forEach(c => { c.width = 28; }); s.views = [{ state: 'frozen', ySplit: 1 }]; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="acompanhamentos-${report.area}-${report.month}.xlsx"`, 'X-Content-Type-Options': 'nosniff' } });
}
