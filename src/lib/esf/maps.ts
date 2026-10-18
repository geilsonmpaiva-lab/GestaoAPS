import { z } from 'zod';
import { esfTemplates, type EsfField } from './catalog';
import { monthSchema } from './production';
const mapDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => value >= '1900-01-01' && value <= '2100-12-31' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);

export const syntheticOrganization = '362db1a9-bfdd-4334-9436-46b1c0117eab';
export type MapValue = string | number | null;
export type MapRow = { id: string; values: Record<string, MapValue> };
export type MapPayload = { headers: Record<string, MapValue>; sections: Record<string, MapRow[]> };
export type MapSection = { id: string; title: string; fields: EsfField[] };
const field = (key: string, label: string, type: EsfField['type'] = 'text', group = 'Identificação'): EsfField => ({ key, label, sourceLabel: label, type, group });
const number = (key: string, label: string, group = 'Movimentação') => field(key, label, 'decimal', group);
const input = (f: EsfField): EsfField => f.key.endsWith('previousBalance') || f.key === 'previousBalance' ? { ...f, type: 'decimal', review: 'Saldo inicial informado para este mapa sintético; não é saldo do estoque operacional.' } : f;

/** Paper-derived fields are not institutional approval. No doses, arbitrary formulas or clinical rules. */
export function mapDefinition(id: string) {
  const template = esfTemplates.find(t => t.id === id && id !== 'producao');
  if (!template) return null;
  let fields = template.fields.map(input);
  const headers = [field('reportDate', 'Data do mapa', 'date'), field('filledBy', 'Responsável pelo preenchimento')];
  if (id === 'testes-rapidos') {
    headers.push(...fields.filter(f => f.group === 'Serviço'), field('serviceOther', 'Outro tipo de serviço'), field('technicalOwner', 'Responsável pelo serviço'));
    fields = fields.filter(f => f.group !== 'Serviço');
  }
  if (id === 'frequencia') headers.push(field('administrativeAddress', 'Endereço da unidade administrativa'));
  if (id === 'frequencia') headers.push(field('informationDate', 'Data da informação', 'date'), field('planningDate', 'Data da conferência da Secretaria', 'date'));
  if (id === 'hanseniase') headers.push(field('regional', 'CRES'), field('municipality', 'Município'));
  headers.push(...fields.filter(f => f.group === 'Conferência'));
  fields = fields.filter(f => f.group !== 'Conferência');
  if (id === 'frequencia') {
    fields = fields.filter(f => !['professionalId', 'absences'].includes(f.key));
    fields.unshift(field('professionalId', 'Servidor(a) sintético(a)'), field('referenceId', 'Identificador do vínculo / profissional'));
    fields.push(field('occurrenceDate', 'Data da ocorrência de frequência', 'date'), field('absent', 'Houve falta neste registro?', 'select'));
    fields.find(f => f.key === 'absent')!.options = ['Sim', 'Não', 'Não informado'];
    fields.find(f => f.key === 'shift')!.type = 'text';
    fields.find(f => f.key === 'shift')!.label = 'Turno(s): manhã, tarde e/ou noite';
    fields.find(f => f.key === 'hours')!.label = 'C.H. de trabalho';
    headers.find(f => f.key === 'planningSecretary')!.label = 'Secretaria de Planejamento, Controle e Ouvidoria';
    fields.push(field('absences', 'Faltas neste lançamento (dia)', 'calculated'));
  }
  if (id === 'nascidos-vivos') {
    headers.push(...fields.filter(f => ['segment', 'area'].includes(f.key)));
    fields = fields.filter(f => !['segment', 'area'].includes(f.key));
  }
  if (['hanseniase', 'tuberculose'].includes(id)) fields.unshift(field('caseReference', 'Referência do caso sintético (manter nos acompanhamentos)'));
  if (id === 'hanseniase') fields.push(field('followUpDate', 'Data deste acompanhamento', 'date'));
  if (id === 'tuberculose') fields.push(field('followUpDate', 'Data deste acompanhamento', 'date'));
  if (id === 'nascidos-vivos') fields.push({ ...field('weightUnit', 'Unidade do peso', 'select'), options: ['g', 'kg', 'Não informado'] });
  if (id === 'medicamentos') fields = fields.filter(f => !['entry', 'exit'].includes(f.key));
  // The legacy generic exit field is not an input here: the paper has purpose-specific uses.
  if (id === 'testes-rapidos') fields = fields.filter(f => f.key !== 'exit').map(f => f.type === 'integer' || f.type === 'decimal' ? { ...f, type: 'integer', unit: 'testes' } : f);
  if (['medicamentos', 'materiais', 'testes-rapidos'].includes(id)) {
    fields.unshift(field('sourceLine', 'Linha do documento / item'), field('occurredOn', 'Data efetiva do lançamento', 'date'));
    fields.push(field('presentation', 'Apresentação / unidade de contagem'), field('origin', 'Origem'), field('destination', 'Destino'));
  }
  if (id === 'materiais') headers.push(field('responsible', 'Responsável pelo mapa'));
  const sections: MapSection[] = [{ id: 'records', title: template.title, fields }];
  if (id === 'insulinas') {
    const deliveries = fields.filter(f => ['Paciente', 'NPH', 'Regular', 'Entrega'].includes(f.group) && !['nphQuantity', 'regularQuantity'].includes(f.key));
    deliveries.push(number('nphVialsDelivered', 'NPH entregue: frascos'), number('nphPensDelivered', 'NPH entregue: canetas'), number('regularVialsDelivered', 'Regular entregue: frascos'), number('regularPensDelivered', 'Regular entregue: canetas'));
    deliveries.forEach(f => { if (f.key.endsWith('Delivered')) f.type = 'integer'; if (['nphUnits', 'regularUnits'].includes(f.key)) { f.unit = 'UI/dia (informadas)'; f.label = `${f.key === 'nphUnits' ? 'NPH' : 'Regular'}: unidades diárias informadas`; } });
    sections.splice(0, 1,
      { id: 'deliveries', title: 'Entregas sintéticas de insulina', fields: deliveries },
      { id: 'supplies', title: 'Agulhas, lancetas, seringas e tiras', fields: [field('item', 'Item / apresentação'), number('previousBalance', 'Saldo anterior'), number('entry', 'Entrada'), number('exit', 'Saída'), field('currentBalance', 'Saldo atual', 'calculated'), number('resupply', 'Ressuprimento solicitado à CAF')] },
      { id: 'insulinStock', title: 'Insulinas em estoque e ressuprimento', fields: [field('insulinType', 'NPH ou Regular'), field('presentation', 'Frasco ou caneta'), number('previousBalance', 'Saldo anterior'), number('entry', 'Entrada'), number('exit', 'Saída'), field('currentBalance', 'Saldo atual', 'calculated'), number('resupply', 'Ressuprimento solicitado à CAF')] });
  }
  // Missing printed totals are explicit calculated columns, not editable inputs.
  if (id === 'medicamentos') sections[0].fields.push(field('entryTotal', 'Total de entradas', 'calculated'), field('exitTotal', 'Total de saídas', 'calculated'));
  if (id === 'testes-rapidos') sections[0].fields.push(field('exitTotal', 'Total de saídas calculado (testes)', 'calculated'));
  return { template, headers, sections };
}

