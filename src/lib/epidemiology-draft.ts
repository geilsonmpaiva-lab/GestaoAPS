import { z } from 'zod';
import { epiAreas, epiAreaSchema, epiCommand } from './epidemiology';

export type EpidemiologyDraftContext = {
  userId: string; organizationId: string; unitId: string; teamId: string;
  area: string; competency: string; entityId: string | null; expectedVersion: number;
};
const draftEnvelope = z.object({
  userId: z.uuid(), organizationId: z.uuid(), unitId: z.uuid(), teamId: z.uuid(),
  area: epiAreaSchema, competency: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  entityId: z.uuid(), expectedVersion: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().safe().min(0)),
  payload: z.string().max(40000), pending: z.string().max(50000).default(''), reason: z.string().max(500).default(''),
}).strict();

/** The stable vault key finds an older draft; version mismatch never applies it. */
export function readEpidemiologyDraft(saved: Record<string, string>, expected: EpidemiologyDraftContext) {
  const parsed = draftEnvelope.safeParse(saved);
  if (!parsed.success) throw new Error('O rascunho epidemiológico está incompleto ou é inválido. A cópia cifrada foi preservada.');
  const draft = parsed.data;
  if (draft.userId !== expected.userId || draft.organizationId !== expected.organizationId || draft.unitId !== expected.unitId || draft.teamId !== expected.teamId || draft.area !== expected.area || draft.competency !== expected.competency || expected.entityId && draft.entityId !== expected.entityId || !expected.entityId && draft.expectedVersion !== 0) throw new Error('Este rascunho pertence a outro registro ou contexto. Nenhum campo foi substituído.');
  let payload: Record<string, string | number>;
  let pending: { action: string; body: string } | null = null;
  try {
    payload = z.record(z.string(), z.union([z.string().max(1000), z.number().int().min(0).max(1000000)])).parse(JSON.parse(draft.payload));
    const definition = epiAreas.find(a => a.id === draft.area)!;
    for (const [key, value] of Object.entries(payload)) {
      const field = definition.fields.find(f => f.key === key);
      if (!field || field.type === 'integer' && typeof value !== 'number' || field.type !== 'integer' && typeof value !== 'string' || field.type === 'date' && value !== '' && !z.iso.date().safeParse(value).success || field.options && value !== '' && !field.options.includes(String(value))) throw new Error('Campo inválido.');
    }
    if (draft.pending) {
      pending = z.object({ action: z.string(), body: z.string().max(40000) }).strict().parse(JSON.parse(draft.pending));
      const command = epiCommand.parse(JSON.parse(pending.body));
      if (command.action !== pending.action || command.teamId !== draft.teamId || command.area !== draft.area || command.competency !== draft.competency || command.entityId !== draft.entityId || command.expectedVersion !== draft.expectedVersion || command.reason !== draft.reason) throw new Error('Comando de outro contexto.');
      if (command.action === 'save' && (Object.keys(command.payload).length !== Object.keys(payload).length || Object.entries(payload).some(([key, value]) => command.payload[key] !== value))) throw new Error('O comando não corresponde ao rascunho.');
    }
  } catch { throw new Error('Não foi possível validar os campos ou o envio pendente. A cópia cifrada foi preservada.'); }
  return { ...draft, payload, pending, versionMatches: draft.expectedVersion === expected.expectedVersion };
}
