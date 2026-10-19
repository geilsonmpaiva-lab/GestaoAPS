import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { epiMonthCommand, epiReportFilters, epiReportValue, type EpiMonthReport } from './epidemiology-monthly';
vi.mock('server-only', () => ({}));
import { epiExcelText, epidemiologyWorkbook } from './server/epidemiology-export';
const query = { area: 'hanseniase', month: '2028-02' };
const command = { ...query, action: 'close', team: randomUUID(), operationId: randomUUID(), expectedVersion: 0, deviceId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true };
function report(nominal = false): EpiMonthReport {
  return { organizationName: '[HOMOLOGAÇÃO] Município', area: 'hanseniase', month: '2028-02', scope: 'team', nominal, generatedAt: new Date().toISOString(), definitive: true, total: 51, teams: [{ teamId: randomUUID(), teamName: '[SINTÉTICO] Equipe', unitId: randomUUID(), unitName: '[SINTÉTICO] UBS', status: 'CLOSED', currentStatus: 'CLOSED', version: 1, revision: 1, total: 51, pending: 0, counts: { VALIDATED: 51 }, noActivity: false, canClose: true, revisions: [], closedAt: new Date().toISOString(), closedBy: randomUUID(), records: nominal ? Array.from({ length: 51 }, (_, i) => ({ id: randomUUID(), version: 1, status: 'VALIDATED', payload: { name: `[SINTÉTICO] Pessoa ${i}`, sinan: '00001', contacts: 0, date: '2028-02-01', classification: '\t=HYPERLINK("bad")' } })) : undefined }] };
}
describe('epidemiology monthly contracts and XLSX', () => {
  it('rejects tenant override, absent team, municipal nominal and ambiguous revisions', () => {
    for (const v of [{ ...query, organizationId: randomUUID() }, { ...query, scope: 'team' }, { ...query, scope: 'municipal', nominal: 'true' }, { ...query, revision: 1 }, { ...query, scope: 'team', team: randomUUID(), revision: 0 }]) expect(epiReportFilters.safeParse(v).success).toBe(false);
    expect(epiReportFilters.parse({ ...query, scope: 'team', team: randomUUID(), nominal: 'true', revision: '2' }).revision).toBe(2);
  });
  it('requires justified zero declarations and reopening while preserving strict envelope', () => {
    expect(epiMonthCommand.safeParse(command).success).toBe(true);
    for (const v of [{ ...command, noActivity: true }, { ...command, action: 'reopen' }, { ...command, expectedVersion: -1 }, { ...command, synthetic: false }, { ...command, unitId: randomUUID() }]) expect(epiMonthCommand.safeParse(v).success).toBe(false);
    expect(epiMonthCommand.safeParse({ ...command, noActivity: true, reason: 'Ausência sintética confirmada' }).success).toBe(true);
  });
  it('distinguishes zero from missing, keeps codes as text and neutralizes formula text', () => {
    expect(epiReportValue(0)).toBe(0); expect(epiReportValue(undefined)).toBe('Não informado'); expect(epiExcelText('00001')).toBe('00001');
    for (const v of ['=A1', '+SUM(A1)', '\t@X', '\n -1']) expect(epiExcelText(v)).toBe(`'${v}`);
  });
  it('exports all 51 snapshot rows with typed dates and counts, no executable formulas', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await epidemiologyWorkbook(report(true)));
    const s = book.getWorksheet('Registros restritos')!;
    expect(s.getCell('E11').value).toBe('00001'); expect(s.getCell('G11').value).toBeInstanceOf(Date);
    expect(s.getCell('I11').value).toBe(0); expect(s.getCell('H11').value).toBe('\'\t=HYPERLINK("bad")');
    expect(s.getCell('F61').value).toBe('[SINTÉTICO] Pessoa 50');
    s.eachRow(r => r.eachCell(c => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)));
    expect(book.getWorksheet('Consolidado')!.getCell('E12').value).toBe(51);
  });
  it('aggregate export has no nominal worksheet or payload', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await epidemiologyWorkbook(report()));
    expect(book.worksheets).toHaveLength(1); expect(JSON.stringify(book.model)).not.toContain('Pessoa');
  });
});
