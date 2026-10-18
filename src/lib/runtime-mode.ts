/** Explicit demo opt-in; a missing integration must never grant synthetic access. */
export function runtimeMode(env: Record<string, string | undefined> = process.env): "demo" | "integrated" | "unconfigured" {
  if (env.SGC_ENVIRONMENT === "staging") {
    const ref = env.SGC_STAGING_PROJECT_REF;
    if (env.VERCEL_ENV === "production" || env.SGC_DEMO_MODE !== "false" ||
      !/^[a-z]{20}$/.test(ref ?? "") || (ref === "javgqqgyealviyhqwhgx" && env.SGC_STAGING_DATABASE_MODE !== "shared-synthetic") ||
      env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) return "unconfigured";
  }
  if (env.SGC_DEMO_MODE === "true") return env.VERCEL_ENV === "production" ? "unconfigured" : "demo";
  return env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "integrated" : "unconfigured";
}
