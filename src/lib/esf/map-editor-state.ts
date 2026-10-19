import type { EsfField } from './catalog';
import type { MapPayload, MapValue } from './maps';

/** Use only identifiers already exposed by this section, never arbitrary payload fields. */
export function mapRowTitle(fields: readonly EsfField[], values: Record<string, MapValue>, position: number) {
  const available = new Set(fields.map(field => field.key));
  for (const key of ['professionalId', 'patientName', 'motherName', 'name', 'itemId', 'item', 'insulinType', 'caseReference', 'referenceId']) {
    if (!available.has(key)) continue;
    const value = values[key];
    if (value === undefined || value === null) continue;
    const title = String(value).trim();
    if (!title || ['Não informado', 'Não se aplica'].includes(title)) continue;
    return title;
  }
  return `Item ${position} — identificação pendente`;
}

/** Clearing an optional header restores absence; zero and explicit NI/NA are data. */
export function mapPayloadChanged(baseline: MapPayload, current: MapPayload) {
  const fingerprint = (payload: MapPayload) => JSON.stringify({
    headers: Object.entries(payload.headers)
      .filter(([, value]) => value !== '' && value !== null)
      .sort(([a], [b]) => a.localeCompare(b)),
    sections: payload.sections,
  });
  return fingerprint(baseline) !== fingerprint(current);
}