export const mapIds = esfTemplates.filter(t => t.id !== 'producao').map(t => t.id);
export const mapInputSchema = z.object({
  operationId: z.uuid(), entityId: z.uuid(), expectedVersion: z.number().int().min(0),
  deviceId: z.uuid(), localTimestamp: z.iso.datetime(),
  templateId: z.string().refine(id => mapIds.includes(id)), competency: monthSchema, teamId: z.uuid(),
  action: z.enum(['save', 'submit', 'return', 'close', 'reopen']), reason: z.string().max(500).default(''),
  synthetic: z.literal(true), payload: z.object({ headers: z.record(z.string(), z.union([z.string().max(1000), z.number().finite(), z.null()])),
    sections: z.record(z.string(), z.array(z.object({ id: z.uuid(), values: z.record(z.string(), z.union([z.string().max(1000), z.number().finite(), z.null()])) }).strict()).max(250)) }).strict(),
}).strict();
export type MapInput = z.infer<typeof mapInputSchema>;
export type EsfMap = { id: string; template_id: string; competency: string; team_id: string; version: number; revision: number; status: 'OPEN' | 'IN_REVIEW' | 'CLOSED'; payload: MapPayload; updated_at?: string; closed_at?: string };

export function blankMap(id: string, filledBy = ''): MapPayload {
  const def = mapDefinition(id);
  return { headers: { filledBy }, sections: Object.fromEntries((def?.sections ?? []).map(s => [s.id, []])) };
}
export function validateMap(input: unknown): MapInput {
  const data = mapInputSchema.parse(input);
  const def = mapDefinition(data.templateId)!;
  const validateValues = (values: Record<string, MapValue>, fields: EsfField[]) => {
    for (const [key, value] of Object.entries(values)) {
      const f = fields.find(f => f.key === key);
      if (!f || f.type === 'calculated') throw new Error('Campo desconhecido ou calculado não pode ser enviado.');
      if (value === null || value === '') continue;
      if (value === 'Não se aplica' && ['integer', 'decimal', 'date'].includes(f.type)) continue;
      if (['integer', 'decimal'].includes(f.type) && (typeof value !== 'number' || value < 0 || value > 1_000_000 || (f.type === 'integer' && !Number.isInteger(value)))) throw new Error(`Quantidade inválida: ${f.label}.`);
      if (f.type === 'date' && (typeof value !== 'string' || !mapDateSchema.safeParse(value).success)) throw new Error(`Data inválida: ${f.label}.`);
      if (!['integer', 'decimal'].includes(f.type) && typeof value !== 'string') throw new Error(`Valor inválido: ${f.label}.`);
      if (f.options && !f.options.includes(String(value))) throw new Error(`Opção inválida: ${f.label}.`);
      if (['name', 'motherName', 'patientName', 'professionalId'].includes(key) && !String(value).startsWith('[SINTÉTICO]')) throw new Error('Nomes de teste devem começar com [SINTÉTICO]. Não informe dados reais.');
      if (f.type === 'attachment' && !z.uuid().safeParse(value).success) throw new Error('Anexe um comprovante sintético confirmado antes de vinculá-lo.');
    }
  };
  validateValues(data.payload.headers, def.headers);
  if (Object.keys(data.payload.sections).some(key => !def.sections.some(s => s.id === key))) throw new Error('Seção inválida.');
  for (const section of def.sections) {
    const rows = data.payload.sections[section.id] ?? [];
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Identificador de linha duplicado.');
    rows.forEach(row => {
      validateValues(row.values, section.fields);
      if (data.templateId === 'obitos' && row.values.birthDate && row.values.birthDate !== 'Não se aplica' && row.values.age !== null && row.values.age !== '' && row.values.age !== undefined && row.values.age !== 'Não se aplica') throw new Error('Informe nascimento ou idade, não os dois.');
      if (data.templateId === 'obitos' && /^\d{4}-/.test(String(row.values.birthDate)) && /^\d{4}-/.test(String(row.values.deathDate)) && String(row.values.birthDate) > String(row.values.deathDate)) throw new Error('Nascimento não pode ser posterior ao óbito.');
      if (data.templateId === 'obitos' && typeof row.values.age === 'number' && !row.values.ageUnit) throw new Error('Informe a unidade da idade.');
      if (typeof row.values.weight === 'number' && !row.values.weightUnit) throw new Error('Informe explicitamente a unidade do peso.');
      for (const key of ['occurredOn', 'occurrenceDate', 'deliveredOn', 'followUpDate']) if (row.values[key] && row.values[key] !== 'Não se aplica' && !String(row.values[key]).startsWith(data.competency)) throw new Error('A data do lançamento deve pertencer à competência.');
      if (['submit', 'close'].includes(data.action)) {
        const identity = data.templateId === 'frequencia' ? 'professionalId' : data.templateId === 'nascidos-vivos' ? 'motherName' : data.templateId === 'insulinas' ? section.id === 'deliveries' ? 'patientName' : section.id === 'supplies' ? 'item' : 'insulinType' : ['hanseniase', 'tuberculose', 'obitos'].includes(data.templateId) ? 'name' : 'itemId';
        if (!String(row.values[identity] ?? '').trim()) throw new Error('Identifique cada registro antes de enviar à revisão.');
      }
    });
  }
  if (['return', 'reopen'].includes(data.action) && data.reason.trim().length < 10) throw new Error('Justificativa de pelo menos 10 caracteres obrigatória.');
  if (['submit', 'close'].includes(data.action) && !Object.values(data.payload.sections).some(rows => rows.length)) throw new Error('Inclua ao menos um registro antes de enviar.');
  return data;
}
const amount = (v: MapValue | undefined): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function sumKnown(values: Array<MapValue | undefined>): number | null {
  const numbers = values.map(amount);
  return numbers.every((v): v is number => v !== null) ? Math.round(numbers.reduce((a, b) => a + b, 0) * 1000) / 1000 : null;
}
export function calculatedRow(template: string, section: string, values: Record<string, MapValue>) {
  const derived: Record<string, MapValue> = {};
  if (template === 'frequencia') derived.absences = values.absent === 'Sim' ? 1 : values.absent === 'Não' ? 0 : null;
  let entries = amount(values.entry), exits = amount(values.exit);
  if (template === 'medicamentos') {
    entries = sumKnown([values.pharmacyEntry, values.otherEntry]); exits = sumKnown([values.dispensed, values.transferred, values.losses]);
    derived.entryTotal = entries; derived.exitTotal = exits; derived.totalDemand = sumKnown([values.served, values.unserved]);
  }
  if (template === 'testes-rapidos') { exits = sumKnown([values.pregnancyUse, values.otherUse, values.losses]); derived.exitTotal = exits; }
  if (['medicamentos', 'materiais', 'testes-rapidos'].includes(template) || (template === 'insulinas' && section !== 'deliveries')) {
    const prior = amount(values.previousBalance);
    derived.currentBalance = prior !== null && entries !== null && exits !== null ? Math.round((prior + entries - exits) * 1000) / 1000 : null;
  }
  return { ...values, ...derived };
}
export const mapStatusLabels = { OPEN: 'Em preenchimento', IN_REVIEW: 'Em revisão de teste', CLOSED: 'Fechado para teste' };
export function displayMapValue(value: MapValue | undefined) {
  return value === '' || value === null || value === undefined ? 'Não informado' : typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : value;
}
