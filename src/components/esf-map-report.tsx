import { mapDefinition, calculatedRow, displayMapValue, mapStatusLabels, sumKnown, type EsfMap } from '@/lib/esf/maps';
import { displayDate } from '@/lib/record-presentation';
import type { EsfField } from '@/lib/esf/catalog';

const show = (field: EsfField, value: string | number | null | undefined) => field.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? displayDate(value) : displayMapValue(value);
export function EsfMapReport({ map, organization, unit, team }: { map: EsfMap; organization: string; unit: string; team: string }) {
  const definition = mapDefinition(map.template_id)!;
  return <article className="esf-report"><header><p>SGC-UBS - HOMOLOGAÇÃO - DADOS SINTÉTICOS</p><h1>{definition.template.title}</h1>
    <p>{organization} · {unit} · {team}</p><p>Competência: {map.competency} · Modelo revisado: {definition.template.page}/10 · Versão de dados {map.version} · Revisão {map.revision}</p>
    <p><strong>{mapStatusLabels[map.status]} - {map.status === 'CLOSED' ? 'SNAPSHOT DE TESTE' : 'PRÉVIA NÃO DEFINITIVA'}</strong></p>
    <p>Modelo institucional em revisão. Não utilizar para dados reais, prescrição ou recomendação de doses.</p></header>
    <section><h2>Cabeçalho e responsáveis informados</h2><dl className="esf-report-meta">{definition.headers.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{show(f, map.payload.headers[f.key])}</dd></div>)}</dl></section>
    {definition.sections.map(section => {
      const rows = map.payload.sections[section.id] ?? [];
      // Split wide paper grids; repeated row numbers connect groups without tiny text.
      const chunks = Array.from({ length: Math.ceil(section.fields.length / 5) }, (_, i) => section.fields.slice(i * 5, i * 5 + 5));
      return <section key={section.id}><h2>{section.title}</h2>{!rows.length ? <p>Sem registros informados. Ausência de lançamento não comprova quantidade zero.</p> : chunks.map((fields, i) => <div className="esf-report-block" key={i}><table><caption>{section.title} - grupo {i + 1} de {chunks.length} - {rows.length} registro(s)</caption>
        <thead><tr><th scope="col">Linha</th>{fields.map(f => <th scope="col" key={f.key}>{f.label}{f.unit ? ` (${f.unit})` : ''}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => { const values = calculatedRow(map.template_id, section.id, row.values); return <tr key={row.id}><th scope="row">{index + 1}</th>{fields.map(f => <td key={f.key}>{show(f, values[f.key])}</td>)}</tr>; })}</tbody>
        {map.template_id === 'insulinas' && section.id === 'deliveries' && <tfoot><tr><th scope="row">Total entregue</th>{fields.map(f => <td key={f.key}>{f.key.endsWith('Delivered') ? displayMapValue(sumKnown(rows.map(r => r.values[f.key]))) : 'Não totalizado'}</td>)}</tr></tfoot>}
      </table></div>)}</section>;
    })}
    <section><h2>Regras de cálculo e pendências</h2><p>Saldo = saldo anterior + entradas - saídas. Ressuprimento solicitado/autorizado não é recebimento. Unidades distintas não são convertidas nem somadas como equivalentes. Total não calculável com valores ausentes ou não aplicáveis aparece como “Não informado”.</p>
      <p>Medicamentos: entradas = assistência farmacêutica + outras; saídas = dispensação + remanejamento + perdas; demanda total = atendida + não atendida (unidade ainda em revisão). Testes: saídas = Rede Cegonha + outros + perdas. Unidades diárias de insulina são apenas transcritas e não são totalizadas. Frequência: Sim para falta equivale a um dia neste lançamento; Não equivale a zero. A regra institucional de apuração continua pendente.</p>
      <ul>{definition.template.pending.map(text => <li key={text}>{text}</li>)}</ul><p>Campos sem opções aprovadas permanecem transcrição documental, não classificação validada. Este mapa não movimenta o estoque operacional e não substitui acompanhamento longitudinal oficial.</p>
    </section></article>;
}
