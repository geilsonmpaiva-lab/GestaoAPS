import type { MapPayload } from './maps';

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
