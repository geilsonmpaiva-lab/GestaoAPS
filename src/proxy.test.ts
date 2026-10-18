import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { runtimeMode } from "./lib/runtime-mode";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
beforeEach(() => {
  vi.stubEnv("SGC_DEMO_MODE", "false");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
  auth.getUser.mockResolvedValue({ data: { user: null } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("isolated access modes", () => {
  it("rejects staging configured against production or a mismatched project", () => {
    const staging = { SGC_ENVIRONMENT: "staging", SGC_DEMO_MODE: "false", SGC_STAGING_PROJECT_REF: "abcdefghijklmnopqrst", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-key" };
    expect(runtimeMode(staging)).toBe("integrated");
    expect(runtimeMode({ ...staging, NEXT_PUBLIC_SUPABASE_URL: "https://javgqqgyealviyhqwhgx.supabase.co" })).toBe("unconfigured");
    expect(runtimeMode({ ...staging, SGC_STAGING_PROJECT_REF: "javgqqgyealviyhqwhgx", NEXT_PUBLIC_SUPABASE_URL: "https://javgqqgyealviyhqwhgx.supabase.co" })).toBe("unconfigured");
    expect(runtimeMode({ ...staging, VERCEL_ENV: "production" })).toBe("unconfigured");
  });
  it("fails closed without configuration", async () => {
    expect(runtimeMode({})).toBe("unconfigured");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await proxy(new NextRequest("https://app.test/"))).status).toBe(503);
  });
  it("rejects demo in Vercel production", () => {
    expect(runtimeMode({ SGC_DEMO_MODE: "true", VERCEL_ENV: "production" })).toBe("unconfigured");
    expect(runtimeMode({ SGC_DEMO_MODE: "true", VERCEL_ENV: "preview" })).toBe("demo");
  });
  it("allows the recovery callback before a session exists", async () => {
    const result = await proxy(new NextRequest("https://app.test/auth/confirm?type=recovery"));
    expect(result.headers.get("location")).toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it("returns JSON 401 for protected APIs", async () => {
    expect((await proxy(new NextRequest("https://app.test/api/v1/units"))).status).toBe(401);
  });
  it("preserves list filters in the login return path", async () => {
    const result = await proxy(new NextRequest("https://app.test/protocolos?page=2"));
    expect(new URL(result.headers.get("location")!).searchParams.get("returnTo")).toBe("/protocolos?page=2");
  });
  it("keeps password setup available to authenticated users", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "test" } } });
    expect((await proxy(new NextRequest("https://app.test/login?passwordSetup=recovery"))).headers.get("location")).toBeNull();
  });
});
