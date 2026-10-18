import { productionProcedures } from '@/lib/esf/catalog';
import { annualProductionRows, monthNames, monthlyStatusLabels, type EsfProductionData } from '@/lib/esf/production';

export function EsfProductionReport({ data, month, organization, unit, team }: { data: EsfProductionData; month: string; organization: string; unit: string; team: string }) {
  const status = data.monthly?.status ?? 'OPEN';
  const summary = status === 'CLOSED' ? data.monthly?.snapshot ?? [] : data.summary;
  return <article className="esf-report"><header><p>SGC-UBS - PRODUÇÃO CONSOLIDADA</p><h1>Produção consolidada</h1><p>{organization} · {unit} · ESF: {team}</p>
    <p>Mês: {month.slice(5)} · Ano: {month.slice(0, 4)} · {monthlyStatusLabels[status]} · Revisão {data.monthly?.revision ?? 1} · {status === 'CLOSED' ? 'Snapshot mensal fechado' : 'PRÉVIA NÃO DEFINITIVA'}</p>
    <p>Códigos transcritos do documento, ainda sujeitos à validação institucional. Não representam SIGTAP aprovado.</p></header>
    <section><h2>Mapa mensal preenchido</h2><table><caption>25 linhas por procedimento/categoria - competência {month}</caption><thead><tr><th>Código</th><th>Descrição</th><th>Quantidade</th></tr></thead><tbody>{productionProcedures.map(p => <tr key={p.id}><td>{p.code}</td><th scope="row">{p.label}</th><td>{summary.find(r => r.procedureId === p.id)?.quantity ?? 'Não informado'}</td></tr>)}</tbody></table></section>
    <section><h2>JAN a DEZ - consolidação anual de {month.slice(0, 4)}</h2><p>PRÉVIA ANUAL: soma dos lançamentos conhecidos. Mês sem lançamento não equivale a zero. O fechamento permanece mensal.</p>
      <table className="esf-annual-print"><caption>Produção consolidada anual e total calculado</caption><thead><tr><th>Código</th><th>Descrição</th>{monthNames.map(m => <th key={m}>{m}</th>)}<th>TOTAL</th></tr></thead><tbody>{annualProductionRows(data.annual, month.slice(0, 4)).map(r => <tr key={r.id}><td>{r.code}</td><th scope="row">{r.label}</th>{r.months.map((v, i) => <td key={i}>{v ?? 'NI'}</td>)}<td>{r.total ?? 'NI'}{r.partial && r.total !== null ? ' *' : ''}</td></tr>)}</tbody></table>
      <p>NI: não informado. * Total parcial: existem meses sem informação. Valores de meses não fechados podem mudar. O mapa mensal acima usa o snapshot quando fechado.</p></section>
  </article>;
}
