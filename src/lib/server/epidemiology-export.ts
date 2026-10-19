import 'server-only';
import ExcelJS from 'exceljs';
import { epiAreas, epiStates } from '@/lib/epidemiology';
import { epiCoverage, epiReportValue, type EpiMonthReport } from '@/lib/epidemiology-monthly';

// User text is always a string, never a formula or hyperlink object.
export function epiExcelText(value: unknown): string | number {
  const v = epiReportValue(value);
  return typeof v === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(v) ? `'${v}` : v;
}
export async function epidemiologyWorkbook(report: EpiMonthReport) {
  const book = new ExcelJS.Workbook(); book.creator = 'SGC-UBS';
  const definition = epiAreas.find(a => a.id === report.area)!;
  function sheet(name: string, columns: string[], widths: number[]) {
    const s = book.addWorksheet(name, { properties: { defaultRowHeight: 24 }, views: [{ showGridLines: false }] });
    s.addRow([]); s.addRow(['Vigilância Epidemiológica']); s.addRow([`${definition.title} · ${report.month}`]);
    s.addRow([epiExcelText(report.organizationName)]);
    s.addRow([report.definitive ? 'REVISÕES FECHADAS NO RECORTE' : 'PRÉVIA PROVISÓRIA — NÃO DEFINITIVO']);
    s.addRow([epiCoverage(report)]); s.addRow(['Gerado em (UTC)', new Date(report.generatedAt)]); s.getCell('B7').numFmt = 'dd/mm/yyyy hh:mm';
    s.addRow(['Contagem de registros internos. Não representa incidência ou casos confirmados.']);
    s.addRow([]); s.addRow(columns);
    widths.forEach((width, i) => { s.getColumn(i + 1).width = width; });
    for (const n of [2, 3, 4, 5, 6, 8]) s.mergeCells(n, 1, n, columns.length);
    s.views = [{ state: 'frozen', ySplit: 10, showGridLines: false }];
    s.getRow(2).font = { name: 'Arial', size: 14, bold: true };
    s.getRow(10).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF164E49' } };
    s.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '10:10' };
    return s;
  }
  const summary = sheet('Consolidado', ['UBS', 'Equipe', 'Situação mensal', 'Revisão', 'Registros', 'Sem validação', 'Ausência declarada', 'Fechado em (UTC)', 'Responsável (ID)'], [30, 35, 24, 12, 14, 18, 22, 24, 40]);
  for (const t of report.teams) {
    const row = summary.addRow([epiExcelText(t.unitName), epiExcelText(t.teamName), t.status === 'CLOSED' ? 'Fechado' : 'Em preenchimento', t.revision || 'Não informado', t.total, t.pending, t.noActivity ? 'Sim, justificada' : t.total ? 'Não' : 'Não declarada', t.closedAt ? new Date(t.closedAt) : 'Não informado', t.closedBy ?? 'Não informado']);
    row.getCell(8).numFmt = 'dd/mm/yyyy hh:mm';
  }
  summary.addRow(['TOTAL DO RECORTE', '', '', '', report.total]);
  if (report.nominal) {
    const records = sheet('Registros restritos', ['Identificador interno', 'Equipe', 'Situação do registro', 'Versão', ...definition.fields.map(f => f.label)], [40, 35, 27, 12, ...definition.fields.map(() => 35)]);
    for (const t of report.teams) for (const r of t.records ?? []) {
      const row = records.addRow([r.id, epiExcelText(t.teamName), epiStates[r.status], r.version, ...definition.fields.map(f => {
        const value = r.payload[f.key];
        return f.type === 'date' && value ? new Date(`${value}T00:00:00Z`) : epiExcelText(value);
      })]);
      definition.fields.forEach((f, i) => { row.getCell(i + 5).numFmt = f.type === 'date' ? 'dd/mm/yyyy' : f.type === 'integer' ? '#,##0' : '@'; });
    }
  }
  for (const s of book.worksheets) {
    s.eachRow((r, n) => {
      if (n !== 2 && n !== 10) r.font = { name: 'Arial', size: 10 };
      if (n >= 10) {
        r.alignment = { vertical: 'middle', wrapText: true };
        let lines = 1;
        r.eachCell((c, col) => { lines = Math.max(lines, Math.ceil(String(c.text).length / Math.max(12, (s.getColumn(col).width ?? 25) - 5))); });
        r.height = Math.min(409, Math.max(46, lines * 14 + 12));
      }
    });
    s.addRow([]); s.addRow(['Modelo v1 em revisão. Origem: EPIDEMIOLOGIA 2026 (1).xlsx, aba ' + definition.source]);
    s.mergeCells(s.rowCount, 1, s.rowCount, s.columnCount);
    for (const note of definition.pending) { const r = s.addRow([note]); s.mergeCells(r.number, 1, r.number, s.columnCount); r.height = 36; r.alignment = { wrapText: true }; }
  }
  return book.xlsx.writeBuffer();
}
