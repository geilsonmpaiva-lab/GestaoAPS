export type PasswordSetupMode = "recovery" | "invite";

export type AuthCallbackState = {
  mode: PasswordSetupMode | null;
  error: string | null;
};

export function readAuthCallback(urlValue: string): AuthCallbackState {
  const url = new URL(urlValue);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const type = hash.get("type") ?? url.searchParams.get("type");
  const errorCode = hash.get("error_code") ?? url.searchParams.get("error_code");
  const errorDescription = hash.get("error_description") ?? url.searchParams.get("error_description");
  const authError = url.searchParams.get("authError");
  const passwordSetup = url.searchParams.get("passwordSetup");

  if (errorCode === "otp_expired") {
    return {
      mode: null,
      error: "Este link já foi usado ou expirou. Solicite um novo e abra somente a mensagem mais recente.",
    };
  }

  if (errorDescription) {
    return { mode: null, error: errorDescription.replaceAll("+", " ") };
  }

  if (authError === "invalid_or_expired") {
    return {
      mode: null,
      error: "Este link é inválido ou expirou. Solicite uma nova recuperação de senha.",
    };
  }

  return {
    mode: passwordSetup === "recovery" ? "recovery" : type === "recovery" || type === "invite" ? type : null,
    error: null,
  };
}
