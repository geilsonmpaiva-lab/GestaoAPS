import { z } from 'zod';
import { longCommand, longArea } from '@/lib/epidemiology-longitudinal';
const scope = z.object({ deviceId: z.uuid(), area: longArea, month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), team: z.uuid() });
export const longOfflineQuery = scope.extend({ case: z.uuid().optional() }).strict();
export const longFileQuery = scope.extend({ attachmentId: z.uuid() }).strict();
export const longOfflineRequest = z.discriminatedUnion('kind', [
  scope.extend({ kind: z.literal('command'), command: longCommand, baseline: z.record(z.string(), z.unknown()).nullable() }).strict(),
  scope.extend({ kind: z.literal('resolve'), conflictId: z.uuid(), operationId: z.uuid(), expectedServerVersion: z.number().int().min(0), decision: z.enum(['KEEP_SERVER', 'RETRY']), justification: z.string().trim().min(10).max(500) }).strict(),
  scope.extend({ kind: z.literal('attachment-reserve'), attachmentId: z.uuid(), visitId: z.uuid(), fileName: z.string().min(1).max(240), contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg']), byteSize: z.number().int().min(1).max(26214400), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  scope.extend({ kind: z.literal('attachment-finalize'), attachmentId: z.uuid() }).strict(),
]).superRefine((v, ctx) => {
  if (v.kind === 'command' && (v.command.deviceId !== v.deviceId || v.command.area !== v.area || v.command.month !== v.month || v.command.teamId !== v.team)) ctx.addIssue({ code: 'custom', message: 'Comando fora do contexto preparado.' });
});
export type LongOfflineRequest = z.infer<typeof longOfflineRequest>;
export function validLongFile(bytes: Uint8Array, mime: string) {
  if (mime === 'application/pdf') return new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  return mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
