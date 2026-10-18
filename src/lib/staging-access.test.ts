import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canUseStaging } from "./staging-access";

afterEach(() => vi.unstubAllEnvs());
function client(allowed: boolean, error: boolean = false) {
  const query = { select: vi.fn(), eq: vi.fn(), lte: vi.fn(), or: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
  for (const key of ["select", "eq", "lte", "or", "limit"] as const) query[key].mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: allowed ? { id: "synthetic-membership" } : null, error: error ? { code: "error" } : null });
  return { value: { from: () => query } as unknown as SupabaseClient, query };
}
describe("synthetic tenant preview access", () => {
  it("does not change access to the production application", async () => {
    vi.stubEnv("SGC_ENVIRONMENT", "production");
    const db = client(false);
    expect(await canUseStaging(db.value, "user")).toBe(true);
    expect(db.query.select).not.toHaveBeenCalled();
  });
  it("fails closed without a configured synthetic organization", async () => {
    vi.stubEnv("SGC_ENVIRONMENT", "staging"); vi.stubEnv("SGC_STAGING_ORGANIZATION_ID", "");
    expect(await canUseStaging(client(true).value, "user")).toBe(false);
  });
  it("requires an active membership specifically in the synthetic organization", async () => {
    const organization = "362db1a9-bfdd-4334-9436-46b1c0117eab";
    vi.stubEnv("SGC_ENVIRONMENT", "staging"); vi.stubEnv("SGC_STAGING_ORGANIZATION_ID", organization);
    const db = client(true);
    expect(await canUseStaging(db.value, "synthetic-user")).toBe(true);
    expect(db.query.eq).toHaveBeenCalledWith("organization_id", organization);
    expect(db.query.eq).toHaveBeenCalledWith("user_id", "synthetic-user");
    expect(await canUseStaging(client(false).value, "real-user")).toBe(false);
    expect(await canUseStaging(client(true, true).value, "user")).toBe(false);
  });
});
