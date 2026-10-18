import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if (!process.argv.includes("--shared-synthetic")) throw new Error("Confirmação explícita --shared-synthetic obrigatória.");
const destination = resolve(".env.staging.local");
if (existsSync(destination)) throw new Error("Arquivo de homologação já existe; não será sobrescrito.");
const source = {};
for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) source[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
}
if (source.NEXT_PUBLIC_SUPABASE_URL !== "https://javgqqgyealviyhqwhgx.supabase.co") throw new Error("Origem não corresponde ao GestaoAPS autorizado.");
const env = {
  SGC_ENVIRONMENT: "staging", SGC_STAGING_DATABASE_MODE: "shared-synthetic", SGC_STAGING_PROJECT_REF: "javgqqgyealviyhqwhgx",
  NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_ORIGIN: "https://gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app",
  SGC_DEMO_MODE: "false", SGC_STAGING_ACCOUNTS_FILE: ".env.staging.accounts.local",
};
if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Chaves locais não encontradas.");
writeFileSync(destination, Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ prepared: true, path: destination, mode: "shared-synthetic" }));
