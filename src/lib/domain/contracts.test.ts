import { describe, expect, it } from "vitest";
import { syncBatchSchema } from "./contracts";

const operation = {
  operationId: "11111111-1111-4111-8111-111111111111",
  entityId: "22222222-2222-4222-8222-222222222222",
  entityType: "melhoria",
  command: "ACTION_UPDATE_PROGRESS",
  expectedVersion: 3,
  deviceId: "33333333-3333-4333-8333-333333333333",
  occurredAt: "2026-09-02T12:00:00.000Z",
  organizationId: "44444444-4444-4444-8444-444444444444",
  unitId: "55555555-5555-4555-8555-555555555555",
  payload: { percentage: 80 }
};

describe("sync contract", () => {
  it("accepts a bounded idempotent batch", () => expect(syncBatchSchema.safeParse({ cursor: null, operations: [operation] }).success).toBe(true));
  it("rejects malformed ids and empty batches", () => {
    expect(syncBatchSchema.safeParse({ cursor: null, operations: [] }).success).toBe(false);
    expect(syncBatchSchema.safeParse({ cursor: null, operations: [{ ...operation, operationId: "bad" }] }).success).toBe(false);
  });
});
