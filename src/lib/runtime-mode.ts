/** Explicit demo opt-in; a missing integration must never grant synthetic access. */
export function runtimeMode(env: Record<string, string | undefined> = process.env): "demo" | "integrated" | "unconfigured" {
  if (env.SGC_DEMO_MODE === "true") return env.VERCEL_ENV === "production" ? "unconfigured" : "demo";
  return env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "integrated" : "unconfigured";
}
