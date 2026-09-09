import { z } from "zod";

export const uuidSchema = z.uuid();

export const operationSchema = z.object({
  operationId: uuidSchema,
  entityId: uuidSchema,
  entityType: z.string().min(1).max(80),
  command: z.string().min(1).max(80),
  expectedVersion: z.number().int().nonnegative(),
  deviceId: uuidSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  organizationId: uuidSchema,
  unitId: uuidSchema.nullable(),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const syncBatchSchema = z.object({
  cursor: z.string().max(200).nullable().default(null),
  operations: z.array(operationSchema).min(1).max(100)
});

export type SyncOperation = z.infer<typeof operationSchema>;
export type SyncBatch = z.infer<typeof syncBatchSchema>;

export type OperationResult = {
  operationId: string;
  status: "accepted" | "duplicate" | "conflict" | "rejected";
  serverVersion?: number;
  reason?: string;
};

export type DomainEvent<T = Record<string, unknown>> = {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  organizationId: string;
  unitId: string | null;
  actorId: string;
  version: number;
  occurredAt: string;
  payload: T;
};

export const protocolStates = ["RASCUNHO", "EM_REVISAO", "APROVADO", "PUBLICADO", "SUSPENSO", "OBSOLETO"] as const;
export const actionStates = ["NAO_INICIADO", "EM_ANDAMENTO", "BLOQUEADO", "CONCLUIDO", "CANCELADO"] as const;
export const indicatorStates = ["SEM_DADO", "DENTRO_META", "ATENCAO", "FORA", "FORA_META"] as const;

export type ProtocolState = (typeof protocolStates)[number];
export type ActionState = (typeof actionStates)[number];
export type IndicatorState = Exclude<(typeof indicatorStates)[number], "FORA_META"> | "FORA_META";
