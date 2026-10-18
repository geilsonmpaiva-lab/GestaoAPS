import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const auth = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ createSupabaseServerClient: async () => ({ auth }) }));
import { GET } from "./route";
beforeEach(() => { auth.verifyOtp.mockReset().mockResolvedValue({ error: null }); });
describe("password setup confirmation", () => {
  it.each(["recovery", "invite"])("verifies %s and redirects without exposing its token", async type => {
    const result = await GET(new NextRequest(`https://app.test/auth/confirm?type=${type}&token_hash=synthetic-test-token`));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "synthetic-test-token", type });
    expect(result.headers.get("location")).toBe("https://app.test/login?passwordSetup=recovery");
  });
  it("rejects expired tokens without opening password setup", async () => {
    auth.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const result = await GET(new NextRequest("https://app.test/auth/confirm?type=recovery&token_hash=expired-test-token"));
    expect(result.headers.get("location")).toBe("https://app.test/login?authError=invalid_or_expired");
  });
  it("rejects unsupported token types without contacting auth", async () => {
    await GET(new NextRequest("https://app.test/auth/confirm?type=signup&token_hash=synthetic-test-token"));
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});
