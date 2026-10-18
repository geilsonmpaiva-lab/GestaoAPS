import { readFileSync } from "node:fs";

export function assertStagingConfig(env) {
  const ref = env.SGC_STAGING_PROJECT_REF;
  if (env.SGC_ENVIRONMENT !== "staging" || !/^[a-z]{20}$/.test(ref ?? "")) {
    throw new Error("Defina explicitamente SGC_ENVIRONMENT=staging e SGC_STAGING_PROJECT_REF.");
  }
  if (ref === "javgqqgyealviyhqwhgx" && env.SGC_STAGING_DATABASE_MODE !== "shared-synthetic") {
    throw new Error("Banco compartilhado exige SGC_STAGING_DATABASE_MODE=shared-synthetic explicitamente autorizado.");
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) {
    throw new Error("A URL não corresponde ao projeto de homologação explicitamente selecionado.");
  }
  if (env.SGC_DEMO_MODE !== "false") throw new Error("Homologação integrada exige SGC_DEMO_MODE=false.");
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("As chaves exclusivas da homologação são obrigatórias.");
  }
  // Legacy JWT keys carry their project ref. Reject accidentally copied production keys.
  for (const key of [env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY]) {
    if (key.split(".").length !== 3) continue;
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); }
    catch { throw new Error("Chave JWT inválida no arquivo de homologação."); }
    if (claims.ref !== ref) throw new Error("Chave pertence a outro projeto Supabase.");
  }
  return { ref, url: env.NEXT_PUBLIC_SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
}

export function loadStagingConfig() {
  const path = process.env.SGC_STAGING_ENV_FILE;
  if (!path) throw new Error("Informe SGC_STAGING_ENV_FILE. Não há fallback para .env.local.");
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || Object.hasOwn(env, match[1])) throw new Error("Arquivo de homologação inválido ou com chave duplicada.");
    const raw = match[2].trim();
    env[match[1]] = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  }
  const config = assertStagingConfig(env);
  return { ...config, env };
}
