import { describe, expect, it } from "vitest";
import { readAuthCallback } from "./auth-callback";

describe("readAuthCallback", () => {
  it("identifica um retorno de recuperação no fragmento", () => {
    expect(readAuthCallback("https://app.test/login#access_token=x&type=recovery")).toEqual({
      mode: "recovery",
      error: null,
    });
  });

  it("identifica um primeiro acesso por convite", () => {
    expect(readAuthCallback("https://app.test/login?type=invite")).toEqual({
      mode: "invite",
      error: null,
    });
  });

  it("identifica uma sessão validada pelo callback do servidor", () => {
    expect(readAuthCallback("https://app.test/login?passwordSetup=recovery")).toEqual({
      mode: "recovery",
      error: null,
    });
  });

  it("traduz token expirado em orientação segura", () => {
    const result = readAuthCallback("https://app.test/login#error=access_denied&error_code=otp_expired");
    expect(result.mode).toBeNull();
    expect(result.error).toContain("já foi usado ou expirou");
  });

  it("traduz falha de verificação do callback", () => {
    const result = readAuthCallback("https://app.test/login?authError=invalid_or_expired");
    expect(result.mode).toBeNull();
    expect(result.error).toContain("inválido ou expirou");
  });
});
